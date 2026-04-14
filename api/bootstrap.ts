import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBootstrapData } from "../src/server/app-api";
import { ensureMethod, handleApiError } from "../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!ensureMethod(request, response, "GET")) {
    return;
  }

  try {
    response.status(200).json(await getBootstrapData());
  } catch (error) {
    handleApiError(response, error);
  }
}
