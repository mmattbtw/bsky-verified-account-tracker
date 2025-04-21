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
});
jetstream.start();

jetstream.onCreate("app.bsky.graph.verification", (event) => {
  console.log(event);
  const richText = new RichText()
    .addMention(event.did, event.did)
    .addText(" has been verified.");
  bot.post({
    text: richText,
  });
});
