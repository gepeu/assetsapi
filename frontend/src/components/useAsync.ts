import { useEffect, useState } from "react";

type AsyncState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T };

/** Runs `load` whenever `key` changes, ignoring results from superseded runs. */
export function useAsync<T>(load: () => Promise<T>, key: unknown): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    load().then(
      (data) => current && setState({ status: "ready", data }),
      () => current && setState({ status: "error" }),
    );
    return () => {
      current = false;
    };
    // `load` is expected to change only along with `key`.
  }, [key]);

  return state;
}
