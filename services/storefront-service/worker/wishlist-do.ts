/**
 * ═══ LISTE-ENVIES-1 — THE WISHLIST OBJECT (founder order, 2026-08-25) ═══
 *
 * ONE INSTANCE PER LISTE, addressed by idFromName('liste:'+token) — the slug
 * pointer's Shape-C reasoning: no directory hotspot, no enumeration surface
 * (Durable Object namespaces cannot enumerate, which here is a FEATURE — a
 * liste is reachable only by its own 192-bit token).
 *
 * WHAT IT HOLDS — a name, a slug, up to twenty pids and their offert marks,
 * plus the sha256 of the creator's edit key. No money, no contact, no
 * supplier anything: the pure law (`src/wishlist-core.ts`) decides every
 * transition, this shell only stores and answers.
 *
 * THE TWO CREDENTIAL LAWS, both inherited:
 *  · the EDIT KEY is stored HASHED and compared by hash (the reseller-feed
 *    code law) — the plaintext leaves the service exactly once, on create;
 *  · both secrets are minted from the OS CSPRNG over the 64-symbol alphabet
 *    with `b & 63` (exact division, no modulo bias — the `mintBuyerRef` law).
 *    This file is on the mint-path-entropy gate's named list.
 *
 * « OFFERT » ARRIVES ONLY FROM INSIDE: /entry/offert is reached exclusively
 * by the OrderDO's outbox wire at the CONFIRMED transition (provider webhook
 * truth). No public route maps to it — the /entry/* internal-only law every
 * DO in this Worker keeps. `absent` and `already` answer 200 like `marked`,
 * deliberately: they are COMPLETE outcomes a retry cannot change, and a wire
 * that retried them forever would be a wire that never drains.
 */

import {
  applyListeUpdate,
  applyOffert,
  projectListe,
  validateListeCreate,
  validateListeUpdate,
  LISTE_TOKEN,
  type ListeRecord,
} from '../src/wishlist-core.js';

const LISTE_KEY = 'liste-record';

/** The one record key — the whole liste is one small value, read and written
 *  whole, so an update and an offert mark can never interleave into a torn
 *  state (DO input-gating serialises the object anyway; one key makes it
 *  structural). */

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 32 chars over a 64-symbol URL-safe alphabet (192 bits) from the OS CSPRNG.
 *  `b & 63` over a 256-value byte divides exactly — no symbol is likelier
 *  than another. Server-minted, never a caller's value: a token a creator
 *  could choose is a token a stranger could choose first. Used for BOTH the
 *  share token and the edit key — same entropy, different doors. */
const REF_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
export function mintListeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let out = '';
  for (const b of bytes) out += REF_ALPHABET[b & 63];
  return out;
}

export class WishlistDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/entry/create') {
      const body = (await request.json().catch(() => null)) as { liste?: unknown; editCle?: unknown } | null;
      const asked = validateListeCreate(body?.liste);
      if (!asked.ok || typeof body?.editCle !== 'string' || !LISTE_TOKEN.test(body.editCle)) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      // FIRST-WINS on the token's name: a 192-bit collision is not a real
      // event, so an existing record here means a replayed create — answered
      // as the refusal it is rather than silently overwriting someone's liste.
      const existing = await this.state.storage.get<ListeRecord>(LISTE_KEY);
      if (existing !== undefined) return Response.json({ ok: false, reason: 'already_exists' }, { status: 409 });
      const record: ListeRecord = {
        nom: asked.value.nom,
        slug: asked.value.slug,
        articles: asked.value.pids.map((pid) => ({ pid })),
        editCleHash: await sha256Hex(body.editCle),
        createdAt: new Date().toISOString(),
        // LISTE-MERCI — the opt-in, already in wa.me digit form (validated
        // and normalised by the pure law). Never on projectListe.
        ...(asked.value.telephone !== undefined ? { notification: { telephone: asked.value.telephone } } : {}),
      };
      await this.state.storage.put(LISTE_KEY, record);
      return Response.json({ ok: true, liste: projectListe(record) });
    }

    /**
     * LISTE-MERCI — the notify facts, INTERNAL WIRE ONLY (the router maps no
     * public path here; the one caller is OrderDO's buyer-token-gated merci
     * read). No opt-in and no liste answer the SAME 404 — a caller that
     * somehow reached this door still cannot tell the two apart.
     */
    if (request.method === 'GET' && pathname === '/entry/notification') {
      const record = await this.state.storage.get<ListeRecord>(LISTE_KEY);
      if (record?.notification === undefined) return Response.json({ ok: false }, { status: 404 });
      return Response.json({ ok: true, nom: record.nom, telephone: record.notification.telephone });
    }

    /** THE READ — already projected: the hash and every orderId stay here. */
    if (request.method === 'GET' && pathname === '/entry') {
      const record = await this.state.storage.get<ListeRecord>(LISTE_KEY);
      if (record === undefined) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
      return Response.json({ ok: true, liste: projectListe(record) });
    }

    if (request.method === 'POST' && pathname === '/entry/update') {
      const body = (await request.json().catch(() => null)) as unknown;
      const asked = validateListeUpdate(body);
      if (!asked.ok) return Response.json({ ok: false, reason: asked.error, ...(asked.field !== undefined ? { field: asked.field } : {}) }, { status: 400 });
      const record = await this.state.storage.get<ListeRecord>(LISTE_KEY);
      // An absent liste and a wrong edit key are the SAME refusal, decided
      // here so no upstream branch can become an existence oracle for tokens.
      if (record === undefined || (await sha256Hex(asked.value.editCle)) !== record.editCleHash) {
        return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
      }
      const next = applyListeUpdate(record, {
        ...(asked.value.nom !== undefined ? { nom: asked.value.nom } : {}),
        pids: asked.value.pids,
      });
      await this.state.storage.put(LISTE_KEY, next);
      return Response.json({ ok: true, liste: projectListe(next) });
    }

    /** INTERNAL WIRE ONLY — the OrderDO's offert outbox. Every outcome is a
     *  200 the wire may mark delivered; only an unreadable body is a 400. */
    if (request.method === 'POST' && pathname === '/entry/offert') {
      const body = (await request.json().catch(() => null)) as { pid?: unknown; orderId?: unknown } | null;
      const pid = body?.pid;
      const orderId = body?.orderId;
      if (typeof pid !== 'string' || pid === '' || pid.length > 191 || typeof orderId !== 'string' || orderId === '' || orderId.length > 191) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const record = await this.state.storage.get<ListeRecord>(LISTE_KEY);
      // An unknown liste is a COMPLETE outcome for the wire: the order named
      // a token this service never minted (or a liste that was never
      // created); no retry can make it exist, and the sale itself is
      // untouched either way.
      if (record === undefined) return Response.json({ ok: true, status: 'ignored' });
      const applied = applyOffert(record, pid, orderId, new Date().toISOString());
      if (applied.status === 'marked') await this.state.storage.put(LISTE_KEY, applied.record);
      return Response.json({ ok: true, status: applied.status });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
