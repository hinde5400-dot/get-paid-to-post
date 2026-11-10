/**
 * File-signature (magic-byte) sniffing for image uploads.
 *
 * `file.type` is client-supplied and can be spoofed, so a renamed
 * non-image with a fake `image/png` MIME used to land in storage.
 * These helpers read the first bytes of the file and check them
 * against the real signatures:
 *
 *   PNG  — 89 50 4E 47 0D 0A 1A 0A
 *   JPEG — FF D8 FF
 *   WebP — "RIFF" .... "WEBP" (bytes 0-3 RIFF, bytes 8-11 WEBP)
 *   GIF  — "GIF87a" / "GIF89a" (47 49 46 38 37|39 61)
 *
 * The MIME check stays as well — a file must pass BOTH: the
 * claimed MIME must be an allowed image type AND the bytes must
 * match that type. Callers read the bytes with
 * `await file.arrayBuffer()`; reading does not consume the File,
 * so the same File can still be uploaded afterwards.
 */

export type ImageKind = "png" | "jpeg" | "webp" | "gif";

const MIME_TO_KIND: Record<string, ImageKind> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Detect the image type from the first bytes, or null when the
 *  bytes match no known image signature. */
export function sniffImageType(bytes: Uint8Array): ImageKind | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "webp";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 && // 8
    (bytes[4] === 0x37 || bytes[4] === 0x39) && // 7 or 9
    bytes[5] === 0x61 // a
  ) {
    return "gif";
  }
  return null;
}

/**
 * True when the file's bytes are a real image of the claimed MIME
 * type. Returns false for unknown signatures and for a mismatch
 * (e.g. JPEG bytes labelled image/png). Unknown MIME types are
 * false too — callers check the MIME allow-list first and only
 * call this with an allowed type.
 */
export function imageBytesMatchMime(
  bytes: Uint8Array,
  mime: string
): boolean {
  const expected = MIME_TO_KIND[mime];
  if (!expected) return false;
  return sniffImageType(bytes) === expected;
}
