import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loginAsDemo } from "../../src/server/app-api";
import { ensureMethod, handleApiError } from "../../src/server/vercel-api";
import { buildSessionCookie } from "../../src/server/auth-session";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  try {
    const role = request.body.role === "student" ? "student" : "teacher";
    const result = await loginAsDemo(role, request.body.studentId);
    response.setHeader("Set-Cookie", buildSessionCookie({ role: result.user.role, userId: result.user.id }));
    response.status(200).json(result);
  } catch (error) {
    handleApiError(response, error);
  }
}
