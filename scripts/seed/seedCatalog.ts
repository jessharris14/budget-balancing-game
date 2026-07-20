import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { CardCatalog, EffectDirection, PromptBankTheme } from "../../src/types/catalog.ts";
import catalogJson from "./countyBudgetSim_v1.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const serviceAccountPath = path.resolve(__dirname, "../../serviceAccountKey.json");

// JSON module imports widen string-literal fields (e.g. "direction") to
// `string`, so this cast is paired with assertValidCatalog below, which
// checks those literal unions at runtime before anything is written.
const catalog = catalogJson as CardCatalog;

const EFFECT_DIRECTIONS: EffectDirection[] = ["increase", "decrease"];
const PROMPT_THEMES: PromptBankTheme[] = [
  "fiscal-conservative",
  "public-safety",
  "social-services",
  "business-econ-dev",
  "environmental",
  "general-devils-advocate",
];

function assertValidCatalog(c: CardCatalog): void {
  for (const card of [...c.revenueCards, ...c.expenditureCards]) {
    if (!EFFECT_DIRECTIONS.includes(card.direction)) {
      throw new Error(`Invalid direction "${card.direction}" on card ${card.id}`);
    }
  }
  for (const card of c.challengeCards) {
    if (!EFFECT_DIRECTIONS.includes(card.direction)) {
      throw new Error(`Invalid direction "${card.direction}" on challenge card ${card.id}`);
    }
    if (card.target !== "deficit" && card.target !== "reserves") {
      throw new Error(`Invalid target "${card.target}" on challenge card ${card.id}`);
    }
  }
  for (const entry of c.promptBank) {
    if (!PROMPT_THEMES.includes(entry.theme)) {
      throw new Error(`Invalid theme "${entry.theme}" on prompt ${entry.id}`);
    }
  }
}

assertValidCatalog(catalog);

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const docRef = db.collection("catalogs").doc(catalog.catalogVersion);
  await docRef.set(catalog);
  console.log(`Seeded catalog "${catalog.catalogVersion}" to catalogs/${catalog.catalogVersion}`);
  console.log(`  revenueCards: ${catalog.revenueCards.length}`);
  console.log(`  expenditureCards: ${catalog.expenditureCards.length}`);
  console.log(`  challengeCards: ${catalog.challengeCards.length}`);
  console.log(`  priorityCards: ${catalog.priorityCards.length}`);
  console.log(`  promptBank: ${catalog.promptBank.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
