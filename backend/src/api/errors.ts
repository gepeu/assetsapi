/**
 * The standard error response. Clients get a generic message and request ID: no stack traces and no
 * SQL. The full error stays in the logs under the same request ID.
 */
import type { FastifyError, FastifyInstance } from "fastify";
import { isDatabaseUnavailable } from "../db/pool.ts";
import type { ErrorBody } from "./schemas/shared.ts";

type ErrorCode = ErrorBody["error"]["code"];

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function toApiError(error: FastifyError): ApiError {
  if (error instanceof ApiError) return error;
  if (error.validation) return new ApiError("bad_request", error.message);
  if (error.statusCode === 429) return new ApiError("rate_limited", "Too many requests");
  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
    return new ApiError("bad_request", "The request couldn't be understood");
  }
  // A 503 from Fastify itself is a handler that ran out of time.
  if (error.statusCode === 503 || isDatabaseUnavailable(error)) {
    return new ApiError("unavailable", "The service is temporarily unavailable");
  }
  return new ApiError("internal", "Something went wrong");
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const apiError = toApiError(error);
    const status = STATUS_BY_CODE[apiError.code];
    if (status >= 500) request.log.error({ err: error }, "request failed");
    const body: ErrorBody = { error: { code: apiError.code, message: apiError.message, requestId: request.id } };
    return reply.code(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorBody = { error: { code: "not_found", message: "Not found", requestId: request.id } };
    return reply.code(404).send(body);
  });
}
