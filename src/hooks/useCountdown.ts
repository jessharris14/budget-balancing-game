import { useEffect, useState } from "react";
import { useServerTimeOffset } from "./useServerTimeOffset";

/**
 * Live "ms remaining until deadline," re-rendering once a second. Null if
 * deadline is null. Phase 8.2: corrected by the server/client clock
 * offset (useServerTimeOffset) rather than raw Date.now() -- a deadline
 * is itself a shared, server-stored absolute timestamp, but without this
 * correction two devices with differently-skewed system clocks would
 * each compute a different "time remaining" against that same deadline.
 */
export function useCountdown(deadline: number | null): number | null {
  const offset = useServerTimeOffset();
  const [now, setNow] = useState(() => Date.now() + offset);

  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now() + offset); // correct any staleness immediately when the deadline (re)starts
    const interval = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(interval);
  }, [deadline, offset]);

  if (deadline === null) return null;
  return Math.max(0, deadline - now);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
