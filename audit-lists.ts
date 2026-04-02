import ora, { type Ora } from "ora";
import {
  CONSTELLATION_BASE_URL,
  CONSTELLATION_USER_AGENT,
  fetchConstellationJson,
} from "./src/constellation.js";

export const PUBLIC_API_BASE_URL = "https://public.api.bsky.app";
export const LIST_OWNER_DID = "did:plc:k3lft27u2pjqp2ptidkne7xr";
export const VERIFIED_BY_PREFIX = "Verified by ";
export const TRUSTED_VERIFIERS_LIST_NAME = "Trusted Verifiers";
export const ALL_VERIFIED_ACCOUNTS_LIST_NAME = "All Verified Accounts";
const GET_PROFILES_BATCH_SIZE = 25;
const SEARCH_CANDIDATE_LIMIT = 10;
const MAX_RETRIES = 5;
export const VERIFIER_TITLE_OVERRIDES: Record<string, string> = {
  "la times": "latimes.com",
};

type VerificationEntry = {
  issuer: string;
  isValid: boolean;
};

type VerificationState = {
  verifiedStatus?: string;
  trustedVerifierStatus?: string;
  verifications?: VerificationEntry[];
};

type ProfileView = {
  did: string;
  handle: string;
  displayName?: string;
  verification?: VerificationState;
};

type ListView = {
  uri: string;
  name: string;
  listItemCount?: number;
};

type ListItemView = {
  uri: string;
  subject: {
    did: string;
    handle: string;
    displayName?: string;
  };
};

type GetListsResponse = {
  cursor?: string;
  lists: ListView[];
};

type GetListResponse = {
  cursor?: string;
  list: ListView;
  items: ListItemView[];
};

type GetProfilesResponse = {
  profiles: ProfileView[];
};

type SearchActorsTypeaheadResponse = {
  actors: ProfileView[];
};

type ResolveHandleResponse = {
  did: string;
};

export type Finding = {
  severity: "error" | "warn";
  category:
    | "verifier_unresolved"
    | "verifier_not_trusted"
    | "missing_profile"
    | "member_not_verified"
    | "member_wrong_verifier"
    | "list_without_rule";
  listName: string;
  message: string;
  subjectHandle?: string;
  subjectDid?: string;
  verifierHandle?: string;
  verifierDid?: string;
  verifierLabel?: string;
  listUri?: string;
  listItemUri?: string;
};

export type RequestStats = {
  requests: number;
  retries: number;
  rateLimitedResponses: number;
};

export type AuditRunResult = {
  lists: ListView[];
  findings: Finding[];
  stats: RequestStats;
};

type AuditOptions = {
  verbose?: boolean;
};

const profileCache = new Map<string, ProfileView>();
const verifierSearchCache = new Map<string, ProfileView | null>();
const subjectVerifierCache = new Map<string, Set<string>>();
function createStats(): RequestStats {
  return {
    requests: 0,
    retries: 0,
    rateLimitedResponses: 0,
  };
}

let stats = createStats();
let verboseLogging = false;
let activeSpinner: Ora | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderProgress(label: string): void {
  if (verboseLogging || !process.stdout.isTTY) {
    return;
  }

  if (!activeSpinner) {
    activeSpinner = ora({
      text: label,
      discardStdin: false,
    }).start();
    return;
  }

  activeSpinner.text = label;
}

function clearProgress(): void {
  if (verboseLogging || !process.stdout.isTTY || !activeSpinner) {
    return;
  }

  activeSpinner.stop();
  activeSpinner = null;
}

function finishProgress(label: string): void {
  if (verboseLogging) {
    return;
  }

  if (process.stdout.isTTY) {
    if (!activeSpinner) {
      activeSpinner = ora({
        text: label,
        discardStdin: false,
      });
    }
    activeSpinner.succeed(label);
    activeSpinner = null;
    return;
  }

  console.log(label);
}

