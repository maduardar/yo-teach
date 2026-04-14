import type { VercelRequest, VercelResponse } from "@vercel/node";
import { submitHomeworkAnswers } from "../../../src/server/homework-generation-service";
import { ensureMethod, getQueryParam, getRequiredSession, handleApiError } from "../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  const homeworkId = getQueryParam(request, "homeworkId");
  if (!homeworkId) {
    response.status(400).json({ error: "Homework id is required." });
    return;
  }

  try {
    const session = getRequiredSession(request, "student");
    response.status(201).json(
      await submitHomeworkAnswers(String(homeworkId), session.userId, request.body?.answers ?? []),
    );
  } catch (error) {
    handleApiError(response, error);
  }
}
