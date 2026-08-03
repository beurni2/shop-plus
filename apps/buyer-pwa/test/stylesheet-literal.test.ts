import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE STYLESHEET TEMPLATE-LITERAL TRAP — pinned after hitting it TWICE in one
 * day (vitrine/styles.ts, then cliente/styles.ts within the hour).
 *
 * Both stylesheets are ONE template literal. A backtick written into a CSS
 * comment — the natural way to quote a property name in prose — terminates the
 * string and breaks the module at PARSE time.
 *
 * WHY THIS FILE IMPORTS NOTHING. The first version of this check lived beside
 * the tests for the screens it protects, and imported the stylesheet constants.
 * That version could never fire: a parse error stops the whole test FILE from
 * loading, so the assertion never ran and the reader got an esbuild stack dump
 * instead of a sentence. CI did fail (exit 1) — but on a message nobody could
 * act on. Reading the files as TEXT, from a module with no imports, is what
 * turns « the bundle exploded » into « you left a backtick in a CSS comment ».
 *
 * A JOURNAL note did not stop the second occurrence. This does.
 */
describe('the stylesheet modules stay parseable', () => {
  const FILES = [
    ['vitrine', 'styles.ts'],
    ['cliente', 'styles.ts'],
  ] as const;

  it('each stylesheet holds EXACTLY the two backticks that open and close it', () => {
    for (const rel of FILES) {
      const src = readFileSync(join(__dirname, '..', 'src', ...rel), 'utf8');
      const ticks = (src.match(/`/g) ?? []).length;
      expect(
        ticks,
        `src/${rel.join('/')}: ${ticks} backticks. A CSS comment quoting a property with backticks ` +
          'closes the template literal and breaks the module — use « guillemets » or plain quotes.',
      ).toBe(2);
    }
  });

  it('CONTROL — the files were actually read, so the count above means something', () => {
    for (const rel of FILES) {
      const src = readFileSync(join(__dirname, '..', 'src', ...rel), 'utf8');
      expect(src.length).toBeGreaterThan(1_000);
      expect(src).toContain('export const');
    }
  });
});
