export interface ObjectSummary {
  key: string;
  size: number;
  lastModified: Date | null;
}

export interface ObjectInfo extends ObjectSummary {
  contentType: string | null;
}

export interface StoredObject extends ObjectInfo {
  body: Uint8Array;
}

export interface DownloadUrlOptions {
  /** Defaults to five minutes. */
  expiresInSeconds?: number;
  /** The name the browser saves the file under. */
  filename?: string;
}

/** Stores whole files by key. Callers don't need to know which provider is behind it. */
export abstract class BucketStorage {
  /** Replaces any object already stored under this key. */
  abstract put(key: string, body: Uint8Array, contentType: string): Promise<void>;

  /** Reads the whole object into memory. Returns null if the key doesn't exist. */
  abstract get(key: string): Promise<StoredObject | null>;

  /** Returns null if the key doesn't exist. */
  abstract stat(key: string): Promise<ObjectInfo | null>;

  /** Succeeds even if the key doesn't exist. */
  abstract delete(key: string): Promise<void>;

  abstract list(prefix?: string): AsyncIterable<ObjectSummary>;

  /**
   * Returns a temporary link that doesn't require a session, so check access first.
   * Links always download rather than display, so saved HTML can't run in the browser.
   */
  abstract createDownloadUrl(key: string, options?: DownloadUrlOptions): Promise<string>;
}
