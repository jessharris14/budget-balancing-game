/**
 * Phase 8.3: standalone cleanup for RTDB sessions past their expiresAt.
 * Deletes ONLY the ephemeral RTDB session node (sessions/{code}) -- never
 * touches the Firestore gameResults collection, which is a completely
 * separate, permanent store. Safe to re-run: a session already deleted
 * is simply skipped (nothing to delete), and deleting one doesn't affect
 * any other session or the catalog.
 *
 * This is the manual fallback for a scheduled Cloud Function, which
 * needs the Blaze plan (not available on this project -- see Phase 7's
 * confirmed Cloud Billing API SERVICE_DISABLED check, and the Phase 8.3
 * delivery notes for the current status). Run this by hand, or wire it
 * to any scheduler you control outside Firebase (cron on a machine you
 * own, a GitHub Action, etc.) -- it only needs the service account key
 * and network access to the project, nothing Firebase-specific beyond
 * that.
 *
 * Usage:
 *   npx tsx scripts/cleanupExpiredSessions.ts [--dry-run]
 *
 * Requires serviceAccountKey.json at the repo root (same file
 * scripts/seed/seedCatalog.ts already uses -- see that file and the
 * project's .gitignore, which already excludes it).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.resolve(__dirname, "../serviceAccountKey.json");
const dryRun = process.argv.includes("--dry-run");

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL ?? `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
});

const db = getDatabase();

interface MinimalSession {
  code: string;
  expiresAt?: number;
  createdAt?: number;
}

async function main() {
  const snapshot = await db.ref("sessions").get();
  if (!snapshot.exists()) {
    console.log("No sessions found.");
    return;
  }

  const sessions = snapshot.val() as Record<string, MinimalSession>;
  const now = Date.now();
  const expired = Object.entries(sessions).filter(([, s]) => {
    // Sessions created before expiresAt existed (pre-Phase-8.3) fall back
    // to a 48h grace period off createdAt, rather than being treated as
    // permanently un-cleanable or immediately expired.
    const cutoff = s.expiresAt ?? (s.createdAt ? s.createdAt + 48 * 60 * 60 * 1000 : null);
    return cutoff !== null && cutoff < now;
  });

  if (expired.length === 0) {
    console.log(`No expired sessions out of ${Object.keys(sessions).length} total.`);
    return;
  }

  console.log(`${expired.length} expired session(s) out of ${Object.keys(sessions).length} total:`);
  for (const [code] of expired) {
    console.log(`  ${code}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing deleted.");
    return;
  }

  for (const [code] of expired) {
    await db.ref(`sessions/${code}`).remove();
    console.log(`Deleted sessions/${code}`);
  }
  console.log(`\nDone. ${expired.length} session(s) deleted. Firestore gameResults untouched.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
  });
