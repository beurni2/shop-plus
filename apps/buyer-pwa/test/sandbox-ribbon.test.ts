import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WO-4.2E — the SANDBOX RIBBON law: a deployed preview must never be
 * mistakable for a real store. The ribbon is UNCONDITIONAL — appended
 * before any URL param is even read, on every code path, with no profile
 * flag and no param that could remove it (the e2e proves it in a real
 * browser; this pin proves it in the source structure).
 */

const appDir = join(import.meta.dirname, '..');

describe('the sandbox ribbon is unconditional', () => {
  const main = readFileSync(join(appDir, 'src/main.ts'), 'utf8');

  it('is appended BEFORE the URL params are read — no param can gate it', () => {
    expect(main).toMatch(
      /ribbon\.textContent = t\('apercu\.ruban'\);[\s\S]*?app\.append\(ribbon\);[\s\S]*?const params = new URLSearchParams/,
    );
  });

  it('carries no condition: the append sits directly under the #app guard, outside every if/branch', () => {
    const block = main.slice(main.indexOf('if (app) {'), main.indexOf('const params = new URLSearchParams'));
    expect(block).toContain("t('apercu.ruban')");
    // No if/ternary between the app guard and the ribbon append.
    expect(block.replace('if (app) {', '')).not.toMatch(/\bif\s*\(|\?[^.]/);
  });

  it('the ribbon copy says sandbox, in the catalog register', () => {
    const catalog = JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as Array<{
      key: string;
      fr: string;
      register: string;
    }>;
    const entry = catalog.find((e) => e.key === 'apercu.ruban');
    expect(entry?.fr).toBe("Aperçu — données d'essai. Rien ici n'est réel.");
    expect(entry?.register).toBe('neutral');
  });

  it('the build base is relative — the same build serves local, the gate, and project Pages', () => {
    const config = readFileSync(join(appDir, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/base: '\.\/'/);
  });
});
