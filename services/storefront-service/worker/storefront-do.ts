import {
  decideAddItem,
  decideRemoveItem,
  decideCreate,
  decideDelete,
  decideSaveIdentity,
  decideSetMedia,
  decideRemoveVoiceNote,
  decideSetVoiceNote,
  decideToggle,
  type CreateDecision,
  type CreateStorefrontCommand,
  type DeleteDecision,
  type IdentityPatch,
  type StorefrontEntry,
} from '../src/storefront-core.js';

/**
 * StorefrontDO — the DURABLE storefront authority (STOREFRONT-READ-PATH-1). One
 * DO instance per storefront (addressed by idFromName(id)), so every command for
 * a storefront serializes through workerd's input gate — the same real mechanism
 * the attribution lock and the reservation DO use, not a shim. State survives via
 * DO storage; the decision logic is the pure core in src/storefront-core.ts
 * (`decideCreate` / `decideToggle`), byte-shared with the in-memory registry.
 *
 * SLUG INDEX — SHAPE C (founder ruling): a per-slug POINTER is its OWN instance
 * of this same class, addressed by idFromName('slug:'+slug), holding just
 * `{ storefrontId }`. Write-once (the slug is immutable), no second binding, no
 * global-directory hotspot. The router resolves a read GET /s/:slug by hitting
 * the pointer instance, then the storefront instance — two tiny hops.
 *
 * No money here: this is identity + discoverability only. The instance role
 * (storefront vs pointer) is chosen by the ROUTER's sub-path; the two never
 * collide because they are addressed by different names.
 */

const ENTRY_KEY = 'storefront-entry';
const POINTER_KEY = 'slug-pointer';
const INDEX_KEY = 'index-list';

interface ToggleArgs {
  id: string;
  correlationId: string;
  at: string;
}
interface SlugPointer {
  storefrontId: string;
}
/** RESELLER-STOREFRONT-WRITE-1 — one immutable directory row per created
 * storefront. id/slug/name are set at create and never change on the service (no
 * rename route exists); the LIVE `discoverable` is read from the entry at list
 * time, so the index stays WRITE-ONCE like the slug pointer. */
interface IndexRow {
  id: string;
  slug: string;
  name: string;
}

