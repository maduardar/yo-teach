import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    const parts = [`${error.name}: ${error.message}`];
    if (error.stack) {
      parts.push(error.stack);
    }
    if ("cause" in error && error.cause) {
      parts.push(`Cause: ${formatUnknownError(error.cause)}`);
    }
    return parts.join("\n");
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export function toApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ApiError(502, "The AI model returned invalid structured output. Try again or choose another model.");
  }

  if (error instanceof Error) {
    if (error.message.includes("request timed out")) {
      return new ApiError(504, error.message);
    }

    if (error.message.includes("response failed schema validation")) {
      return new ApiError(502, "The AI model returned invalid structured output. Try again or choose another model.");
    }

    if (error.message.includes("could not generate a valid")) {
      return new ApiError(502, error.message);
    }
  }

  if (typeof error === "object" && error && "code" in error && typeof error.code === "string") {
    if (error.code === "P1001") {
      return new ApiError(
        503,
        "The database is unreachable. Start PostgreSQL and make sure DATABASE_URL in .env points to it.",
      );
    }

    if (error.code === "P1010") {
      return new ApiError(
        503,
        "Database access was denied. Update DATABASE_URL in .env with valid PostgreSQL credentials.",
      );
    }

    if (error.code === "P2021" || error.code === "P2022") {
      return new ApiError(
        500,
        "The database schema is out of date. Run the Prisma migration and seed commands, then try again.",
      );
    }
  }

  return new ApiError(500, "Internal server error");
}
