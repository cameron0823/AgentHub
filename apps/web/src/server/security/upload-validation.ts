const textDecoder = new TextDecoder("utf-8", { fatal: true });

export type UploadValidationResult = {
  ok: boolean;
  detectedMimeType?: string;
  reason?: string;
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start = 0, end = bytes.length) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function looksLikeUtf8Text(bytes: Uint8Array) {
  if (bytes.some((byte) => byte === 0)) return false;
  try {
    textDecoder.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function sniffMagicBytes(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "application/zip";
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "application/msword";
  if (ascii(bytes, 4, 8) === "ftyp") return "video/mp4";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (ascii(bytes, 0, 4) === "OggS") return "video/ogg";
  if (looksLikeUtf8Text(bytes)) {
    const trimmed = textDecoder.decode(bytes).trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "application/json";
    if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml")) return "image/svg+xml";
    return "text/plain";
  }
  return null;
}

function expectedMatchesDetected(expected: string, detected: string) {
  if (expected === detected) return true;
  if (expected.startsWith("text/") && detected === "text/plain") return true;
  if ((expected === "application/json" || expected.endsWith("+json")) && detected === "application/json") return true;
  if (expected === "text/csv" && detected === "text/plain") return true;
  if (expected === "text/markdown" && detected === "text/plain") return true;
  if (expected === "application/csv" && detected === "text/plain") return true;
  if (
    expected === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    detected === "application/zip"
  )
    return true;
  if (expected.startsWith("image/") && detected.startsWith("image/"))
    return expected === "image/*" || expected === detected;
  if (expected.startsWith("video/") && detected.startsWith("video/"))
    return expected === "video/*" || expected === detected;
  return false;
}

export function validateUploadBytes(bytes: Uint8Array, expectedMimeType: string): UploadValidationResult {
  const detectedMimeType = sniffMagicBytes(bytes);
  if (!detectedMimeType) {
    return { ok: false, reason: "Unsupported or unreadable file signature" };
  }
  if (!expectedMatchesDetected(expectedMimeType, detectedMimeType)) {
    return {
      ok: false,
      detectedMimeType,
      reason: `Declared content type ${expectedMimeType} does not match detected ${detectedMimeType}`,
    };
  }
  return { ok: true, detectedMimeType };
}