export class StorefrontDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    // ── storefront-instance ops (idFromName(id)) ─────────────────────────────
    if (request.method === 'POST' && pathname === '/entry/create') {
      let cmd: CreateStorefrontCommand;
      try {
        cmd = (await request.json()) as CreateStorefrontCommand;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideCreate(current, cmd);
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      return Response.json(decision);
    }
    if (request.method === 'POST' && (pathname === '/entry/publish' || pathname === '/entry/unpublish')) {
      let args: ToggleArgs;
      try {
        args = (await request.json()) as ToggleArgs;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideToggle(current, pathname === '/entry/publish', args.correlationId, args.at);
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      return Response.json(decision);
    }
    // REAL-PRODUCT-RENDER-1 (a2) — MEMBERSHIP: publishing a listing appends its
    // pid to curatedItems (append-if-absent; an existing pid keeps its position).
    if (request.method === 'POST' && pathname === '/entry/items/add') {
      let args: { pid?: string; at?: string };
      try {
        args = (await request.json()) as { pid?: string; at?: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if (typeof args.pid !== 'string' || args.pid === '') return Response.json({ error: 'malformed' }, { status: 400 });
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideAddItem(current, args.pid, args.at ?? new Date().toISOString());
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      // `absent` is a 404, as it is on the remove route beside it. It answered
      // 200 before, which is how a membership write against a shop that does
      // not exist could look like a success to a caller that only reads status
      // codes (founder ruling 2026-08-11).
      return Response.json(decision, { status: decision.status === 'absent' ? 404 : 200 });
    }
    // VITRINE-RETRAIT (founder, 2026-08-11) — MEMBERSHIP, THE OTHER DIRECTION:
    // she takes a product OUT of her shop. Same shape as the add above, and the
    // decision (not this route) is what also clears the pin and the section rows
    // — one place, so the two can never disagree.
    if (request.method === 'POST' && pathname === '/entry/items/remove') {
      let args: { pid?: string; at?: string };
      try {
        args = (await request.json()) as { pid?: string; at?: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if (typeof args.pid !== 'string' || args.pid === '') return Response.json({ error: 'malformed' }, { status: 400 });
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideRemoveItem(current, args.pid, args.at ?? new Date().toISOString());
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      return Response.json(decision, { status: decision.status === 'absent' ? 404 : 200 });
    }
    // PERSONNALISER-REAL-1 — save the presentation she owns. Absent → 404 (never
    // a phantom save); a bounds/canon refusal → 422 with its NAMED reason, so her
    // screen can say the true thing instead of « une erreur ».
    if (request.method === 'POST' && pathname === '/entry/identity') {
      let body: { patch?: IdentityPatch; at?: string };
      try {
        body = (await request.json()) as { patch?: IdentityPatch; at?: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if (body.patch === undefined || typeof body.patch !== 'object') {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideSaveIdentity(current, body.patch, body.at ?? new Date().toISOString());
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      const status = decision.status === 'absent' ? 404 : decision.status === 'refused' ? 422 : 200;
      return Response.json(decision, { status });
    }
    // PERSONNALISER-MEDIA-1 — the service writes HER media URL onto the shop, the
    // app never can (it has no such patch field). Reachable only from a completed
    // upload of validated bytes.
    if (request.method === 'POST' && pathname === '/entry/media') {
      let body: { kind?: 'cover' | 'avatar'; url?: string; at?: string };
      try {
        body = (await request.json()) as { kind?: 'cover' | 'avatar'; url?: string; at?: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if ((body.kind !== 'cover' && body.kind !== 'avatar') || typeof body.url !== 'string' || body.url === '') {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideSetMedia(current, body.kind, body.url, body.at ?? new Date().toISOString());
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      const mediaStatus = decision.status === 'absent' ? 404 : decision.status === 'refused' ? 422 : 200;
      return Response.json(decision, { status: mediaStatus });
    }
    // VOIX-PRODUIT — the same law, one field over: the service writes the note's
    // address onto her shop the moment it holds the bytes. Kept apart from
    // `/entry/media` because the body is a different shape (pid + durationMs)
    // and a shared route would have to guess which half of it is required.
    if (request.method === 'POST' && pathname === '/entry/voice') {
      let body: { pid?: string; url?: string; durationMs?: number; at?: string };
      try {
        body = (await request.json()) as { pid?: string; url?: string; durationMs?: number; at?: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if (typeof body.pid !== 'string' || typeof body.url !== 'string' || body.url === '' || typeof body.durationMs !== 'number') {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideSetVoiceNote(
        current,
        body.pid,
        body.url,
        body.durationMs,
        body.at ?? new Date().toISOString(),
      );
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      const voiceStatus = decision.status === 'absent' ? 404 : decision.status === 'refused' ? 422 : 200;
      return Response.json(decision, { status: voiceStatus });
    }
    // VOIX-SUPPRIMER-1 — the founder's 2026-08-12 decision. « Supprimer » used
    // to remove the note from her phone alone while buyers kept hearing it;
    // this is the act that makes it true. `no_note` is 200, not 404: deleting
    // a note that is not there is not a failure, and the act must be safe to
    // repeat when a queued removal arrives twice.
    if (request.method === 'POST' && pathname === '/entry/voice/remove') {
      let body: { pid?: string; at?: string };
      try {
        body = (await request.json()) as { pid?: string; at?: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if (typeof body.pid !== 'string') return Response.json({ error: 'malformed' }, { status: 400 });
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideRemoveVoiceNote(current, body.pid, body.at ?? new Date().toISOString());
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      const code = decision.status === 'absent' ? 404 : decision.status === 'refused' ? 422 : 200;
      return Response.json(decision, { status: code });
    }
    if (request.method === 'GET' && pathname === '/entry') {
      const entry = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      if (!entry) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json(entry.storefront);
    }
    // STOREFRONT-DELETE-1 — erase this instance's entry. Absent → honest 404
    // (never a phantom success); deleted returns the slug so the ROUTER can
    // clear the pointer + index (cross-instance acts live where the stubs do).
    if (request.method === 'POST' && pathname === '/entry/delete') {
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, erase } = decideDelete(current);
      if (erase) await this.state.storage.delete(ENTRY_KEY);
      return Response.json(decision, { status: decision.status === 'absent' ? 404 : 200 });
    }

    // ── slug-pointer-instance ops (idFromName('slug:'+slug)) — Shape C ───────
    if (request.method === 'PUT' && pathname === '/pointer') {
      let ptr: SlugPointer;
      try {
        ptr = (await request.json()) as SlugPointer;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      await this.state.storage.put(POINTER_KEY, ptr);
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && pathname === '/pointer') {
      const ptr = await this.state.storage.get<SlugPointer>(POINTER_KEY);
      if (!ptr) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json(ptr);
    }
    // STOREFRONT-DELETE-1 — pointer cleanup. Idempotent: clearing an already
    // clear pointer is `ok` (the orphaned-pointer read is honest either way).
    if (request.method === 'POST' && pathname === '/pointer/delete') {
      await this.state.storage.delete(POINTER_KEY);
      return Response.json({ ok: true });
    }

    // ── directory-index-instance ops (idFromName('index')) — the admin list ───
    if (request.method === 'PUT' && pathname === '/index/add') {
      let row: IndexRow;
      try {
        row = (await request.json()) as IndexRow;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const list = (await this.state.storage.get<IndexRow[]>(INDEX_KEY)) ?? [];
      if (!list.some((r) => r.id === row.id)) {
        list.push({ id: row.id, slug: row.slug, name: row.name });
        await this.state.storage.put(INDEX_KEY, list);
      }
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && pathname === '/index') {
      const list = (await this.state.storage.get<IndexRow[]>(INDEX_KEY)) ?? [];
      return Response.json(list);
    }
    // STOREFRONT-DELETE-1 — the directory forgets a deleted shop. Idempotent.
    if (request.method === 'POST' && pathname === '/index/remove') {
      let row: { id?: string };
      try {
        row = (await request.json()) as { id?: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if (typeof row.id !== 'string') return Response.json({ error: 'malformed' }, { status: 400 });
      const list = (await this.state.storage.get<IndexRow[]>(INDEX_KEY)) ?? [];
      await this.state.storage.put(
        INDEX_KEY,
        list.filter((r) => r.id !== row.id),
      );
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}

interface Env {
  STOREFRONT: DurableObjectNamespace;
}

const sfStub = (env: Env, id: string): DurableObjectStub =>
  env.STOREFRONT.get(env.STOREFRONT.idFromName(id));
const slugStub = (env: Env, slug: string): DurableObjectStub =>
  env.STOREFRONT.get(env.STOREFRONT.idFromName(`slug:${slug}`));
// The single directory-index instance (RESELLER-STOREFRONT-WRITE-1). ONE object,
// written only on create and read only by the founder's admin list — a contention
// profile utterly unlike the per-page slug pointers, so the single-object choice
// rejected for slugs is correct here (JOURNAL). A single index has a size ceiling
// (irrelevant at this scale, not infinite).
const indexStub = (env: Env): DurableObjectStub =>
  env.STOREFRONT.get(env.STOREFRONT.idFromName('index'));

const forward = async (res: Response, status = res.status): Promise<Response> =>
  new Response(await res.text(), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Router — the durable storefront surface used by DurableStorefrontStore:
 *   POST /storefronts                     create (+ writes the slug pointer on 'created')
 *   POST /storefronts/:id/publish|unpublish   discoverability toggle
 *   GET  /storefronts/:id                 the raw canon Storefront (or 404)
 *   GET  /s/:slug                         THE READ PATH — pointer → id → storefront (or 404)
 * The DO name IS the id (or 'slug:'+slug); one authority per storefront by construction.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/storefronts') {
      const cmd = (await request.clone().json().catch(() => null)) as CreateStorefrontCommand | null;
      if (cmd == null || typeof cmd.id !== 'string') {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const res = await sfStub(env, cmd.id).fetch(
        new Request('https://do/entry/create', { method: 'POST', body: JSON.stringify(cmd) }),
      );
      const decision = (await res.clone().json()) as CreateDecision;
      // Shape C: the slug pointer lands on the REAL create only (slug immutable → write-once).
      if (decision.status === 'created') {
        await slugStub(env, decision.storefront.slug).fetch(
          new Request('https://do/pointer', { method: 'PUT', body: JSON.stringify({ storefrontId: cmd.id }) }),
        );
        // …and the immutable directory row, so the admin list can enumerate what exists.
        await indexStub(env).fetch(
          new Request('https://do/index/add', {
            method: 'PUT',
            body: JSON.stringify({ id: cmd.id, slug: decision.storefront.slug, name: decision.storefront.name }),
          }),
        );
      }
      return forward(res);
    }

    // THE ADMIN LIST (RESELLER-STOREFRONT-WRITE-1) — key-gated at the composition
    // root (a GET, so the write gate skips it). Reads the write-once index, then
    // the LIVE discoverable off each entry, so the list never shows stale state.
    if (request.method === 'GET' && pathname === '/storefronts') {
      const idxRes = await indexStub(env).fetch(new Request('https://do/index'));
      const rows = (await idxRes.json()) as IndexRow[];
      const out = [];
      for (const r of rows) {
        const eRes = await sfStub(env, r.id).fetch(new Request('https://do/entry'));
        const entry = eRes.status === 200 ? ((await eRes.json()) as { discoverable?: boolean; resellerId?: string }) : {};
        // RESELLER-AUTH-1 — the owner rides the row, so the composition root can
        // narrow the list to the caller's own shops when a session is presented.
        out.push({
          id: r.id,
          slug: r.slug,
          name: r.name,
          discoverable: Boolean(entry.discoverable),
          ...(typeof entry.resellerId === 'string' ? { resellerId: entry.resellerId } : {}),
        });
      }
      return Response.json(out);
    }

    let m = /^\/storefronts\/([^/]+)\/(publish|unpublish)$/.exec(pathname);
    if (m && request.method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      const args = (await request.clone().json().catch(() => ({}))) as Partial<ToggleArgs>;
      const res = await sfStub(env, id).fetch(
        new Request(`https://do/entry/${m[2]}`, { method: 'POST', body: JSON.stringify({ ...args, id }) }),
      );
      return forward(res);
    }

    // PERSONNALISER-REAL-1 — POST /storefronts/:id/identity. A write, so the
    // composition root's key gate refuses it uncredentialled before this router
    // is reached (no new gate code, same as DELETE).
    m = /^\/storefronts\/([^/]+)\/identity$/.exec(pathname);
    if (m && request.method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      const body = await request.clone().text();
      const res = await sfStub(env, id).fetch(
        new Request('https://do/entry/identity', { method: 'POST', body }),
      );
      return forward(res);
    }

    m = /^\/storefronts\/([^/]+)\/media$/.exec(pathname);
    if (m && request.method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      const body = await request.clone().text();
      const res = await sfStub(env, id).fetch(new Request('https://do/entry/media', { method: 'POST', body }));
      return forward(res);
    }

    m = /^\/storefronts\/([^/]+)\/voice$/.exec(pathname);
    if (m && request.method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      const body = await request.clone().text();
      const res = await sfStub(env, id).fetch(new Request('https://do/entry/voice', { method: 'POST', body }));
      return forward(res);
    }

    m = /^\/storefronts\/([^/]+)\/voice\/remove$/.exec(pathname);
    if (m && request.method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      const body = await request.clone().text();
      const res = await sfStub(env, id).fetch(
        new Request('https://do/entry/voice/remove', { method: 'POST', body }),
      );
      return forward(res);
    }

    m = /^\/storefronts\/([^/]+)\/items$/.exec(pathname);
    if (m && request.method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      const args = (await request.clone().json().catch(() => ({}))) as { pid?: string; at?: string };
      const res = await sfStub(env, id).fetch(
        new Request('https://do/entry/items/add', { method: 'POST', body: JSON.stringify(args) }),
      );
      return forward(res);
    }

    // VITRINE-RETRAIT — a SEPARATE route, deliberately, rather than a `remove`
    // flag on the add: « mettre dans ma vitrine » and « retirer de ma vitrine »
    // are two acts a reseller performs on purpose, and a body field that flips
    // one into the other is one typo away from emptying a shop.
    m = /^\/storefronts\/([^/]+)\/items\/remove$/.exec(pathname);
    if (m && request.method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      const args = (await request.clone().json().catch(() => ({}))) as { pid?: string; at?: string };
      const res = await sfStub(env, id).fetch(
        new Request('https://do/entry/items/remove', { method: 'POST', body: JSON.stringify(args) }),
      );
      return forward(res);
    }

    m = /^\/storefronts\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      const id = decodeURIComponent(m[1]!);
      const res = await sfStub(env, id).fetch(new Request('https://do/entry'));
      return forward(res);
    }

    // ═══ STOREFRONT-DELETE-1 — DELETE /storefronts/:id (operator cleanup) ═══
    //
    // Session-gated BY METHOD at the composition root (DELETE is not a safe
    // method, so the root refuses it without an active session, and with one
    // only on her own shop — ACCES-ARME-2 retired the key that used to open it).
    // ENTRY FIRST, then pointer, then index — the failure-safe order: the moment
    // the entry is erased, every buyer read is ALREADY the honest 404 (the
    // orphaned-pointer rule below), so a cleanup lost mid-flight can strand only
    // ADMIN residue, never a resolvable shop. The reverse order could leave a
    // shop that resolves for buyers but is absent from the operator's list:
    // alive and invisible, the disappearance family.
    //
    // RE-RUN CONVERGES (verifier finding, fixed): on `absent`, the entry cannot
    // name its slug — but the DIRECTORY ROW still can. The absent branch consults
    // the index for the id and finishes any leftover pointer/index cleanup, so
    // repeating an interrupted DELETE completes it instead of orphaning residue
    // forever. Fully-cleaned ⇒ no row ⇒ no-op; every step is idempotent.
    m = /^\/storefronts\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'DELETE') {
      const id = decodeURIComponent(m[1]!);
      const res = await sfStub(env, id).fetch(new Request('https://do/entry/delete', { method: 'POST' }));
      const decision = (await res.clone().json().catch(() => null)) as DeleteDecision | null;
      if (decision?.status === 'deleted') {
        await slugStub(env, decision.slug).fetch(new Request('https://do/pointer/delete', { method: 'POST' }));
        await indexStub(env).fetch(
          new Request('https://do/index/remove', { method: 'POST', body: JSON.stringify({ id }) }),
        );
      } else if (decision?.status === 'absent') {
        const rows = (await (await indexStub(env).fetch(new Request('https://do/index'))).json().catch(() => [])) as IndexRow[];
        const leftover = rows.find((r) => r.id === id);
        if (leftover !== undefined) {
          await slugStub(env, leftover.slug).fetch(new Request('https://do/pointer/delete', { method: 'POST' }));
          await indexStub(env).fetch(
            new Request('https://do/index/remove', { method: 'POST', body: JSON.stringify({ id }) }),
          );
        }
      }
      return forward(res);
    }

    m = /^\/s\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      const slug = decodeURIComponent(m[1]!);
      const ptrRes = await slugStub(env, slug).fetch(new Request('https://do/pointer'));
      if (ptrRes.status === 404) return Response.json({ error: 'not_found' }, { status: 404 });
      const ptr = (await ptrRes.json()) as SlugPointer;
      const res = await sfStub(env, ptr.storefrontId).fetch(new Request('https://do/entry'));
      // an orphaned pointer (storefront gone) reads as the SAME honest not-found
      if (res.status === 404) return Response.json({ error: 'not_found' }, { status: 404 });
      return forward(res, 200);
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
