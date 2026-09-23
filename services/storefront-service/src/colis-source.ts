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
  /** The asked products, grouped by the supplier they leave from — or `undefined`. */
  grouper(productVersionIds: readonly string[]): Promise<readonly (readonly string[])[] | undefined>;
}

export interface ColisGroupingEnv {
  readonly OFFER?: { fetch(request: Request): Promise<Response> };
  readonly SUPPLY_READ_SECRET?: string;
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

export function resolveColisGrouping(env?: ColisGroupingEnv): ColisGroupingPort {
  return env?.OFFER !== undefined ? new BoundColisGrouping(env.OFFER, env.SUPPLY_READ_SECRET) : new AbsentColisGrouping();
}
