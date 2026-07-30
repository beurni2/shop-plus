import { expect, test, type Page } from '@playwright/test';

/**
 * PWA CLIENTE — the pixel-for-pixel gate (Édition Indigo). Proves, in a real
 * Chromium against the real build:
 *  (1) every C1–C9 screen AND state mounts (reachability — a component nobody
 *      mounts must fail here), and the retired S1–S7 routes are un-generatable;
 *  (2) every amount carries the U+202F byte, read raw from the live DOM
 *      (textContent), never a normalized comparison — and a page-wide scan
 *      finds no amount grouped with a space/NBSP;
 *  (3) the four §1.2 habillages drive the chrome (indigo the themeless
 *      default), proven live by a var-flip repaint;
 *  (4) the problème/signalement surfaces keep their danger prominence
 *      (#F8E1DE / #7E1A15 / #8C1D18 / #C4574B / #D9A49C) under EVERY theme —
 *      gate-locked, never ghost, never themed;
 *  (5) no purchase-side economics term ever reaches a buyer surface;
 *  (6) « Le code de remise fait foi » — C9 reveals only after « Tout est bon »
 *      (mode A) or the operator's confirmation (mode B), never before.
 */

const NNBSP = String.fromCharCode(0x202f);
const CODE = '734 921';

/** The four §1.2 habillages → their accent as computed rgb(). */
const THEMES: Record<string, string> = {
  laterite: 'rgb(194, 87, 27)',
  danfani: 'rgb(163, 29, 78)',
  indigo: 'rgb(62, 75, 140)',
  foret: 'rgb(11, 91, 71)',
};

async function noEconomicsLeak(page: Page, label: string): Promise<void> {
  const text = (await page.locator('main.cl-root').innerText()).toLowerCase();
  for (const term of ['coût', 'marge', 'fournisseur', ' net ']) {
    expect(text.includes(term), `${label} leaks « ${term.trim()} »`).toBe(false);
  }
}

/** Raw body text must never group an amount with a space/NBSP — the only
 * digit-space-digits token allowed is the C9 drop code (a code, not an amount,
 * plain space per the pixel source). */
async function noSpaceGroupedAmount(page: Page, label: string): Promise<void> {
  const text = await page.locator('main.cl-root').innerText();
  const scrubbed = text.split(CODE).join(' ');
  expect(scrubbed, `${label} groups an amount with a space/NBSP`).not.toMatch(/\d[ \u00a0]\d{3}(?!\d)/);
}

test('every C1–C9 screen and state mounts (reachability), with zero economics leak', async ({ page }) => {
  const cases: Array<[string, string]> = [
    ['C1', 'C1'],
    ['C1&stock=out', 'C1'],
    ['C1&voix=0', 'C1'],
    ['C1&etat=loading', 'squelette'],
    ['C2', 'C2'],
    ['C3', 'C3'],
    ['C3&micro=refuse', 'C3'],
    ['C4', 'C4'],
    ['C5', 'C5'],
    ['C5&b=indisponible', 'C5'],
    ['C6', 'C6'],
    ['C6&conf=attente', 'C6'],
    ['C6&conf=hors-ligne', 'C6'],
    ['C7', 'C7'],
    ['C8', 'C8'],
    ['C9', 'C9'],
    ['C9&revealed=1', 'C9'],
  ];
  for (const [q, screen] of cases) {
    await page.goto(`/?demo-cliente=${q}`);
    await expect(page.locator('main.cl-root')).toBeVisible();
    await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
    await noEconomicsLeak(page, q);
    await noSpaceGroupedAmount(page, q);
  }
});

test('SCREEN-FIT — every screen/state fills a 360px phone with ZERO horizontal overflow (founder, 2026-07-22)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const cases = ['C1', 'C1&stock=out', 'C2', 'C3', 'C4', 'C5', 'C5&b=indisponible', 'C6', 'C7', 'C8', 'C9', 'C9&revealed=1'];
  for (const q of cases) {
    await page.goto(`/?demo-cliente=${q}`);
    await expect(page.locator('main.cl-root')).toBeVisible();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, `${q} overflows a 360px phone (scrollWidth ${w})`).toBeLessThanOrEqual(360);
    // and the flow owns the full width — no legacy box around it.
    const rootW = await page.locator('main.cl-root').evaluate((el) => el.getBoundingClientRect().width);
    expect(rootW, `${q} — the flow does not fill the phone width`).toBe(360);
  }
  // the dead status spacer is gone in a browser tab (safe-area handles devices).
  await page.goto('/?demo-cliente=C1');
  const statusH = await page.locator('.cl-status').evaluate((el) => el.getBoundingClientRect().height);
  expect(statusH).toBe(0);
});

test('the retired S1–S7 achat routes are UN-GENERATABLE (they fall to the directory)', async ({ page }) => {
  for (const q of ['produit', 'recap', 'localisation', 'livraison', 'confirmation', 'suivi', 'protections']) {
    await page.goto(`/?demo-achat=${q}`);
    await expect(page.locator('.cl-root')).toHaveCount(0);
    await expect(page.locator('.ac-root')).toHaveCount(0);
    // the shell falls through to the S3 découverte root — never a dead screen.
    await expect(page.locator('.boutiques')).toBeVisible();
  }
  // and an unknown screen id is refused too (closed enum — C2 is now legal,
  // an S-era or invented id is not).
  await page.goto('/?demo-cliente=S1');
  await expect(page.locator('.cl-root')).toHaveCount(0);
});

test('C1 — the price band carries the signed price with the U+202F byte (live DOM)', async ({ page }) => {
  await page.goto('/?demo-cliente=C1&theme=indigo');
  const hero = page.locator('.cl-pb-hero').first();
  const amount = await hero.evaluate((el) => el.textContent);
  expect(amount).toBe(`11${NNBSP}500`);
  expect(amount).not.toMatch(/[ \u00a0]/);
  const band = await page.locator('[data-role="price-band"]').first().evaluate((el) => el.textContent);
  expect(band).toContain(`${NNBSP}FCFA`);
  expect(band).not.toMatch(/\d[ \u00a0]FCFA/);
  // épuisé: the price stays signed, struck, with the same bytes.
  await page.goto('/?demo-cliente=C1&stock=out');
  await expect(page.locator('.cl-epuise-stamp')).toContainText('ÉPUISÉ');
  await expect(page.locator('.cl-cta-off')).toBeDisabled();
  const struck = await page.locator('.cl-pb-epuise .cl-pb-hero').evaluate((el) => el.textContent);
  expect(struck).toBe(`11${NNBSP}500`);
});

