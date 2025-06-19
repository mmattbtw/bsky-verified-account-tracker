import { Bot, RichText } from "@skyware/bot";
import { Jetstream } from "@skyware/jetstream";
import { configDotenv } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import WebSocket from "ws";

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
} as Record<`did:${string}`, string>;

const ALL_VERIFIED_LIST = "3lngcmewutk2z";

const BSKY_DID = "did:plc:z72i7hdynmk6r22z27h6tvur";

type BacklinkResponse = {
  total: number;
  linking_dids: string[];
  cursor?: string;
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
      `https://constellation.microcosm.blue/links/distinct-dids?target=${event.did}&collection=app.bsky.graph.verification&path=.subject`
    )
  ).json()) as BacklinkResponse;

  if (backlinks.linking_dids.length == 0 && !(event.did == BSKY_DID)) {
    console.log("No backlinks found, skipping verification.");
    return;
  }

  if (backlinks.linking_dids.includes(BSKY_DID) || event.did == BSKY_DID) {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      // .addText(`@${event.commit.record.handle}`)
      .addText(" has been verified by ")
      .addMention(`@${await resolveDID(event.did)}`, event.did)
      // .addText(`@${await resolveDID(event.did)}`)
      .addText(".");
    await bot.post({
      text: richText,
    });

    // All Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${ALL_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });

    const verifiedList = VERIFIED_LISTS[event.did];
    if (verifiedList) {
      await bot.createRecord("app.bsky.graph.listitem", {
        list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${verifiedList}`,
        // @ts-ignore
        subject: event.commit.record.subject,
      });
    } else {
      console.log(`No verified list found for DID: ${event.did}`);
      const convoID = await bot.getConversationForMembers([
        "did:plc:tas6hj2xjrqben5653v5kohk",
      ]);
      await convoID.sendMessage({
        text: new RichText()
          .addText("No verified list found for ")
          .addMention(`@${event.did}`, event.did),
      });
    }
  }
});
