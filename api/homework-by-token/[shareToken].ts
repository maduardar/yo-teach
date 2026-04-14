import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveHomeworkByShareToken } from "../../src/server/app-api";
import { ensureMethod, getQueryParam, getRequiredSession, handleApiError } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "GET")) return;

  const shareToken = getQueryParam(request, "shareToken");
  if (!shareToken) {
    response.status(400).json({ error: "Share token is required." });
    return;
  }

  try {
    const session = getRequiredSession(request, "student");
    response.status(200).json(await resolveHomeworkByShareToken(shareToken, session.userId));
  } catch (error) {
    handleApiError(response, error);
  }
}
