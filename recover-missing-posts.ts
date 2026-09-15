import { Bot, RichText } from "@skyware/bot";
import { configDotenv } from "dotenv";
import { fetchConstellationJson } from "./src/constellation.js";
import {
  isBlacklistedVerifierDid,
  isTrustedVerifierDid,
} from "./src/verifiers.js";

configDotenv();

const TRACKER_HANDLE = "verified.evil.gay";
const TRACKER_DID = "did:plc:k3lft27u2pjqp2ptidkne7xr";
const BSKY_DID = "did:plc:z72i7hdynmk6r22z27h6tvur";
const DEFAULT_LAST_POST_URL =
  "https://bsky.app/profile/verified.evil.gay/post/3miu3kgx7x223";

const VERIFIER_DIDS = [
  BSKY_DID,
  "did:plc:b2kutgxqlltwc6lhs724cfwr",
  "did:plc:inz4fkbbp7ms3ixufw6xuvdi",
  "did:plc:eclio37ymobqex2ncko63h4r",
  "did:plc:wmho6q2uiyktkam3jsvrms3s",
  "did:plc:sqbswn3lalcc2dlh2k7zdpuw",
  "did:plc:y3xrmnwvkvsq4tqcsgwch4na",
  "did:plc:d2jith367s6ybc3ldsusgdae",
  "did:plc:dzezcmpb3fhcpns4n4xm4ur5",
  "did:plc:xwqgusybtrpm67tcwqdfmzvy",
  "did:plc:hbdc3q6k5lforao5vyuarvsp",
  "did:plc:oxo226vi7t2btjokm2buusoy",
  "did:plc:2w45zyhuklwihpdc7oj3mi63",
  "did:plc:ofbkqcjzvm6gtwuufsubnkaf",
  "did:plc:rk25gdgk3cnnmtkvlae265nz",
  "did:plc:j4eroku3volozvv6ljsnnfec",
  "did:plc:m7ks2xhfuku7errrtfjux2lg",
] as const;

type BacklinkResponse = {
  total: number;
  linking_dids: string[];
  cursor?: string;
};

type AuthorFeedResponse = {
  feed: Array<{
    post: {
      uri: string;
      record?: AuthorFeedRecord;
    };
  }>;
  cursor?: string;
};

type AuthorFeedRecord = {
  createdAt?: string;
  facets?: Array<{
    features?: Array<{
      $type?: string;
      did?: string;
    }>;
  }>;
};

type GetRecordResponse = {
  uri: string;
  value?: {
    createdAt?: string;
  };
};

type PlcDidDocument = {
  service?: Array<{
    id?: string;
    type?: string;
    serviceEndpoint?: string;
  }>;
};

type VerificationRecord = {
  uri: string;
  value: {
    subject?: string;
    handle?: string;
    createdAt?: string;
  };
};

type ListRecordsResponse = {
  records: VerificationRecord[];
  cursor?: string;
};

type VerificationCandidate = {
  subjectDid: string;
  subjectHandle: string;
  verifierDid: string;
  verifierHandle: string;
  verifiedAt: number;
  sourceUri: string;
};

type ParsedArgs = {
  dryRun: boolean;
  endAtMs: number;
  lastPostRef: string;
  startAtMs?: number;
};

const verifierHandleCache = new Map<string, string>();
const pdsCache = new Map<string, string>();
const backlinkCache = new Map<string, boolean>();

function parseArgs(argv: string[]): ParsedArgs {
  let dryRun = false;
  let lastPostRef = process.env.LAST_POST_URL ?? DEFAULT_LAST_POST_URL;
  let startAtMs = process.env.START_AT
    ? Date.parse(process.env.START_AT)
    : undefined;
  let endAtMs = process.env.END_AT ? Date.parse(process.env.END_AT) : Date.now();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--last-post" && argv[index + 1]) {
      lastPostRef = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--start-at" && argv[index + 1]) {
      startAtMs = Date.parse(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--end-at" && argv[index + 1]) {
      endAtMs = Date.parse(argv[index + 1]);
      index += 1;
    }
  }

  if (Number.isNaN(endAtMs)) {
    throw new Error("Invalid END_AT / --end-at value");
  }

  if (startAtMs !== undefined && Number.isNaN(startAtMs)) {
    throw new Error("Invalid START_AT / --start-at value");
  }

  return {
    dryRun,
    endAtMs,
    lastPostRef,
    startAtMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function verificationKey(subjectDid: string, verifierDid: string): string {
  return `${subjectDid}::${verifierDid}`;
}

function parseAtUri(uri: string): {
  repo: string;
  collection: string;
  rkey: string;
} {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid AT URI: ${uri}`);
  }

  return {
    repo: match[1],
    collection: match[2],
    rkey: match[3],
  };
}

async function fetchJson<T>(url: URL | string): Promise<T> {
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${response.url}`);
  }

  return (await response.json()) as T;
}

