import { useEffect, useState } from "react";
import { useServerTimeOffset } from "./useServerTimeOffset";

/**
 * Live "ms remaining until deadline," re-rendering once a second. Null if
 * deadline is null/undefined/not a finite number. Phase 8.2: corrected by
 * the server/client clock offset (useServerTimeOffset) rather than raw
 * Date.now() -- a deadline is itself a shared, server-stored absolute
 * timestamp, but without this correction two devices with differently-
 * skewed system clocks would each compute a different "time remaining"
 * against that same deadline.
 *
 * Accepts `undefined` as well as the declared `number | null`: RTDB
 * prunes a field written as `null` to "key absent" rather than storing
 * it, so a deadline field that's genuinely unset (e.g. a motion seconded
 * before the Chair starts the debate timer) reads back as `undefined` at
 * runtime even though every caller's own type says `number | null` --
 * treating only `=== null` as "no deadline" left `undefined - now` to
 * silently compute NaN, which is where the "NaN:NaN" timer bug came from.
 */
export function useCountdown(deadline: number | null | undefined): number | null {
  const offset = useServerTimeOffset();
  const [now, setNow] = useState(() => Date.now() + offset);
  const hasDeadline = deadline !== null && deadline !== undefined && Number.isFinite(deadline);

  useEffect(() => {
    if (!hasDeadline) return;
    setNow(Date.now() + offset); // correct any staleness immediately when the deadline (re)starts
    const interval = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, offset, hasDeadline]);

  if (!hasDeadline) return null;
  return Math.max(0, deadline - now);
}

/**
 * The one place every countdown in this app turns milliseconds into
 * "M:SS" -- deliberately defensive about every input a live Firebase
 * field can actually hand it (not just the `number` its type claims):
 * undefined/null (RTDB-pruned "unset" fields, same reasoning as
 * useCountdown above), NaN, and negative values all render as the
 * neutral "--:--" placeholder instead of ever showing "NaN:NaN" or a
 * negative clock. Zero is a real, valid countdown value ("time's up"),
 * not a missing one, so it still renders as "0:00".
 */
export function formatClock(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "--:--";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
