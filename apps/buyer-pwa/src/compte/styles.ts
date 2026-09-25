import { motion, pwaColour, radius, sharedColour, type as fp } from '@platform/ui-tokens';

/**
 * ═══ MON-COMPTE-PLUS — HER ACCOUNT, REDESIGNED (founder, 2026-09-25) ═══
 *
 * « change the looking of this screen and all screens of the account creation
 * flow, make them look more beautiful and more nicer and very professional.
 * Also change the mon compte bar … more professional and well structured ».
 *
 * One stylesheet for every account screen (the doors, sign-up, sign-in,
 * recovery, « Mon compte » and its three lists, the edit and password and
 * delete screens) and for the bands at the head of the shell. Faso Premium,
 * read from the design tokens and never re-typed: the shared warm neutrals,
 * the PWA terracotta as the account's own accent, the two families, the type
 * scale, the radii and the fpIn motion. Spacing and touch sizes are the
 * shell's token variables. The only literal dimension is the 1px hairline
 * (the account-styles scan pins it).
 *
 * The accent is read at every site as « the boutique's, else the account's »:
 * a screen reached from a boutique's doors wears that boutique's habillage
 * (the same --vt-* the boutique paints), each boutique card in « Mon compte »
 * wears its own, and « Mon compte » itself wears the terracotta. Read at the
 * site, never through an intermediate variable: a custom property inherits
 * its computed value, so an alias resolved on an ancestor would freeze the
 * ancestor's colour into every card below it.
 */

const px = (n: number): string => String(n) + 'px';
const ms = (n: number): string => String(n) + 'ms';

const ACCENT = 'var(--vt-accent, var(--cpt-accent))';
const PROFOND = 'var(--vt-deep, var(--cpt-profond))';
const DOUX = 'var(--vt-soft, var(--cpt-doux))';
const SUR = 'var(--vt-on, var(--cpt-sur))';

const S = fp.scale;
const ECRAN = px(S.screen.size);
const VUE = px(S.view.size.max);
const LIGNE = px(S.row.size);
const CORPS = px(S.body.size.max);
const PETIT = px(S.body.size.min);
const CAPS = px(S.caps.size.max);
const PILULE = px(S.pill.size);

