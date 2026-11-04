/**
 * Phase 8.2: remembers which session this device last took part in, so a
 * closed-and-reopened tab (landing back on "/", not "/session/{code}")
 * can offer a way back in. This is deliberately NOT the primary
 * reconnect mechanism -- Lobby.tsx already re-derives role/Commission
 * live from session.participants/members on every load, keyed by the
 * anonymous auth uid, which Firebase's own auth persistence keeps stable
 * across a refresh or a closed tab on the same browser. All this adds is
 * remembering the *code* itself, since there's no server-side "which
 * sessions is this uid in" index to query. If the uid no longer matches
 * (storage was cleared, or a different browser/device), this is treated
 * as not found -- offering a stale resume link would just route to a
 * session this device's current identity has no claim in.
 */
const KEY = "lets-balance:last-session";

interface StoredSession {
  code: string;
  uid: string;
  savedAt: number;
}

export function rememberSession(code: string, uid: string): void {
  try {
    const entry: StoredSession = { code, uid, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Private browsing / storage disabled -- the resume convenience is
    // simply unavailable this session, nothing else depends on it.
  }
}

/** Returns the remembered session code only if it was saved under the SAME uid currently signed in -- see the module comment. */
export function getRememberedSession(currentUid: string | undefined): string | null {
  if (!currentUid) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as StoredSession;
    return entry.uid === currentUid ? entry.code : null;
  } catch {
    return null;
  }
}

export function forgetSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do -- see rememberSession.
  }
}
