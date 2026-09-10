import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, SCRYPT_KEYLEN);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

export function createShareToken(): string {
  return randomBytes(12).toString("base64url");
}

export function createId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function signAdminSession(shareToken: string, secret: string): string {
  return createHash("sha256")
    .update(`${shareToken}:${secret}`)
    .digest("base64url");
}

export function adminCookieName(shareToken: string): string {
  return `rf_orca_admin_${shareToken}`;
}

export function getSessionSecret(adminPasswordHash: string): string {
  return createHash("sha256").update(adminPasswordHash).digest("hex");
}

export function signBoLeadSession(
  shareToken: string,
  boLeadToken: string,
): string {
  return createHash("sha256")
    .update(`bo:${shareToken}:${boLeadToken}`)
    .digest("base64url");
}

export function boLeadCookieName(shareToken: string): string {
  return `rf_orca_bolead_${shareToken}`;
}