test('C5 — totals, CTA and the reconciliation line hold the money bytes for BOTH fees', async ({ page }) => {
  await page.goto('/?demo-cliente=C5&theme=indigo');
  // jump() prefill: livraison today (1 000). The MODE is hers to pick — the
  // CTA mounts disabled, « Choisissez pour continuer » (§4 C5).
  const cta0 = page.locator('.cl-cta-c5');
  await expect(cta0).toBeDisabled();
  await expect(cta0).toHaveText('Choisissez pour continuer');
  const reconcile = await page.locator('[data-role="reconcile"]').evaluate((el) => el.textContent);
  expect(reconcile).toBe(`12${NNBSP}500 = 11${NNBSP}500 + 1${NNBSP}000 — chaque franc a sa place.`);
  await page.locator('[data-action="choix-paiement"][data-mode="B"]').click();
  const cta = await page.locator('.cl-cta-c5').evaluate((el) => el.textContent);
  expect(cta).toBe(`Payer 1${NNBSP}000${NNBSP}FCFA maintenant`);
  // switch to mode A — the CTA reads the frozen total.
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  const ctaA = await page.locator('.cl-cta-c5').evaluate((el) => el.textContent);
  expect(ctaA).toBe(`Payer 12${NNBSP}500${NNBSP}FCFA`);
  // the 800-leg reconciliation: pick « Demain » on C4, continue to C5.
  await page.goto('/?demo-cliente=C4');
  await page.locator('[data-action="choix-livraison"][data-choix="tomorrow"]').click();
  await page.locator('[data-action="continuer-c4"]').click();
  const rec800 = await page.locator('[data-role="reconcile"]').evaluate((el) => el.textContent);
  expect(rec800).toBe(`12${NNBSP}300 = 11${NNBSP}500 + 800 — chaque franc a sa place.`);
});

/** One swept text block: what it says, how it wrapped, and WHICH element it is
 *  (the class, so an assertion can name the CTA without guessing at its text —
 *  « Payer le produit à la livraison » is also an option TITLE on this screen). */
interface BlocBalaye {
  readonly cls: string;
  readonly text: string;
  readonly lines: number;
  readonly lastRatio: number;
}

/**
 * EVERY MULTI-LINE TEXT BLOCK ON C5, AS LAID OUT, RIGHT NOW.
 *
 * Structural, never a selector list: a TEXT BLOCK is an element whose own
 * content flows as text — a block box (a flex ITEM counts; the browser
 * blockifies it) whose element children are all inline. That excludes the
 * containers — the bill, a bill ROW, an option row — whose children are boxes
 * laid side by side and whose « lines » are an artefact of layout rather than a
 * wrapped sentence.
 */
