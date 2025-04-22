import { Bot, RichText } from "@skyware/bot";
import { Jetstream } from "@skyware/jetstream";
import { configDotenv } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import WebSocket from "ws";

configDotenv();

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
      list: "at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/3lngcmewutk2z",
      // @ts-ignore
      subject: event.commit.record.subject,
    });
    // Bluesky Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: "at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/3lngcmmcczc2z",
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
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
      list: "at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/3lngcmewutk2z",
      // @ts-ignore
      subject: event.commit.record.subject,
    });
    // The Athletic Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: "at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/3lngcntqojk2z",
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
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
      list: "at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/3lngcmewutk2z",
      // @ts-ignore
      subject: event.commit.record.subject,
    });

    // Wired Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: "at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/3lngcn3ndvs2z",
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
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
      list: "at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/3lngcmewutk2z",
      // @ts-ignore
      subject: event.commit.record.subject,
    });

    // NYT Verified Accounts List
    await bot.createRecord("app.bsky.graph.listitem", {
      list: "at://did:plc:k3lft27u2pjqp2ptidkne7xr/app.bsky.graph.list/3lngcngulys2z",
      // @ts-ignore
      subject: event.commit.record.subject,
    });
  }
});

// jetstream.onDelete("app.bsky.graph.verification", (event) => {
//   console.log(event);
//   writeFileSync("cursor.txt", event.time_us.toString());

//   // if (event.did === "did:plc:z72i7hdynmk6r22z27h6tvur") {
//   const richText = new RichText()
//     .addText("❌ ")
//     // @ts-ignore
//     // .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
//     .addText(`${event.commit.record.handle}`)
//     .addText(" has been unverified.");
//   bot.post({ text: richText });
//   // }
//   if (event.did === "did:plc:b2kutgxqlltwc6lhs724cfwr") {
//     const richText = new RichText()
//       .addText("❌ ")
//       // @ts-ignore
//       .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
//       .addText(" has been unverified by ")
//       .addMention(
//         // TODO: probably don't hardcode this handle.
//         `@theathletic.bsky.social`,
//         "did:plc:b2kutgxqlltwc6lhs724cfwr"
//       )
//       .addText(".");
//     bot.post({ text: richText });
//   }
//   if (event.did === "did:plc:inz4fkbbp7ms3ixufw6xuvdi") {
//     const richText = new RichText()
//       .addText("❌ ")
//       // @ts-ignore
//       .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
//       .addText(" has been unverified by ")
//       .addMention(`@wired.com`, "did:plc:inz4fkbbp7ms3ixufw6xuvdi")
//       .addText(".");
//     bot.post({ text: richText });
//   }
//   if (event.did === "did:plc:eclio37ymobqex2ncko63h4r") {
//     const richText = new RichText()
//       .addText("❌ ")
//       // @ts-ignore
//       .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
//       .addText(" has been unverified by ")
//       .addMention(`@nytimes.com`, "did:plc:eclio37ymobqex2ncko63h4r")
//       .addText(".");
//     bot.post({ text: richText });
//   }
// });
