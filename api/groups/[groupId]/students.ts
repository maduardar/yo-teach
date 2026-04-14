import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createStudentForGroup } from "../../../src/server/app-api";
import { ensureMethod, getQueryParam, getRequestOrigin, getRequiredSession, handleApiError } from "../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  const groupId = getQueryParam(request, "groupId");
  if (!groupId) {
    response.status(400).json({ error: "Group id is required." });
    return;
  }

  try {
    const session = getRequiredSession(request, "teacher");
    response.status(201).json(await createStudentForGroup(groupId, request.body, session.userId, getRequestOrigin(request)));
  } catch (error) {
    handleApiError(response, error);
  }
}
