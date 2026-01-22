import { Bot } from "@skyware/bot";
import { configDotenv } from "dotenv";
import { and, eq } from "drizzle-orm";
import { db, listItems } from "./src/db/index.js";

configDotenv();

const BSKY_VERIFIED_LIST = "3lngcmmcczc2z";
const THE_ATHLETIC_VERIFIED_LIST = "3lngcntqojk2z";
const WIRED_VERIFIED_LIST = "3lngcn3ndvs2z";
const NYT_VERIFIED_LIST = "3lngcngulys2z";
const NBC_VERIFIED_LIST = "3lpsilsxujs2p";
const YAHOO_FINANCE_VERIFIED_LIST = "3lpsimccolk2p";
const GLOBAL_MAIL_VERIFIED_LIST = "3lpsimsbai22p";
const CNN_VERIFIED_LIST = "3lpsin5ibqc2p";
const LA_TIMES_VERIFIED_LIST = "3lpsints3js2p";
const IGN_VERIFIED_LIST = "3lrdq5yralk2v";
const REST_OF_WORLD_VERIFIED_LIST = "3mcy6uxiul227";
const EUROPEAN_COMMISSION_VERIFIED_LIST = "3mcy6vazask27";
const FORBES_VERIFIED_LIST = "3mcy6vhkrv227";
const MS_NOW_VERIFIED_LIST = "3mcy6vnpvis27";
const CITY_OF_TORONTO_VERIFIED_LIST = "3mcy6vvbkvk27";
const HUFFPOST_VERIFIED_LIST = "3mcy6w3y26k27";

const VERIFIED_LISTS = {
  "did:plc:z72i7hdynmk6r22z27h6tvur": BSKY_VERIFIED_LIST,
  "did:plc:b2kutgxqlltwc6lhs724cfwr": THE_ATHLETIC_VERIFIED_LIST,
  "did:plc:inz4fkbbp7ms3ixufw6xuvdi": WIRED_VERIFIED_LIST,
  "did:plc:eclio37ymobqex2ncko63h4r": NYT_VERIFIED_LIST,
  "did:plc:wmho6q2uiyktkam3jsvrms3s": NBC_VERIFIED_LIST,
  "did:plc:sqbswn3lalcc2dlh2k7zdpuw": YAHOO_FINANCE_VERIFIED_LIST,
  "did:plc:y3xrmnwvkvsq4tqcsgwch4na": GLOBAL_MAIL_VERIFIED_LIST,
  "did:plc:d2jith367s6ybc3ldsusgdae": LA_TIMES_VERIFIED_LIST,
  "did:plc:dzezcmpb3fhcpns4n4xm4ur5": CNN_VERIFIED_LIST,
  "did:plc:xwqgusybtrpm67tcwqdfmzvy": IGN_VERIFIED_LIST,
  "did:plc:hbdc3q6k5lforao5vyuarvsp": REST_OF_WORLD_VERIFIED_LIST,
  "did:plc:oxo226vi7t2btjokm2buusoy": EUROPEAN_COMMISSION_VERIFIED_LIST,
  "did:plc:2w45zyhuklwihpdc7oj3mi63": FORBES_VERIFIED_LIST,
  "did:plc:ofbkqcjzvm6gtwuufsubnkaf": MS_NOW_VERIFIED_LIST,
  "did:plc:rk25gdgk3cnnmtkvlae265nz": CITY_OF_TORONTO_VERIFIED_LIST,
  "did:plc:j4eroku3volozvv6ljsnnfec": HUFFPOST_VERIFIED_LIST,
} as Record<`did:${string}`, string>;

const ALL_VERIFIED_LIST = "3lngcmewutk2z";
const LIST_OWNER_DID = "did:plc:k3lft27u2pjqp2ptidkne7xr";

// Verifier DIDs
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
];

type VerificationRecord = {
  uri: string;
  cid: string;
  value: {
    subject: string;
    createdAt: string;
  };
};

type ConstellationResponse = {
  total: number;
  linking_dids: string[];
  cursor?: string;
};

let bot: Bot | null = null;

