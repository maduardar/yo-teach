import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getHomeworkGenerationJobStatus } from "../../../src/server/homework-generation-service";
import { ensureMethod, getQueryParam, getRequiredSession, handleApiError } from "../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "GET")) {
    return;
  }

  const jobId = getQueryParam(request, "jobId");
  if (!jobId) {
    response.status(400).json({ error: "Job id is required." });
    return;
  }

  try {
    getRequiredSession(request, "teacher");
    response.status(200).json(getHomeworkGenerationJobStatus(String(jobId)));
  } catch (error) {
    handleApiError(response, error);
  }
}
