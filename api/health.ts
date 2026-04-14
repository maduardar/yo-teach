import type { VercelRequest, VercelResponse } from "@vercel/node";
import { prisma } from "../src/server/db";

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    const userCount = await prisma.user.count();

    response.status(200).json({
      ok: true,
      service: "lingua-flow-api",
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        users: userCount,
      },
    });
  } catch (error) {
    response.status(500).json({
      ok: false,
      service: "lingua-flow-api",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown database error",
    });
  }
}
