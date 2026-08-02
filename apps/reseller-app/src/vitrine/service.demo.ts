/**
 * RESELLER-SEAM-HONESTY-1 — the in-memory DEMO adapter, MOVED OUT of `service.ts`
 * into its own module so that NOTHING REACHABLE FROM THE APP ENTRY IMPORTS IT.
 *
 * WHY IT MOVED (the defect this slice closes): `resolveStorefrontService()` used to
 * return `new DemoStorefrontService()` when the env was unset — so the adapter was
 * BUNDLED AND SELECTED, not absent. Its `create` and `publish` always return
 * `{ ok: true }`, so `publishOnline` could never reach a failure branch: an unset or
 * mistyped `EXPO_PUBLIC_STOREFRONT_*` produced « En ligne : {slug} » — a SUCCESS
 * TOAST naming a storefront that exists nowhere, with nothing written anywhere.
 *
 * It fabricates a SUCCESS rather than data, and unlike fabricated data there is NO
 * ARTIFACT TO NOTICE AFTERWARDS. The standing pattern, now three times over: a
 * populated fallback is dangerous not because it can be SELECTED but because it can
 * be PRESENT.
 *
 * WHO MAY IMPORT THIS: tests only. The app entry must not, transitively or
 * otherwise, and `scripts/gates/no-demo-adapter-in-bundle.mjs` proves it by
 * MEASURING THE REAL EXPORTED BUNDLE — not by reading import statements.
 */

import type {
  CreateStorefrontCommand,
  ServiceResult,
  PublishListingRequest,
  StorefrontIdentityPatch,
  StorefrontRow,
  StorefrontServicePort,
  UploadOutcome,
} from './service';
// ENTETES-B — the CANON closed set, imported (never hand-copied): this module is
// tests-only and Node-side, so the Metro law does not bind it, and the
// no-demo-adapter-in-bundle gate proves it stays out of the exported bundle.
import { STOREFRONT_HEADER_STYLES, StorefrontPhotoFocusSchema } from '@platform/contracts';
import { DEFAULT_STOREFRONT, type Storefront } from './customize/storefront';

const HEADER_STYLES: ReadonlySet<string> = new Set<string>(STOREFRONT_HEADER_STYLES);

/**
 * The in-memory DEMO adapter — tests only, ZERO network. It applies the same rules
 * the service does (create is idempotent on the storefront id; the list returns live
 * discoverable), so a test exercises the whole flow with no Worker.
 */
export class DemoStorefrontService implements StorefrontServicePort {
  private readonly stores = new Map<string, { slug: string; name: string; discoverable: boolean }>();
  readonly uploads: { kind: string; storefrontId: string; size: number }[] = [];
  /** PERSONNALISER-REAL-1 — saved presentations, read back by `getById`. */
  private readonly identities = new Map<string, Storefront>();
  /** Ids whose identity save REFUSES — the certified-mock failure lever. */
  readonly refuseIdentityFor = new Set<string>();

  async create(cmd: CreateStorefrontCommand): Promise<ServiceResult<{ status: string; slug: string | null }>> {
    const slug = cmd.shortCode.toLowerCase();
    if (this.stores.has(cmd.id)) return { ok: true, value: { status: 'idempotent', slug } };
    this.stores.set(cmd.id, { slug, name: cmd.name, discoverable: false });
    return { ok: true, value: { status: 'created', slug } };
  }

  /** PERSONNALISER-REAL-1 — the demo shop, held per id so a save is READ BACK
   *  rather than assumed. Unknown id ⇒ `undefined` (honest absence), exactly as
   *  the real adapter maps a 404 — a mock that always found a shop would make
   *  the not-yet-live path untestable (certified-mock rule, Contract §3). */
  async getById(id: string): Promise<ServiceResult<Storefront | undefined>> {
    const held = this.identities.get(id);
    if (held) return { ok: true, value: held };
    const s = this.stores.get(id);
    if (!s) return { ok: true, value: undefined };
    return { ok: true, value: { ...DEFAULT_STOREFRONT, id, slug: s.slug, name: s.name, discoverable: s.discoverable } };
  }

