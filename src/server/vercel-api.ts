import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readSessionFromCookieHeader, type AppSessionRole } from "./auth-session";
import { ApiError } from "./errors";
import { formatUnknownError, toApiError } from "./errors";

export function getQueryParam(request: VercelRequest, key: string) {
  const value = request.query[key];
  return Array.isArray(value) ? value[0] : value;
}

export function getRequestOrigin(request: VercelRequest) {
  const origin = request.headers.origin;
  if (origin) {
    return origin;
  }

  const forwardedHost = request.headers["x-forwarded-host"];
  if (typeof forwardedHost === "string" && forwardedHost) {
    return `${request.headers["x-forwarded-proto"]?.toString() ?? "https"}://${forwardedHost}`;
  }

  return `${request.headers["x-forwarded-proto"]?.toString() ?? "https"}://${request.headers.host ?? "localhost:8080"}`;
}

export function ensureMethod(request: VercelRequest, response: VercelResponse, method: string) {
  if (request.method === method) {
    return true;
  }

  response.setHeader("Allow", method);
  response.status(405).json({ error: `Method ${request.method ?? "UNKNOWN"} not allowed.` });
  return false;
}

export function handleApiError(response: VercelResponse, error: unknown) {
  const apiError = toApiError(error);
  console.error(formatUnknownError(error));
  response.status(apiError.status).json({ error: apiError.message });
}

export function getRequiredSession(request: VercelRequest, role: AppSessionRole) {
  const session = readSessionFromCookieHeader(request.headers.cookie);
  if (!session || session.role !== role) {
    throw new ApiError(401, "You must be signed in to continue.");
  }
  return session;
}
