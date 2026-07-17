import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { auth } from "./config";

export async function signInAnonymouslyIfNeeded(): Promise<void> {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
