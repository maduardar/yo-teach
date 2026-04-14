import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deleteLesson, updateLesson } from "../../src/server/app-api";
import { getQueryParam, getRequiredSession, handleApiError } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const lessonId = getQueryParam(request, "lessonId");
  if (!lessonId) {
    response.status(400).json({ error: "Lesson id is required." });
    return;
  }

  try {
    const session = getRequiredSession(request, "teacher");
    if (request.method === "PATCH") {
      response.status(200).json(await updateLesson(String(lessonId), { ...request.body, teacherId: session.userId }));
      return;
    }

    if (request.method === "DELETE") {
      response.status(200).json(await deleteLesson(String(lessonId), session.userId));
      return;
    }

    response.setHeader("Allow", "PATCH, DELETE");
    response.status(405).json({ error: `Method ${request.method ?? "UNKNOWN"} not allowed.` });
  } catch (error) {
    handleApiError(response, error);
  }
}
