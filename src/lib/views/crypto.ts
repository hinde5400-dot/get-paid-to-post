// Token encryption at rest (AES-256-GCM).
//
// TikTok access/refresh tokens are stored in public.tiktok_connections.
// The 3-hour view-refresh job runs without a user session, so it reads
// tokens through a SECURITY DEFINER function — if tokens were plaintext
// there, anyone with the public anon key could read them. Encrypting
// them means the database (and that function) only ever holds
// ciphertext; only the server, which holds ENCRYPTION_KEY, can use them.
//
// ENCRYPTION_KEY is a 64-hex-character (32-byte) secret in Vercel env
// vars (Production). It is NEVER logged or sent to the browser.
// Legacy rows saved before encryption exist (plaintext) — decryptToken
// passes those through, and the refresh job re-saves them encrypted.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY?.trim();
  if (!hex) return null;
  try {
    const key = Buffer.from(hex, "hex");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function isEncryptedToken(value: string): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt a token. Returns the input unchanged when no key is set. */
export function encryptToken(plain: string): string {
  const key = getKey();
  if (!key || !plain) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64")
  );
}

/**
 * Decrypt a token. Plaintext (legacy) values pass through unchanged.
 * Returns "" when the value is encrypted but cannot be decrypted
 * (no key, or wrong key) — callers treat that as "token unusable".
 */
export function decryptToken(stored: string): string {
  if (!stored) return "";
  if (!isEncryptedToken(stored)) return stored;
  const key = getKey();
  if (!key) return "";
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