async function sweepC5(page: Page, label: string): Promise<EtatBalaye> {
  const seen = await page.evaluate(() => {
    const screen = document.querySelector('[data-screen="C5"]');
    // NO C5 AT ALL. Every field the caller reads exists here too, so a missing
    // screen fails on the `etat` assertion by name — never on an undefined.
    if (screen === null) {
      return {
        etat: null as string | null,
        blocks: [] as Array<{ cls: string; text: string; lines: number; lastRatio: number }>,
        glued: [] as Array<{ cls: string; text: string; lines: number }>,
      };
    }
    /** The visual lines of one element: union the client rects per line top. */
    const linesOf = (el: Element): number[] => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const byTop = new Map<number, { left: number; right: number }>();
      for (const r of [...range.getClientRects()].filter((x) => x.width > 0)) {
        const key = Math.round(r.top);
        const cur = byTop.get(key);
        byTop.set(key, cur === undefined ? { left: r.left, right: r.right } : { left: Math.min(cur.left, r.left), right: Math.max(cur.right, r.right) });
      }
      return [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.right - v.left);
    };
    const isTextBlock = (el: Element): boolean => {
      const d = getComputedStyle(el).display;
      if (d !== 'block' && d !== 'list-item' && d !== 'flow-root') return false;
      return [...el.children].every((c) => getComputedStyle(c).display === 'inline');
    };
    const multi = [...screen.querySelectorAll('*')].filter((el) => {
      if (el.closest('svg') !== null) return false;
      if ((el.textContent ?? '').trim() === '') return false;
      if (!isTextBlock(el)) return false;
      return linesOf(el).length > 1;
    });
    // Keep the INNERMOST block for each run of text: a wrapper that merely
    // contains a wrapped paragraph is not itself a sentence.
    const blocks = multi
      .filter((el) => !multi.some((other) => other !== el && el.contains(other) && (other.textContent ?? '') === (el.textContent ?? '')))
      .map((el) => {
        const w = linesOf(el);
        // THE CONTENT BOX, IN THE SAME COORDINATE SPACE AS THE LINES.
        // Two traps, both hit while writing this: a padded block's text can
        // never fill its OUTER width (so the border box would report a full
        // line as an orphan), and the flow is rendered under `zoom: 1.15` —
        // client rects come back scaled, `clientWidth` and the computed
        // paddings do not. Mixing them inflated every ratio by 15% and
        // silently lowered the bar. Rebuild the content width from the
        // measured rect, using the element's own scale factor.
        const rect = el.getBoundingClientRect();
        const offset = el instanceof HTMLElement ? el.offsetWidth : 0;
        const scale = offset > 0 ? rect.width / offset : 1;
        const cs = getComputedStyle(el);
        const pad = (Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight)) * scale;
        return { cls: el.className, text: (el.textContent ?? '').trim(), lines: w.length, lastRatio: w[w.length - 1]! / (rect.width - pad) };
      });
    // EVERY NO-WRAP UNIT ON THE SCREEN, and how many lines it actually took.
    //
    // WHY THIS EXISTS (round 6). Five sentences on C5 are now set with a glued
    // clause — cl-reconcile-promesse, cl-redite-fin, cl-titre-fin,
    // cl-envoi-fin, cl-prov-cle — and the 0.35 orphan bar only defends the ones
    // whose ratio it happens to cross. Deleting cl-prov-cle puts the opérateur
    // screen back to 0.363: a REGRESSION the bar cannot see, because 0.363
    // passes. A fix nothing fails for is a fix that leaves on the next edit.
    // This also covers the amounts (cl-bill-row b, cl-opt-fee, …) — a franc
    // figure that wraps is a defect in its own right.
    //
    // ═══ WHAT THIS SET DEFENDS, AND WHAT IT DOES NOT (round 7, corrected) ═══
    //
    // The round-6 version of this comment said the glue was « pinned as itself »
    // and left it there, which reads as « the glued clauses are now safe ». THEY
    // ARE NOT, and the distinction is the whole point of the assertions below.
    //
    //   IT DEFENDS AGAINST WRAPPING. A unit that still computes `nowrap` and
    //   takes two lines fails, by name, wherever it is.
    //
    //   IT DOES NOT DEFEND AGAINST REMOVAL, AND CANNOT. Delete a glue and the
    //   element stops computing `nowrap`, drops OUT of this set, and the
    //   invariant passes VACUOUSLY for it — nothing is left to measure. The
    //   `.some(...)` presence checks and the `glued.length` floor further down
    //   are the only things that see a removal at all.
    //
    // The measured cost of each removal, which is why both kinds of assertion
    // are needed (last-line ratio the screen falls back to, and what catches it):
    //   cl-reconcile-promesse → 0.21   · caught by the 0.35 ratio bar
    //   cl-redite-fin         → 0.286  · caught by the 0.35 ratio bar
    //   cl-envoi-fin          → 0.334  · caught by the ratio bar AND by presence
    //   cl-prov-cle           → 0.363  · presence ONLY — 0.363 clears the bar
    //   cl-titre-fin          → 0.362  · presence ONLY — added in round 7,
    //                                    because until then NOTHING caught it:
    //                                    the e2e stayed green, 14 passed, sweep
    //                                    included, with the glue neutered.
    const glued = [...screen.querySelectorAll('*')]
      .filter((el) => {
        if (el.closest('svg') !== null) return false;
        if ((el.textContent ?? '').trim() === '') return false;
        if (getComputedStyle(el).whiteSpace !== 'nowrap') return false;
        return [...el.children].every((c) => getComputedStyle(c).display === 'inline');
      })
      .map((el) => ({ cls: el.className, text: (el.textContent ?? '').trim(), lines: linesOf(el).length }));
    // THE SUB-STATE IS READ IN THE SAME DOM SNAPSHOT AS THE BLOCKS. `envoi`
    // lasts 1 200 ms and `operateur` 2 400 ms before the flow moves on by
    // itself, so a sweep of either is racing a timer. Reading `data-etat` here
    // — inside the one evaluate, off the one layout — means a branch that
    // advanced mid-sweep can only ever produce a WRONG-STATE FAILURE, never a
    // ratio quietly taken from the next screen.
    return { etat: screen.getAttribute('data-etat'), blocks, glued };
  });
  return { label, etat: seen.etat, blocks: seen.blocks, glued: seen.glued };
}

/** One swept sub-state: what it is, and how many wrapped blocks it must yield.
 *  A `plancher` is « the sweep saw this screen », never a target — `choix` is
 *  the whole bill, `envoi` and `operateur` are short centred columns. */
interface EtatBalaye {
  readonly label: string;
  readonly etat: string | null;
  readonly blocks: BlocBalaye[];
  readonly glued: Array<{ cls: string; text: string; lines: number }>;
}

/** Which payment mode this sweep was taken under — `null` before she chooses. */
type ModeBalaye = 'A' | 'B' | null;

/**
 * THE WHOLE SCREEN, IN EVERY STATE A BUYER CAN REACH — which now includes the
 * two she reaches by PRESSING PAYER.
 *
 * `renderC5` has three top-level branches: `choix`, `envoi` (« ENVOI SÉCURISÉ »)
 * and `operateur` (« Confirmez sur votre téléphone »). The sweep used to click
 * the mode cards and stop, so two of the three — both on the far side of the one
 * button this screen exists for, both seen by every buyer on every purchase —
 * were never measured. Each mode is re-entered from a fresh load because paying
 * leaves C5 for C6.
 */
async function sweepEveryState(
  page: Page,
  basket: string,
  url: string,
): Promise<Array<EtatBalaye & { attendu: string; plancher: number; mode: ModeBalaye }>> {
  // `mode` is a FIELD, not a substring of the label. The first version of this
  // filtered with `label.endsWith('chosen')`, which also matched « nothing
  // chosen » — a boundary drawn on prose, in the one test whose entire subject
  // is boundaries drawn carelessly.
  const states = [{ ...(await sweepC5(page, `${basket} · nothing chosen`)), attendu: 'choix', plancher: 6, mode: null as ModeBalaye }];
  for (const mode of ['A', 'B'] as const) {
    await page.goto(url);
    await expect(page.locator('[data-screen="C5"]')).toBeVisible();
    await page.locator(`[data-action="choix-paiement"][data-mode="${mode}"]`).click();
    states.push({ ...(await sweepC5(page, `${basket} · mode ${mode} chosen`)), attendu: 'choix', plancher: 6, mode });
    // …AND THEN SHE PRESSES IT. Everything below this line is a state no
    // previous version of this sweep has ever entered.
    await page.locator('[data-action="payer"]').click();
    await expect(page.locator('[data-etat="envoi"]')).toBeVisible();
    states.push({ ...(await sweepC5(page, `${basket} · mode ${mode} · envoi`)), attendu: 'envoi', plancher: 1, mode });
    await expect(page.locator('[data-etat="operateur"]')).toBeVisible({ timeout: 5_000 });
    states.push({ ...(await sweepC5(page, `${basket} · mode ${mode} · opérateur`)), attendu: 'operateur', plancher: 3, mode });
  }
  return states;
}

