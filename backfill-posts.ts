import { configDotenv } from "dotenv";
import { and, eq } from "drizzle-orm";
import { db, verifiedUsers } from "./src/db/index.js";
import { isBlacklistedVerifierDid } from "./src/verifiers.js";

configDotenv();

type VerificationRecord = {
  uri: string;
  cid: string;
  value: {
    subject: string;
    createdAt: string;
  };
};

// Verifier DIDs from the main script
const VERIFIER_DIDS = [
  "did:plc:z72i7hdynmk6r22z27h6tvur", // Bluesky
  "did:plc:b2kutgxqlltwc6lhs724cfwr", // The Athletic
  "did:plc:inz4fkbbp7ms3ixufw6xuvdi", // Wired
  "did:plc:eclio37ymobqex2ncko63h4r", // NYT
  "did:plc:wmho6q2uiyktkam3jsvrms3s", // NBC
  "did:plc:sqbswn3lalcc2dlh2k7zdpuw", // Yahoo Finance
  "did:plc:y3xrmnwvkvsq4tqcsgwch4na", // Global Mail
  "did:plc:d2jith367s6ybc3ldsusgdae", // LA Times
  "did:plc:dzezcmpb3fhcpns4n4xm4ur5", // CNN
  "did:plc:xwqgusybtrpm67tcwqdfmzvy", // IGN
  "did:plc:hbdc3q6k5lforao5vyuarvsp", // Rest of World
  "did:plc:oxo226vi7t2btjokm2buusoy", // European Commission
  "did:plc:2w45zyhuklwihpdc7oj3mi63", // Forbes
  "did:plc:ofbkqcjzvm6gtwuufsubnkaf", // MS NOW
  "did:plc:rk25gdgk3cnnmtkvlae265nz", // City of Toronto
  "did:plc:j4eroku3volozvv6ljsnnfec", // HuffPost
  "did:plc:m7ks2xhfuku7errrtfjux2lg", // CNBC
];

// Cache for resolved PDS servers
const pdsCache = new Map<string, string>();

async function resolveDidToPds(did: string): Promise<string> {
  // Check cache first
  if (pdsCache.has(did)) {
    return pdsCache.get(did)!;
  }

  try {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(
        did,
      )}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const pds = data.pds || "https://bsky.social";
    pdsCache.set(did, pds);
    console.log(`🔍 Resolved ${did} to PDS: ${pds}`);
    return pds;
  } catch (error) {
    console.log(`⚠️  Failed to resolve ${did}, using default PDS: ${error}`);
    const defaultPds = "https://bsky.social";
    pdsCache.set(did, defaultPds);
    return defaultPds;
  }
}

async function fetchVerificationRecords(
  verifierDid: string,
  cursor?: string,
): Promise<{ records: VerificationRecord[]; cursor?: string }> {
  try {
    // Resolve the DID to get the correct PDS server
    const pds = await resolveDidToPds(verifierDid);

    // Build the URL for the listRecords endpoint
    const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set("repo", verifierDid);
    url.searchParams.set("collection", "app.bsky.graph.verification");
    url.searchParams.set("limit", "100");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const records: VerificationRecord[] = data.records.map((record: any) => ({
      uri: record.uri,
      cid: record.cid,
      value: record.value as {
        subject: string;
        createdAt: string;
      },
    }));

    return {
      records,
      cursor: data.cursor,
    };
  } catch (error) {
    console.log(
      `⚠️  Failed to fetch verification records for ${verifierDid}: ${error}`,
    );
    return {
      records: [],
      cursor: undefined,
    };
  }
}

async function hasAlreadyRecorded(
  subjectDid: string,
  verifierDid: string,
): Promise<boolean> {
  const existing = await db
    .select()
    .from(verifiedUsers)
    .where(
      and(
        eq(verifiedUsers.subjectDid, subjectDid),
        eq(verifiedUsers.verifierDid, verifierDid),
      ),
    )
    .limit(1);

  return existing.length > 0;
}

async function recordVerification(
  subjectDid: string,
  verifierDid: string,
  verifiedAt: number,
): Promise<void> {
  try {
    // Insert verification record
    await db.insert(verifiedUsers).values({
      subjectDid,
      verifierDid,
      verifiedAt,
      createdAt: new Date(),
    });

    console.log(
      `✅ Recorded verification: ${subjectDid} verified by ${verifierDid}`,
    );
  } catch (error) {
    console.log(
      `⚠️  Verification already recorded for ${subjectDid} by ${verifierDid}`,
    );
  }
}

async function backfillVerifier(verifierDid: string): Promise<void> {
  console.log(`\n🔄 Backfilling verifications for ${verifierDid}...`);

  let cursor: string | undefined;
  let totalProcessed = 0;
  let totalRecorded = 0;

  try {
    while (true) {
      const { records, cursor: nextCursor } = await fetchVerificationRecords(
        verifierDid,
        cursor,
      );

      if (records.length === 0) {
        break;
      }

      console.log(`📄 Processing ${records.length} verification records...`);

      for (const record of records) {
        totalProcessed++;
        const subjectDid = record.value.subject;
        const verifiedAt = new Date(record.value.createdAt).getTime();

        // Check if we've already recorded this verification
        const alreadyRecorded = await hasAlreadyRecorded(
          subjectDid,
          verifierDid,
        );
        if (alreadyRecorded) {
          console.log(`⏭️  Skipping already recorded: ${subjectDid}`);
          continue;
        }

        // Record the verification
        await recordVerification(subjectDid, verifierDid, verifiedAt);
        totalRecorded++;

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      cursor = nextCursor;
      if (!cursor) {
        break;
      }

      // Delay between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      `✅ Completed backfill for ${verifierDid}: ${totalRecorded}/${totalProcessed} new records`,
    );
  } catch (error) {
    console.error(`❌ Error backfilling ${verifierDid}:`, error);
  }
}

async function main() {
  console.log("🚀 Starting verification backfill...");

  try {
    for (const verifierDid of VERIFIER_DIDS) {
      if (isBlacklistedVerifierDid(verifierDid)) {
        console.log(`⏭️  Skipping blacklisted verifier: ${verifierDid}`);
        continue;
      }

      await backfillVerifier(verifierDid);
    }

    console.log("\n🎉 Backfill completed!");

    // Show summary
    const totalVerifications = await db
      .select({ count: verifiedUsers.subjectDid })
      .from(verifiedUsers);

    console.log(
      `📊 Total verifications in database: ${totalVerifications.length}`,
    );
  } catch (error) {
    console.error("❌ Backfill failed:", error);
    process.exit(1);
  }
}

// Run the backfill
main();
