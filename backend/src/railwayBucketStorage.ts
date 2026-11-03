import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  paginateListObjectsV2,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BucketStorage,
  type DownloadUrlOptions,
  type ObjectInfo,
  type ObjectSummary,
  type StoredObject,
} from "./bucketStorage.ts";
import { requireEnv } from "./env.ts";

const DEFAULT_DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export interface RailwayBucketConfig {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function isMissingObject(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.name === "NoSuchKey" || error.name === "NotFound")
  );
}

/** Railway Storage Buckets, reached through their S3-compatible API. */
export class RailwayBucketStorage extends BucketStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: RailwayBucketConfig) {
    super();
    this.bucket = config.bucket;
    // Credentials are explicit so the SDK can't fall back to a local AWS profile.
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // The SDK's default extra checksums aren't supported by every S3-compatible service.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  /** Read at call time, so the backend can start without a bucket configured. */
  static fromEnv(): RailwayBucketStorage {
    return new RailwayBucketStorage({
      bucket: requireEnv("S3_BUCKET"),
      endpoint: requireEnv("S3_ENDPOINT"),
      region: requireEnv("S3_REGION"),
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) throw new Error(`Bucket returned no body for ${key}`);
      const body = await response.Body.transformToByteArray();
      return {
        key,
        size: body.byteLength,
        lastModified: response.LastModified ?? null,
        contentType: response.ContentType ?? null,
        body,
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async stat(key: string): Promise<ObjectInfo | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? null,
        contentType: response.ContentType ?? null,
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async *list(prefix?: string): AsyncGenerator<ObjectSummary> {
    const pages = paginateListObjectsV2(
      { client: this.client },
      { Bucket: this.bucket, Prefix: prefix },
    );
    for await (const page of pages) {
      for (const object of page.Contents ?? []) {
        if (object.Key === undefined) continue;
        yield {
          key: object.Key,
          size: object.Size ?? 0,
          lastModified: object.LastModified ?? null,
        };
      }
    }
  }

  async createDownloadUrl(key: string, options: DownloadUrlOptions = {}): Promise<string> {
    const { expiresInSeconds = DEFAULT_DOWNLOAD_URL_TTL_SECONDS, filename } = options;
    const disposition = filename
      ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      : "attachment";
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}
