import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/**
 * AES-256-GCM encryption for secrets-at-rest (Click merchant secret keys, Telegram
 * bot tokens). The key encryption key (KEK) comes from the environment
 * (CLICK_CREDENTIALS_KEK) and is never stored in the database. This is the only
 * module that should ever see a decrypted Click secret in memory.
 */
const KEK = Buffer.from(env.CLICK_CREDENTIALS_KEK, "hex");

if (KEK.length !== 32) {
  throw new Error("CLICK_CREDENTIALS_KEK must decode to exactly 32 bytes (64 hex chars)");
}

/** Returns `{ ciphertext, iv }`, both hex-encoded, ready to store in two DB columns. */
export function encrypt(plaintext: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEK, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store ciphertext || authTag together, iv separately.
  return { ciphertext: Buffer.concat([encrypted, authTag]).toString("hex"), iv: iv.toString("hex") };
}

export function decrypt(ciphertextHex: string, ivHex: string): string {
  const combined = Buffer.from(ciphertextHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = combined.subarray(combined.length - 16);
  const encrypted = combined.subarray(0, combined.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", KEK, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
