import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

describe("File upload limits", () => {
  it("enforces source-aligned tiered upload limits server side", async () => {
    const route = await readText("apps/web/src/app/api/upload/presigned/route.ts");

    assert.match(route, /IMAGE_UPLOAD_LIMIT_BYTES = 10 \* 1024 \* 1024/);
    assert.match(route, /DOCUMENT_UPLOAD_LIMIT_BYTES = 50 \* 1024 \* 1024/);
    assert.match(route, /VIDEO_UPLOAD_LIMIT_BYTES = 500 \* 1024 \* 1024/);
    assert.match(route, /uploadLimitForContentType/);
    assert.match(route, /FORBIDDEN_EXTENSIONS/);
    assert.match(route, /video\//);
    assert.match(route, /uploads are limited to/);
  });

  it("keeps client-side accepted types and rejection feedback in sync", async () => {
    const input = await readText("apps/web/src/components/ChatInput.tsx");

    assert.match(input, /MAX_UPLOAD_FILES = 10/);
    assert.match(input, /CLIENT_UPLOAD_LIMITS/);
    assert.match(input, /isAcceptedUploadType/);
    assert.match(input, /setUploadError/);
    assert.match(input, /unsupported file type/);
    assert.match(input, /\$\{category\} limit is/);
    assert.match(input, /accept="image\/\*,video\/\*,text\/\*,\.csv,\.doc,\.docx,\.json,\.md,\.pdf"/);
  });

  it("sets presigned upload URLs to the documented 15 minute lifetime", async () => {
    const s3 = await readText("apps/web/src/lib/s3.ts");

    assert.match(s3, /getUploadUrl\(key: string, contentType: string, expiresIn = 900\)/);
  });

  it("validates uploaded bytes after presigned PUT before files can be used", async () => {
    const [presignRoute, completeRoute, validation, s3, input, chatStream] = await Promise.all([
      readText("apps/web/src/app/api/upload/presigned/route.ts"),
      readText("apps/web/src/app/api/upload/complete/route.ts"),
      readText("apps/web/src/server/security/upload-validation.ts"),
      readText("apps/web/src/lib/s3.ts"),
      readText("apps/web/src/components/ChatInput.tsx"),
      readText("apps/web/src/app/api/chat/stream/route.ts"),
    ]);

    assert.match(presignRoute, /uploadStatus: "pending"/);
    assert.match(completeRoute, /headObject\(file\.s3Key\)/);
    assert.match(completeRoute, /getObjectPrefix\(file\.s3Key\)/);
    assert.match(completeRoute, /validateUploadBytes\(prefix, file\.mimeType\)/);
    assert.match(completeRoute, /uploadStatus: "validated"/);
    assert.match(completeRoute, /uploadStatus: "rejected"/);
    assert.match(validation, /sniffMagicBytes/);
    assert.match(validation, /Declared content type/);
    assert.match(validation, /image\/png/);
    assert.match(validation, /application\/pdf/);
    assert.match(validation, /video\/mp4/);
    assert.match(s3, /HeadObjectCommand/);
    assert.match(s3, /Range: `bytes=0-\$\{Math\.max\(0, byteLength - 1\)\}`/);
    assert.match(input, /\/api\/upload\/complete/);
    assert.match(input, /Upload validation failed/);
    assert.match(chatStream, /File upload has not passed validation/);
  });

  it("keeps a live MinIO upload proof for presign, PUT, complete, metadata, and retrieval", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/minio-upload.spec.ts");

    assert.doesNotMatch(spec, /page\.setContent/, "MinIO upload proof must run against the app route");
    assert.match(spec, /\/api\/upload\/presigned/, "spec must request a real presigned upload URL");
    assert.match(spec, /context\.request\.put\(uploadUrl/, "spec must PUT bytes to the presigned MinIO URL");
    assert.match(spec, /\/api\/upload\/complete/, "spec must complete and validate the uploaded object");
    assert.match(spec, /uploadStatus: "validated"/, "spec must assert validated upload metadata");
    assert.match(spec, /createE2EApiKey/, "spec must verify persisted metadata through API-key auth");
    assert.match(spec, /\/api\/v1\/files/, "spec must list persisted file records through the public API");
    assert.match(spec, /context\.request\.get\(s3Url\)/, "spec must retrieve the stored object resource");
  });
});
