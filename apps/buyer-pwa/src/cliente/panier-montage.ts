/**
 * ═══ PAYER-TOUT-1 — WHERE THE PANIER'S THREE SCREENS ARE MOUNTED ═══
 *
 *  · the panier checkout — `createCliente` in panier mode, over the panier's
 *    own price source (panier-source.ts);
 *  · one paid article's tracking — `createCliente` at C7 over that ORDER's
 *    own reads, with its door payment possible (the panier's holder is kept);
 *  · « Mes articles commandés ensemble » — the list that reopens each tracking
 *    after the tab died.
 *
 * Moving from one to the next REPLACES the host element: a flow's listeners
 * live on its container, and a fresh element is the only way the previous
 * flow can never hear a tap meant for the next one.
 */

import { applyTheme } from '../vitrine/themes';
import type { ClienteInit } from './flow';
import { renderMesArticles, type ArticlePanierVue, type ClienteProduit } from './screens';
import { creerSourcePanier } from './panier-source';
import {
  panierPaye,
  resolvePanierPort,
  resolveSuiviArticle,
  retirerArticlePaye,
  type ArticlePaye,
  type ColisPaye,
  type PanierPaye,
} from './panier-port';
import { orderCommandIdFor, villeDe } from './quote-port';
import { retirerDuPanier } from '../vitrine/panier';
import { tf } from '../i18n';

type Monter = (host: HTMLElement, init: ClienteInit) => void;

/** Her money is not yet the operator's word in these two states; every later one is a paid order. */
const PAS_ENCORE_PAYE = new Set(['payment_pending', 'payment_failed']);

export interface BoutiquePanier {
  readonly name: string;
  readonly slug: string;
  readonly zone: string;
  readonly resellerId: string;
}

export interface ArticleAPayer extends ArticlePanierVue {
  readonly pid: string;
}

const prenomDe = (name: string): string => name.replace(/^Chez\s+/i, '').split(' ')[0] ?? name;

function stub(b: { readonly name: string; readonly slug: string; readonly zone: string }, productName: string): ClienteProduit {
  // What the panier's screens read off « the product »: her boutique, and a
  // name for the whole panier. No price: every franc comes from the service.
  return { shopName: b.name, prenom: prenomDe(b.name), slug: b.slug, productName, zone: b.zone, priceFcfa: 0, assetRefs: [], inStock: true };
}

/** A fresh element in the host's place — the previous flow's listeners stay on the old one. */
function remplacer(host: HTMLElement): HTMLElement {
  const next = document.createElement('main');
  host.replaceWith(next);
  return next;
}

export function monterSuiviArticle(
  host: HTMLElement,
  args: {
    readonly monter: Monter;
    readonly article: ArticlePaye;
    readonly titulaire: string | null;
    readonly boutique: { readonly name: string; readonly slug: string; readonly zone: string };
    readonly session: Storage | undefined;
    readonly garde: Storage | undefined;
    readonly onTerminee: () => void;
    /**
     * COLIS-FOURNISSEUR-1 — the payment this article was born in, its
     * packages, and its sibling articles (names and read tokens): a package's
     * door is ONE payment for what she keeps, through the payment.
     */
    readonly paiement?: {
      readonly groupId: string;
      readonly colis: readonly ColisPaye[];
      readonly articles: readonly ArticlePaye[];
    } | undefined;
  },
): void {
  const port = resolveSuiviArticle();
  const { article, titulaire } = args;
  const colis = args.paiement?.colis.find((c) => c.orderIds.includes(article.orderId));
  const membres = colis === undefined ? [] : colis.orderIds.flatMap((id) => {
    const a = args.paiement!.articles.find((x) => x.orderId === id);
    return a === undefined ? [] : [{ orderId: a.orderId, nom: a.nom, buyerRef: a.buyerRef }];
  });
  args.monter(remplacer(host), {
    produit: stub(args.boutique, article.nom),
    theme: 'indigo',
    ecran: 'C7',
    suivi: {
      orderId: article.orderId,
      buyerRef: article.buyerRef,
      etatCommande: async (id) => {
        const r = await port.orderState(id);
        // Paid for good: the article leaves her boutique's panier here too,
        // for the tab that paid may have died before it heard (verifier minor 1).
        if (r.status === 'order' && !PAS_ENCORE_PAYE.has(r.order.state) && article.pid !== undefined && args.boutique.slug !== '') {
          retirerDuPanier(args.boutique.slug, [article.pid]);
        }
        return r;
      },
      remise: (id, ref) => port.remise(id, ref),
      // Her door, under the holder that paid the panier; without it (a phone
      // that lost it) the door road is withheld, never faked.
      ...(titulaire !== null
        ? {
            payerALaPorte: (id: string, essai: number) => {
              const cmd = orderCommandIdFor(`${id}#porte`, essai, args.session);
              return cmd === undefined
                ? Promise.resolve({ status: 'refused' as const, reason: 'no_secure_random' })
                : port.doorCharge(id, cmd, titulaire);
            },
          }
        : {}),
      // COLIS-FOURNISSEUR-1 — ONE door payment for what she keeps of the
      // package, under the panier's holder, through its payment. Withheld
      // like the single door when the holder or a sibling was lost.
      ...(colis !== undefined && titulaire !== null && membres.length === colis.orderIds.length
        ? {
            colis: {
              articles: membres,
              payer: (gardes: readonly string[], essai: number) => {
                const cmd = orderCommandIdFor(`${colis.packageId}#porte#${[...gardes].sort().join(',')}`, essai, args.session);
                return cmd === undefined
                  ? Promise.resolve({ status: 'refused' as const, reason: 'no_secure_random' })
                  : resolvePanierPort(new Map()).porte(args.paiement!.groupId, colis.packageId, gardes, cmd, titulaire);
              },
            },
          }
        : {}),
      oublier: () => retirerArticlePaye(article.orderId, args.garde),
    },
    onTerminee: args.onTerminee,
  });
}

