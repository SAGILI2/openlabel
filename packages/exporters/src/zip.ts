import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import type { FileSink } from "./types.js";

/** Already-compressed types are stored as-is; everything else is deflated. */
const STORED = /\.(png|jpe?g|webp|gif|tiff?|zip|gz)$/i;

/**
 * Streams files into a ZIP. Chunks go to `onChunk` as they are produced, so a large dataset never
 * has to fit in memory as a whole archive.
 */
export function createZipSink(onChunk: (chunk: Uint8Array) => void): {
  sink: FileSink;
  finish: () => Promise<void>;
} {
  let failure: Error | null = null;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      failure = err;
      resolveDone();
      return;
    }
    onChunk(chunk);
    if (final) resolveDone();
  });
  const seen = new Set<string>();
  return {
    sink: {
      add(path, data) {
        if (failure) return Promise.reject(failure);
        if (seen.has(path)) return Promise.reject(new Error(`duplicate path in export: ${path}`));
        seen.add(path);
        const entry = STORED.test(path) ? new ZipPassThrough(path) : new ZipDeflate(path, { level: 6 });
        zip.add(entry);
        entry.push(data, true);
        return Promise.resolve();
      },
    },
    finish: async () => {
      zip.end();
      await done;
      if (failure) throw failure;
    },
  };
}
