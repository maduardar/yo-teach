import type { VercelRequest, VercelResponse } from "@vercel/node";
import { publishHomework } from "../../../src/server/homework-generation-service";
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
    getRequiredSession(request, "teacher");
    response.status(200).json(await publishHomework(String(homeworkId)));
  } catch (error) {
    handleApiError(response, error);
  }
}