async function getBot(): Promise<Bot> {
  if (bot) {
    return bot;
  }

  bot = new Bot({
    service: process.env.BSKY_PDS,
  });

  await bot.login({
    identifier: process.env.BSKY_USERNAME ?? "",
    password: process.env.BSKY_PASSWORD ?? "",
  });

  return bot;
}

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
        did
      )}`
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
  cursor?: string
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
      `⚠️  Failed to fetch verification records for ${verifierDid}: ${error}`
    );
    return {
      records: [],
      cursor: undefined,
    };
  }
}

async function hasAlreadyAddedToList(
  subjectDid: string,
  verifierDid: string,
  listDid: string
): Promise<boolean> {
  // First check database
  const existing = await db
    .select()
    .from(listItems)
    .where(
      and(
        eq(listItems.subjectDid, subjectDid),
        eq(listItems.verifierDid, verifierDid),
        eq(listItems.listDid, listDid)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return true;
  }

  // Then check Constellation to see if the list item already exists in the specific list
  try {
    const listUri = `at://${LIST_OWNER_DID}/app.bsky.graph.list/${listDid}`;
    
    // Query Constellation to check if LIST_OWNER_DID has already added this subject to this specific list
    // We'll fetch list items and check if any match both the subject and list
    let cursor: string | undefined;
    let found = false;

    while (!found) {
      const url = new URL(
        `https://constellation.microcosm.blue/records`
      );
      url.searchParams.set("repo", LIST_OWNER_DID);
      url.searchParams.set("collection", "app.bsky.graph.listitem");
      url.searchParams.set("limit", "100");
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        // If Constellation check fails, assume not in list
        break;
      }

      const data = await response.json();
      const records = data.records || [];

      // Check if any list item matches both the subject and the specific list
      found = records.some((record: any) => {
        const value = record.value;
        return (
          value?.subject === subjectDid &&
          value?.list === listUri
        );
      });

      if (found) {
        console.log(
          `✅ Found existing list item in Constellation: ${subjectDid} in list ${listDid}`
        );
        return true;
      }

      cursor = data.cursor;
      if (!cursor) {
        break;
      }
    }

    return false;
  } catch (error) {
    // If Constellation check fails, assume not in list
    console.log(
      `⚠️  Failed to check Constellation for ${subjectDid} in list ${listDid}: ${error}`
    );
    return false;
  }
}

async function addToList(
  subjectDid: string,
  verifierDid: string,
  listId: string,
  verifiedAt: number
): Promise<string | null> {
  try {
    // Use bot.createRecord which uses putRecord internally and handles auth
    const botInstance = await getBot();

    const response = await botInstance.createRecord("app.bsky.graph.listitem", {
      list: `at://${LIST_OWNER_DID}/app.bsky.graph.list/${listId}`,
      subject: subjectDid as `did:${string}:${string}`,
    });

    const listUri = response.uri;

    // Record that we added this person to the list
    await db.insert(listItems).values({
      subjectDid,
      verifierDid,
      listDid: listId,
      listUri,
      addedAt: verifiedAt,
      createdAt: new Date(),
    });

    console.log(
      `✅ Added ${subjectDid} to list ${listId} (verified by ${verifierDid})`
    );
    return listUri;
  } catch (error: any) {
    // putRecord skips duplicates automatically, so check for "already exists" errors
    if (
      error.message?.includes("UNIQUE constraint failed") ||
      error.message?.includes("already exists")
    ) {
      console.log(`⏭️  Already in list ${listId}: ${subjectDid}`);
      return null;
    }
    console.log(`⚠️  Error adding ${subjectDid} to list ${listId}: ${error}`);
    return null;
  }
}

async function backfillVerifier(verifierDid: string): Promise<void> {
  console.log(`\n🔄 Backfilling lists for verifier ${verifierDid}...`);

  let cursor: string | undefined;
  let totalProcessed = 0;
  let totalAdded = 0;
  let totalSkipped = 0;

  try {
    while (true) {
      const { records, cursor: nextCursor } = await fetchVerificationRecords(
        verifierDid,
        cursor
      );

      if (records.length === 0) {
        break;
      }

      console.log(`📄 Processing ${records.length} verification records...`);

      for (const record of records) {
        totalProcessed++;
        const subjectDid = record.value.subject;
        const verifiedAt = new Date(record.value.createdAt).getTime();

        // Check if already added to "All Verified Accounts" list
        const allVerifiedAlreadyAdded = await hasAlreadyAddedToList(
          subjectDid,
          verifierDid,
          ALL_VERIFIED_LIST
        );

        if (!allVerifiedAlreadyAdded) {
          const uri = await addToList(
            subjectDid,
            verifierDid,
            ALL_VERIFIED_LIST,
            verifiedAt
          );
          if (uri) {
            totalAdded++;
          }
          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          totalSkipped++;
        }

        // Add to specific verifier list if one exists
        const verifiedList = VERIFIED_LISTS[verifierDid as `did:${string}`];
        if (verifiedList) {
          const verifierListAlreadyAdded = await hasAlreadyAddedToList(
            subjectDid,
            verifierDid,
            verifiedList
          );

          if (!verifierListAlreadyAdded) {
            const uri = await addToList(
              subjectDid,
              verifierDid,
              verifiedList,
              verifiedAt
            );
            if (uri) {
              totalAdded++;
            }
            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 100));
          } else {
            totalSkipped++;
          }
        }

        // Small delay between records
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      cursor = nextCursor;
      if (!cursor) {
        break;
      }

      // Delay between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      `✅ Completed backfill for ${verifierDid}: ${totalAdded}/${totalProcessed} new list items`
    );
  } catch (error) {
    console.error(`❌ Error backfilling ${verifierDid}:`, error);
  }
}

async function backfillLists() {
  console.log("🚀 Starting list backfill...");

  try {
    for (const verifierDid of VERIFIER_DIDS) {
      await backfillVerifier(verifierDid);
    }

    console.log("\n🎉 List backfill completed!");

    // Show final summary
    const totalListItems = await db
      .select({ count: listItems.subjectDid })
      .from(listItems);
    console.log(`\n📊 Total list items in database: ${totalListItems.length}`);
  } catch (error) {
    console.error("❌ List backfill failed:", error);
    process.exit(1);
  }
}

// Run the backfill
backfillLists();