/**
 * SP3.3b1 — NO LABEL ON THE MONEY SCREEN MAY BE TRUNCATED, and the honesty
 * line may not wrap into an orphan.
 *
 * THE DEFECTS THIS LOCKS (founder review, read off a 360px screenshot):
 *   · « Livraison Séra — ja… » — the bill row's `text-overflow: ellipsis` ate
 *     « jamais cachée », which IS that row's promise: the delivery fee is shown
 *     apart, never buried in the product price. A trust claim deleted by CSS is
 *     a trust claim not made.
 *   · « Robe brodée bogo… » — the same cut on the article she is paying for.
 *   · « … chaque franc a / sa place. » — the reconciliation sentence wrapped
 *     with two words alone against the right edge, so the screen's own honesty
 *     statement read like a layout accident.
 *
 * Asserted in the LIVE DOM because only the DOM can see it: the HTML string
 * carries the full label either way — it is the rendering that truncated.
 */
test('C5 at 360px — every bill label renders in full, and NO sentence orphans, in every state', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/?demo-cliente=C5&theme=indigo');
  await expect(page.locator('[data-screen="C5"]')).toBeVisible();

  // (1)+(2) NOTHING IS CLIPPED: every label's laid-out width fits its box.
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.cl-bill-row span, .cl-bill-total span, .cl-bill-row b, .cl-bill-total b')].map((el) => ({
      text: el.textContent ?? '',
      clipped: el.scrollWidth > el.clientWidth + 1,
    })),
  );
  expect(labels.length).toBeGreaterThanOrEqual(6);
  for (const l of labels) {
    expect(l.clipped, `« ${l.text} » is cut off on a 360px phone`).toBe(false);
  }

  // …and the two sentences that were being eaten are readable, whole.
  const bill = await page.locator('.cl-bill').innerText();
  expect(bill).toContain('Livraison Séra — jamais cachée');
  expect(bill).toContain('Robe brodée bogolan');
  // no ellipsis anywhere on the bill — neither the character nor three dots
  expect(bill).not.toContain('…');
  expect(bill).not.toMatch(/\.\.\./);

  // (3) NO SENTENCE ON THIS SCREEN ENDS ON AN ORPHAN — and « this screen »
  // means EVERY text block, in EVERY state the buyer can put it in, AT MORE
  // THAN ONE BASKET, found structurally rather than by a list of selectors.
  //
  // THE LESSON THIS ENCODES, now three deep. Each time, the guard was real and
  // the SCOPE was the defect:
  //   · BY SELECTOR (round 2). The honesty line was fixed and the test scoped to
  //     `.cl-reconcile`. Two reviewers then checked that element and passed the
  //     screen — while the REPLAY, one element below, stranded « d'accord ? » on
  //     a third line at 28.6%: the question she is asked to agree to, alone.
  //   · BY STATE (round 4). A sweep of « every block » still saw nothing,
  //     because C5 mounts with NO mode chosen and the replay only exists after
  //     she chooses. Hence three states, and an explicit assertion that the
  //     replay was IN the swept set.
  //   · BY COMPUTED DISPLAY and BY CONTENT (round 5, and both are fixed here).
  //     A button's UA display is inline-block, so `isTextBlock` rejected the
  //     CTA — the one element that carries an amount AND is the screen's single
  //     primary action — before a ratio was ever taken. And the sweep ran three
  //     times against ONE basket, the harness's 12 500, where the paylines and
  //     the CTA all fit on one line, so a wrap none of them can perform at that
  //     basket was never measured. Both are the same shape of miss: the guard
  //     passes because it never looked, and every previous instance of that
  //     shape had hidden a real defect.
  //   · BY SUB-STATE (round 6). The sweep clicked the mode cards and never
  //     pressed Payer, so `envoi` and `operateur` — the two branches on the far
  //     side of this screen's one primary action, which every buyer sees on
  //     every purchase — had never been measured at all. « ENVOI SÉCURISÉ »
  //     was stranding « l'opérateur. » at 0.334, in all four combinations,
  //     fixed regardless of the amount: the party the money is going to, alone
  //     on a line, at the moment the payment leaves her hands.
  //
  // THE RULE, and it is the actual deliverable here, because it has now held
  // SIX times without a single exception:
  //
  //   EVERY TIME THIS SWEEP HAS BEEN BOUNDED BY ANYTHING OTHER THAN « the whole
  //   screen, in every state a buyer can reach », THE BOUNDARY HAS HIDDEN A
  //   DEFECT — by selector, by element, by mount state, by computed display, by
  //   fixture amount, and now by sub-state.
  //
  // The corollary is the one to act on: the next narrowing will look just as
  // reasonable as these six did. Widen the sweep; never the exemption list.
  const BASKET_DEFAULT = 'basket 12 500';
  const BASKET_LARGE = 'basket 19 753 086';
  const URL_DEFAULT = '/?demo-cliente=C5&theme=indigo';
  const URL_LARGE = '/?demo-cliente=C5&theme=indigo&prix=9876543&frais=9876543';

  const petit = await sweepEveryState(page, BASKET_DEFAULT, URL_DEFAULT);

  // THE SAME SCREEN, THE SAME STATES, A BASKET WHOSE SENTENCES WRAP. `prix` and
  // `frais` are harness levers into the certified mock quote service
  // (`harnessFrancs`) — no screen computes anything new; the service is simply
  // asked to price a bigger article and a bigger course. At this basket the two
  // §6.1 paylines wrap, the replay wraps, and mode B's CTA — « Payer 9 876 543
  // FCFA maintenant » — wraps too, which is what puts it in the swept set.
  await page.goto(URL_LARGE);
  await expect(page.locator('[data-screen="C5"]')).toBeVisible();
  const grand = await sweepEveryState(page, BASKET_LARGE, URL_LARGE);

  const tous = [...petit, ...grand];
  for (const { label, etat, blocks, attendu, plancher } of tous) {
    // THE SWEEP MEASURED THE SCREEN IT MEANT TO. `envoi` and `operateur` are
    // timed branches; a ratio read off the wrong one would be a number that
    // proves nothing, so the state travels with the measurement.
    expect(etat, `${label}: swept « ${etat} » — this is not the branch under test`).toBe(attendu);
    // The sweep really did see the screen — an empty result would pass in silence.
    expect(blocks.length, `${label}: no multi-line text found on C5`).toBeGreaterThanOrEqual(plancher);
    for (const b of blocks) {
      expect(
        b.lastRatio,
        `${label}: « ${b.text} » ends on an orphan line (${Math.round(b.lastRatio * 100)}% of the block, ${b.lines} lines)`,
      ).toBeGreaterThan(0.35);
    }
  }

  // …and the REPLAY was actually in the swept set once she had chosen, at BOTH
  // baskets: the sentence this test exists for must not be able to leave
  // coverage quietly. Selected BY LABEL, not by index — a sweep that grows new
  // states must not silently re-point this assertion at one of them.
  for (const { label, blocks } of tous.filter((s) => s.attendu === 'choix' && s.mode !== null)) {
    expect(
      blocks.some((b) => b.text.startsWith('Vous payez')),
      `${label}: the replay line was not swept — coverage shrank without failing`,
    ).toBe(true);
  }

  // …AND THE TWO BRANCHES BEHIND THE PAYER BUTTON WERE REALLY ENTERED, each
  // with the sentence that carries the amount on it. Same discipline as the
  // replay and the CTA: naming the element that must be in the swept set is
  // what stops the set from shrinking back to `choix` without a red test.
  for (const { label, blocks } of tous.filter((s) => s.attendu === 'envoi')) {
    expect(
      blocks.some((b) => b.cls.includes('cl-sub-body')),
      `${label}: « ENVOI SÉCURISÉ » was not swept — the payment-leaving screen left coverage`,
    ).toBe(true);
  }
  for (const { label, blocks } of tous.filter((s) => s.attendu === 'operateur')) {
    expect(
      blocks.some((b) => b.cls.includes('cl-prov-body')),
      `${label}: the opérateur screen was not swept — the code-secret screen left coverage`,
    ).toBe(true);
  }

  // EVERY GLUED CLAUSE HOLDS — AND EVERY ONE OF THEM STILL EXISTS.
  //
  // TWO DIFFERENT ASSERTIONS, BECAUSE THEY CATCH TWO DIFFERENT FAILURES, and
  // conflating them is the mistake round 6 made (see the table in `sweepC5`):
  //   · the LOOP below catches a glue that WRAPPED. It is measured only for
  //     units that are still there.
  //   · the PRESENCE checks catch a glue that was REMOVED — which the loop
  //     cannot, because a removed unit is not in `glued` to be measured, and
  //     which the 0.35 ratio bar catches only when the un-glued screen happens
  //     to fall below 0.35. For cl-prov-cle (0.363) and cl-titre-fin (0.362) it
  //     does not, so presence is the ONLY thing standing between those two
  //     fixes and a silent regression on the next copy tweak.
  for (const { label, glued } of tous) {
    for (const g of glued) {
      expect(g.lines, `${label}: the no-wrap unit « ${g.text} » (${g.cls}) wrapped onto ${g.lines} lines`).toBe(1);
    }
  }
  for (const { label, glued } of tous.filter((s) => s.attendu === 'envoi')) {
    expect(
      glued.some((g) => g.cls.includes('cl-envoi-fin')),
      `${label}: « à l’opérateur. » is no longer one no-wrap unit — the orphan at 0.334 is back`,
    ).toBe(true);
  }
  for (const { label, glued } of tous.filter((s) => s.attendu === 'operateur')) {
    expect(
      glued.some((g) => g.cls.includes('cl-prov-cle')),
      `${label}: « code secret Orange Money » is no longer one no-wrap unit — back to 0.363`,
    ).toBe(true);
  }
  // …AND OPTION B'S NAME, on every state that shows the payment cards (round 7).
  // cl-titre-fin was the one glue on this screen that NOTHING defended: neutered
  // (nowrap → normal) the whole e2e stayed green, sweep included, while the title
  // went back to breaking as « Payer le produit à la / livraison » and stranding
  // the word that says WHICH option it is at 0.362 — above the bar, so invisible
  // to every ratio. It is rendered on both `choix` sites (the payable card and
  // the « Pas disponible » head), which is why `choix` is the right scope.
  for (const { label, glued } of tous.filter((s) => s.attendu === 'choix')) {
    expect(
      glued.some((g) => g.cls.includes('cl-titre-fin')),
      `${label}: « à la livraison » is no longer one no-wrap unit — option B's name orphans again at 0.362`,
    ).toBe(true);
  }
  // A FLOOR ON THE SET ITSELF, so the invariant cannot pass by measuring nothing.
  //
  // Every assertion above is a `for … of glued` or a `.some(…)`; an empty or
  // shrunken `glued` satisfies the loop vacuously and only the named units would
  // notice. The floor is the count ACTUALLY MEASURED on `choix`: the bill's three
  // amounts (`.cl-bill-row b` ×2, `.cl-bill-total b`), the honesty promise, and
  // option B's name. Five, asserted, so deleting an un-named glue is a red test
  // rather than a quieter suite.
  //
  // « Écouter la note » IS NOT IN THIS SET, and is not counted here — its `svg`
  // child computes `display: block`, so the glue filter above skips it exactly
  // as the text-block filter does. Saying so is the point of this round: a floor
  // that quietly counted it would be this comment overstating its own reach
  // again. That control is asserted on its own, by name, in the « Écouter la
  // note » test below.
  const PLANCHER_GLUE_CHOIX = 5;
  for (const { label, glued } of tous.filter((s) => s.attendu === 'choix')) {
    expect(
      glued.length,
      `${label}: only ${glued.length} no-wrap unit(s) on the payment screen — the glued set shrank ` +
        `(${glued.map((g) => g.cls).join(' · ')})`,
    ).toBeGreaterThanOrEqual(PLANCHER_GLUE_CHOIX);
  }

  // …AND THE CTA WAS IN THE SWEPT SET TOO — the assertion the replay has had
  // since round 4 and the CTA had not. It is the only text on this screen that
  // both carries an amount and is the primary action, and until `display: block`
  // it could not be measured at all. If that declaration is removed, the button
  // computes to inline-block, `isTextBlock` drops it, and this fails BY NAME
  // rather than by a silently smaller swept set.
  const ctaState = grand.find((s) => s.attendu === 'choix' && s.mode === 'B');
  expect(
    ctaState?.blocks.some((b) => b.cls.includes('cl-cta-c5')),
    `${BASKET_LARGE}: the CTA was not swept — it is a text block by display, or it stopped wrapping`,
  ).toBe(true);

  // …and the honesty line says what it says, on at most two lines.
  const rec = petit[0]!.blocks.find((b) => b.text.startsWith('12'));
  expect(rec?.text).toBe(`12${NNBSP}500 = 11${NNBSP}500 + 1${NNBSP}000 — chaque franc a sa place.`);
  expect(rec?.lines, 'the reconciliation sentence spilled past two lines').toBeLessThanOrEqual(2);
});

