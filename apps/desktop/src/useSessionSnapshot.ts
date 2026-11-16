import type { Session, SessionSnapshot } from "core";
import { useCallback, useSyncExternalStore } from "react";

// L'état du propriétaire de la session, relu à chaque changement.
export function useSessionSnapshot(session: Session): SessionSnapshot {
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const snapshot = useCallback(() => session.snapshot(), [session]);
  return useSyncExternalStore(subscribe, snapshot);
}
