import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAssignedHomeworks } from "../../../src/server/app-api";
import { ensureMethod, getQueryParam, getRequiredSession, handleApiError } from "../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "GET")) {
    return;
  }

  const studentId = getQueryParam(request, "studentId");
  if (!studentId) {
    response.status(400).json({ error: "Student id is required." });
    return;
  }

  try {
    const session = getRequiredSession(request, "student");
    if (studentId !== session.userId && studentId !== "me") {
      response.status(403).json({ error: "You can only access your own homework." });
      return;
    }
    response.status(200).json(await getAssignedHomeworks(session.userId));
  } catch (error) {
    handleApiError(response, error);
  }
}