/**
 * THE CREDENTIAL GLUE ON C8 IS ITS OWN MARKUP (round 7, fresh verifier).
 *
 * « Composez votre code secret Orange Money pour valider {X} » is rendered
 * TWICE — C5's opérateur screen and C8's door-payment screen — each with its
 * own `<span class="cl-prov-cle">`. Only the C5 copy was ever named by a test.
 * The two are covered TRANSITIVELY today because they share one CSS rule, so
 * deleting the RULE fails on C5; but deleting the SPAN from C8's markup alone
 * fails nothing at all, and C8 is the screen where she pays the second leg
 * standing in front of the rider. Named here, on the screen that renders it.
 */
test('C8 at 360px — the door payment keeps « code secret Orange Money » as one no-wrap unit', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  // C8 mounts with the prefill's mode B, so « Tout est bon » opens the door
  // payment rather than jumping straight to C9. It self-advances after 2 600 ms.
  await page.goto('/?demo-cliente=C8&theme=indigo');
  await page.locator('[data-action="porte-bon"]').click();
  await expect(page.locator('[data-etat="paiement-porte"]')).toBeVisible();

  const cle = await page.evaluate(() => {
    const el = document.querySelector('[data-etat="paiement-porte"] .cl-prov-cle');
    if (el === null) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
    return { text: (el.textContent ?? '').trim(), nowrap: getComputedStyle(el).whiteSpace === 'nowrap', lines: tops.size };
  });
  expect(cle, 'C8’s « code secret Orange Money » span is gone — the door-leg glue is unprotected').not.toBeNull();
  expect(cle?.text).toBe('code secret Orange Money');
  expect(cle?.nowrap, 'C8’s credential clause no longer computes nowrap').toBe(true);
  expect(cle?.lines, 'C8’s « code secret Orange Money » wrapped — the credential is split across lines').toBe(1);
});

