import type { VercelRequest, VercelResponse } from "@vercel/node";
import { addPhraseToRevision } from "../../src/server/app-api";
import { ensureMethod, getRequiredSession, handleApiError } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  try {
    const session = getRequiredSession(request, "student");
    response.status(201).json(
      await addPhraseToRevision(session.userId, {
        phrase: String(request.body.phrase ?? ""),
        context: String(request.body.context ?? ""),
        lessonId: String(request.body.lessonId ?? ""),
      }),
    );
  } catch (error) {
    handleApiError(response, error);
  }
}
