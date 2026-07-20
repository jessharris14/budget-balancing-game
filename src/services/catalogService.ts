import { doc, getDoc } from "firebase/firestore";
import { firestore } from "../firebase/config";
import type { CardCatalog } from "../types/catalog";

export async function getCatalog(catalogVersion: string): Promise<CardCatalog | null> {
  const snapshot = await getDoc(doc(firestore, "catalogs", catalogVersion));
  return snapshot.exists() ? (snapshot.data() as CardCatalog) : null;
}
