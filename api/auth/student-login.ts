import type { VercelRequest, VercelResponse } from "@vercel/node";
import { login } from "../../src/server/app-api";
import { buildSessionCookie } from "../../src/server/auth-session";
import { ensureMethod, handleApiError } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  try {
    const result = await login(String(request.body?.identifier ?? ""), String(request.body?.password ?? ""));
    response.setHeader("Set-Cookie", buildSessionCookie({ role: result.user.role, userId: result.user.id }));
    response.status(200).json(result);
  } catch (error) {
    handleApiError(response, error);
  }
}
