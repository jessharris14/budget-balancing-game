import { useEffect, useState } from "react";
import { subscribeToConnectionStatus } from "../services/presenceService";

/** Phase 8.2: live RTDB connection state for a non-alarming "reconnecting..." indicator. Starts true (assume connected) so there's no flash of a reconnecting banner before the first real status arrives. */
export function useConnectionStatus(): boolean {
  const [connected, setConnected] = useState(true);
  useEffect(() => subscribeToConnectionStatus(setConnected), []);
  return connected;
}
