import {
  shopPlusTheme as theme,
  shopColour,
  type as typo,
  spacing,
  radius,
  touch,
  motion,
} from '@platform/ui-tokens';
import { t, tf } from './i18n';
import { FCFA } from './format';
import { DEMO_KIT } from './demo';
import { composeCard, OUTPUT, PREVIEW, type CardCopy, type Format, type Model } from './composeur';
import { paint } from './paint';

/**
 * WO-7.2b — the composeur shell. Token-driven chrome (every colour, dimension,
 * duration is a Grand Teint token resolved to a CSS variable — no hardcoded
 * values), a WYSIWYG preview canvas, and the « Créer l'image » action that
 * renders the full-resolution card on THIS phone (« rien n'est envoyé »). One
 * primary action; the format/model choices whisper beneath it.
 */

const root = document.documentElement;
const px = (n: number): string => `${n}px`;
const ms = (n: number): string => `${n}ms`;

for (const [name, value] of Object.entries(theme.colours)) root.style.setProperty(`--c-${name}`, value);
root.style.setProperty('--c-accent', shopColour.primaryStrong);
root.style.setProperty('--font', `${typo.family}, ${typo.familyFallback}`);
root.style.setProperty('--sp-sm', px(spacing.sm));
root.style.setProperty('--sp-md', px(spacing.md));
root.style.setProperty('--sp-lg', px(spacing.lg));
root.style.setProperty('--sp-xl', px(spacing.xl));
root.style.setProperty('--r-button', px(radius.button));
root.style.setProperty('--touch', px(touch.minTargetPx));
root.style.setProperty('--dur', ms(motion.quickMs));

const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--font); background: var(--c-desk); color: var(--c-ink); }
  .wrap { max-width: 460px; margin: 0 auto; padding: var(--sp-lg); display: flex; flex-direction: column; gap: var(--sp-lg); }
  .titre { font-weight: 800; font-size: 22px; margin: 0; }
  .sous { color: var(--c-muted); margin: 0; font-size: 15px; line-height: 1.4; }
  .seg-label { font-weight: 800; text-transform: uppercase; letter-spacing: 2px; font-size: 11px; color: var(--c-muted); margin-bottom: var(--sp-sm); }
  .seg { display: flex; gap: var(--sp-sm); }
  .seg button { flex: 1; min-height: var(--touch); border: 1px solid var(--c-hairlineStrong); border-radius: var(--r-button); background: var(--c-paper); color: var(--c-ink); font-family: var(--font); font-weight: 700; font-size: 14px; cursor: pointer; transition: background var(--dur), color var(--dur); }
  .seg button[aria-pressed="true"] { background: var(--c-accent); color: var(--c-onPrimary); border-color: var(--c-accent); }
  .stage { display: flex; justify-content: center; padding: var(--sp-lg) 0; }
  .stage canvas { max-width: 100%; height: auto; box-shadow: 0 1px 0 var(--c-hairlineStrong); }
  .cta { min-height: var(--touch); border: none; border-radius: var(--r-button); background: var(--c-accent); color: var(--c-onPrimary); font-family: var(--font); font-weight: 800; font-size: 16px; cursor: pointer; }
  .status { min-height: 20px; color: var(--c-muted); font-size: 13px; text-align: center; }
  @media (prefers-reduced-motion: reduce) { .seg button { transition: none; } }
`;
document.head.appendChild(style);

function segment(labelKey: string, options: Array<{ id: string; labelKey: string }>, current: () => string, onPick: (id: string) => void): HTMLElement {
  const box = document.createElement('div');
  const lab = document.createElement('div');
  lab.className = 'seg-label';
  lab.textContent = t(labelKey);
  const row = document.createElement('div');
  row.className = 'seg';
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t(opt.labelKey);
    b.setAttribute('aria-pressed', String(current() === opt.id));
    b.addEventListener('click', () => onPick(opt.id));
    row.appendChild(b);
  }
  box.append(lab, row);
  return box;
}

let format: Format = 'story';
let model: Model = 'clair';

const app = document.getElementById('app')!;
const wrap = document.createElement('div');
wrap.className = 'wrap';

const titre = document.createElement('h1');
titre.className = 'titre';
titre.textContent = t('kit.titre');
const sous = document.createElement('p');
sous.className = 'sous';
sous.textContent = t('kit.sous_titre');

const formatSeg = document.createElement('div');
const modelSeg = document.createElement('div');

const stage = document.createElement('div');
stage.className = 'stage';
const canvas = document.createElement('canvas');
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', t('kit.apercu'));
stage.appendChild(canvas);

const cta = document.createElement('button');
cta.type = 'button';
cta.className = 'cta';
cta.textContent = t('kit.cta');

const status = document.createElement('div');
status.className = 'status';
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');

function copy(): CardCopy {
  return {
    productName: DEMO_KIT.productName,
    prixTag: t('card.prix_label'),
    priceLabel: `${FCFA.format(DEMO_KIT.priceFcfa)} F`,
    deliveryBadge: t('card.livre_protege'),
    codeLine: tf('card.code', { code: DEMO_KIT.shortCode }),
    bioLine: t('card.bio'),
    validity: tf('card.validite', { date: DEMO_KIT.priceValidityDate }),
    qrLegend: t('card.qr_legende'),
    qrFallback: tf('card.qr_repli', { code: DEMO_KIT.shortCode }),
  };
}

function rebuildSegments(): void {
  formatSeg.replaceChildren(
    segment(
      'kit.format_titre',
      [
        { id: 'story', labelKey: 'kit.format_story' },
        { id: 'carre', labelKey: 'kit.format_carre' },
        { id: 'affiche', labelKey: 'kit.format_affiche' },
      ],
      () => format,
      (id) => {
        format = id as Format;
        render();
      },
    ),
  );
  modelSeg.replaceChildren(
    segment(
      'kit.modele_titre',
      [
        { id: 'clair', labelKey: 'kit.modele_clair' },
        { id: 'nuit', labelKey: 'kit.modele_nuit' },
      ],
      () => model,
      (id) => {
        model = id as Model;
        render();
      },
    ),
  );
}

function render(): void {
  rebuildSegments();
  const card = composeCard({ format, model, copy: copy(), qrUrl: DEMO_KIT.qrUrl });
  paint(canvas, card, PREVIEW[format].width);
  status.textContent = '';
}

cta.addEventListener('click', () => {
  status.textContent = t('kit.etat_rendu');
  const card = composeCard({ format, model, copy: copy(), qrUrl: DEMO_KIT.qrUrl });
  const out = document.createElement('canvas');
  paint(out, card, OUTPUT[format].width);
  const quality = format === 'affiche' ? 0.9 : 0.8;
  out.toBlob(
    (blob) => {
      if (blob === null) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shop-plus-${format}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
      status.textContent = navigator.onLine ? t('kit.etat_prete') : t('kit.etat_hors_ligne');
    },
    'image/jpeg',
    quality,
  );
});

wrap.append(titre, sous, formatSeg, modelSeg, stage, cta, status);
app.appendChild(wrap);
render();