export function monterPanier(
  host: HTMLElement,
  args: {
    readonly monter: Monter;
    readonly boutique: BoutiquePanier;
    readonly articles: readonly ArticleAPayer[];
    readonly session: Storage | undefined;
    readonly garde: Storage | undefined;
    readonly onVitrine: (slug: string) => void;
    readonly onTerminee: () => void;
    /** COMPTE-CLIENTE-2 — a signed-in buyer's paid articles join « Mes commandes ». */
    readonly rattacher?: (c: { readonly orderId: string; readonly buyerRef: string }) => void;
  },
): void {
  const port = resolvePanierPort(new Map(args.articles.map((a) => [a.pid, a.prixFcfa])));
  const source = creerSourcePanier({
    port,
    slug: args.boutique.slug,
    ville: villeDe(args.boutique.zone),
    resellerId: args.boutique.resellerId,
    articles: args.articles.map((a) => ({ pid: a.pid, nom: a.nom })),
    session: args.session,
    garde: args.garde,
    ...(args.rattacher !== undefined ? { rattacher: args.rattacher } : {}),
  });
  args.monter(host, {
    produit: stub(args.boutique, tf('cl.panier.titre', { n: String(args.articles.length) })),
    quoteSource: source.quoteSource,
    theme: 'indigo',
    ecran: 'C1',
    panier: {
      articles: args.articles.map((a) => ({ nom: a.nom, prixFcfa: a.prixFcfa, ...(a.photo !== undefined ? { photo: a.photo } : {}) })),
      lignes: source.lignes,
      payes: source.payes,
      livraisons: source.livraisons,
      colis: source.colis,
      onSuivre: (orderId, buyerRef, nom) => {
        const pid = source.payes().find((a) => a.orderId === orderId)?.pid;
        const groupId = source.groupId();
        monterSuiviArticle(host, {
          monter: args.monter,
          article: { orderId, buyerRef, nom, ...(pid !== undefined ? { pid } : {}) },
          titulaire: source.titulaire(),
          boutique: args.boutique,
          session: args.session,
          garde: args.garde,
          onTerminee: args.onTerminee,
          ...(groupId !== null ? { paiement: { groupId, colis: source.colis(), articles: source.payes() } } : {}),
        });
      },
    },
    onVitrine: args.onVitrine,
  });
}

/** « Mes articles commandés ensemble » — each article's tracking, reopened from the phone's record. */
export function monterMesArticles(
  host: HTMLElement,
  args: {
    readonly monter: Monter;
    readonly paye: PanierPaye;
    readonly session: Storage | undefined;
    readonly garde: Storage | undefined;
    readonly onTerminee: () => void;
  },
): void {
  applyTheme(host, 'indigo');
  host.classList.add('cl-root');
  host.innerHTML = `<div class="cl-stage">${renderMesArticles(args.paye.articles, args.paye.colis ?? [])}</div>`;
  host.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest('[data-action="suivre-article"]');
    if (!(el instanceof HTMLElement)) return;
    const orderId = el.getAttribute('data-order') ?? '';
    // Re-read: the record is the phone's, and the last word on it wins.
    const paye = panierPaye(args.garde) ?? args.paye;
    const article = paye.articles.find((a) => a.orderId === orderId);
    if (article === undefined) return;
    monterSuiviArticle(host, {
      monter: args.monter,
      article,
      titulaire: paye.holderRef,
      // The record keeps only the boutique's public slug (to tidy her panier); C7 reads no name.
      boutique: { name: '', slug: paye.slug ?? '', zone: '' },
      session: args.session,
      garde: args.garde,
      onTerminee: args.onTerminee,
      paiement: { groupId: paye.groupId, colis: paye.colis ?? [], articles: paye.articles },
    });
  });
}
