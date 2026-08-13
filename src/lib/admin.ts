import { cookies } from "next/headers";
import {
  adminCookieName,
  getSessionSecret,
  signAdminSession,
  verifyPassword,
} from "./crypto";
import { getShowInternal } from "./store";

export async function isAdminUnlocked(shareToken: string): Promise<boolean> {
  const show = await getShowInternal(shareToken);
  if (!show) return false;
  const jar = await cookies();
  const value = jar.get(adminCookieName(shareToken))?.value;
  if (!value) return false;
  const expected = signAdminSession(
    shareToken,
    getSessionSecret(show.adminPasswordHash),
  );
  return value === expected;
}

export async function unlockAdmin(
  shareToken: string,
  password: string,
): Promise<boolean> {
  const show = await getShowInternal(shareToken);
  if (!show) return false;
  if (!verifyPassword(password, show.adminPasswordHash)) return false;
  const jar = await cookies();
  const token = signAdminSession(
    shareToken,
    getSessionSecret(show.adminPasswordHash),
  );
  jar.set(adminCookieName(shareToken), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}

export async function lockAdmin(shareToken: string): Promise<void> {
  const jar = await cookies();
  jar.delete(adminCookieName(shareToken));
}
