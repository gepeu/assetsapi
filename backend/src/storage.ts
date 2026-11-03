import { join } from "node:path";
import type { BucketStorage } from "./bucketStorage.ts";
import { LocalBucketStorage } from "./localBucketStorage.ts";
import { RailwayBucketStorage } from "./railwayBucketStorage.ts";

const DEFAULT_LOCAL_DIR = join(import.meta.dirname, "../../.local/documents");

/** STORAGE_BACKEND picks the implementation: "local" (the default) or "railway". */
export function createBucketStorage(): BucketStorage {
  const backend = process.env.STORAGE_BACKEND ?? "local";
  switch (backend) {
    case "local":
      return new LocalBucketStorage({
        rootDir: process.env.LOCAL_STORAGE_DIR ?? DEFAULT_LOCAL_DIR,
        signingSecret: process.env.LOCAL_STORAGE_SIGNING_SECRET,
      });
    case "railway":
      return RailwayBucketStorage.fromEnv();
    default:
      throw new Error(`Unknown STORAGE_BACKEND: ${backend} (expected "local" or "railway")`);
  }
}
