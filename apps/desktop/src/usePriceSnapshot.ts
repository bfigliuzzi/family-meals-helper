import type { PriceKeeper, PriceSnapshot } from "core";
import { useCallback, useSyncExternalStore } from "react";

// L'état du propriétaire de la table de prix, relu à chaque changement.
export function usePriceSnapshot(keeper: PriceKeeper): PriceSnapshot {
  const subscribe = useCallback((listener: () => void) => keeper.subscribe(listener), [keeper]);
  const snapshot = useCallback(() => keeper.snapshot(), [keeper]);
  return useSyncExternalStore(subscribe, snapshot);
}
