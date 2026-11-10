"use client";

import { useRef } from "react";
import { useToast } from "@/components/Toast";
import { compressCampaignImage } from "@/lib/image-compress";

export const CAMPAIGN_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Required image upload field for the brand campaign form
 * (Turn's decision 2026-11-10): Brand Logo and Thumbnail are
 * file uploads with an upload button — NOT link fields. Validates
 * client-side (PNG, JPG or WebP, max 2 MB) and shows a preview
 * after choosing; the file itself is only uploaded at confirmed
 * submit (BrandForm uploads it, then sends the returned URL).
 * The server re-validates type + size on the upload endpoint.
 * Large phone photos are compressed client-side at pick time
 * (see lib/image-compress.ts) so the upload is small and fast
 * even on a weak mobile connection.
 */
export default function ImageUploadField({
  fieldId,
  label,
  help,
  buttonLabel,
  file,
  previewUrl,
  error,
  disabled,
  onPick,
}: {
  /** Anchor id the form's error handling scrolls to, e.g. "field-logoUrl". */
  fieldId: string;
  label: string;
  help: string;
  buttonLabel: string;
  file: File | null;
  previewUrl: string | null;
  error?: string;
  disabled?: boolean;
  onPick: (file: File | null) => void;
}) {
  const { showError } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Pick time is compression time: the file is downscaled BEFORE
  // the 2 MB check and before the preview, so the size the brand
  // sees is the size that will actually upload — a 5 MB phone
  // photo becomes ~100–300 KB instead of being rejected outright.
  // Compression never blocks a pick: on failure the original file
  // is used and the 2 MB cap still applies.
  async function pickFile(f: File | null) {
    if (!f) {
      onPick(null);
      return;
    }
    if (!IMAGE_TYPES.includes(f.type)) {
      showError("Image must be PNG, JPG or WebP.");
      return;
    }
    const compressed = await compressCampaignImage(f);
    if (compressed.size > CAMPAIGN_IMAGE_MAX_BYTES) {
      showError(
        "Image is still over 2 MB after compression — try a smaller photo."
      );
      return;
    }
    onPick(compressed);
  }

  function clear() {
    onPick(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div id={fieldId} className="block text-sm font-bold text-fg">
      {label}
      <span className="mt-1 block text-xs font-medium text-fg/50">
        {help}
      </span>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
      {file && previewUrl ? (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-fg/15 bg-ink px-3 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Selected preview"
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
            {file.name}{" "}
            <span className="text-xs font-medium text-fg/50">
              ({formatSize(file.size)})
            </span>
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="shrink-0 rounded-full bg-fg/10 px-3 py-1 text-xs font-bold text-fg/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Change
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={clear}
            className="shrink-0 rounded-full bg-fg/10 px-3 py-1 text-xs font-bold text-fg/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className="mt-2 w-full rounded-xl border border-dashed border-fg/20 bg-ink px-4 py-3 text-sm font-bold text-fg/70 transition hover:border-lime/50 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          📷 {buttonLabel}
        </button>
      )}
      {error && (
        <span className="mt-1 block text-sm font-bold text-red-300">
          {error}
        </span>
      )}
    </div>
  );
}