function getBackoffDelayMs(
  response: Response,
  attempt: number,
  fallbackBaseMs = 1_000,
): number {
  const retryAfterSeconds = response.headers.get("retry-after");
  if (retryAfterSeconds) {
    const retryAfterMs = Number(retryAfterSeconds) * 1_000;
    if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
      return retryAfterMs;
    }
  }

  return fallbackBaseMs * 2 ** attempt;
}

async function fetchJson<T>(
  path: string,
  params: Record<string, string | string[] | undefined>,
): Promise<T> {
  const url = new URL(path, PUBLIC_API_BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, entry);
      }
      continue;
    }

    url.searchParams.set(key, value);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    stats.requests += 1;
    if (verboseLogging) {
      const attemptLabel = attempt === 0 ? "initial" : `retry ${attempt}`;
      console.log(`[request] ${attemptLabel} GET ${url.toString()}`);
    }

    const response = await fetch(url.toString());
    if (verboseLogging) {
      console.log(`[response] ${response.status} ${url.toString()}`);
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      if (response.status === 429) {
        stats.rateLimitedResponses += 1;
      }
      stats.retries += 1;
      const delayMs = getBackoffDelayMs(response, attempt);
      if (verboseLogging) {
        console.log(
          `[retry] ${response.status} waiting ${delayMs}ms before retrying ${url.toString()}`,
        );
      }
      await sleep(delayMs);
      continue;
    }

    throw new Error(`HTTP ${response.status} for ${url.toString()}`);
  }

  throw new Error(`Retries exhausted for ${url.toString()}`);
}

export async function getAllLists(actorDid: string): Promise<ListView[]> {
  const lists: ListView[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetchJson<GetListsResponse>(
      "/xrpc/app.bsky.graph.getLists",
      {
        actor: actorDid,
        limit: "100",
        cursor,
      },
    );

    lists.push(...response.lists);
    cursor = response.cursor;
  } while (cursor);

  return lists;
}

export async function getAllListItems(listUri: string): Promise<ListItemView[]> {
  const items: ListItemView[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetchJson<GetListResponse>(
      "/xrpc/app.bsky.graph.getList",
      {
        list: listUri,
        limit: "100",
        cursor,
      },
    );

    items.push(...response.items);
    cursor = response.cursor;
  } while (cursor);

  return items;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function getProfiles(dids: string[]): Promise<Map<string, ProfileView>> {
  const uniqueDids = [...new Set(dids)];
  const missingDids = uniqueDids.filter((did) => !profileCache.has(did));

  for (const didBatch of chunk(missingDids, GET_PROFILES_BATCH_SIZE)) {
    const response = await fetchJson<GetProfilesResponse>(
      "/xrpc/app.bsky.actor.getProfiles",
      {
        actors: didBatch,
      },
    );

    for (const profile of response.profiles) {
      profileCache.set(profile.did, profile);
    }
  }

  const profiles = new Map<string, ProfileView>();
  for (const did of uniqueDids) {
    const profile = profileCache.get(did);
    if (profile) {
      profiles.set(did, profile);
    }
  }

  return profiles;
}

async function getProfilesWithProgress(
  dids: string[],
  listName: string,
): Promise<Map<string, ProfileView>> {
  const uniqueDids = [...new Set(dids)];
  const missingDids = uniqueDids.filter((did) => !profileCache.has(did));
  const total = uniqueDids.length;

  if (missingDids.length === 0) {
    renderProgress(`Auditing ${listName} (${total}/${total})`);
    return getProfiles(uniqueDids);
  }

  let completed = total - missingDids.length;
  renderProgress(`Auditing ${listName} (${completed}/${total})`);

  for (const didBatch of chunk(missingDids, GET_PROFILES_BATCH_SIZE)) {
    await getProfiles(didBatch);
    completed += didBatch.length;
    renderProgress(`Auditing ${listName} (${completed}/${total})`);
  }

  return getProfiles(uniqueDids);
}

async function getProfile(actor: string): Promise<ProfileView> {
  const cachedProfile = profileCache.get(actor);
  if (cachedProfile) {
    return cachedProfile;
  }

  const response = await fetchJson<ProfileView>(
    "/xrpc/app.bsky.actor.getProfile",
    { actor },
  );
  profileCache.set(response.did, response);
  profileCache.set(response.handle, response);
  return response;
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/^@/, "").replace(/\s+/g, " ").toLowerCase();
}

