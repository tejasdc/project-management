import type { Context } from "hono";
import { ZodError } from "zod";
import { logger } from "./logger.js";

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;

  constructor(opts: { code: ErrorCode; status: number; message: string; details?: unknown }) {
    super(opts.message);
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError({ code: "BAD_REQUEST", status: 400, message, details });
}

export function unauthorized(message = "Unauthorized") {
  return new ApiError({ code: "UNAUTHORIZED", status: 401, message });
}

export function notFound(resource: string, id?: string) {
  return new ApiError({
    code: "NOT_FOUND",
    status: 404,
    message: `${resource} not found`,
    details: id ? { resource, id } : { resource },
  });
}

export function conflict(message: string, details?: unknown) {
  return new ApiError({ code: "CONFLICT", status: 409, message, details });
}

export function serviceUnavailable(message: string, details?: unknown) {
  return new ApiError({ code: "SERVICE_UNAVAILABLE", status: 503, message, details });
}

export function toErrorResponse(c: Context, err: unknown): Response {
  const requestId =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c.get("requestId" as any) as string | undefined) ??
    c.req.header("x-request-id") ??
    undefined;

  if (err instanceof ApiError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          status: err.status,
          details: err.details,
          requestId,
        },
      },
      err.status as any
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          status: 422,
          details: err.issues,
          requestId,
        },
      },
      422
    );
  }

  logger.error({ err, requestId }, "Unhandled error");
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal error",
        status: 500,
        requestId,
      },
    },
    500
  );
}
