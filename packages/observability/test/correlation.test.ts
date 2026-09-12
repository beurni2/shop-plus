import { describe, expect, it } from 'vitest';
import { CORRELATION_HEADER, correlationIdFrom, createLogger, makeHealthFetch, type LogLine } from '../src/index.js';

// Contract E0 exit: "correlation IDs flow through a hello-world transaction".

describe('structured logger', () => {
  it('emits JSON lines with a correlation_id field on every line', () => {
    const lines: LogLine[] = [];
    const logger = createLogger({
      service: 'test-service',
      correlationId: 'corr-123',
      sink: (l) => lines.push(l),
    });
    logger.info('hello', { extra: 1 });
    logger.error('boom');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.correlation_id).toBe('corr-123');
      expect(line.service).toBe('test-service');
      expect(typeof line.ts).toBe('string');
    }
    expect(lines[0]?.extra).toBe(1);
    expect(lines[1]?.level).toBe('error');
  });
});

describe('hello-world request through a service stub', () => {
  it('carries the inbound correlation id: header → structured log → response header', () => {
    const lines: LogLine[] = [];
    const fetchHandler = makeHealthFetch('storefront-service', (l) => lines.push(l));
    const request = new Request('https://storefront.shop.internal/health', {
      headers: { [CORRELATION_HEADER]: 'hello-world-chain-1' },
    });
    const response = fetchHandler(request);
    expect(response.status).toBe(200);
    expect(response.headers.get(CORRELATION_HEADER)).toBe('hello-world-chain-1');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.correlation_id).toBe('hello-world-chain-1');
    expect(lines[0]?.msg).toBe('health check');
  });

  it('mints a correlation id when none arrives, so the chain always exists', () => {
    const lines: LogLine[] = [];
    const fetchHandler = makeHealthFetch('storefront-service', (l) => lines.push(l));
    const response = fetchHandler(new Request('https://storefront.shop.internal/health'));
    const echoed = response.headers.get(CORRELATION_HEADER);
    expect(echoed).toBeTruthy();
    expect(lines[0]?.correlation_id).toBe(echoed);
  });
});

/**
 * DURCISSEMENT-SERVICE-1 (AUDIT-SHOP-2 F-27) — the inbound header is
 * ATTACKER-CONTROLLED and lands verbatim on every log line and on the response;
 * unbounded, one request could write kilobytes into the log per line. Capped at
 * 64 characters: enough for any real chain id (a UUID is 36), never a payload.
 */
describe('the correlation id is capped at 64 characters', () => {
  it('a longer header is cut to its first 64 — logged and echoed at that length, never unbounded', () => {
    const lines: LogLine[] = [];
    const fetchHandler = makeHealthFetch('storefront-service', (l) => lines.push(l));
    const response = fetchHandler(
      new Request('https://storefront.shop.internal/health', { headers: { [CORRELATION_HEADER]: 'c'.repeat(500) } }),
    );
    expect(response.headers.get(CORRELATION_HEADER)).toBe('c'.repeat(64));
    expect(lines[0]?.correlation_id).toBe('c'.repeat(64));
  });

  it('a header of 64 characters or fewer passes untouched — the cap is a ceiling, not a rewrite', () => {
    const exact = 'x'.repeat(64);
    expect(correlationIdFrom(new Request('https://s/health', { headers: { [CORRELATION_HEADER]: exact } }))).toBe(exact);
    expect(correlationIdFrom(new Request('https://s/health', { headers: { [CORRELATION_HEADER]: 'corr-7' } }))).toBe('corr-7');
  });
});