async function resolveRepoRefToDid(actor: string): Promise<string> {
  if (actor.startsWith("did:")) {
    return actor;
  }

  const url = new URL(
    "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle",
  );
  url.searchParams.set("handle", actor);
  const response = await fetchJson<{ did: string }>(url);
  return response.did;
}

async function normalizePostRefToAtUri(postRef: string): Promise<string> {
  if (postRef.startsWith("at://")) {
    return postRef;
  }

  const match = postRef.match(/^https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/]+)$/);
  if (!match) {
    throw new Error(
      "Expected --last-post to be an AT URI or a bsky.app post URL",
    );
  }

  const repo = await resolveRepoRefToDid(decodeURIComponent(match[1]));
  const rkey = decodeURIComponent(match[2]);
  return `at://${repo}/app.bsky.feed.post/${rkey}`;
}

async function fetchAnchorPost(atUri: string): Promise<{ uri: string; createdAtMs: number }> {
  const { repo, collection, rkey } = parseAtUri(atUri);
  const url = new URL(
    "https://public.api.bsky.app/xrpc/com.atproto.repo.getRecord",
  );
  url.searchParams.set("repo", repo);
  url.searchParams.set("collection", collection);
  url.searchParams.set("rkey", rkey);

  const record = await fetchJson<GetRecordResponse>(url);
  const createdAtMs = Date.parse(record.value?.createdAt ?? "");

  if (Number.isNaN(createdAtMs)) {
    throw new Error(`Could not read createdAt for anchor post ${atUri}`);
  }

  return { uri: record.uri, createdAtMs };
}

function extractMentionDidOrder(
  facets: AuthorFeedRecord["facets"] | undefined,
): string[] {
  const dids: string[] = [];

  for (const facet of facets ?? []) {
    for (const feature of facet.features ?? []) {
      if (
        feature.$type === "app.bsky.richtext.facet#mention" &&
        feature.did &&
        !dids.includes(feature.did)
      ) {
        dids.push(feature.did);
      }
    }
  }

  return dids;
}

async function fetchPostedVerificationKeysSinceAnchor(
  anchorUri: string,
  endAtMs: number,
): Promise<Set<string>> {
  const postedKeys = new Set<string>();
  let cursor: string | undefined;
  let foundAnchor = false;

  while (true) {
    const url = new URL(
      "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed",
    );
    url.searchParams.set("actor", TRACKER_DID);
    url.searchParams.set("limit", "100");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetchJson<AuthorFeedResponse>(url);

    for (const item of response.feed) {
      if (item.post.uri === anchorUri) {
        foundAnchor = true;
        break;
      }

      const createdAtMs = Date.parse(item.post.record?.createdAt ?? "");
      if (Number.isNaN(createdAtMs) || createdAtMs > endAtMs) {
        continue;
      }

      const [subjectDid, verifierDid] = extractMentionDidOrder(
        item.post.record?.facets,
      );

      if (subjectDid && verifierDid) {
        postedKeys.add(verificationKey(subjectDid, verifierDid));
      }
    }

    if (foundAnchor || !response.cursor) {
      break;
    }

    cursor = response.cursor;
    await sleep(100);
  }

  if (!foundAnchor) {
    throw new Error(`Anchor post ${anchorUri} was not found in @${TRACKER_HANDLE}'s feed`);
  }

  return postedKeys;
}

async function resolveDidToPds(did: string): Promise<string> {
  const cached = pdsCache.get(did);
  if (cached) {
    return cached;
  }

  const document = await fetchJson<PlcDidDocument>(`https://plc.directory/${did}`);
  const pds =
    document.service?.find((service) => service.id === "#atproto_pds")
      ?.serviceEndpoint ?? "https://bsky.social";

  pdsCache.set(did, pds);
  return pds;
}

async function verifierHasBacklink(verifierDid: string): Promise<boolean> {
  if (verifierDid === BSKY_DID) {
    return true;
  }

  const cached = backlinkCache.get(verifierDid);
  if (cached !== undefined) {
    return cached;
  }

  const backlinks = await fetchConstellationJson<BacklinkResponse>(
    "/links/distinct-dids",
    {
      target: verifierDid,
      from_dids: BSKY_DID,
      collection: "app.bsky.graph.verification",
      path: ".subject",
    },
  );

  const hasBacklink =
    backlinks.linking_dids.length > 0 &&
    backlinks.linking_dids.includes(BSKY_DID);
  backlinkCache.set(verifierDid, hasBacklink);
  return hasBacklink;
}

async function resolveHandle(did: string): Promise<string> {
  const cached = verifierHandleCache.get(did);
  if (cached) {
    return cached;
  }

  const url = new URL(
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile",
  );
  url.searchParams.set("actor", did);
  const profile = await fetchJson<{ handle: string }>(url);

  verifierHandleCache.set(did, profile.handle);
  return profile.handle;
}

