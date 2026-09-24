import type { Page } from '@playwright/test';

/**
 * COMPTE-CLIENTE — a real boutique link now opens on the three doors (create
 * an account · sign in · continue without one). The walks whose subject is the
 * BOUTIQUE start as a buyer who already chose « Continuer sans compte » in this
 * tab — the state the app itself records on that tap — so they keep walking
 * what they were written to walk. The doors have their own walks (compte.spec.ts).
 */
export async function commeInvitee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sp-compte-invitee:v1', '1');
    } catch {
      /* a blocked store would show the doors — the walk would say so */
    }
  });
}
