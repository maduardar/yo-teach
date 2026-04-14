import type { VercelRequest, VercelResponse } from "@vercel/node";
import { confirmTeacherEmail } from "../../src/server/app-api";
import { buildSessionCookie } from "../../src/server/auth-session";
import { ensureMethod, handleApiError } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  try {
    const result = await confirmTeacherEmail(String(request.body?.token ?? ""));
    response.setHeader("Set-Cookie", buildSessionCookie({ role: "teacher", userId: result.user.id }));
    response.status(200).json(result);
  } catch (error) {
    handleApiError(response, error);
  }
}
