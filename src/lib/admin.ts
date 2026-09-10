import { cookies } from "next/headers";
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

export async function isBoLeadUnlocked(shareToken: string): Promise<boolean> {
  const show = await getShowInternal(shareToken);
  if (!show?.boLeadToken) return false;
  const jar = await cookies();
  const value = jar.get(boLeadCookieName(shareToken))?.value;
  if (!value) return false;
  const expected = signBoLeadSession(shareToken, show.boLeadToken);
  return value === expected;
}

/** Highest privilege for floor mark locks (admin > BO Lead > crew). */
export async function getBoardRole(shareToken: string): Promise<BoardRole> {
  if (await isAdminUnlocked(shareToken)) return "admin";
  if (await isBoLeadUnlocked(shareToken)) return "boLead";
  return "crew";
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

export async function unlockBoLead(
  shareToken: string,
  leadToken: string,
): Promise<boolean> {
  const show = await getShowInternal(shareToken);
  if (!show?.boLeadToken) return false;
  if (leadToken !== show.boLeadToken) return false;
  const jar = await cookies();
  const session = signBoLeadSession(shareToken, show.boLeadToken);
  jar.set(boLeadCookieName(shareToken), session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return true;
}

export async function lockBoLead(shareToken: string): Promise<void> {
  const jar = await cookies();
  jar.delete(boLeadCookieName(shareToken));
}
