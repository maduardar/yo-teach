import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildClearedSessionCookie } from "../../src/server/auth-session";
import { ensureMethod } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  response.setHeader("Set-Cookie", buildClearedSessionCookie());
  response.status(200).json({ ok: true });
}