export const COMPTE_STYLES = `
  :root {
    --cpt-paper: ${sharedColour.paper};
    --cpt-card: ${sharedColour.card};
    --cpt-ink: ${sharedColour.ink};
    --cpt-body: ${sharedColour.body};
    --cpt-sub: ${sharedColour.sub};
    --cpt-hair: ${sharedColour.hairline};
    --cpt-hair-fort: ${sharedColour.hairlineStrong};
    --cpt-hair-champ: ${sharedColour.hairlineInput};
    --cpt-dim: ${sharedColour.dim};
    --cpt-ok: ${sharedColour.okFg};
    --cpt-ok-fond: ${sharedColour.okBg};
    --cpt-danger: ${sharedColour.dangerFg};
    --cpt-danger-fond: ${sharedColour.dangerBg};
    --cpt-danger-bord: ${sharedColour.dangerBorder};
    --cpt-accent: ${pwaColour.primary};
    --cpt-profond: ${pwaColour.deep};
    --cpt-doux: ${pwaColour.soft};
    --cpt-sur: ${pwaColour.onPrimary};
    --cpt-display: '${fp.families.display.name}', 'Archivo', system-ui, sans-serif;
    --cpt-texte: '${fp.families.text.name}', 'Archivo', system-ui, sans-serif;
    --cpt-ombre: 0 1px 0 var(--cpt-hair), 0 var(--sp-sm) var(--sp-xl) color-mix(in srgb, var(--cpt-ink) 6%, transparent);
    --cpt-r-carte: ${px(radius.card)};
    --cpt-r-tuile: ${px(radius.tile)};
    --cpt-r-art: ${px(radius.art.max)};
    --cpt-r-bouton: ${px(radius.button)};
    --cpt-r-bouton2: ${px(radius.buttonSecondary.max)};
    --cpt-r-feuille: ${px(radius.sheet)};
    --cpt-r-pilule: ${px(radius.pill)};
  }

  /* ── The ground and the column ── */
  body:has(.compte) { background: var(--cpt-paper); }
  /* COMPTE-CLIENTE-2 — the layer « Mon compte » opens over a product or a
     payment: the page stays mounted under it, and nothing behind it scrolls. */
  .compte-voile { position: fixed; inset: 0; z-index: 50; overflow-y: auto; background: var(--cpt-paper); }
  body.compte-voile-ouvert { overflow: hidden; }
  .compte {
    width: 100%; max-width: calc(var(--touch) * 10); margin: 0 auto;
    display: grid; gap: var(--sp-lg); align-content: start;
    font-family: var(--cpt-texte); color: var(--cpt-ink);
  }
  .compte :focus-visible { outline: var(--hair-strong) solid ${ACCENT}; outline-offset: var(--hair-strong); }
  .compte [hidden] { display: none; }
  .compte .compte-alerte[hidden], .compte .compte-champ-refus[hidden] { display: none; }

  /* ── Back, as a pill: the arrow and its word ── */
  .compte .back-step {
    justify-self: start; min-height: calc(var(--touch) - var(--sp-xs));
    padding: 0 var(--sp-md) 0 var(--sp-sm); gap: var(--sp-xs);
    border: 1px solid var(--cpt-hair-fort); border-radius: var(--cpt-r-pilule);
    background: var(--cpt-card); color: var(--cpt-ink);
    font-family: var(--cpt-texte); font-size: ${CORPS}; font-weight: ${S.row.wght};
    letter-spacing: 0; text-transform: none; text-decoration: none;
  }
  .compte .back-step:active { background: var(--cpt-dim); }

  /* ── A screen's head: glyph in a soft round, title, one line of why ── */
  .compte-entete { display: grid; justify-items: start; gap: var(--sp-sm); padding: 0; border: 0; }
  .compte-entete-icone {
    display: grid; place-items: center;
    width: calc(var(--touch) + var(--sp-xs)); height: calc(var(--touch) + var(--sp-xs));
    border-radius: var(--cpt-r-pilule); background: ${DOUX}; color: ${PROFOND};
    margin-bottom: var(--sp-xs);
  }
  .compte-entete-icone svg, .compte-entete-glyphe { width: var(--icon); height: var(--icon); }
  .compte-titre {
    margin: 0; color: var(--cpt-ink); text-wrap: balance;
    font-family: var(--cpt-display); font-size: ${ECRAN}; font-weight: ${S.screen.wght};
    line-height: 1.1; letter-spacing: ${fp.families.display.titleLetterSpacing};
  }
  .compte-sous { margin: 0; font-size: ${CORPS}; line-height: 1.5; color: var(--cpt-body); }
  .compte-danger .compte-entete-icone { background: var(--cpt-danger-fond); color: var(--cpt-danger); }

  /* ── Cards ── */
  .compte-carte {
    display: grid; gap: var(--sp-lg); padding: var(--sp-lg);
    background: var(--cpt-card); border: 1px solid var(--cpt-hair);
    border-radius: var(--cpt-r-carte); box-shadow: var(--cpt-ombre);
  }

  /* ── Fields: a sentence-case label, one rounded box, the refusal under it ── */
  .compte-form { display: grid; gap: var(--sp-lg); }
  .compte-champ { display: grid; gap: var(--sp-sm); }
  .compte .field-label {
    margin: 0; color: var(--cpt-ink);
    font-size: ${CORPS}; font-weight: ${S.row.wght}; letter-spacing: 0; text-transform: none;
  }
  .compte-saisie {
    display: flex; align-items: center; gap: var(--sp-xs);
    min-height: calc(var(--touch) + var(--sp-xs));
    border: 1px solid var(--cpt-hair-champ); border-radius: var(--cpt-r-art);
    background: var(--cpt-card); padding: 0 var(--sp-xs) 0 var(--sp-md);
    transition: border-color ${ms(motion.fpIn.durationMs)}, box-shadow ${ms(motion.fpIn.durationMs)};
  }
  .compte-saisie:focus-within { border-color: ${ACCENT}; box-shadow: 0 0 0 var(--sp-xs) ${DOUX}; }
  .compte-saisie:has(.compte-input[aria-invalid="true"]) { border-color: var(--cpt-danger-bord); box-shadow: none; }
  .compte .compte-input {
    flex: 1; min-width: 0; min-height: var(--touch); padding: 0;
    border: 0; outline: 0; background: transparent; color: var(--cpt-ink);
    font-family: var(--cpt-texte); font-size: var(--t-body);
  }
  .compte .compte-input::placeholder { color: var(--cpt-sub); opacity: 0.7; }
  .compte .secondary-action.compte-voir {
    flex: none; width: auto; min-height: calc(var(--touch) - var(--sp-sm)); padding: 0 var(--sp-md);
    border: 0; border-radius: var(--cpt-r-pilule); background: var(--cpt-dim); color: var(--cpt-ink);
    font-family: var(--cpt-texte); font-size: ${PETIT}; font-weight: ${S.row.wght};
    letter-spacing: 0; text-transform: none;
  }
  .compte .secondary-action.compte-voir[aria-pressed="true"] { background: ${DOUX}; color: ${PROFOND}; }
  .compte-aide { margin: 0; font-size: ${PETIT}; line-height: 1.45; color: var(--cpt-sub); }
  .compte-champ-refus { margin: 0; font-size: ${PETIT}; font-weight: ${S.row.wght}; line-height: 1.45; color: var(--cpt-danger); }
  .compte-fixe { margin: 0; font-size: var(--t-body); font-weight: ${S.row.wght}; color: var(--cpt-ink); overflow-wrap: anywhere; }
  .compte-rester {
    display: flex; align-items: center; gap: var(--sp-md); min-height: var(--touch);
    font-size: ${CORPS}; color: var(--cpt-body); cursor: pointer;
  }
  .compte-rester input { width: var(--icon-sm); height: var(--icon-sm); margin: 0; flex: none; accent-color: ${PROFOND}; }

  /* ── The messages: a refusal, a note, the privacy line ── */
  .compte-alerte {
    margin: 0; display: grid; gap: var(--sp-sm); padding: var(--sp-md);
    border: 1px solid var(--cpt-danger-bord); border-radius: var(--cpt-r-art);
    background: var(--cpt-danger-fond); color: var(--cpt-danger);
    font-size: ${CORPS}; font-weight: ${S.row.wght}; line-height: 1.45;
  }
  .compte-note {
    margin: 0; padding: var(--sp-md); border-radius: var(--cpt-r-art);
    background: ${DOUX}; color: ${PROFOND};
    font-size: ${CORPS}; font-weight: ${S.row.wght}; line-height: 1.45;
  }
  .compte-note-douce { background: var(--cpt-dim); color: var(--cpt-body); font-weight: normal; }
  .compte-prive-bloc {
    display: flex; align-items: center; gap: var(--sp-sm);
    padding: var(--sp-sm) var(--sp-md); border-radius: var(--cpt-r-art);
    background: var(--cpt-ok-fond); color: var(--cpt-ok);
  }
  .compte-prive-bloc svg { flex: none; }
  .compte-prive { margin: 0; font-size: ${PETIT}; font-weight: ${S.row.wght}; line-height: 1.4; color: inherit; }
  .compte .offline-banner { border-radius: var(--cpt-r-art); }

  /* ── Buttons: one filled primary, full-width secondaries, quiet links ── */
  .compte .primary-action {
    width: 100%; min-height: calc(var(--touch) + var(--sp-sm));
    border: 0; border-radius: var(--cpt-r-bouton);
    background: ${PROFOND}; color: ${SUR};
    font-family: var(--cpt-texte); font-size: var(--t-body); font-weight: ${S.row.wght};
    letter-spacing: 0; text-transform: none; cursor: pointer;
  }
  .compte .primary-action:disabled { opacity: var(--disabled-opacity); }
  .compte .primary-action.problem-path { background: var(--cpt-danger); color: var(--cpt-card); }
  .compte .secondary-action {
    width: 100%; min-height: calc(var(--touch) + var(--sp-xs));
    border: 1px solid var(--cpt-hair-fort); border-radius: var(--cpt-r-bouton2);
    background: var(--cpt-card); color: var(--cpt-ink);
    font-family: var(--cpt-texte); font-size: ${CORPS}; font-weight: ${S.row.wght};
    letter-spacing: 0; text-transform: none; cursor: pointer;
  }
  .compte .secondary-action:active, .compte .primary-action:active { opacity: var(--pressed-opacity); }
  .compte .link-quiet:not(.back-step) {
    justify-self: center; color: ${PROFOND};
    font-family: var(--cpt-texte); font-size: ${CORPS}; font-weight: ${S.row.wght};
    letter-spacing: 0; text-transform: none;
    text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent);
    text-underline-offset: var(--sp-xs);
  }

  /* ── « Mon compte »: who she is ── */
  .compte-identite { gap: var(--sp-md); }
  .compte-identite-tete { display: flex; align-items: center; gap: var(--sp-md); min-width: 0; }
  .compte-avatar {
    flex: none; display: grid; place-items: center;
    width: calc(var(--touch) + var(--sp-sm)); height: calc(var(--touch) + var(--sp-sm));
    border-radius: var(--cpt-r-pilule); background: ${PROFOND}; color: ${SUR};
    font-family: var(--cpt-display); font-size: ${VUE}; font-weight: ${S.view.wght};
  }
  .compte-bonjour {
    margin: 0; min-width: 0; overflow-wrap: anywhere;
    font-family: var(--cpt-display); font-size: ${VUE}; font-weight: ${S.view.wght};
    letter-spacing: ${fp.families.display.titleLetterSpacing}; line-height: 1.2;
  }
  .compte-infos-titre, .compte-info dt {
    margin: 0; font-size: ${CAPS}; font-weight: ${S.caps.wght};
    letter-spacing: ${S.caps.letterSpacing}; text-transform: uppercase; color: var(--cpt-sub);
  }
  .compte-infos-titre { padding-top: var(--sp-sm); border-top: 1px solid var(--cpt-hair); }
  dl.compte-infos { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-md); }
  .compte-info { display: grid; gap: var(--sp-xs); min-width: 0; }
  .compte-info:nth-child(n+3) { grid-column: 1 / -1; }
  .compte-info dd { margin: 0; font-size: ${LIGNE}; font-weight: ${S.row.wght}; color: var(--cpt-ink); overflow-wrap: anywhere; }
  .compte-info dd.compte-vide { font-weight: normal; color: var(--cpt-sub); }
  .compte-carte[aria-busy="true"] { gap: var(--sp-md); }

  /* ── « Mon compte »: her blocks — orders, panier, coups de cœur ── */
  .compte-bloc { display: grid; gap: var(--sp-md); }
  .compte .compte-sous-titre {
    margin: 0; display: flex; align-items: center; gap: var(--sp-sm);
    font-family: var(--cpt-display); font-size: ${VUE}; font-weight: ${S.view.wght};
    letter-spacing: ${fp.families.display.titleLetterSpacing}; color: var(--cpt-ink);
  }
  .compte-sous-titre-icone {
    flex: none; display: grid; place-items: center;
    width: calc(var(--touch) - var(--sp-md)); height: calc(var(--touch) - var(--sp-md));
    border-radius: var(--cpt-r-pilule); background: ${DOUX}; color: ${PROFOND};
  }
  .compte-sous-titre-icone svg, .compte-bloc-glyphe { width: var(--icon-sm); height: var(--icon-sm); }
  .compte-commandes, .compte-articles { display: grid; gap: var(--sp-sm); }
  .compte-commande {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--sp-md);
    min-height: calc(var(--touch) + var(--sp-md)); padding: var(--sp-sm) var(--sp-md);
    border: 1px solid var(--cpt-hair); border-radius: var(--cpt-r-tuile);
    background: var(--cpt-card); color: var(--cpt-ink);
    font-family: var(--cpt-texte); text-align: left; cursor: pointer;
  }
  .compte-commande:active { background: var(--cpt-dim); }
  .compte-commande-icone {
    display: grid; place-items: center;
    width: calc(var(--touch) - var(--sp-sm)); height: calc(var(--touch) - var(--sp-sm));
    border-radius: var(--cpt-r-art); background: var(--cpt-dim); color: var(--cpt-body);
  }
  .compte-commande-glyphe { width: var(--icon-sm); height: var(--icon-sm); }
  .compte-commande-mots { display: grid; gap: var(--sp-xs); min-width: 0; }
  .compte-commande-date { font-size: ${LIGNE}; font-weight: ${S.row.wght}; }
  .compte-commande-ref {
    font-size: ${PETIT}; color: var(--cpt-sub); font-variant-numeric: tabular-nums;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .compte-commande > svg:last-child, .compte-ligne > svg:last-child { color: var(--cpt-sub); flex: none; }
  .compte-vide-ligne {
    padding: var(--sp-md); border: 1px dashed var(--cpt-hair-champ); border-radius: var(--cpt-r-tuile);
    color: var(--cpt-sub);
  }
  .compte-vide-bloc {
    display: grid; justify-items: center; gap: var(--sp-sm); text-align: center;
    padding: var(--sp-xl) var(--sp-lg);
    border: 1px dashed var(--cpt-hair-champ); border-radius: var(--cpt-r-carte);
  }
  .compte-vide-icone {
    display: grid; place-items: center;
    width: var(--touch); height: var(--touch);
    border-radius: var(--cpt-r-pilule); background: var(--cpt-dim); color: var(--cpt-sub);
  }
  .compte-vide-titre { margin: 0; font-size: ${LIGNE}; font-weight: ${S.row.wght}; color: var(--cpt-ink); }
  .compte-vide-bloc .compte-sous { font-size: ${PETIT}; color: var(--cpt-sub); max-width: calc(var(--touch) * 6); }

  /* ── One boutique's card: in its own habillage, never a price ── */
  .compte-boutique {
    display: grid; overflow: hidden;
    background: var(--cpt-card); border: 1px solid var(--cpt-hair);
    border-radius: var(--cpt-r-carte); box-shadow: var(--cpt-ombre);
  }
  .compte-boutique[aria-busy="true"], .compte-boutique-muette { gap: var(--sp-sm); padding: var(--sp-md) var(--sp-lg); }
  .compte-boutique-muette .compte-boutique-tete { padding: 0; background: none; border: 0; }
  .compte-boutique-muette .compte-sous { font-size: ${PETIT}; color: var(--cpt-sub); }
  .compte-boutique-tete {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--sp-md);
    padding: var(--sp-md) var(--sp-lg);
    background: ${DOUX}; border-bottom: var(--theme-strip) solid ${ACCENT};
  }
  .compte-boutique-avatar {
    display: grid; place-items: center; overflow: hidden;
    width: calc(var(--touch) - var(--sp-xs)); height: calc(var(--touch) - var(--sp-xs));
    border-radius: var(--cpt-r-pilule); border: var(--hair-strong) solid var(--cpt-card);
    background: ${PROFOND}; color: ${SUR};
    font-family: var(--cpt-display); font-size: ${VUE}; font-weight: ${S.view.wght};
  }
  .compte-boutique-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .compte-boutique-mots { display: grid; gap: var(--sp-xs); min-width: 0; }
  .compte-boutique-nom {
    font-family: var(--cpt-display); font-size: var(--t-body); font-weight: ${S.view.wght};
    line-height: 1.25; color: var(--cpt-ink); overflow-wrap: anywhere;
  }
  .compte-boutique-lieu {
    font-size: ${CAPS}; font-weight: ${S.caps.wght}; letter-spacing: ${S.caps.letterSpacing};
    text-transform: uppercase; color: ${PROFOND}; line-height: 1.4;
  }
  .compte-boutique-muette .compte-boutique-lieu { color: var(--cpt-sub); }
  .compte-boutique-nombre {
    padding: var(--sp-xs) var(--sp-sm); border-radius: var(--cpt-r-pilule);
    background: var(--cpt-card); color: ${PROFOND};
    font-size: ${PILULE}; font-weight: ${S.pill.wght}; white-space: nowrap;
  }
  .compte-boutique > .compte-sous { padding: var(--sp-md) var(--sp-lg) 0; font-size: ${PETIT}; color: var(--cpt-sub); }
  .compte-produits {
    margin: 0; padding: var(--sp-md) var(--sp-lg); list-style: none;
    display: grid; grid-auto-flow: column; grid-auto-columns: calc(var(--touch) * 2 + var(--sp-sm));
    gap: var(--sp-md); overflow-x: auto; overscroll-behavior-x: contain;
    scroll-snap-type: x proximity; scroll-padding-inline: var(--sp-lg); scrollbar-width: none;
  }
  .compte-produits::-webkit-scrollbar { display: none; }
  .compte-produit { position: relative; display: grid; align-content: start; gap: var(--sp-sm); min-width: 0; scroll-snap-align: start; }
  .compte-produit-art {
    display: grid; place-items: center; overflow: hidden; aspect-ratio: 1;
    border-radius: var(--cpt-r-art); background: var(--cpt-dim); color: var(--cpt-sub);
    border: 1px solid var(--cpt-hair);
  }
  .compte-produit-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .compte-produit[data-epuise] .compte-produit-art img { opacity: 0.5; }
  .compte-produit-nom {
    font-size: ${PETIT}; font-weight: ${S.row.wght}; line-height: 1.3; color: var(--cpt-ink);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    overflow-wrap: anywhere;
  }
  .compte-produit-epuise {
    position: absolute; top: var(--sp-sm); left: var(--sp-sm);
    padding: var(--sp-xs) var(--sp-sm); border-radius: var(--cpt-r-pilule);
    background: var(--cpt-ink); color: var(--cpt-card);
    font-size: ${PILULE}; font-weight: ${S.pill.wght}; letter-spacing: ${S.caps.letterSpacing};
  }
  .compte-voir-chez {
    margin: 0 var(--sp-lg) var(--sp-lg);
    display: flex; align-items: center; justify-content: center; gap: var(--sp-xs);
    min-height: calc(var(--touch) + var(--sp-xs)); padding: 0 var(--sp-md);
    border-radius: var(--cpt-r-bouton2); background: ${DOUX}; color: ${PROFOND};
    font-size: ${CORPS}; font-weight: ${S.row.wght}; text-decoration: none; text-align: center;
  }
  .compte-voir-chez span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .compte-voir-chez svg { flex: none; }
  .compte-voir-chez:active { opacity: var(--pressed-opacity); }

  /* ── « Mon compte »: settings as rows, then the quiet way out ── */
  .compte-reglages { gap: 0; padding: 0 var(--sp-lg); }
  .compte .compte-ligne {
    justify-content: flex-start; gap: var(--sp-md); min-height: calc(var(--touch) + var(--sp-sm));
    padding: 0; border: 0; border-radius: 0; background: none; text-align: left;
  }
  .compte .compte-ligne + .compte-ligne { border-top: 1px solid var(--cpt-hair); }
  .compte-ligne-glyphe { width: var(--icon-sm); height: var(--icon-sm); flex: none; color: ${PROFOND}; }
  .compte-ligne-mots { flex: 1; min-width: 0; }
  .compte .compte-supprimer-lien {
    justify-self: center; width: auto; min-height: var(--touch);
    border: 0; background: none; color: var(--cpt-danger);
  }

  /* ── The doors (PORTE-BELLE, now on the same tokens) ── */
  .porte-tete {
    margin: calc(var(--sp-lg) * -1) calc(var(--sp-lg) * -1) 0;
    padding: var(--sp-xl) var(--sp-lg);
    display: grid; justify-items: start; gap: var(--sp-sm);
    background: ${PROFOND}; color: ${SUR};
    border-bottom: var(--theme-strip) solid ${ACCENT};
    border-radius: 0 0 var(--cpt-r-feuille) var(--cpt-r-feuille);
  }
  .porte-tete[data-etat="attente"] { background: var(--cpt-dim); color: var(--cpt-ink); border-bottom-color: var(--cpt-hair-fort); }
  .porte-identite { display: flex; align-items: center; gap: var(--sp-md); min-width: 0; }
  .porte-avatar {
    position: relative; flex: none; display: inline-grid; place-items: center;
    width: calc(var(--touch) + var(--sp-xs)); height: calc(var(--touch) + var(--sp-xs));
    border-radius: var(--cpt-r-pilule); border: var(--hair-strong) solid ${SUR};
    background: ${DOUX}; color: ${PROFOND};
    font-family: var(--cpt-display); font-size: ${VUE}; font-weight: ${S.view.wght};
  }
  .porte-avatar-attente { border-color: var(--cpt-hair-fort); background: var(--cpt-card); }
  .porte-tete[data-etat="attente"] .porte-ligne-attente { background: var(--cpt-card); }
  .porte-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: inherit; }
  .porte-avatar-bulle {
    position: absolute; right: calc(var(--sp-xs) * -1); bottom: calc(var(--sp-xs) * -1);
    width: calc(var(--icon-sm) + var(--sp-xs)); height: calc(var(--icon-sm) + var(--sp-xs));
    border-radius: var(--cpt-r-pilule); display: grid; place-items: center;
    background: ${ACCENT}; color: ${SUR}; border: var(--hair-strong) solid ${PROFOND};
  }
  .porte-bulle-glyphe { width: var(--sp-md); height: var(--sp-md); }
  .porte-ligne-attente { width: 45%; }
  .porte-verifiee {
    margin: 0; min-width: 0;
    font-size: ${CAPS}; font-weight: ${S.caps.wght}; letter-spacing: ${S.caps.letterSpacing};
    text-transform: uppercase; color: ${DOUX};
  }
  .porte-titre {
    margin: 0; color: inherit; text-wrap: balance;
    font-family: var(--cpt-display); font-size: ${ECRAN}; font-weight: ${S.screen.wght};
    line-height: 1.1; letter-spacing: ${fp.families.display.titleLetterSpacing};
  }
  .porte-sous { margin: 0; color: inherit; opacity: 0.9; font-size: ${CORPS}; line-height: 1.5; }
  .porte-actions { display: grid; gap: var(--sp-md); }
  .porte-ou {
    margin: 0; display: flex; align-items: center; gap: var(--sp-md);
    font-size: ${CAPS}; font-weight: ${S.caps.wght}; letter-spacing: ${S.caps.letterSpacing};
    text-transform: uppercase; color: var(--cpt-sub);
  }
  .porte-ou::before, .porte-ou::after { content: ''; flex: 1; border-top: 1px solid var(--cpt-hair-fort); }
  .porte-invitee {
    width: 100%; min-height: calc(var(--touch) + var(--sp-xs));
    border: 0; border-radius: var(--cpt-r-bouton2); background: var(--cpt-dim); color: var(--cpt-ink);
    font-family: var(--cpt-texte); font-size: ${CORPS}; font-weight: ${S.row.wght}; cursor: pointer;
  }
  .porte-invitee:active { opacity: var(--pressed-opacity); }
  .porte-invitee-note { margin: 0; text-align: center; font-size: ${PETIT}; line-height: 1.45; color: var(--cpt-sub); }
  .porte-atouts {
    display: grid; gap: var(--sp-md); padding: var(--sp-lg);
    background: var(--cpt-card); border: 1px solid var(--cpt-hair); border-radius: var(--cpt-r-carte);
  }
  .porte-atouts-titre {
    margin: 0; font-size: ${CAPS}; font-weight: ${S.caps.wght};
    letter-spacing: ${S.caps.letterSpacing}; text-transform: uppercase; color: var(--cpt-sub);
  }
  .porte-atouts-liste { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--sp-md); }
  .porte-atout { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: var(--sp-md); }
  .porte-atout-icone {
    display: grid; place-items: center;
    width: calc(var(--touch) - var(--sp-xs)); height: calc(var(--touch) - var(--sp-xs));
    border-radius: var(--cpt-r-pilule); background: ${DOUX}; color: ${PROFOND};
  }
  .porte-atout-glyphe { width: var(--icon-sm); height: var(--icon-sm); }
  .porte-atout-mots { display: grid; gap: var(--sp-xs); min-width: 0; }
  .porte-atout-titre { font-size: ${LIGNE}; font-weight: ${S.row.wght}; line-height: 1.3; color: var(--cpt-ink); }
  .porte-atout-texte { font-size: ${PETIT}; line-height: 1.45; color: var(--cpt-body); }

  /* ── The bands at the head of the shell: « Ma commande », « Mes articles »,
     « Mon compte » — one family: a round, the words, the way in ── */
  .ma-commande {
    width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: var(--sp-md);
    min-height: calc(var(--touch) + var(--sp-md)); padding: var(--sp-sm) var(--sp-lg);
    border: 0; border-bottom: 1px solid var(--cpt-hair);
    background: var(--cpt-card); color: var(--cpt-ink);
    font-family: var(--cpt-texte); font-size: ${LIGNE}; font-weight: ${S.row.wght};
    text-align: left; cursor: pointer;
  }
  .ma-commande:active { background: var(--cpt-dim); }
  .ma-commande:focus-visible { outline: var(--hair-strong) solid var(--cpt-accent); outline-offset: calc(var(--hair-strong) * -1); }
  .bande-pastille {
    display: grid; place-items: center;
    width: calc(var(--touch) - var(--sp-sm)); height: calc(var(--touch) - var(--sp-sm));
    border-radius: var(--cpt-r-pilule); background: var(--cpt-doux); color: var(--cpt-profond);
    font-family: var(--cpt-display); font-size: var(--t-body); font-weight: ${S.view.wght};
  }
  .bande-pastille svg { width: var(--icon-sm); height: var(--icon-sm); }
  .bande-compte .bande-pastille { background: var(--cpt-profond); color: var(--cpt-sur); }
  .bande-compte[data-invitee] .bande-pastille { background: var(--cpt-doux); color: var(--cpt-profond); }
  .bande-mots { display: grid; gap: var(--sp-xs); min-width: 0; }
  .bande-surtitre {
    font-size: ${CAPS}; font-weight: ${S.caps.wght}; letter-spacing: ${S.caps.letterSpacing};
    text-transform: uppercase; color: var(--cpt-sub); line-height: 1;
  }
  .ma-commande-ref {
    display: inline-flex; align-items: center; gap: var(--sp-xs);
    padding: var(--sp-xs) var(--sp-sm) var(--sp-xs) var(--sp-md); border-radius: var(--cpt-r-pilule);
    background: var(--cpt-doux); color: var(--cpt-profond);
    font-size: ${PETIT}; font-weight: ${S.row.wght}; white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .ma-commande-ref:not(.ma-commande-suivre) { padding: var(--sp-xs) var(--sp-md); }
  .ma-commande .bande-nom {
    display: block; padding: 0; background: none; border-radius: 0; color: var(--cpt-ink);
    font-family: var(--cpt-display); font-size: var(--t-body); font-weight: ${S.view.wght};
    overflow: hidden; text-overflow: ellipsis;
  }
  .bande-compte[data-invitee] .bande-nom { color: var(--cpt-profond); }
  .ma-commande-chevron { width: var(--icon-sm); height: var(--icon-sm); flex: none; }
  .bande-compte > .ma-commande-chevron { color: var(--cpt-sub); }

  @media (prefers-reduced-motion: no-preference) {
    .compte-ecran { animation: cpt-entree ${ms(motion.fpIn.durationMs)} ${motion.fpIn.timingFunction} both; }
    .porte-tete[data-etat="boutique"] > * { animation: cpt-entree ${ms(motion.fpIn.durationMs)} ${motion.fpIn.timingFunction} both; }
    @keyframes cpt-entree { from { opacity: 0; transform: translateY(var(--sp-sm)); } }
  }
`;
