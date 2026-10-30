import type { AstroCookies } from "astro";
import {
  adminCookieName,
  boLeadCookieName,
  getSessionSecret,
  signAdminSession,
  signBoLeadSession,
  verifyPassword,
} from "./crypto";
import { getShowInternal } from "./store";
import type { BoardRole } from "./types";

function isProd(): boolean {
  return import.meta.env.PROD || process.env.NODE_ENV === "production";
}

export async function isAdminUnlocked(
  shareToken: string,
  cookies: AstroCookies,
): Promise<boolean> {
  const show = await getShowInternal(shareToken);
  if (!show) return false;
  const value = cookies.get(adminCookieName(shareToken))?.value;
  if (!value) return false;
  const expected = signAdminSession(
    shareToken,
    getSessionSecret(show.adminPasswordHash),
  );
  return value === expected;
}

export async function isBoLeadUnlocked(
  shareToken: string,
  cookies: AstroCookies,
): Promise<boolean> {
  const show = await getShowInternal(shareToken);
  if (!show?.boLeadToken) return false;
  const value = cookies.get(boLeadCookieName(shareToken))?.value;
  if (!value) return false;
  const expected = signBoLeadSession(shareToken, show.boLeadToken);
  return value === expected;
}

/** Highest privilege for floor mark locks (admin > BO Lead > crew). */
export async function getBoardRole(
  shareToken: string,
  cookies: AstroCookies,
): Promise<BoardRole> {
  if (await isAdminUnlocked(shareToken, cookies)) return "admin";
  if (await isBoLeadUnlocked(shareToken, cookies)) return "boLead";
  return "crew";
}

export async function unlockAdmin(
  shareToken: string,
  password: string,
  cookies: AstroCookies,
): Promise<boolean> {
  const show = await getShowInternal(shareToken);
  if (!show) return false;
  if (!verifyPassword(password, show.adminPasswordHash)) return false;
  const token = signAdminSession(
    shareToken,
    getSessionSecret(show.adminPasswordHash),
  );
  cookies.set(adminCookieName(shareToken), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}

export async function lockAdmin(
  shareToken: string,
  cookies: AstroCookies,
): Promise<void> {
  cookies.delete(adminCookieName(shareToken), { path: "/" });
}

export async function unlockBoLead(
  shareToken: string,
  leadToken: string,
  cookies: AstroCookies,
): Promise<boolean> {
  const show = await getShowInternal(shareToken);
  if (!show?.boLeadToken) return false;
  if (leadToken !== show.boLeadToken) return false;
  const session = signBoLeadSession(shareToken, show.boLeadToken);
  cookies.set(boLeadCookieName(shareToken), session, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return true;
}

export async function lockBoLead(
  shareToken: string,
  cookies: AstroCookies,
): Promise<void> {
  cookies.delete(boLeadCookieName(shareToken), { path: "/" });
}
