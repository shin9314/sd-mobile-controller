import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "sdmc_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function loginUser() {
  return process.env.APP_LOGIN_USER || "user";
}

function loginPassword() {
  return process.env.APP_LOGIN_PASSWORD || "password";
}

function sessionSecret() {
  return [
    process.env.APP_LOGIN_USER || "user",
    process.env.APP_LOGIN_PASSWORD || "password",
    process.env.DATABASE_URL || "sd-mobile-controller"
  ].join(":");
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyLogin(user: string, password: string) {
  return safeEqual(user, loginUser()) && safeEqual(password, loginPassword());
}

export function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({ iat: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function isValidSessionToken(token?: string) {
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iat?: number };
    return typeof parsed.iat === "number" && Date.now() - parsed.iat < SESSION_MAX_AGE * 1000;
  } catch {
    return false;
  }
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  return isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireAuthResponse() {
  if (await isAuthenticated()) {
    return null;
  }

  return NextResponse.json(
    { ok: false, errorMessage: "ログインしてください。" },
    { status: 401 }
  );
}

export function setSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/"
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}
