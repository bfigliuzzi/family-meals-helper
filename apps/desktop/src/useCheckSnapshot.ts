import type { CheckKeeper, CheckSnapshot } from "core";
import { useCallback, useSyncExternalStore } from "react";

// L'état du propriétaire des cases cochées, relu à chaque changement.
export function useCheckSnapshot(keeper: CheckKeeper): CheckSnapshot {
  const subscribe = useCallback((listener: () => void) => keeper.subscribe(listener), [keeper]);
  const snapshot = useCallback(() => keeper.snapshot(), [keeper]);
  return useSyncExternalStore(subscribe, snapshot);
}
