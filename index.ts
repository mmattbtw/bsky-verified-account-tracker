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

const ALL_VERIFIED_LIST = "3lngcmewutk2z";

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

  // Bluesky
  if (event.did === "did:plc:z72i7hdynmk6r22z27h6tvur") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by Bluesky.");
    await bot.post({
      text: richText,
    });

    // All Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${ALL_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
    // Bluesky Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${BSKY_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
  // The Athletic
  if (event.did === "did:plc:b2kutgxqlltwc6lhs724cfwr") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by ")
      .addMention(
        // TODO: probably don't hardcode this handle.
        `@theathletic.bsky.social`,
        "did:plc:b2kutgxqlltwc6lhs724cfwr"
      )
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
    // The Athletic Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${THE_ATHLETIC_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
  // WIRED
  if (event.did === "did:plc:inz4fkbbp7ms3ixufw6xuvdi") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by ")
      .addMention(`@wired.com`, "did:plc:inz4fkbbp7ms3ixufw6xuvdi")
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

    // Wired Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${WIRED_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
  // NYT
  if (event.did === "did:plc:eclio37ymobqex2ncko63h4r") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by ")
      .addMention(`@nytimes.com`, "did:plc:eclio37ymobqex2ncko63h4r")
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

    // NYT Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${NYT_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
  // NBC
  if (event.did === "did:plc:wmho6q2uiyktkam3jsvrms3s") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by ")
      .addMention(`@nbcnews.com`, "did:plc:wmho6q2uiyktkam3jsvrms3s")
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

    // NBC Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${NBC_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
  // Yahoo Finance
  if (event.did === "did:plc:sqbswn3lalcc2dlh2k7zdpuw") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by ")
      .addMention(`@yahoofinance.com`, "did:plc:sqbswn3lalcc2dlh2k7zdpuw")
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

    // Yahoo Finance Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${YAHOO_FINANCE_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
  // The Globe and Mail
  if (event.did === "did:plc:y3xrmnwvkvsq4tqcsgwch4na") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by ")
      .addMention(`@theglobeandmail.com`, "did:plc:y3xrmnwvkvsq4tqcsgwch4na")
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

    // The Globe and Mail Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${GLOBAL_MAIL_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
  // LA Times
  if (event.did === "did:plc:d2jith367s6ybc3ldsusgdae") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by ")
      .addMention(`@latimes.com`, "did:plc:d2jith367s6ybc3ldsusgdae")
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

    // LA Times Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${LA_TIMES_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
  // CNN
  if (event.did === "did:plc:dzezcmpb3fhcpns4n4xm4ur5") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by ")
      .addMention(`@cnn.com`, "did:plc:dzezcmpb3fhcpns4n4xm4ur5")
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

    // CNN Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${CNN_VERIFIED_LIST}`,
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }

  // IGN
  if (event.did === "did:plc:xwqgusybtrpm67tcwqdfmzvy") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by ")
      .addMention(`@ign.com`, "did:plc:xwqgusybtrpm67tcwqdfmzvy")
      .addText(".");
    await bot.post({
      text: richText,
    });
  }

  // All Verified Accounts List
  await bot.createRecord("app.bsky.graph.listitem", {
    list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${ALL_VERIFIED_LIST}`,
    // @ts-ignore
    subject: event.commit.record.subject,
  });

  // IGN Verified Accounts List
  await bot.createRecord("app.bsky.graph.listitem", {
    list: `at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/${IGN_VERIFIED_LIST}`,
    // @ts-ignore
    subject: event.commit.record.subject,
  });
});
