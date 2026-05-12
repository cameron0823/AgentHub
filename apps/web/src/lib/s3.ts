import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

export async function getUploadUrl(key: string, contentType: string, expiresIn = 300) {
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