async function fetchVerifierCandidates(
  verifierDid: string,
  startAtMs: number,
  endAtMs: number,
): Promise<VerificationCandidate[]> {
  if (isBlacklistedVerifierDid(verifierDid)) {
    console.log(`Skipping blacklisted verifier ${verifierDid}`);
    return [];
  }

  if (!(await isTrustedVerifierDid(verifierDid))) {
    console.log(`Skipping untrusted verifier ${verifierDid}`);
    return [];
  }

  if (!(await verifierHasBacklink(verifierDid))) {
    console.log(`Skipping verifier without backlink ${verifierDid}`);
    return [];
  }

  const verifierHandle = await resolveHandle(verifierDid);
  const pds = await resolveDidToPds(verifierDid);
  const candidates: VerificationCandidate[] = [];
  let cursor: string | undefined;

  while (true) {
    const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set("repo", verifierDid);
    url.searchParams.set("collection", "app.bsky.graph.verification");
    url.searchParams.set("limit", "100");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetchJson<ListRecordsResponse>(url);
    let reachedStartBoundary = false;

    for (const record of response.records) {
      const subjectDid = record.value.subject;
      const subjectHandle = record.value.handle;
      const verifiedAt = Date.parse(record.value.createdAt ?? "");

      if (!subjectDid || !subjectHandle || Number.isNaN(verifiedAt)) {
        continue;
      }

      if (verifiedAt <= startAtMs) {
        reachedStartBoundary = true;
        break;
      }

      if (verifiedAt > endAtMs) {
        continue;
      }

      candidates.push({
        subjectDid,
        subjectHandle,
        verifierDid,
        verifierHandle,
        verifiedAt,
        sourceUri: record.uri,
      });
    }

    if (reachedStartBoundary || !response.cursor) {
      break;
    }

    cursor = response.cursor;
    await sleep(100);
  }

  console.log(
    `Found ${candidates.length} candidate verifications for ${verifierHandle} (${verifierDid})`,
  );

  return candidates;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const anchorUri = await normalizePostRefToAtUri(args.lastPostRef);
  const anchorPost = await fetchAnchorPost(anchorUri);
  const startAtMs = args.startAtMs ?? anchorPost.createdAtMs;

  if (startAtMs >= args.endAtMs) {
    throw new Error("Start time must be before end time");
  }

  console.log(`Tracker account: @${TRACKER_HANDLE}`);
  console.log(`Anchor post: ${anchorPost.uri}`);
  console.log(`Window start: ${new Date(startAtMs).toISOString()}`);
  console.log(`Window end:   ${new Date(args.endAtMs).toISOString()}`);

  const postedKeys = await fetchPostedVerificationKeysSinceAnchor(
    anchorPost.uri,
    args.endAtMs,
  );
  console.log(`Found ${postedKeys.size} already-posted verifications in the public feed`);

  const candidatesByKey = new Map<string, VerificationCandidate>();

  for (const verifierDid of VERIFIER_DIDS) {
    const candidates = await fetchVerifierCandidates(
      verifierDid,
      startAtMs,
      args.endAtMs,
    );

    for (const candidate of candidates) {
      const key = verificationKey(candidate.subjectDid, candidate.verifierDid);
      if (!candidatesByKey.has(key)) {
        candidatesByKey.set(key, candidate);
      }
    }
  }

  const missingCandidates = [...candidatesByKey.values()]
    .filter(
      (candidate) =>
        !postedKeys.has(verificationKey(candidate.subjectDid, candidate.verifierDid)),
    )
    .sort((left, right) => left.verifiedAt - right.verifiedAt);

  console.log(`Missing verifications to post: ${missingCandidates.length}`);

  if (missingCandidates.length === 0) {
    return;
  }

  if (args.dryRun) {
    for (const candidate of missingCandidates) {
      console.log(
        [
          new Date(candidate.verifiedAt).toISOString(),
          candidate.subjectHandle,
          candidate.subjectDid,
          candidate.verifierHandle,
          candidate.verifierDid,
          candidate.sourceUri,
        ].join(" | "),
      );
    }
    return;
  }

  const bot = new Bot({
    service: process.env.BSKY_PDS,
  });

  await bot.login({
    identifier: process.env.BSKY_USERNAME ?? "",
    password: process.env.BSKY_PASSWORD ?? "",
  });

  for (const candidate of missingCandidates) {
    const richText = new RichText()
      .addText("✅ ")
      .addMention(
        `@${candidate.subjectHandle}`,
        candidate.subjectDid as `did:${string}:${string}`,
      )
      .addText(" has been verified by ")
      .addMention(
        `@${candidate.verifierHandle}`,
        candidate.verifierDid as `did:${string}:${string}`,
      )
      .addText(".");

    const result = await bot.post({
      text: richText,
      createdAt: new Date(candidate.verifiedAt),
    });

    console.log(
      `Posted ${candidate.subjectHandle} verified by ${candidate.verifierHandle}: ${result.uri}`,
    );

    await sleep(500);
  }
}

await main();
