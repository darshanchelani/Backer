import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

const KEY = () => Buffer.from(env.APP_ENCRYPTION_KEY, "hex");

/**
 * AES-256-GCM. Output format: v1.<iv>.<tag>.<ciphertext> (all base64url).
 * Used for connector OAuth tokens at rest.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload format");
  }
  const decipher = createDecipheriv("aes-256-gcm", KEY(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Unguessable URL-safe token for tracking pixels, click redirects, reply addresses. */
export function newToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** One-way hash for IP addresses - we never store raw IPs. */
export function hashIp(ip: string): string {
  return createHmac("sha256", env.IP_HASH_SALT).update(ip).digest("hex");
}

/** Constant-time string comparison (webhook secrets, cron auth). */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
