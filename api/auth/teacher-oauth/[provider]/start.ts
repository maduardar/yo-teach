import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getTeacherOAuthAuthorizationUrl } from "../../../../src/server/app-api";
import { getQueryParam, getRequestOrigin, handleApiError } from "../../../../src/server/vercel-api";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: `Method ${request.method ?? "UNKNOWN"} not allowed.` });
    return;
  }

  const provider = getQueryParam(request, "provider");
  if (provider !== "google" && provider !== "yandex") {
    response.status(404).json({ error: "OAuth provider not found." });
    return;
  }

  try {
    const { authorizationUrl } = getTeacherOAuthAuthorizationUrl({
      provider,
      apiOrigin: getRequestOrigin(request),
      appOrigin: getRequestOrigin(request),
    });
    response.redirect(302, authorizationUrl);
  } catch (error) {
    handleApiError(response, error);
  }
}
