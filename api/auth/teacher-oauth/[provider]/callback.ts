import type { VercelRequest, VercelResponse } from "@vercel/node";
import { completeTeacherOAuth } from "../../../../src/server/app-api";
import { buildSessionCookie } from "../../../../src/server/auth-session";
import { getQueryParam, getRequestOrigin } from "../../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: `Method ${request.method ?? "UNKNOWN"} not allowed.` });
    return;
  }

  const provider = getQueryParam(request, "provider");
  if (provider !== "google" && provider !== "yandex") {
    response.status(404).json({ error: "OAuth provider not found." });
    return;
  }

  try {
    const result = await completeTeacherOAuth({
      provider,
      code: String(request.query.code ?? ""),
      state: String(request.query.state ?? ""),
      apiOrigin: getRequestOrigin(request),
    });
    response.setHeader("Set-Cookie", buildSessionCookie({ role: "teacher", userId: result.user.id }));
    response.redirect(302, `${result.appOrigin.replace(/\/$/, "")}/teacher`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth sign-in failed.";
    response.redirect(302, `${getRequestOrigin(request).replace(/\/$/, "")}/login?oauthError=${encodeURIComponent(message)}`);
  }
}
