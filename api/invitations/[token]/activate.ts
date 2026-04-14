import type { VercelRequest, VercelResponse } from "@vercel/node";
import { activateInvitation } from "../../../src/server/app-api";
import { ensureMethod, getQueryParam, handleApiError } from "../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  const token = getQueryParam(request, "token");
  if (!token) {
    response.status(400).json({ error: "Invitation token is required." });
    return;
  }

  try {
    response.status(200).json(await activateInvitation(token, String(request.body?.password ?? "")));
  } catch (error) {
    handleApiError(response, error);
  }
}
