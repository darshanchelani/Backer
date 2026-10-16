import { createHmac } from "node:crypto";
import { safeCompare } from "../crypto";

/**
 * Verify a Svix-style webhook signature (used by Resend).
 * Header format: `v1,<base64 signature>` (possibly space-separated list).
 */
export function verifySvixSignature(opts: {
  payload: string;
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  toleranceSeconds?: number;
}): boolean {
  const { payload, secret, id, timestamp, signatureHeader } = opts;
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  const tolerance = opts.toleranceSeconds ?? 300;
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");

  return signatureHeader.split(" ").some((part) => {
    const [version, signature] = part.split(",");
    return version === "v1" && Boolean(signature) && safeCompare(signature!, expected);
  });
}
