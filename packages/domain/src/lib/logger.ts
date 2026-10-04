// Structured JSON logging, one line per event — the shape a real log
// aggregator (CloudWatch/Loki/whatever Phase 12's actual ops stack turns
// out to be) can parse without a regex. Every module before this phase used
// a bare `console.error('[module] message', err)`, readable in a terminal
// but not machine-parseable; this replaces those call sites rather than
// adding a second, inconsistent logging convention alongside them.
//
// `Error` objects don't JSON.stringify usefully (message/stack aren't
// enumerable), so errors are serialized explicitly rather than passed
// through raw.

type LogLevel = 'info' | 'warn' | 'error';

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function write(level: LogLevel, scope: string, message: string, context?: Record<string, unknown>) {
  // requestId is promoted to a top-level field (docs/platform/CONTRACT.md
  // §16 wants request/correlation ID alongside timestamp/level/service/
  // environment/message, not buried inside an opaque nested object) —
  // everything else in context stays nested. Set by src/proxy.ts's
  // x-request-id header, read back out by errorResponse() in errors.ts.
  const { requestId, ...rest } = context ?? {};
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.APP_NAME ?? 'unknown',
    environment: process.env.NODE_ENV ?? 'unknown',
    ...(requestId ? { requestId } : {}),
    scope,
    message,
    ...(Object.keys(rest).length > 0 ? { context: rest } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (scope: string, message: string, context?: Record<string, unknown>) => write('info', scope, message, context),
  warn: (scope: string, message: string, context?: Record<string, unknown>) => write('warn', scope, message, context),
  error: (scope: string, message: string, err?: unknown, context?: Record<string, unknown>) =>
    write('error', scope, message, { ...context, error: serializeError(err) }),
};
