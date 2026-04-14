import type { VercelRequest, VercelResponse } from "@vercel/node";
import { registerTeacher } from "../../src/server/app-api";
import { ensureMethod, getRequestOrigin, handleApiError } from "../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "POST")) {
    return;
  }

  try {
    response.status(201).json(await registerTeacher(request.body, getRequestOrigin(request)));
  } catch (error) {
    handleApiError(response, error);
  }
}
