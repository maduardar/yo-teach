import type { VercelRequest, VercelResponse } from "@vercel/node";
import { regenerateHomeworkExercise } from "../../../../../../src/server/homework-generation-service";
import { ensureMethod, getQueryParam, getRequiredSession, handleApiError } from "../../../../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  const homeworkId = getQueryParam(request, "homeworkId");
  const exerciseId = getQueryParam(request, "exerciseId");
  if (!homeworkId || !exerciseId) {
    response.status(400).json({ error: "Homework and exercise ids are required." });
    return;
  }

  try {
    getRequiredSession(request, "teacher");
    response
      .status(200)
      .json(await regenerateHomeworkExercise(String(homeworkId), String(exerciseId), { model: request.body?.model }));
  } catch (error) {
    handleApiError(response, error);
  }
}