function getVerifierMatchScore(candidate: ProfileView, query: string): number {
  const normalizedQuery = normalizeLabel(query);
  const normalizedHandle = normalizeLabel(candidate.handle);
  const normalizedDisplayName = normalizeLabel(candidate.displayName ?? "");

  if (normalizedHandle === normalizedQuery) {
    return 100;
  }

  if (normalizedDisplayName === normalizedQuery) {
    return 95;
  }

  if (normalizedHandle.startsWith(`${normalizedQuery}.`)) {
    return 90;
  }

  if (normalizedDisplayName.includes(normalizedQuery)) {
    return 75;
  }

  if (normalizedHandle.includes(normalizedQuery)) {
    return 70;
  }

  return 0;
}

function isTrustedVerifier(profile: ProfileView | undefined): boolean {
  return profile?.verification?.trustedVerifierStatus === "valid";
}

function isVerifiedAccount(profile: ProfileView | undefined): boolean {
  return profile?.verification?.verifiedStatus === "valid";
}

function isVerifiedOrTrustedAccount(profile: ProfileView | undefined): boolean {
  return isVerifiedAccount(profile) || isTrustedVerifier(profile);
}

function hasValidVerificationFromIssuer(
  profile: ProfileView | undefined,
  issuerDid: string,
): boolean {
  return (
    profile?.verification?.verifications?.some(
      (verification) => verification.issuer === issuerDid && verification.isValid,
    ) ?? false
  );
}

async function getVerifierDidsForSubject(subjectDid: string): Promise<Set<string>> {
  const cached = subjectVerifierCache.get(subjectDid);
  if (cached) {
    return cached;
  }

  const url = new URL("/links/distinct-dids", CONSTELLATION_BASE_URL);
  url.searchParams.set("target", subjectDid);
  url.searchParams.set("collection", "app.bsky.graph.verification");
  url.searchParams.set("path", ".subject");

  stats.requests += 1;
  if (verboseLogging) {
    console.log(`[request] initial GET ${url.toString()}`);
  }

  const response = await fetchConstellationJson<{
    linking_dids?: string[];
  }>("/links/distinct-dids", {
    target: subjectDid,
    collection: "app.bsky.graph.verification",
    path: ".subject",
  });
  if (verboseLogging) {
    console.log(`[response] 200 ${url.toString()}`);
  }

  const verifierDids = new Set(response.linking_dids ?? []);
  subjectVerifierCache.set(subjectDid, verifierDids);
  return verifierDids;
}

async function hasVerificationFromIssuer(
  profile: ProfileView | undefined,
  issuerDid: string,
): Promise<boolean> {
  if (!profile) {
    return false;
  }

  if (hasValidVerificationFromIssuer(profile, issuerDid)) {
    return true;
  }

  const verifierDids = await getVerifierDidsForSubject(profile.did);
  return verifierDids.has(issuerDid);
}

