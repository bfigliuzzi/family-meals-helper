import type { SettingsKeeper, SettingsSnapshot } from "core";
import { useCallback, useSyncExternalStore } from "react";

// L'état du propriétaire du document, relu à chaque changement.
export function useSettingsSnapshot(keeper: SettingsKeeper): SettingsSnapshot {
  const subscribe = useCallback((listener: () => void) => keeper.subscribe(listener), [keeper]);
  const snapshot = useCallback(() => keeper.snapshot(), [keeper]);
  return useSyncExternalStore(subscribe, snapshot);
}
