import type { StockOperation } from "../api/inventory";

/** Sequential, resumable lookup; keep the existing 20/minute server guard. */
export async function checkInventoryNames(initial: StockOperation, options: {
  resolve: (id: number) => Promise<StockOperation>;
  progress: (op: StockOperation) => void;
  stopped: () => boolean;
  wait?: (ms: number) => Promise<void>;
}) {
  const wait = options.wait || (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let current = initial;
  while ((current.lookup_remaining || 0) > 0 && !options.stopped()) {
    const before = current.lookup_remaining || 0;
    const started = Date.now();
    current = await options.resolve(current.id);
    options.progress(current);
    if ((current.lookup_remaining || 0) >= before) break;
    if ((current.lookup_remaining || 0) > 0 && !options.stopped()) await wait(Math.max(0, 3100 - (Date.now() - started)));
  }
  return current;
}
