import { createHmac, timingSafeEqual } from "node:crypto";

export type AppSessionRole = "teacher" | "student";

export type AppSession = {
  userId: string;
  role: AppSessionRole;
};

type SignedPayload<T extends object> = T & {
  exp: number;
};

export const SESSION_COOKIE_NAME = "lingua_flow_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function getSigningSecret() {
  return process.env.AUTH_SESSION_SECRET || "lingua-flow-dev-session-secret";
}

function signValue(value: string) {
  return createHmac("sha256", getSigningSecret()).update(value).digest();
}

export function createSignedToken<T extends object>(payload: T, maxAgeSeconds: number) {
  const encodedPayload = base64UrlEncode(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
    } satisfies SignedPayload<T>),
  );
  const encodedSignature = base64UrlEncode(signValue(encodedPayload));
  return `${encodedPayload}.${encodedSignature}`;
}

export function readSignedToken<T extends object>(token: string): SignedPayload<T> | null {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload);
  const actualSignature = base64UrlDecode(encodedSignature);
  if (expectedSignature.length !== actualSignature.length || !timingSafeEqual(expectedSignature, actualSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as SignedPayload<T>;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(session: AppSession) {
  return createSignedToken(session, SESSION_MAX_AGE_SECONDS);
}

export function readSessionToken(token: string) {
  const payload = readSignedToken<AppSession>(token);
  if (!payload) {
    return null;
  }

  return {
    userId: payload.userId,
    role: payload.role,
  } satisfies AppSession;
}

export function parseCookieHeader(header: string | null | undefined) {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index >= 0 ? [part.slice(0, index), decodeURIComponent(part.slice(index + 1))] : [part, ""];
      }),
  );
}

export function readSessionFromCookieHeader(header: string | null | undefined) {
  const cookies = parseCookieHeader(header);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  return readSessionToken(token);
}

export function buildSessionCookie(session: AppSession) {
  const token = createSessionToken(session);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function buildClearedSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
