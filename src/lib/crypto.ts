import "server-only";
import crypto from "node:crypto";

/**
 * API-key encryption at rest (AES-256-GCM).
 *
 * The 32-byte key is derived from BETTER_AUTH_SECRET via SHA-256 - the app
 * already trusts that secret, and it never leaves the server.
 *
 * Format: `v1.<iv_base64>.<authTag_base64>.<ciphertext_base64>`
 * Legacy plaintext values (no `v1.` prefix) are returned as-is so existing
 * keys keep working; they are re-encrypted on next save.
 */

const VERSION_PREFIX = "v1.";

function getKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not configured - refusing to store API keys without it.",
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(VERSION_PREFIX);
}

export function encryptApiKey(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptApiKey(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncryptedValue(stored)) return stored; // legacy plaintext - still works, re-encrypted on next save
  try {
    const [, ivB64, tagB64, dataB64] = stored.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.warn(
      "[crypto] Failed to decrypt stored API key:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Re-encrypt legacy plaintext values; no-op if already encrypted. */
export function maybeReencrypt(stored: string | null | undefined): string | null | undefined {
  if (!stored) return stored;
  if (isEncryptedValue(stored)) return stored;
  return encryptApiKey(stored);
}
