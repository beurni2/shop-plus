import { PackageGroupingAnswerSchema, isGroupingOf } from '@platform/contracts';
import { SUPPLY_READ_TIMEOUT_MS } from './delais.js';

/**
 * ═══ COLIS-FOURNISSEUR-1 — WHICH ARTICLES OF HER PANIER LEAVE TOGETHER ═══
 *
 * Founder rulings 2026-09-23 (« build option 1 », canon 3.20.0): the articles
 * of one grouped payment that leave from the SAME supplier travel as ONE
 * package with ONE delivery fee. Shop+ never learns who the supplier is — it
 * asks Boutik+ (`POST /supply-grouping`, canon `PackageGroupingRequest`) and
 * gets back groups of the asked product ids and nothing else.
 *
 * Over the supply read's own binding and credential (`OFFER` +
 * `SUPPLY_READ_SECRET`): the question is a supply read, asked of the same
 * producer by the same caller.
 *
 * THE LAW OF THE ANSWER, like the other producer asks: an answer that is a
 * grouping of exactly what was asked binds; anything else — unreachable, a
 * refusal, a malformed body, a grouping of other products — is `undefined`,
 * and every article is then priced alone, as before this slice. An outage
 * never blocks a sale; it only costs the package its shared fee.
 *
 * The CONTRACT this client speaks is boutik-plus's own seam test
 * (`services/offer-service/test/colis.e2e.test.ts`): 200 `{groups}` on a well
 * formed ask behind the credential, 400 on a malformed one, 401 without it.
 */

export const GROUPING_ROUTE = '/supply-grouping';

export interface ColisGroupingPort {
  /** The asked products, grouped by the supplier they leave from — or `undefined`.
   *  `boutique` names the shop whose panier this is (COLIS-2: its memory). */
  grouper(productVersionIds: readonly string[], boutique?: string): Promise<readonly (readonly string[])[] | undefined>;
}

export interface ColisGroupingEnv {
  readonly OFFER?: { fetch(request: Request): Promise<Response> };
  readonly SUPPLY_READ_SECRET?: string;
  /** COLIS-2 — the storefront objects, where each shop keeps its memory. */
  readonly STOREFRONT?: StorefrontNamespace;
}

interface StorefrontNamespace {
  idFromName(name: string): unknown;
  get(id: never): { fetch(request: Request): Promise<Response> };
}

/** No producer bound: no grouping is known, so every article travels alone. */
export class AbsentColisGrouping implements ColisGroupingPort {
  async grouper(): Promise<undefined> {
    return undefined;
  }
}

export class BoundColisGrouping implements ColisGroupingPort {
  private readonly secret: string | undefined;
  constructor(
    private readonly fetcher: { fetch(request: Request): Promise<Response> },
    secret?: string,
  ) {
    this.secret = secret !== undefined && secret !== '' ? secret : undefined;
  }

