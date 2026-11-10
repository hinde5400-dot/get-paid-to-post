/**
 * Client-side image compression for campaign logo / thumbnail
 * uploads (friend's brand test, 2026-11-11): phone photos are
 * often 3–8 MB, and on a slow mobile connection the very first
 * upload fetch can die before it finishes ("Failed to fetch"
 * with nothing uploaded and no campaign created). Downscaling
 * before upload makes the file typically 100–300 KB, so the
 * upload finishes fast even on a weak connection. Plain browser
 * Canvas APIs — no new dependency.
 *
 * PNGs stay PNG (logos often have transparency — never convert
 * PNG to JPEG). JPEG / WebP are re-encoded as JPEG at quality
 * 0.82. Max dimension 1200px on any side. If compression would
 * make the file bigger, or anything fails, the original file is
 * returned unchanged — compression never blocks an upload.
 */
export const COMPRESSED_MAX_DIMENSION = 1200;

const COMPRESSABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function compressCampaignImage(file: File): Promise<File> {
  if (!COMPRESSABLE_TYPES.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const longest = Math.max(bitmap.width, bitmap.height);
      const scale = Math.min(1, COMPRESSED_MAX_DIMENSION / longest);
      // Already small enough and small in bytes — nothing to do.
      if (scale >= 1 && file.size <= 300 * 1024) return file;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const outType =
        file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, outType, 0.82)
      );
      if (!blob) return file;
      // Compression must never make things worse.
      if (blob.size >= file.size) return file;
      const name =
        outType === "image/jpeg" && !/\.jpe?g$/i.test(file.name)
          ? file.name.replace(/\.[^.]+$/, "") + ".jpg"
          : file.name;
      return new File([blob], name, { type: outType });
    } finally {
      bitmap.close();
    }
  } catch {
    // createImageBitmap / canvas unavailable or failed — fall back
    // to the original file; the 2 MB server cap still applies.
    return file;
  }
}
