import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deleteHomework, getHomeworkById, updateHomeworkDraft } from "../../src/server/homework-generation-service";
import { getQueryParam, getRequiredSession, handleApiError } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const homeworkId = getQueryParam(request, "homeworkId");
  if (!homeworkId) {
    response.status(400).json({ error: "Homework id is required." });
    return;
  }

  try {
    getRequiredSession(request, "teacher");
    if (request.method === "DELETE") {
      response.status(200).json(await deleteHomework(String(homeworkId)));
      return;
    }

    if (request.method === "GET") {
      response.status(200).json(await getHomeworkById(String(homeworkId)));
      return;
    }

    if (request.method === "PATCH") {
      response.status(200).json(await updateHomeworkDraft(String(homeworkId), request.body));
      return;
    }

    response.setHeader("Allow", "GET, PATCH, DELETE");
    response.status(405).json({ error: `Method ${request.method ?? "UNKNOWN"} not allowed.` });
  } catch (error) {
    handleApiError(response, error);
  }
}
