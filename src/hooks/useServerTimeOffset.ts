import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { rtdb } from "../firebase/config";

/**
 * Phase 8.2: the gap between this device's own clock and the RTDB
 * server's clock, in ms (positive means this device's clock is behind).
 * `.info/serverTimeOffset` is a special RTDB path every client gets for
 * free, kept live-updated by the SDK itself -- no writes, no server
 * round-trip per read. Every countdown in the app adds this to its own
 * `Date.now()` before comparing against a deadline, so two devices with
 * differently-skewed system clocks still agree on how much time is left,
 * and a device that reconnects after being off doesn't show a stale or
 * jumped value once it's back.
 */
export function useServerTimeOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const offsetRef = ref(rtdb, ".info/serverTimeOffset");
    return onValue(offsetRef, (snapshot) => {
      setOffset(typeof snapshot.val() === "number" ? snapshot.val() : 0);
    });
  }, []);

  return offset;
}