  /** PERSONNALISER-REAL-1 — persists the patch AND refuses like the real service:
   *  a mock that could only succeed would make every test greener than the system. */
  async saveIdentity(id: string, patch: StorefrontIdentityPatch, at: string): Promise<ServiceResult<{ status: string }>> {
    if (this.refuseIdentityFor.has(id)) return { ok: false, reason: 'name_too_short' };
    // ENTETES-B — the demo refuses exactly what the service refuses, by the same
    // NAME, against the CANON set (certified-mock rule: a mock that only succeeds
    // makes every test greener than the system).
    if (patch.headerStyle !== undefined && !HEADER_STYLES.has(patch.headerStyle)) {
      return { ok: false, reason: 'unknown_header_style' };
    }
    // ENTETES-C — the SAME two named refusals the service holds, proven against
    // the CANON schema (never a hand-copied bound): a SET pair must parse as a
    // canon photo focus, and a set needs the photo it frames. Tri-state exactly
    // as the wire: absent = untouched · null = clear · pair = set.
    const focusRefusal = (
      order: { readonly x: number; readonly y: number } | null | undefined,
      hasPhoto: boolean,
    ): string | undefined => {
      if (order === undefined || order === null) return undefined;
      if (!StorefrontPhotoFocusSchema.safeParse(order).success) return 'bad_focus';
      return hasPhoto ? undefined : 'no_photo_to_frame';
    };
    const read = await this.getById(id);
    const current = read.ok ? read.value : undefined;
    if (current === undefined) return { ok: false, reason: 'http_404' };
    const hasCoverPhoto = current.cover.status !== 'none' && typeof current.cover.url === 'string' && current.cover.url !== '';
    const hasAvatarPhoto = current.avatar.mode === 'photo' && typeof current.avatar.url === 'string' && current.avatar.url !== '';
    const refusal = focusRefusal(patch.coverFocus, hasCoverPhoto) ?? focusRefusal(patch.avatarFocus, hasAvatarPhoto);
    if (refusal !== undefined) return { ok: false, reason: refusal };
    const withFocus = <T extends { readonly focus?: { readonly x: number; readonly y: number } }>(
      part: T,
      order: { readonly x: number; readonly y: number } | null | undefined,
    ): T => {
      if (order === undefined) return part;
      const { focus: _cleared, ...rest } = part;
      return order === null ? (rest as T) : ({ ...rest, focus: { x: order.x, y: order.y } } as T);
    };
    this.identities.set(id, {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.zone !== undefined ? { zone: patch.zone } : {}),
      ...(patch.theme !== undefined ? { theme: patch.theme as Storefront['theme'] } : {}),
      ...(patch.featuredItems !== undefined ? { featuredItems: [...patch.featuredItems] } : {}),
      ...(patch.sections !== undefined ? { sections: patch.sections.map((s) => ({ ...s, pids: [...s.pids] })) } : {}),
      ...(patch.curatedItems !== undefined ? { curatedItems: [...patch.curatedItems] } : {}),
      ...(patch.headerStyle !== undefined ? { headerStyle: patch.headerStyle } : {}),
      ...(patch.coverFocus !== undefined ? { cover: withFocus(current.cover, patch.coverFocus) } : {}),
      ...(patch.avatarFocus !== undefined ? { avatar: withFocus(current.avatar, patch.avatarFocus) } : {}),
      updatedAt: at,
    });
    return { ok: true, value: { status: 'saved' } };
  }

  async publish(id: string, _correlationId?: string, _at?: string): Promise<ServiceResult<{ status: string }>> {
    const s = this.stores.get(id);
    if (!s) return { ok: true, value: { status: 'absent' } };
    s.discoverable = true;
    return { ok: true, value: { status: 'changed' } };
  }

  async unpublish(id: string, _correlationId?: string, _at?: string): Promise<ServiceResult<{ status: string }>> {
    const s = this.stores.get(id);
    if (!s) return { ok: true, value: { status: 'absent' } };
    s.discoverable = false;
    return { ok: true, value: { status: 'changed' } };
  }

  /** ENTETES-C — the demo upload WRITES THE URL onto the held shop, exactly as
   *  the real service does (the service owns the address; the app never patches
   *  it), and the sub-object is rebuilt WITHOUT any `focus` — a fresh photo
   *  starts unframed here too, or the mock would hide the very behaviour the
   *  canon comment makes law (certified-mock rule, Contract §3). */
  private async setMedia(storefrontId: string, kind: 'cover' | 'avatar', url: string): Promise<void> {
    const read = await this.getById(storefrontId);
    if (!read.ok || read.value === undefined) return; // absent shop: nothing to point at
    this.identities.set(storefrontId, {
      ...read.value,
      ...(kind === 'cover'
        ? { cover: { status: 'live' as const, url } }
        : { avatar: { mode: 'photo' as const, url } }),
    });
  }

  async uploadCover(storefrontId: string, bytes: Uint8Array, _contentType?: string): Promise<ServiceResult<UploadOutcome>> {
    this.uploads.push({ kind: 'cover', storefrontId, size: bytes.length });
    const url = `demo://cover/${storefrontId}`;
    await this.setMedia(storefrontId, 'cover', url);
    return { ok: true, value: { status: 'pending', url } };
  }

  async uploadAvatar(storefrontId: string, bytes: Uint8Array, _contentType?: string): Promise<ServiceResult<UploadOutcome>> {
    this.uploads.push({ kind: 'avatar', storefrontId, size: bytes.length });
    const url = `demo://avatar/${storefrontId}`;
    await this.setMedia(storefrontId, 'avatar', url);
    return { ok: true, value: { status: 'pending', url } };
  }

  async list(): Promise<ServiceResult<readonly StorefrontRow[]>> {
    return {
      ok: true,
      value: [...this.stores.entries()].map(([id, s]) => ({ id, slug: s.slug, name: s.name, discoverable: s.discoverable })),
    };
  }

  /**
   * PUBLISH-PRICE-1 — the demo publish. **IT CAN FAIL, deliberately.**
   *
   * The certified-mock rule (Execution Contract §3): a mock that hides real failure
   * behaviour is a bug the author owns. The real service REFUSES when it cannot read
   * the live base, so this one refuses too — for any product version in
   * `refuseSupplyFor` — and a test that never exercises the refusal is testing a
   * happier system than the one that ships. `markup` is recorded and NO price is
   * computed here, because the app has no business computing one.
   */
  readonly published: { storefrontId: string; productVersionId: string; markup: number }[] = [];
  readonly refuseSupplyFor = new Set<string>();

  async publishListing(req: PublishListingRequest): Promise<ServiceResult<{ status: string }>> {
    if (this.refuseSupplyFor.has(req.productVersionId)) return { ok: false, reason: 'supply_unavailable' };
    if (!Number.isSafeInteger(req.markup) || req.markup < 0) return { ok: false, reason: 'markup_invalid' };
    const already = this.published.some(
      (p) => p.storefrontId === req.storefrontId && p.productVersionId === req.productVersionId && p.markup === req.markup,
    );
    if (already) return { ok: true, value: { status: 'idempotent' } };
    this.published.push({ storefrontId: req.storefrontId, productVersionId: req.productVersionId, markup: req.markup });
    return { ok: true, value: { status: 'published' } };
  }
}