async function resolveVerifierFromListTitle(
  verifierLabel: string,
): Promise<ProfileView | null> {
  const cacheKey = normalizeLabel(verifierLabel);
  if (verifierSearchCache.has(cacheKey)) {
    return verifierSearchCache.get(cacheKey) ?? null;
  }

  const overrideHandle = VERIFIER_TITLE_OVERRIDES[cacheKey];
  if (overrideHandle) {
    try {
      const resolution = await fetchJson<ResolveHandleResponse>(
        "/xrpc/com.atproto.identity.resolveHandle",
        { handle: overrideHandle },
      );
      const profile = await getProfile(resolution.did);
      verifierSearchCache.set(cacheKey, profile);
      return profile;
    } catch {
      // Fall through to the default resolution paths.
    }
  }

  const looksLikeHandle = /^[^@\s]+\.[^@\s]+$/.test(cacheKey);
  if (looksLikeHandle) {
    try {
      const resolution = await fetchJson<ResolveHandleResponse>(
        "/xrpc/com.atproto.identity.resolveHandle",
        { handle: cacheKey },
      );
      const profile = await getProfile(resolution.did);
      verifierSearchCache.set(cacheKey, profile);
      return profile;
    } catch {
      // Fall through to search-based resolution.
    }
  }

  const response = await fetchJson<SearchActorsTypeaheadResponse>(
    "/xrpc/app.bsky.actor.searchActorsTypeahead",
    {
      q: verifierLabel,
      limit: String(SEARCH_CANDIDATE_LIMIT),
    },
  );

  const rankedCandidates = response.actors
    .map((candidate) => ({
      candidate,
      score: getVerifierMatchScore(candidate, verifierLabel),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return Number(isTrustedVerifier(right.candidate)) -
        Number(isTrustedVerifier(left.candidate));
    });

  const bestMatch = rankedCandidates[0]?.candidate ?? null;
  verifierSearchCache.set(cacheKey, bestMatch);
  return bestMatch;
}

function printFinding(finding: Finding): void {
  const prefix = finding.severity === "error" ? "ERROR" : "WARN";
  console.log(`[${prefix}] ${finding.listName}: ${finding.message}`);
}

function pushFinding(findings: Finding[], finding: Finding): void {
  findings.push(finding);
}

function printGroupedHandles(
  title: string,
  entries: Map<string, Set<string>>,
): void {
  if (entries.size === 0) {
    return;
  }

  console.log("");
  console.log(title);

  const sortedLists = [...entries.keys()].sort((left, right) =>
    left.localeCompare(right),
  );

  for (const listName of sortedLists) {
    const handles = [...(entries.get(listName) ?? [])].sort((left, right) =>
      left.localeCompare(right),
    );
    console.log(`- ${listName}: ${handles.length}`);
    console.log(`  ${handles.join(", ")}`);
  }
}

function printVerifierSummary(findings: Finding[]): void {
  const verifierProblems = findings.filter(
    (finding) =>
      finding.category === "verifier_unresolved" ||
      finding.category === "verifier_not_trusted",
  );

  if (verifierProblems.length === 0) {
    return;
  }

  console.log("");
  console.log("Verifier issues");

  for (const finding of verifierProblems) {
    const verifierText = finding.verifierHandle ?? finding.verifierLabel ?? "unknown";
    console.log(`- ${finding.listName}: ${verifierText}`);
  }
}

export function printSummary(
  findings: Finding[],
  lists: ListView[],
  requestStats: RequestStats,
): void {
  const errorFindings = findings.filter((finding) => finding.severity === "error");
  const warningFindings = findings.filter((finding) => finding.severity === "warn");

  const findingsByCategory = new Map<Finding["category"], number>();
  for (const finding of findings) {
    findingsByCategory.set(
      finding.category,
      (findingsByCategory.get(finding.category) ?? 0) + 1,
    );
  }

  const unresolvedVerifierCount =
    findingsByCategory.get("verifier_unresolved") ?? 0;
  const untrustedVerifierCount =
    findingsByCategory.get("verifier_not_trusted") ?? 0;
  const missingProfileCount = findingsByCategory.get("missing_profile") ?? 0;
  const notVerifiedCount = findingsByCategory.get("member_not_verified") ?? 0;
  const wrongVerifierCount =
    findingsByCategory.get("member_wrong_verifier") ?? 0;
  const noRuleCount = findingsByCategory.get("list_without_rule") ?? 0;

  const unverifiedByList = new Map<string, Set<string>>();
  const wrongVerifierByList = new Map<string, Set<string>>();

  for (const finding of findings) {
    if (finding.category === "member_not_verified" && finding.subjectHandle) {
      const current = unverifiedByList.get(finding.listName) ?? new Set<string>();
      current.add(finding.subjectHandle);
      unverifiedByList.set(finding.listName, current);
    }

    if (finding.category === "member_wrong_verifier" && finding.subjectHandle) {
      const current = wrongVerifierByList.get(finding.listName) ?? new Set<string>();
      const label = finding.verifierHandle
        ? `${finding.subjectHandle} (expected ${finding.verifierHandle})`
        : finding.subjectHandle;
      current.add(label);
      wrongVerifierByList.set(finding.listName, current);
    }
  }

  console.log("");
  console.log("Audit summary");
  console.log(`Lists checked: ${lists.length}`);
  console.log(
    `Verified-by lists: ${lists.filter((list) => list.name.startsWith(VERIFIED_BY_PREFIX)).length}`,
  );
  console.log(
    `Special lists: ${lists.filter((list) => !list.name.startsWith(VERIFIED_BY_PREFIX)).length}`,
  );
  console.log(`Requests: ${requestStats.requests}`);
  console.log(`Retries: ${requestStats.retries}`);
  console.log(`429 responses: ${requestStats.rateLimitedResponses}`);
  console.log(`Errors: ${errorFindings.length}`);
  console.log(`Warnings: ${warningFindings.length}`);
  console.log(`Unresolved verifiers: ${unresolvedVerifierCount}`);
  console.log(`Untrusted verifiers: ${untrustedVerifierCount}`);
  console.log(`Missing profiles: ${missingProfileCount}`);
  console.log(`Unverified members: ${notVerifiedCount}`);
  console.log(`Wrong-verifier members: ${wrongVerifierCount}`);
  console.log(`Lists without audit rule: ${noRuleCount}`);

  printVerifierSummary(findings);
  printGroupedHandles("Unverified members", unverifiedByList);
  printGroupedHandles("Wrong-verifier members", wrongVerifierByList);
}

async function auditVerifiedByList(
  list: ListView,
  findings: Finding[],
): Promise<void> {
  renderProgress(`Auditing ${list.name} (resolving verifier)`);
  const verifierLabel = list.name.slice(VERIFIED_BY_PREFIX.length).trim();
  const verifier = await resolveVerifierFromListTitle(verifierLabel);

  if (!verifier) {
    finishProgress(`Auditing ${list.name}: verifier could not be resolved`);
    pushFinding(findings, {
      severity: "error",
      category: "verifier_unresolved",
      listName: list.name,
      message: `could not resolve "${verifierLabel}" to a trusted verifier via public API search`,
      verifierLabel,
      listUri: list.uri,
    });
    return;
  }

  if (!isTrustedVerifier(verifier)) {
    finishProgress(`Auditing ${list.name}: verifier ${verifier.handle} is not trusted`);
    pushFinding(findings, {
      severity: "error",
      category: "verifier_not_trusted",
      listName: list.name,
      message: `${verifier.handle} resolved from list title but is not a trusted verifier`,
      verifierHandle: verifier.handle,
      verifierDid: verifier.did,
      verifierLabel,
      listUri: list.uri,
    });
    return;
  }

  renderProgress(`Auditing ${list.name} (loading items)`);
  const items = await getAllListItems(list.uri);
  const profiles = await getProfilesWithProgress(
    items.map((item) => item.subject.did),
    list.name,
  );

  finishProgress(
    `Auditing ${list.name}: ${items.length} item(s), verifier ${verifier.handle}`,
  );

  for (const item of items) {
    const profile = profiles.get(item.subject.did);

    if (!profile) {
      pushFinding(findings, {
        severity: "error",
        category: "missing_profile",
        listName: list.name,
        message: `missing profile data for ${item.subject.handle} (${item.subject.did})`,
        subjectHandle: item.subject.handle,
        subjectDid: item.subject.did,
        verifierHandle: verifier.handle,
        verifierDid: verifier.did,
        listUri: list.uri,
        listItemUri: item.uri,
      });
      continue;
    }

    if (!isVerifiedAccount(profile)) {
      pushFinding(findings, {
        severity: "error",
        category: "member_not_verified",
        listName: list.name,
        message: `${profile.handle} is in the list but does not have verifiedStatus=valid`,
        subjectHandle: profile.handle,
        subjectDid: profile.did,
        verifierHandle: verifier.handle,
        verifierDid: verifier.did,
        listUri: list.uri,
        listItemUri: item.uri,
      });
      continue;
    }

    if (!(await hasVerificationFromIssuer(profile, verifier.did))) {
      pushFinding(findings, {
        severity: "error",
        category: "member_wrong_verifier",
        listName: list.name,
        message: `${profile.handle} is verified, but not by ${verifier.handle}`,
        subjectHandle: profile.handle,
        subjectDid: profile.did,
        verifierHandle: verifier.handle,
        verifierDid: verifier.did,
        listUri: list.uri,
        listItemUri: item.uri,
      });
    }
  }
}

async function auditTrustedVerifiersList(
  list: ListView,
  findings: Finding[],
): Promise<void> {
  renderProgress(`Auditing ${list.name} (loading items)`);
  const items = await getAllListItems(list.uri);
  const profiles = await getProfilesWithProgress(
    items.map((item) => item.subject.did),
    list.name,
  );

  finishProgress(`Auditing ${list.name}: ${items.length} item(s)`);

  for (const item of items) {
    const profile = profiles.get(item.subject.did);

    if (!isTrustedVerifier(profile)) {
      pushFinding(findings, {
        severity: "error",
        category: "member_not_verified",
        listName: list.name,
        message: `${item.subject.handle} is in Trusted Verifiers but does not have trustedVerifierStatus=valid`,
        subjectHandle: item.subject.handle,
        subjectDid: item.subject.did,
        listUri: list.uri,
        listItemUri: item.uri,
      });
    }
  }
}

async function auditVerifiedAccountsList(
  list: ListView,
  findings: Finding[],
): Promise<void> {
  renderProgress(`Auditing ${list.name} (loading items)`);
  const items = await getAllListItems(list.uri);
  const profiles = await getProfilesWithProgress(
    items.map((item) => item.subject.did),
    list.name,
  );

  finishProgress(`Auditing ${list.name}: ${items.length} item(s)`);

  for (const item of items) {
    const profile = profiles.get(item.subject.did);

    if (!isVerifiedOrTrustedAccount(profile)) {
      pushFinding(findings, {
        severity: "error",
        category: "member_not_verified",
        listName: list.name,
        message: `${item.subject.handle} is in the list but is neither verified nor a trusted verifier`,
        subjectHandle: item.subject.handle,
        subjectDid: item.subject.did,
        listUri: list.uri,
        listItemUri: item.uri,
      });
    }
  }
}

export async function runAudit(options: AuditOptions = {}): Promise<AuditRunResult> {
  stats = createStats();
  verboseLogging = options.verbose ?? false;
  const lists = await getAllLists(LIST_OWNER_DID);
  const findings: Finding[] = [];

  console.log(`Fetched ${lists.length} list(s) from verified.evil.gay`);

  for (const list of lists) {
    if (list.name.startsWith(VERIFIED_BY_PREFIX)) {
      await auditVerifiedByList(list, findings);
      continue;
    }

    if (list.name === TRUSTED_VERIFIERS_LIST_NAME) {
      await auditTrustedVerifiersList(list, findings);
      continue;
    }

    if (list.name === ALL_VERIFIED_ACCOUNTS_LIST_NAME) {
      await auditVerifiedAccountsList(list, findings);
      continue;
    }

    pushFinding(findings, {
      severity: "warn",
      category: "list_without_rule",
      listName: list.name,
      message: "no audit rule matched this list name",
    });
  }

  return {
    lists,
    findings,
    stats: { ...stats },
  };
}

async function main(): Promise<void> {
  const verbose = process.argv.includes("--verbose");
  const result = await runAudit({ verbose });

  printSummary(result.findings, result.lists, result.stats);

  if (result.findings.length > 0) {
    console.log("");
    for (const finding of result.findings) {
      printFinding(finding);
    }
  }

  if (result.findings.some((finding) => finding.severity === "error")) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
