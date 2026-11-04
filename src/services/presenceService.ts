import { onDisconnect, onValue, ref, set } from "firebase/database";
import { rtdb } from "../firebase/config";

/**
 * Phase 8.2: standard RTDB presence pattern. `.info/connected` flips to
 * true every time this client (re)establishes a realtime connection --
 * including the very first connection and every reconnect after a drop.
 * Each time it does, this registers an onDisconnect().remove() with the
 * SERVER (not a client-side promise -- the server fires it the moment it
 * notices this connection is gone, even an ungraceful one like killed
 * Wi-Fi or a closed laptop lid), then writes presence/{uid} = timestamp.
 * The net effect: presence/{uid} exists for exactly as long as this uid
 * has at least one live connection, with no heartbeat polling needed.
 *
 * A disconnect never touches members.commissionerIds, publicHearingSpeakers,
 * endorsementsUsed, or any ballot vote -- this is purely an additional,
 * separate presence marker, never wired into any role-claim or write
 * path, so losing connection can never release a seat or drop recorded
 * history.
 */
export function startPresence(code: string, uid: string): () => void {
  const connectedRef = ref(rtdb, ".info/connected");
  const presenceRef = ref(rtdb, `sessions/${code}/presence/${uid}`);

  const unsubscribe = onValue(connectedRef, (snapshot) => {
    if (snapshot.val() !== true) return;
    onDisconnect(presenceRef)
      .remove()
      .then(() => {
        void set(presenceRef, Date.now());
      });
  });

  return () => {
    unsubscribe();
    void onDisconnect(presenceRef).cancel();
    void set(presenceRef, null);
  };
}

/** True exactly while this client currently has a live RTDB connection -- for a "reconnecting..." indicator, not for gating any action. */
export function subscribeToConnectionStatus(callback: (connected: boolean) => void): () => void {
  return onValue(ref(rtdb, ".info/connected"), (snapshot) => callback(snapshot.val() === true));
}
