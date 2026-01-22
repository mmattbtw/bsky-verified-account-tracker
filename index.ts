import { Bot, RichText } from "@skyware/bot";
import { Jetstream } from "@skyware/jetstream";
import { configDotenv } from "dotenv";
import { and, eq } from "drizzle-orm";
import { readFileSync, writeFileSync } from "fs";
import WebSocket from "ws";
import { db, posts, verifiedUsers } from "./src/db/index.js";

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

const BSKY_DID = "did:plc:z72i7hdynmk6r22z27h6tvur";

const IS_DEV =
  process.env.NODE_ENV === "development" || process.env.DEV === "true";

console.log(`${IS_DEV ? "🟢" : "🔴"} DEV MODE`);

type BacklinkResponse = {
  total: number;
  linking_dids: string[];
  cursor?: string;
};

type VerificationEvent = {
  did: string;
  time_us: number;
  commit: {
    record: {
      $type: "app.bsky.graph.verification";
      handle: string;
      subject: string;
    };
  };
};

// should probably just make this redis  but whateva
let handleResolutions = new Map<`did:${string}`, string>();

async function resolveDID(did: `did:${string}`): Promise<string> {
  if (handleResolutions.has(did)) {
    console.log(":) CACHE HIT ", did);
    return handleResolutions.get(did) as string;
  }
  console.log(":( CACHE MISS ", did);
  const handle = (await bot.getProfile(did)).handle;
  handleResolutions.set(did, handle);
  return handle;
}

async function hasAlreadyPostedVerification(
  subjectDid: string,
  verifierDid: string
): Promise<boolean> {
  const existingVerification = await db
    .select()
    .from(verifiedUsers)
    .where(
      and(
        eq(verifiedUsers.subjectDid, subjectDid),
        eq(verifiedUsers.verifierDid, verifierDid)
      )
    )
    .limit(1);

  return existingVerification.length > 0;
}

async function recordVerification(
  subjectDid: string,
  verifierDid: string,
  verifiedAt: number,
  postUri: string
): Promise<void> {
  try {
    // Insert verification record (will fail if duplicate due to primary key constraint)
    await db.insert(verifiedUsers).values({
      subjectDid,
      verifierDid,
      verifiedAt,
      createdAt: new Date(),
    });

    // Record the post
    await db.insert(posts).values({
      subjectDid,
      verifierDid,
      postUri,
      createdAt: new Date(),
    });

    console.log(
      `Recorded verification: ${subjectDid} verified by ${verifierDid}`
    );
  } catch (error) {
    console.log(
      `Verification already recorded for ${subjectDid} by ${verifierDid}`
    );
    throw error; // Re-throw to indicate this is a duplicate
  }
}

const bot = new Bot({
  service: process.env.BSKY_PDS,
});
await bot.login({
  identifier: process.env.BSKY_USERNAME ?? "",
  password: process.env.BSKY_PASSWORD ?? "",
});

// Load cursor from file if it exists
let cursor: number | undefined;
try {
  cursor = parseInt(readFileSync("cursor.txt", "utf-8"));
} catch (error) {
  // File doesn't exist or can't be read, use undefined cursor
}

const jetstream = new Jetstream({
  ws: WebSocket,
  wantedCollections: ["app.bsky.graph.verification"],
  cursor: cursor,
});
jetstream.start();

jetstream.onCreate("app.bsky.graph.verification", async (event) => {
  console.log(event);
  // Save the current cursor to file
  writeFileSync("cursor.txt", event.time_us.toString());

  const backlinks = (await (
    await fetch(
      `https://constellation.microcosm.blue/links/distinct-dids?target=${event.did}&from_dids=${BSKY_DID}&collection=app.bsky.graph.verification&path=.subject`
    )
  ).json()) as BacklinkResponse;

  if (backlinks.linking_dids.length == 0 && !(event.did == BSKY_DID)) {
    console.log("No backlinks found, skipping verification.");
    return;
  }

  if (backlinks.linking_dids.includes(BSKY_DID) || event.did == BSKY_DID) {
    const subjectDid = (event.commit.record as any).subject;
    const verifierDid = event.did;

    // Check if we've already posted about this verification
    const alreadyPosted = await hasAlreadyPostedVerification(
      subjectDid,
      verifierDid
    );
    if (alreadyPosted) {
      console.log(
        `Already posted verification for ${subjectDid} by ${verifierDid}, skipping...`
      );
      return;
    }

    try {
      const isDev = process.env.NODE_ENV === "development";
      const subjectHandle = (event.commit.record as any).handle;
      const verifierHandle = await resolveDID(event.did as `did:${string}`);

      const richText = new RichText();

      if (isDev) {
        richText
          .addText("✅ ")
          .addText(`@${subjectHandle}`)
          .addText(" has been verified by ")
          .addText(`@${verifierHandle}`)
          .addText(".");
      } else {
        richText
          .addText("✅ ")
          .addMention(
            `@${subjectHandle}`,
            (event.commit.record as any).subject as `did:${string}:${string}`
          )
          .addText(" has been verified by ")
          .addMention(
            `@${verifierHandle}`,
            event.did as `did:${string}:${string}`
          )
          .addText(".");
      }

      const postResult = await bot.post({
        text: richText,
      });

      // Record the verification and post in database
      await recordVerification(
        subjectDid,
        verifierDid,
        event.time_us,
        postResult.uri
      );

      // All Verified Accounts List
      await bot.createRecord("app.bsky.graph.listitem", {
        list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${ALL_VERIFIED_LIST}`,
        subject: (event.commit.record as any)
          .subject as `did:${string}:${string}`,
      });

      const verifiedList = VERIFIED_LISTS[event.did as `did:${string}`];
      if (verifiedList) {
        await bot.createRecord("app.bsky.graph.listitem", {
          list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${verifiedList}`,
          subject: (event.commit.record as any)
            .subject as `did:${string}:${string}`,
        });
      } else {
        console.log(`No verified list found for DID: ${event.did}`);
        const convoID = await bot.getConversationForMembers([
          "did:plc:tas6hj2xjrqben5653v5kohk",
        ]);

        const errorText = new RichText();
        if (isDev) {
          errorText
            .addText("No verified list found for ")
            .addText(`@${event.did}`);
        } else {
          errorText
            .addText("No verified list found for ")
            .addMention(
              `@${event.did}`,
              event.did as `did:${string}:${string}`
            );
        }

        await convoID.sendMessage({
          text: errorText,
        });
      }
    } catch (error: any) {
      if (error.message?.includes("UNIQUE constraint failed")) {
        console.log(
          `Duplicate verification detected for ${subjectDid} by ${verifierDid}, skipping...`
        );
        return;
      }
      console.error("Error posting verification:", error);
      throw error;
    }
  }
});
