import type { VercelRequest, VercelResponse } from "@vercel/node";
import { regenerateHomeworkQuestion } from "../../../../../../../../src/server/homework-generation-service";
import { ensureMethod, getQueryParam, getRequiredSession, handleApiError } from "../../../../../../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  const homeworkId = getQueryParam(request, "homeworkId");
  const exerciseId = getQueryParam(request, "exerciseId");
  const questionId = getQueryParam(request, "questionId");
  if (!homeworkId || !exerciseId || !questionId) {
    response.status(400).json({ error: "Homework, exercise, and question ids are required." });
    return;
  }

  try {
    getRequiredSession(request, "teacher");
    response.status(200).json(
      await regenerateHomeworkQuestion(String(homeworkId), String(exerciseId), String(questionId), {
        model: request.body?.model,
        additionalContext: request.body?.additionalContext,
      }),
    );
  } catch (error) {
    handleApiError(response, error);
  }
}
