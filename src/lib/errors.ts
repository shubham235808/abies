import { ZodError } from 'zod';

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

export function errorResponse(error: unknown): Response {
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
  console.error('[unhandled]', error);
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
      return errorResponse(error);
    }
  };
}
