import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createGroup } from "../../src/server/app-api";
import { ensureMethod, getRequiredSession, handleApiError } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  try {
    const session = getRequiredSession(request, "teacher");
    response.status(201).json(await createGroup({ ...request.body, teacherId: session.userId }));
  } catch (error) {
    handleApiError(response, error);
  }
}