/**
 * « ÉCOUTER LA NOTE » ON THE PAYMENT SCREEN — FOUNDER RULING 2026-07-30, which
 * reverses the 2026-07-22 override that removed it.
 *
 * The rule it enforces is the one the founder stated: the buyer can listen to
 * THE RESELLER'S OWN note exactly when the reseller has recorded one, and there
 * is NO control at all when she has not. This is the screen where the buyer
 * decides to part with money, so a control that plays nothing is not a
 * degraded feature — it is a promise the screen cannot keep.
 *
 * NOT §6.1's per-option audio note. That is a recorded explanation of options A
 * and B, it needs the founder's own recordings, and it stays unbuilt.
 */
test('C5 — « Écouter la note » plays HER note when one exists, and does not exist when it does not', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });

  // ── WITH A NOTE: the control is there, it names whose voice it is, and it
  //    carries the note's own url.
  await page.goto('/?demo-cliente=C5&theme=indigo');
  const ecouter = page.locator('[data-role="ecouter-note"]');
  await expect(ecouter).toBeVisible();
  await expect(ecouter).toHaveText('Écouter la note de la vendeuse');
  expect(await ecouter.getAttribute('data-voix-url')).toBeTruthy();
  // It is NOT C1's handler — C1's is the one with the « (démo) » fallback.
  expect(await ecouter.getAttribute('data-action')).toBe('voix-lire-paiement');
  await expect(page.locator('[data-action="voix-lire"]')).toHaveCount(0);
  // …and the CTA is still the only thing on this screen that looks like one.
  await expect(page.locator('.cl-cta-c5')).toBeVisible();

  // IT WHISPERS, AND IT FITS. Asserted here by name because the C5 glue sweep
  // cannot see this control at all: it is `inline-flex` (not a text block) and
  // its `svg` child computes `display: block` (so the no-wrap set skips it too).
  // A nowrap label that outgrows the column is exactly how this control first
  // broke — at the inherited 16px it pushed the page to scrollWidth 377 on a
  // 360px phone — so the size, the single line and the fit are all pinned.
  const mesure = await page.evaluate(() => {
    const el = document.querySelector('.cl-ecouter') as HTMLElement | null;
    if (el === null) return null;
    const cs = getComputedStyle(el);
    // THE LABEL'S OWN TEXT, not the whole control. Selecting the button's
    // contents spans the play glyph too, and in an `inline-flex` the glyph and
    // the text sit at different tops — which reads as « two lines » when the
    // label is perfectly set on one. Measure the text node.
    const textNode = [...el.childNodes].find((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
    const range = document.createRange();
    if (textNode !== undefined) range.selectNode(textNode);
    const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
    const cta = getComputedStyle(document.querySelector('.cl-cta-c5')!);
    return {
      nowrap: cs.whiteSpace === 'nowrap',
      fontPx: Number.parseFloat(cs.fontSize),
      ctaFontPx: Number.parseFloat(cta.fontSize),
      lines: tops.size,
      width: el.offsetWidth,
      column: (el.parentElement as HTMLElement).clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(mesure).not.toBeNull();
  expect(mesure?.nowrap, 'the listen label may break mid-phrase').toBe(true);
  expect(mesure?.lines, 'the listen label wrapped onto more than one line').toBe(1);
  expect(mesure!.width, 'the nowrap listen label outgrew its column').toBeLessThanOrEqual(mesure!.column);
  expect(mesure!.docScrollWidth, 'the listen control pushed C5 past a 360px phone').toBeLessThanOrEqual(360);
  // IT WHISPERS: smaller than the primary action, never competing with it (§5).
  expect(mesure!.fontPx, 'the listen link is not smaller than the CTA — it stopped whispering').toBeLessThan(
    mesure!.ctaFontPx,
  );

  // IT ACTUALLY PLAYS, and says nothing while it does.
  //
  // THE ASSERTION IS THE SILENCE, and it is not vacuous: the handler's ONLY
  // toast is the `play()` refusal path, so « no toast » can only mean the
  // promise resolved. The companion test below forces that same promise to
  // reject and watches the toast appear, which is what makes this one mean
  // something rather than merely pass.
  await ecouter.click();
  await page.waitForTimeout(300);
  await expect(page.locator('.cl-toast')).toHaveCount(0);
  await page.screenshot({ path: '.artifacts/sp33b1-r7-c5-ecouter-avec-note-360.png', fullPage: true });

  // ── WITHOUT A NOTE (`?voix=0` — the harness's « this product has no voice
  //    note », which now removes the note itself): NO control. Not disabled,
  //    not greyed, not a toast — absent.
  await page.goto('/?demo-cliente=C5&theme=indigo&voix=0');
  await expect(page.locator('[data-screen="C5"]')).toBeVisible();
  await expect(page.locator('[data-role="ecouter-note"]')).toHaveCount(0);
  await expect(page.locator('.cl-ecouter')).toHaveCount(0);
  // and the page says nothing about a note it does not have
  expect(await page.locator('main.cl-root').innerText()).not.toContain('Écouter');
  await page.screenshot({ path: '.artifacts/sp33b1-r7-c5-ecouter-sans-note-360.png', fullPage: true });
});

/**
 * AND C1'S « (démo) » FALLBACK CANNOT REACH THE MONEY SCREEN.
 *
 * The tempting shortcut this locks out was named in the work order: reuse C1's
 * `voix-lire` action and inherit its toast. C1 answers BOTH a missing url and a
 * refused `play()` with « La voix d'Aïcha — 0:12 (démo) ». On C5 the missing-url
 * case cannot arise (no url ⇒ no button), and the REFUSAL case is driven here
 * for real: `play()` is stubbed to reject before the page loads, exactly as an
 * autoplay policy or an undecodable codec would, and the sentence she gets is
 * asserted to be the true one and never the demo claim.
 */
test('C5 — a note that will not play says something TRUE, and never « démo »', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.addInitScript(() => {
    // Every media element on the page refuses to start, the way a locked-down
    // WebView does. Nothing else about the page changes.
    HTMLMediaElement.prototype.play = function play(): Promise<void> {
      return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError'));
    };
  });
  await page.goto('/?demo-cliente=C5&theme=indigo');
  await page.locator('[data-role="ecouter-note"]').click();
  const toast = page.locator('.cl-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('La note ne se lance pas sur ce téléphone.');
  const said = await toast.innerText();
  expect(said, 'the payment screen claimed a demo').not.toContain('démo');
  expect(said).not.toContain('(');
});

test('the four habillages drive the chrome, indigo is the themeless default, proven live', async ({ page }) => {
  for (const [theme, rgb] of Object.entries(THEMES)) {
    await page.goto(`/?demo-cliente=C1&theme=${theme}`);
    await expect(page.locator('.cl-cta')).toHaveCSS('background-color', rgb);
    const accent = await page
      .locator('main.cl-root')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--vt-accent').trim());
    expect(accent.length).toBeGreaterThan(0);
  }
  // no theme param → indigo (the founder-decreed fallback).
  await page.goto('/?demo-cliente=C1');
  await expect(page.locator('.cl-cta')).toHaveCSS('background-color', THEMES.indigo!);
  // THE DRIVE, proven live: flip --vt-accent → the CTA repaints (consumes, not copies).
  await page.locator('main.cl-root').evaluate((el) => el.style.setProperty('--vt-accent', 'rgb(11, 91, 71)'));
  await expect(page.locator('.cl-cta')).toHaveCSS('background-color', 'rgb(11, 91, 71)');
});

test('danger prominence is GATE-LOCKED — never ghost, never themed, under any habillage', async ({ page }) => {
  for (const theme of ['indigo', 'danfani']) {
    // C7: the problem banner + « Signaler un problème ».
    await page.goto(`/?demo-cliente=C7&theme=${theme}`);
    await page.locator('[data-action="signaler-c7"]').click();
    const banner = page.locator('[data-role="problem-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS('background-color', 'rgb(248, 225, 222)'); // #F8E1DE
    await expect(banner).toHaveCSS('color', 'rgb(126, 26, 21)'); // #7E1A15
    const report = page.locator('.cl-c7-report');
    await expect(report).toHaveCSS('border-top-color', 'rgb(217, 164, 156)'); // #D9A49C
    await expect(report).toHaveCSS('color', 'rgb(140, 29, 24)'); // #8C1D18
    // C8: « Un problème » holds equal weight with its danger border.
    await page.goto(`/?demo-cliente=C8&theme=${theme}`);
    const bad = page.locator('.cl-door-bad');
    await expect(bad).toBeVisible();
    await expect(bad).toHaveCSS('border-top-color', 'rgb(196, 87, 75)'); // #C4574B
    await expect(bad).toHaveCSS('color', 'rgb(140, 29, 24)'); // #8C1D18
    // C8 report note keeps the danger tint too.
    await bad.click();
    await page.locator('[data-action="motif"]').first().click();
    const note = page.locator('[data-role="report-note"]');
    await expect(note).toHaveCSS('background-color', 'rgb(248, 225, 222)');
    await expect(note).toHaveCSS('color', 'rgb(126, 26, 21)');
  }
});

test('chemin B complet — the code reveals ONLY after the operator confirms the rest', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?demo-cliente=C5');
  // she picks mode B, then pays the delivery leg: envoi (1.2 s) → opérateur (2.4 s) → C6.
  await page.locator('[data-action="choix-paiement"][data-mode="B"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect(page.locator('[data-etat="envoi"]')).toBeVisible();
  await expect(page.locator('[data-etat="operateur"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-screen="C6"] [data-etat="confirmee"]')).toBeVisible({ timeout: 5_000 });
  // C6 states the confirmed franc: 1 000 now (mode B, today).
  expect(await page.locator('[data-etat="confirmee"]').innerText()).toContain(`1${NNBSP}000${NNBSP}FCFA`);
  // suivre → C7; simulate to step 5; the door CTA appears.
  await page.locator('[data-action="suivre"]').click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  for (let i = 0; i < 4; i += 1) await page.locator('[data-action="simuler"]').click();
  await page.locator('[data-action="porte"]').click();
  await expect(page.locator('[data-screen="C8"] [data-etat="inspection"]')).toBeVisible();
  // mode B owes the product leg at the door, byte-exact.
  expect(await page.locator('[data-role="owing"]').innerText()).toContain(`11${NNBSP}500${NNBSP}FCFA`);
  // « Tout est bon » → the operator screen — the code is NOT revealed yet.
  await page.locator('[data-action="porte-bon"]').click();
  await expect(page.locator('[data-etat="paiement-porte"]')).toBeVisible();
  expect(await page.locator('main.cl-root').innerText()).not.toContain(CODE);
  // 2.6 s later the operator confirms → C9 révélé, the pixel code.
  await expect(page.locator('[data-role="code-revele"]')).toBeVisible({ timeout: 6_000 });
  expect(await page.locator('.cl-code-figure').innerText()).toBe(CODE);
});

test('chemin A — « Tout est bon » reveals C9 with NO door payment; refus keeps step 5 + banner', async ({ page }) => {
  // mode A: no owing band, no operator wait at the door.
  await page.goto('/?demo-cliente=C5');
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect(page.locator('[data-screen="C6"]')).toBeVisible({ timeout: 6_000 });
  await page.locator('[data-action="suivre"]').click();
  for (let i = 0; i < 4; i += 1) await page.locator('[data-action="simuler"]').click();
  await page.locator('[data-action="porte"]').click();
  await expect(page.locator('[data-role="owing"]')).toHaveCount(0);
  await page.locator('[data-action="porte-bon"]').click();
  await expect(page.locator('[data-role="code-revele"]')).toBeVisible();
  expect(await page.locator('.cl-code-figure').innerText()).toBe(CODE);

  // the refusal path is as dignified: motif → « C'est noté » → C7, step 5 kept, banner on.
  await page.goto('/?demo-cliente=C8');
  await page.locator('[data-action="porte-probleme"]').click();
  await page.locator('[data-action="motif"]').nth(1).click();
  await page.locator('[data-action="confirmer-signalement"]').click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  await expect(page.locator('[data-role="problem-banner"]')).toBeVisible();
  // step 5 is the current step (« À votre porte » wears MAINTENANT).
  await expect(page.locator('.cl-tl-t-now')).toHaveText('À votre porte');
  // problem set → no door CTA, no sim.
  await expect(page.locator('[data-action="porte"]')).toHaveCount(0);
  await expect(page.locator('[data-action="simuler"]')).toHaveCount(0);
});

test('C9 direct — the code stays hidden until its leg is confirmed. Jamais avant.', async ({ page }) => {
  await page.goto('/?demo-cliente=C9');
  await expect(page.locator('[data-role="code-cache"]')).toBeVisible();
  await expect(page.locator('[data-role="code-revele"]')).toHaveCount(0);
  expect(await page.locator('main.cl-root').innerText()).not.toContain(CODE);
  await page.goto('/?demo-cliente=C9&revealed=1');
  await expect(page.locator('[data-role="code-revele"]')).toBeVisible();
});

test('hors ligne — the ink banner rides every screen; payNow lands on C6 hors-ligne; the voice queues', async ({ page }) => {
  await page.goto('/?demo-cliente=C5&offline=1');
  await expect(page.locator('[data-role="offline-banner"]')).toBeVisible();
  await page.locator('[data-action="choix-paiement"][data-mode="B"]').click();
  await page.locator('[data-action="payer"]').click();
  // immediate — no fake operator wait offline, never a « payé » lie.
  await expect(page.locator('[data-screen="C6"] [data-etat="hors-ligne"]')).toBeVisible();
  expect(await page.locator('[data-etat="hors-ligne"]').innerText()).toContain('Nous ne dirons jamais « payé »');

  await page.goto('/?demo-cliente=C3&offline=1');
  await page.locator('[data-action="voix-demarrer"]').click();
  await expect(page.locator('[data-role="voice-recording"]')).toBeVisible();
  await page.locator('[data-action="voix-arreter"]').click();
  await expect(page.locator('[data-role="voice-queued"]')).toBeVisible();
});

test('C3 — the five voice states + the gate (zone + repère/voix) drive the CTA', async ({ page }) => {
  await page.goto('/?demo-cliente=C3');
  // pixel truth: C3 mounts EMPTY — no zone picked, no repère typed; the CTA
  // sleeps until canC3 = zone && (repère || voix) turns true.
  const cta = page.locator('[data-action="continuer-c3"]');
  await expect(cta).toBeDisabled();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await expect(cta).toBeDisabled();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await expect(cta).toBeEnabled();
  await page.locator('[data-role="repere"]').fill('');
  await expect(cta).toBeDisabled();
  // record instead: idle → recording (chrono) → recorded (wave + REFAIRE) → CTA on again.
  await page.locator('[data-action="voix-demarrer"]').click();
  await expect(page.locator('[data-role="voice-recording"]')).toBeVisible();
  await page.locator('[data-action="voix-arreter"]').click();
  await expect(page.locator('[data-role="voice-recorded"]')).toBeVisible();
  await expect(cta).toBeEnabled();
  await page.locator('[data-action="voix-refaire"]').click();
  await expect(page.locator('[data-role="voice-recording"]')).toBeVisible();
  // micro refusé — the dignified fallback note.
  await page.goto('/?demo-cliente=C3&micro=refuse');
  await expect(page.locator('[data-role="voice-refused"]')).toBeVisible();
});

test('C2 — the protections sheet opens over C1 and closes on « Compris »', async ({ page }) => {
  await page.goto('/?demo-cliente=C1');
  await page.locator('.cl-shield').click();
  await expect(page.locator('[data-screen="C2"]')).toBeVisible();
  await expect(page.locator('[data-screen="C2"]')).toContainText('Le code de remise fait foi');
  await page.locator('[data-action="fermer-protections-cta"]').click();
  await expect(page.locator('[data-screen="C2"]')).toHaveCount(0);
});
