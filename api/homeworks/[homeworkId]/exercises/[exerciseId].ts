import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deleteHomeworkExercise, updateHomeworkExercise } from "../../../../../src/server/homework-generation-service";
import { getQueryParam, getRequiredSession, handleApiError } from "../../../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const homeworkId = getQueryParam(request, "homeworkId");
  const exerciseId = getQueryParam(request, "exerciseId");
  if (!homeworkId || !exerciseId) {
    response.status(400).json({ error: "Homework and exercise ids are required." });
    return;
  }

  try {
    getRequiredSession(request, "teacher");
    if (request.method === "PATCH") {
      response.status(200).json(await updateHomeworkExercise(String(homeworkId), String(exerciseId), request.body?.exercise));
      return;
    }

    if (request.method === "DELETE") {
      response.status(200).json(await deleteHomeworkExercise(String(homeworkId), String(exerciseId)));
      return;
    }

    response.setHeader("Allow", "PATCH, DELETE");
    response.status(405).json({ error: `Method ${request.method ?? "UNKNOWN"} not allowed.` });
  } catch (error) {
    handleApiError(response, error);
  }
}
