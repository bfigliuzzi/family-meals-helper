import { useCallback, useEffect, useRef, useState } from "react";

export type ReadState<T> =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; value: T };

// Lit une source locale (l'historique) et relit quand `refresh` ou la source changent. `read` doit être stable (une
// fonction de module) : c'est la source qui change la lecture, pas `read`.
//
// `attempt` est le numéro de la lecture demandée : il ne fait qu'augmenter, à chaque appel de `retry` et à chaque
// changement de `refresh` ou de `source` (ajusté pendant le rendu, jamais dans un effet). Un seul effet lance les
// lectures. `settled` est le numéro de la dernière lecture lancée qui a répondu. Tant qu'ils diffèrent, une lecture est
// en cours : `reading` est calculé, jamais stocké. Une lecture qui répond après une lecture plus récente est ignorée.
export function useLatestRead<S, T>(
  source: S,
  refresh: number,
  read: (source: S) => Promise<T>,
): { state: ReadState<T>; reading: boolean; retry: () => void } {
  const [state, setState] = useState<ReadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<number | null>(null);
  const [previousRefresh, setPreviousRefresh] = useState(refresh);
  const [previousSource, setPreviousSource] = useState(source);
  if (refresh !== previousRefresh || source !== previousSource) {
    setPreviousRefresh(refresh);
    setPreviousSource(source);
    setAttempt(attempt + 1);
  }
  const reading = attempt !== settled;
  const latestRead = useRef(0);

  const load = useCallback(
    async (number: number) => {
      latestRead.current += 1;
      const mine = latestRead.current;
      let next: ReadState<T>;
      try {
        next = { status: "ready", value: await read(source) };
      } catch (reason) {
        next = {
          status: "error",
          message: reason instanceof Error ? reason.message : "Erreur inconnue.",
        };
      }
      if (mine === latestRead.current) {
        setState(next);
        setSettled(number);
      }
    },
    [read, source],
  );

  useEffect(() => {
    void load(attempt);
  }, [load, attempt]);

  const retry = (): void => {
    if (reading) return;
    setAttempt(attempt + 1);
  };
  return { state, reading, retry };
}
