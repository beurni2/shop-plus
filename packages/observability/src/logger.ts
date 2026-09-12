/**
 * Structured logger (Execution Contract §6): one correlation chain per
 * transaction, plumbed from E0. Every log line is a single JSON object
 * carrying a `correlation_id` field — no free-text logging.
 */

export interface LogLine {
  ts: string;
  level: 'info' | 'warn' | 'error';
  correlation_id: string;
  service: string;
  msg: string;
  [field: string]: unknown;
}

export type LogSink = (line: LogLine) => void;

export interface Logger {
  readonly correlationId: string;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

const defaultSink: LogSink = (line) => {
  console.log(JSON.stringify(line));
};

export function createLogger(options: {
  service: string;
  correlationId: string;
  sink?: LogSink;
}): Logger {
  const { service, correlationId, sink = defaultSink } = options;
  const emit = (level: LogLine['level'], msg: string, fields?: Record<string, unknown>): void => {
    sink({
      ts: new Date().toISOString(),
      level,
      correlation_id: correlationId,
      service,
      msg,
      ...fields,
    });
  };
  return {
    correlationId,
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  };
}

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * DURCISSEMENT-SERVICE-1 (AUDIT-SHOP-2 F-27) — the inbound header is
 * ATTACKER-CONTROLLED and lands verbatim on every log line and on the response;
 * unbounded, one request could write kilobytes into the log per line. 64 holds
 * any real chain id (a UUID is 36) and never a payload.
 */
export const CORRELATION_ID_MAX = 64;

/** Read the inbound correlation id (capped), or mint one so the chain always exists. */
export function correlationIdFrom(request: Request): string {
  const inbound = request.headers.get(CORRELATION_HEADER);
  return inbound === null ? crypto.randomUUID() : inbound.slice(0, CORRELATION_ID_MAX);
}
