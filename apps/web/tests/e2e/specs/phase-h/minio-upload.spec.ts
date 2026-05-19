import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";
import { createE2EApiKey, uniqueName } from "../../fixtures";

test.describe("MinIO-backed uploads", () => {
  test("presigns, uploads, validates, lists, and retrieves a file through object storage", async ({
    page,
    context,
  }) => {
    const content = `E2E MinIO upload ${Date.now()}\n`;
    const filename = `${uniqueName("E2E MinIO Upload")}.txt`;
    const contentType = "text/plain";
    const bytes = Buffer.from(content, "utf8");

    await page.goto("/");
    await expect(page.getByTestId("new-chat-button")).toBeVisible({ timeout: 15_000 });

    const presigned = await context.request.post("/api/upload/presigned", {
      data: { filename, contentType, size: bytes.byteLength },
    });
    expect(presigned.status()).toBe(200);
    const { uploadUrl, fileId, s3Url, key } = (await presigned.json()) as {
      uploadUrl: string;
      fileId: string;
      s3Url: string;
      key: string;
    };

    const upload = await context.request.put(uploadUrl, {
      headers: { "Content-Type": contentType },
      data: bytes,
    });
    expect(upload.status()).toBeGreaterThanOrEqual(200);
    expect(upload.status()).toBeLessThan(300);

    const complete = await context.request.post("/api/upload/complete", {
      data: { fileId, key, contentType, size: bytes.byteLength },
    });
    expect(complete.status()).toBe(200);
    const completed = await complete.json();
    expect(completed).toMatchObject({
      fileId,
      key,
      s3Url,
      detectedMimeType: "text/plain",
      uploadStatus: "validated",
    });

    const retrieved = await context.request.get(s3Url);
    expect(retrieved.status()).toBe(200);
    expect(await retrieved.text()).toBe(content);

    const apiKey = await createE2EApiKey();
    const list = await context.request.get("/api/v1/files?limit=10", {
      headers: { Authorization: `Bearer ${apiKey.key}` },
    });
    expect(list.status()).toBe(200);
    const body = (await list.json()) as {
      data: Array<{
        id: string;
        name: string;
        mimeType: string;
        size: number;
        s3Key: string;
        s3Url: string;
        metadata: Record<string, unknown>;
      }>;
    };
    const row = body.data.find((item) => item.id === fileId);

    expect(row).toMatchObject({
      id: fileId,
      name: filename,
      mimeType: contentType,
      size: bytes.byteLength,
      s3Key: key,
      s3Url,
    });
    expect(row?.metadata).toMatchObject({
      uploadStatus: "validated",
      detectedMimeType: "text/plain",
      contentLength: bytes.byteLength,
    });
  });
});
