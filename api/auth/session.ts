import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSession } from "../../src/server/app-api";
import { readSessionFromCookieHeader } from "../../src/server/auth-session";
import { ensureMethod, handleApiError } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "GET")) {
    return;
  }

  try {
    response.status(200).json(await getSession(readSessionFromCookieHeader(request.headers.cookie)));
  } catch (error) {
    handleApiError(response, error);
  }
}
