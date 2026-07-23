import { doc, getDoc } from "firebase/firestore";
import { firestore } from "../firebase/config";
import type { CardCatalog } from "../types/catalog";

/**
 * A catalog's content is immutable once published under a given version
 * (that's the whole point of catalogVersion -- see spec Section 5), so
 * caching the fetch by version for the page's lifetime is always correct,
 * never stale. Caches the in-flight promise itself, not just the resolved
 * value, so two callers racing before the first fetch resolves (e.g. the
 * Public Hearing Speaker join flow fetching the catalog for promptBank,
 * immediately followed by SpeakerView fetching it again after navigating)
 * share one Firestore round-trip instead of two.
 */
const catalogCache = new Map<string, Promise<CardCatalog | null>>();

export function getCatalog(catalogVersion: string): Promise<CardCatalog | null> {
  let cached = catalogCache.get(catalogVersion);
  if (!cached) {
    cached = getDoc(doc(firestore, "catalogs", catalogVersion)).then((snapshot) =>
      snapshot.exists() ? (snapshot.data() as CardCatalog) : null,
    );
    // A transient network failure shouldn't permanently poison the cache --
    // let a later call retry instead of re-throwing the same failure forever.
    cached.catch(() => catalogCache.delete(catalogVersion));
    catalogCache.set(catalogVersion, cached);
  }
  return cached;
}
