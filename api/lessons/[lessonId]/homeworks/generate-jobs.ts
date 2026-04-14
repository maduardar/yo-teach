import type { VercelRequest, VercelResponse } from "@vercel/node";
import { startHomeworkGenerationJob } from "../../../../src/server/homework-generation-service";
import { ensureMethod, getQueryParam, getRequiredSession, handleApiError } from "../../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  const lessonId = getQueryParam(request, "lessonId");
  if (!lessonId) {
    response.status(400).json({ error: "Lesson id is required." });
    return;
  }

  try {
    getRequiredSession(request, "teacher");
    response.status(202).json(await startHomeworkGenerationJob(String(lessonId), { model: request.body?.model }));
  } catch (error) {
    handleApiError(response, error);
  }
}
