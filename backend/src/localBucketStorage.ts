import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import {
  BucketStorage,
  type DownloadUrlOptions,
  type ObjectInfo,
  type ObjectSummary,
  type StoredObject,
} from "./bucketStorage.ts";

const DEFAULT_DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/** Holds content types beside the objects. Keys can't start with a dot, so it can't clash. */
const META_DIR = ".meta";
const TEMP_DIR = ".tmp";

export const LOCAL_DOWNLOAD_PATH = "/api/files";

export interface LocalBucketConfig {
  rootDir: string;
  /** Links stop working when this changes. Defaults to a new random value per process. */
  signingSecret?: string;
}

function assertValidKey(key: string): void {
  const segments = key.split("/");
  const valid =
    key.length > 0 &&
    !key.includes("\\") &&
    !key.includes("\0") &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
    !segments[0].startsWith(".");
  if (!valid) throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Keeps objects on disk for local development, behind the same interface as the bucket. */
export class LocalBucketStorage extends BucketStorage {
  private readonly rootDir: string;
  private readonly signingSecret: string;

  constructor(config: LocalBucketConfig) {
    super();
    this.rootDir = config.rootDir;
    this.signingSecret = config.signingSecret ?? randomBytes(32).toString("base64url");
  }

  private objectPath(key: string): string {
    assertValidKey(key);
    return join(this.rootDir, key);
  }

  private metaPath(key: string): string {
    assertValidKey(key);
    return join(this.rootDir, META_DIR, `${key}.json`);
  }

  /** Writes to a temporary file first, so a crash can't leave a partial object behind. */
  private async writeAtomic(path: string, body: Uint8Array | string): Promise<void> {
    const tempDir = join(this.rootDir, TEMP_DIR);
    await mkdir(tempDir, { recursive: true });
    await mkdir(dirname(path), { recursive: true });
    const tempPath = join(tempDir, randomUUID());
    await writeFile(tempPath, body);
    await rename(tempPath, path);
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.writeAtomic(this.metaPath(key), JSON.stringify({ contentType }));
    await this.writeAtomic(this.objectPath(key), body);
  }

  private async readContentType(key: string): Promise<string | null> {
    try {
      const { contentType } = JSON.parse(await readFile(this.metaPath(key), "utf8")) as {
        contentType?: string;
      };
      return contentType ?? null;
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const info = await this.stat(key);
    if (!info) return null;
    return { ...info, body: new Uint8Array(await readFile(this.objectPath(key))) };
  }

  async stat(key: string): Promise<ObjectInfo | null> {
    try {
      const file = await stat(this.objectPath(key));
      if (!file.isFile()) return null;
      return {
        key,
        size: file.size,
        lastModified: file.mtime,
        contentType: await this.readContentType(key),
      };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.objectPath(key), { force: true });
    await rm(this.metaPath(key), { force: true });
  }

  async *list(prefix?: string): AsyncGenerator<ObjectSummary> {
    let entries;
    try {
      entries = await readdir(this.rootDir, { recursive: true, withFileTypes: true });
    } catch (error) {
      if (isMissingFile(error)) return;
      throw error;
    }

    const keys = entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(this.rootDir, join(entry.parentPath, entry.name)).split(sep).join("/"))
      .filter((key) => !key.startsWith(".") && (prefix === undefined || key.startsWith(prefix)))
      .sort();

    for (const key of keys) {
      const info = await this.stat(key);
      if (info) yield { key, size: info.size, lastModified: info.lastModified };
    }
  }

  private sign(key: string, expires: number, filename: string): Buffer {
    return createHmac("sha256", this.signingSecret).update(`${key}\n${expires}\n${filename}`).digest();
  }

  /** A same-origin link to the backend's download route, which always sends an attachment. */
  async createDownloadUrl(key: string, options: DownloadUrlOptions = {}): Promise<string> {
    assertValidKey(key);
    const { expiresInSeconds = DEFAULT_DOWNLOAD_URL_TTL_SECONDS, filename = "" } = options;
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const params = new URLSearchParams({
      key,
      expires: String(expires),
      filename,
      sig: this.sign(key, expires, filename).toString("base64url"),
    });
    return `${LOCAL_DOWNLOAD_PATH}?${params}`;
  }

  /** Checks a link from createDownloadUrl. Returns what to send, or null if it's invalid or expired. */
  verifyDownload(params: URLSearchParams): { key: string; filename: string } | null {
    const key = params.get("key");
    const expires = Number(params.get("expires"));
    const filename = params.get("filename") ?? "";
    const signature = Buffer.from(params.get("sig") ?? "", "base64url");
    if (!key || !Number.isInteger(expires) || expires < Date.now() / 1000) return null;

    const expected = this.sign(key, expires, filename);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    return { key, filename };
  }
}
