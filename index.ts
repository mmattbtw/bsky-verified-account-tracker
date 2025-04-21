import { Bot, RichText } from "@skyware/bot";
import { Jetstream } from "@skyware/jetstream";
import { configDotenv } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import WebSocket from "ws";

configDotenv();

const bot = new Bot({
  service: "https://pds.mmatt.net",
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

jetstream.onCreate("app.bsky.graph.verification", (event) => {
  console.log(event);
  // Save the current cursor to file
  writeFileSync("cursor.txt", event.time_us.toString());

  if (event.did === "did:plc:z72i7hdynmk6r22z27h6tvur") {
    const richText = new RichText()
      .addText("✅ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been verified by Bluesky.");
    bot.post({
      text: richText,
    });
  }
});

jetstream.onDelete("app.bsky.graph.verification", (event) => {
  console.log(event);
  writeFileSync("cursor.txt", event.time_us.toString());

  if (event.did === "did:plc:z72i7hdynmk6r22z27h6tvur") {
    const richText = new RichText()
      .addText("❌ ")
      // @ts-ignore
      .addMention(`@${event.commit.record.handle}`, event.commit.record.subject)
      .addText(" has been unverified.");
    bot.post({ text: richText });
  }
});
