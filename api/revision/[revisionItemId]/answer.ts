import type { VercelRequest, VercelResponse } from "@vercel/node";
import { submitRevisionAnswer } from "../../../src/server/homework-generation-service";
import { ensureMethod, getQueryParam, getRequiredSession, handleApiError } from "../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  const revisionItemId = getQueryParam(request, "revisionItemId");
  if (!revisionItemId) {
    response.status(400).json({ error: "Revision item id is required." });
    return;
  }

  try {
    const session = getRequiredSession(request, "student");
    response.status(200).json(
      await submitRevisionAnswer(revisionItemId, session.userId, Boolean(request.body.correct)),
    );
  } catch (error) {
    handleApiError(response, error);
  }
}
