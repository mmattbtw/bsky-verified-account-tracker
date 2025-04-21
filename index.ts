import { Bot, RichText } from "@skyware/bot";
import { Jetstream } from "@skyware/jetstream";
import { configDotenv } from "dotenv";
import WebSocket from "ws";

configDotenv();

const bot = new Bot({
  service: "https://pds.mmatt.net",
});
await bot.login({
  identifier: process.env.BSKY_USERNAME ?? "",
  password: process.env.BSKY_PASSWORD ?? "",
});

const jetstream = new Jetstream({
  ws: WebSocket,
  wantedCollections: ["app.bsky.graph.verification"],
  cursor: process.env.JETSTREAM_CURSOR
    ? parseInt(process.env.JETSTREAM_CURSOR)
    : undefined,
});
jetstream.start();

jetstream.onCreate("app.bsky.graph.verification", (event) => {
  console.log(event);
  if (event.did === "did:plc:z72i7hdynmk6r22z27h6tvur") {
    const richText = new RichText()
      // @ts-ignore
      .addMention(event.commit.record.handle, event.commit.record.did)
      .addText(" has been verified by Bluesky.");
    bot.post({
      text: richText,
    });
  }
});
