import { Bot } from "@skyware/bot";
import { configDotenv } from "dotenv";
import {
  getAllListItems,
  printSummary,
  runAudit,
  type Finding,
} from "./audit-lists.js";

configDotenv();

type PlannedDeletion = {
  uri: string;
  listName: string;
  reason: string;
};

const APPLY_FLAG = "--apply";
const DELETE_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addDeletion(
  deletions: Map<string, PlannedDeletion>,
  deletion: PlannedDeletion,
): void {
  if (!deletions.has(deletion.uri)) {
    deletions.set(deletion.uri, deletion);
  }
}

async function planDeletions(findings: Finding[]): Promise<PlannedDeletion[]> {
  const deletions = new Map<string, PlannedDeletion>();

  for (const finding of findings) {
    if (
      (finding.category === "member_not_verified" ||
        finding.category === "member_wrong_verifier" ||
        finding.category === "missing_profile") &&
      finding.listItemUri
    ) {
      addDeletion(deletions, {
        uri: finding.listItemUri,
        listName: finding.listName,
        reason: finding.message,
      });
      continue;
    }

    if (
      (finding.category === "verifier_unresolved" ||
        finding.category === "verifier_not_trusted") &&
      finding.listUri
    ) {
      const items = await getAllListItems(finding.listUri);
      for (const item of items) {
        addDeletion(deletions, {
          uri: item.uri,
          listName: finding.listName,
          reason: finding.message,
        });
      }
    }
  }

  return [...deletions.values()].sort((left, right) =>
    left.listName.localeCompare(right.listName) || left.uri.localeCompare(right.uri),
  );
}

function printDeletionPlan(deletions: PlannedDeletion[]): void {
  const byList = new Map<string, PlannedDeletion[]>();

  for (const deletion of deletions) {
    const current = byList.get(deletion.listName) ?? [];
    current.push(deletion);
    byList.set(deletion.listName, current);
  }

  console.log("");
  console.log("Deletion plan");
  console.log(`List items to delete: ${deletions.length}`);

  for (const listName of [...byList.keys()].sort((left, right) => left.localeCompare(right))) {
    const current = byList.get(listName) ?? [];
    console.log(`- ${listName}: ${current.length}`);
  }
}

async function getBot(): Promise<Bot> {
  const bot = new Bot({
    service: process.env.BSKY_PDS,
  });

  await bot.login({
    identifier: process.env.BSKY_USERNAME ?? "",
    password: process.env.BSKY_PASSWORD ?? "",
  });

  return bot;
}

async function applyDeletions(deletions: PlannedDeletion[]): Promise<void> {
  const bot = await getBot();
  let dbCleanup:
    | ((uri: string) => Promise<void>)
    | null = null;

  try {
    const [{ eq }, dbModule] = await Promise.all([
      import("drizzle-orm"),
      import("./src/db/index.js"),
    ]);
    dbCleanup = async (uri: string) => {
      await dbModule.db
        .delete(dbModule.listItems)
        .where(eq(dbModule.listItems.listUri, uri));
    };
  } catch (error) {
    console.warn(
      "Database cleanup unavailable in this Node environment; continuing with remote deletions only.",
      error,
    );
  }

  let deletedCount = 0;

  for (const deletion of deletions) {
    await bot.deleteRecord(deletion.uri);
    if (dbCleanup) {
      await dbCleanup(deletion.uri);
    }
    deletedCount += 1;
    console.log(`Deleted ${deletion.uri} (${deletion.reason})`);
    await sleep(DELETE_DELAY_MS);
  }

  console.log("");
  console.log(`Deleted ${deletedCount} list item(s).`);
}

async function main(): Promise<void> {
  const apply = process.argv.includes(APPLY_FLAG);
  const verbose = process.argv.includes("--verbose");
  const result = await runAudit({ verbose });

  printSummary(result.findings, result.lists, result.stats);

  const deletions = await planDeletions(result.findings);
  printDeletionPlan(deletions);

  if (!apply) {
    console.log("");
    console.log(`Dry run only. Re-run with ${APPLY_FLAG} to delete these list items.`);
    if (result.findings.some((finding) => finding.severity === "error")) {
      process.exitCode = 1;
    }
    return;
  }

  if (deletions.length === 0) {
    console.log("");
    console.log("No list items need deletion.");
    return;
  }

  await applyDeletions(deletions);
}

await main();