  async grouper(productVersionIds: readonly string[]): Promise<readonly (readonly string[])[] | undefined> {
    const ask = { productVersionIds: [...productVersionIds] };
    let res: Response;
    try {
      res = await this.fetcher.fetch(
        new Request(`https://offer${GROUPING_ROUTE}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.secret !== undefined ? { Authorization: `Bearer ${this.secret}` } : {}),
          },
          body: JSON.stringify(ask),
          // One bounded attempt on the buyer's own request; silence is `undefined`.
          signal: AbortSignal.timeout(SUPPLY_READ_TIMEOUT_MS),
        }),
      );
    } catch {
      return undefined;
    }
    if (!res.ok) return undefined;
    const parsed = PackageGroupingAnswerSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success || !isGroupingOf(parsed.data, ask)) return undefined;
    return parsed.data.groups;
  }
}

/**
 * ═══ COLIS-2 — WHEN BOUTIK+ CANNOT BE REACHED, THE SHOP REMEMBERS ═══
 *
 * Founder, 2026-09-23: « If Boutik+ can't be reached, articles are priced
 * separately that day, each with a full fee. » A product's supplier never
 * changes (a product version's supplier is written once in Boutik+), so
 * « these two leave from the same supplier » is true for ever once Boutik+
 * has said it. Each shop keeps what Boutik+ told IT about its own products —
 * groups of product ids, never a supplier — and a quote reads that memory
 * only when Boutik+ gives no answer at all. What was never grouped travels
 * alone at the full fee, as before: the memory only ever joins what Boutik+
 * joined, so it can never put two suppliers in one package.
 */
export interface ColisMemoire {
  lire(boutique: string): Promise<readonly (readonly string[])[] | undefined>;
  retenir(boutique: string, groupes: readonly (readonly string[])[]): Promise<void>;
}

export class MemorisedColisGrouping implements ColisGroupingPort {
  constructor(
    private readonly source: ColisGroupingPort,
    private readonly memoire: ColisMemoire,
  ) {}

  async grouper(productVersionIds: readonly string[], boutique?: string): Promise<readonly (readonly string[])[] | undefined> {
    const answer = await this.source.grouper(productVersionIds).catch(() => undefined);
    if (boutique === undefined) return answer;
    if (answer !== undefined) {
      const ensemble = answer.filter((g) => g.length >= 2);
      if (ensemble.length > 0) await this.memoire.retenir(boutique, ensemble).catch(() => undefined);
      return answer;
    }
    const connus = await this.memoire.lire(boutique).catch(() => undefined);
    return connus === undefined ? undefined : grouperDeMemoire(productVersionIds, connus);
  }
}

/** The asked products grouped by what the memory knows, in the order asked;
 *  a product it never saw grouped is alone. */
export function grouperDeMemoire(
  productVersionIds: readonly string[],
  connus: readonly (readonly string[])[],
): string[][] {
  const groupes: string[][] = [];
  for (const id of productVersionIds) {
    const ensemble = connus.find((c) => c.includes(id));
    const avec = ensemble === undefined ? undefined : groupes.find((g) => ensemble.includes(g[0]!));
    if (avec !== undefined) avec.push(id);
    else groupes.push([id]);
  }
  return groupes;
}

/** Joins new groups into the memory: groups that share a product are one
 *  supplier's, so they merge. Disjoint groups, each sorted, first-seen order. */
export function fusionnerMemoire(
  connus: readonly (readonly string[])[],
  nouveaux: readonly (readonly string[])[],
): string[][] {
  let groupes = connus.map((g) => [...g]);
  for (const nouveau of nouveaux) {
    const touches = groupes.filter((g) => g.some((id) => nouveau.includes(id)));
    const union = [...new Set([...touches.flat(), ...nouveau])].sort();
    const premier = groupes.findIndex((g) => touches.includes(g));
    groupes = groupes.filter((g) => !touches.includes(g));
    groupes.splice(premier === -1 ? groupes.length : premier, 0, union);
  }
  return groupes;
}

/** The memory, kept in the shop's own storefront object. */
export class StorefrontColisMemoire implements ColisMemoire {
  constructor(private readonly ns: StorefrontNamespace) {}

  private stub(boutique: string) {
    return this.ns.get(this.ns.idFromName(boutique) as never);
  }

  async lire(boutique: string): Promise<readonly (readonly string[])[] | undefined> {
    const res = await this.stub(boutique).fetch(new Request('https://do/entry/colis-memoire'));
    if (!res.ok) return undefined;
    const body = (await res.json().catch(() => null)) as { groupes?: unknown } | null;
    const groupes = body?.groupes;
    if (!Array.isArray(groupes) || !groupes.every((g) => Array.isArray(g) && g.every((x) => typeof x === 'string'))) return undefined;
    return groupes as string[][];
  }

  async retenir(boutique: string, groupes: readonly (readonly string[])[]): Promise<void> {
    await this.stub(boutique).fetch(
      new Request('https://do/entry/colis-memoire', { method: 'POST', body: JSON.stringify({ groupes }) }),
    );
  }
}

export function resolveColisGrouping(env?: ColisGroupingEnv): ColisGroupingPort {
  if (env?.OFFER === undefined) return new AbsentColisGrouping();
  const source = new BoundColisGrouping(env.OFFER, env.SUPPLY_READ_SECRET);
  return env.STOREFRONT !== undefined ? new MemorisedColisGrouping(source, new StorefrontColisMemoire(env.STOREFRONT)) : source;
}
