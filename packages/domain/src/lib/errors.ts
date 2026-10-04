import { ZodError } from 'zod';
import { logger } from './logger';

// Shared error types so every route handler maps failures to HTTP responses
// the same way, instead of each module inventing its own shape.
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super(message, 503);
  }
}

// `req` is optional only so this stays callable from contexts with no
// request object (tests, scripts) — every real route handler has one and
// should pass it, so its x-request-id (stamped by src/proxy.ts onto the
// forwarded request headers) ends up on the error's log line.
export function errorResponse(error: unknown, req?: Request): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message }, { status: error.statusCode });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: 'Invalid request', issues: error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 },
    );
  }
  // Unexpected errors: never leak internals (stack traces, DB error text) to
  // the client — log server-side, return a generic message.
  const requestId = req?.headers.get('x-request-id') ?? undefined;
  logger.error('http', 'unhandled error in route handler', error, requestId ? { requestId } : undefined);
  return Response.json({ error: 'Something went wrong' }, { status: 500 });
}

type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

// Wraps a route handler so every AppError (and any unexpected throw) becomes
// a consistent JSON error response, instead of each handler needing its own
// try/catch.
export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return errorResponse(error, req);
    }
  };
}
