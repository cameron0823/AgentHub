import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
const region = process.env.S3_REGION || "us-east-1";
const bucket = process.env.S3_BUCKET || "agenthub";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "agenthub_minio_user";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "agenthub_minio_password";

export const s3Client = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

export async function getUploadUrl(key: string, contentType: string, expiresIn = 900) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getDownloadUrl(key: string, expiresIn = 300) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function headObject(key: string) {
  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return s3Client.send(command);
}

function concatChunks(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function getObjectPrefix(key: string, byteLength = 4100) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    Range: `bytes=0-${Math.max(0, byteLength - 1)}`,
  });
  const response = await s3Client.send(command);
  const body = response.Body;
  if (!body) return new Uint8Array();

  const sdkBody = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof sdkBody.transformToByteArray === "function") {
    return sdkBody.transformToByteArray();
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  }
  return concatChunks(chunks);
}

export async function deleteObject(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return s3Client.send(command);
}

export function buildS3Url(key: string) {
  return `${endpoint}/${bucket}/${key}`;
}

export { bucket };
