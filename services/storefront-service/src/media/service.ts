import type { MediaStore } from './media-store.js';

/**
 * STOREFRONT-MEDIA-BACKING — the through-a-service media pipeline: receive →
 * VALIDATE → store (via {@link MediaStore}) → moderation hold → buyer projection.
 *
 * The moderation states the storefront handoff specced become REAL here. Cover
 * (`pending`) and avatar (« vérification Séra ») REQUIRE review: the service
 * stores the bytes but holds them STORED-BUT-NOT-LIVE until an approve, and the
 * buyer projection never emits them — the whole reason through-a-service was
 * chosen is that the server sees the bytes before they go live. Voice notes carry
 * no review (the reseller's `pending` becomes buyer-visible `ready` on store).
 *
 * FROZEN — presentation media only. Nothing here touches a price, a net, an
 * attribution, or the signed link (loi 5).
 *
 * The canon media fields (`StorefrontCoverSchema` = {status, url?}, and
 * `StorefrontAvatarSchema` = {mode, url?}) are consumed VERBATIM by the buyer
 * projection below. GAP (reported, not invented): the canon avatar has NO
 * moderation status (only `monogram`|`photo`), so an avatar photo awaiting
 * verification is held SERVICE-INTERNALLY as `pending_review` and the canon
 * avatar stays `monogram` until it goes live — canon would need an avatar
 * moderation status (like cover's `pending`) to express « en vérification »
 * buyer-side; today it does not need to, because the buyer only ever sees live.
 */

export type MediaKind = 'cover' | 'avatar' | 'voice';

/** Whether a kind is held for Séra review before it can go live (cover/avatar), or lives on store (voice). */
export const REQUIRES_REVIEW: Record<MediaKind, boolean> = { cover: true, avatar: true, voice: false };

/* --------------------------------------------------------------- bounds -- */

/** Image standard: the stored image must already be within this box (the app resizes on device;
 * server-side re-encode/downscale is the env-gated production step, see the module flag in the report). */
export const IMAGE_STANDARD_MAX_DIM = 2048;
export const IMAGE_MIN_DIM = 200;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const AUDIO_MAX_BYTES = 4 * 1024 * 1024;
export const AUDIO_MAX_DURATION_MS = 60_000;

/* ----------------------------------------------------------- validation -- */

export type ImageFormat = 'jpeg' | 'png';
export type AudioFormat = 'wav' | 'm4a' | 'ogg' | 'webm';

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean =>
  sig.every((byte, i) => b[at + i] === byte);

/** Magic-byte image sniff — never trust a declared content-type. jpeg/png only (what the app's picker emits). */
export function sniffImage(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  return null;
}

/** Magic-byte audio sniff. m4a/mp4 carries `ftyp` at offset 4. */
export function sniffAudio(bytes: Uint8Array): AudioFormat | null {
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x41, 0x56, 0x45], 8)) return 'wav'; // RIFF…WAVE
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return 'm4a'; // ….ftyp
  if (startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])) return 'ogg'; // OggS
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm'; // EBML (webm/mkv)
  return null;
}

const be16 = (b: Uint8Array, at: number): number => (b[at]! << 8) | b[at + 1]!;
const be32 = (b: Uint8Array, at: number): number => (b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!;

/** Read intrinsic dimensions from the header — pure JS, no image library. */
export function imageDimensions(bytes: Uint8Array, fmt: ImageFormat): { width: number; height: number } | null {
  if (fmt === 'png') {
    // 8-byte signature · 4-byte length · "IHDR" · width(4 BE) · height(4 BE)
    if (bytes.length < 24 || !startsWith(bytes, [0x49, 0x48, 0x44, 0x52], 12)) return null;
    return { width: be32(bytes, 16), height: be32(bytes, 20) };
  }
  // JPEG — scan segments for a Start-Of-Frame marker (SOF0..SOF15, excluding DHT/DAC/RST).
  let i = 2; // skip SOI (FF D8)
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marker = bytes[i + 1]!;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: be16(bytes, i + 5), width: be16(bytes, i + 7) };
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // no length
    i += 2 + be16(bytes, i + 2); // skip this segment by its length
  }
  return null;
}

/* -------------------------------------------------------------- records -- */

export type ModerationStatus = 'pending_review' | 'live';

/** A stored media object + its moderation state (service-internal, not a canon field). */
export interface MediaRecord {
  readonly id: string;
  readonly storefrontId: string;
  readonly kind: MediaKind;
  /** Voice notes are per-product; cover/avatar carry no pid. */
  readonly pid?: string;
  /** The stored object URL (in the bucket) — exposed buyer-side ONLY once `live`. */
  readonly url: string;
  readonly contentType: string;
  readonly status: ModerationStatus;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly uploadedAt: string;
}

export type RejectReason =
  | 'empty'
  | 'unsupported_type'
  | 'too_large'
  | 'bad_dimensions'
  | 'bad_duration'
  | 'missing_pid';

export type UploadInput = {
  readonly storefrontId: string;
  readonly kind: MediaKind;
  readonly bytes: Uint8Array;
  readonly pid?: string;
  /** Client-measured take length (voice) — the reseller already measures it; the service caps it. */
  readonly durationMs?: number;
  readonly at: string;
  readonly id?: string;
};

export type UploadOutcome =
  | { readonly ok: true; readonly record: MediaRecord }
  | { readonly ok: false; readonly reason: RejectReason };

/* ---------------------------------------------- the through-a-service API -- */

/**
 * The media service: one in-memory moderation registry + the store adapter. Upload
 * validates then stores then holds (or goes live); approve/reject move a held
 * record; the buyer projection reads LIVE records only. Mirrors the single-writer
 * registry pattern of the storefront aggregate; the durable host is named, not
 * built here.
 */
export class StorefrontMediaService {
  private readonly byId = new Map<string, MediaRecord>();
  private seq = 0;

  constructor(private readonly store: MediaStore) {}

  async upload(input: UploadInput): Promise<UploadOutcome> {
    const { bytes, kind } = input;
    if (bytes.length === 0) return { ok: false, reason: 'empty' };
    if (kind === 'voice' && (input.pid === undefined || input.pid === '')) return { ok: false, reason: 'missing_pid' };

    let contentType: string;
    let width: number | undefined;
    let height: number | undefined;
    let durationMs: number | undefined;

    if (kind === 'cover' || kind === 'avatar') {
      if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, reason: 'too_large' };
      const fmt = sniffImage(bytes);
      if (fmt === null) return { ok: false, reason: 'unsupported_type' };
      const dims = imageDimensions(bytes, fmt);
      if (dims === null) return { ok: false, reason: 'bad_dimensions' };
      if (dims.width > IMAGE_STANDARD_MAX_DIM || dims.height > IMAGE_STANDARD_MAX_DIM) return { ok: false, reason: 'bad_dimensions' };
      if (dims.width < IMAGE_MIN_DIM || dims.height < IMAGE_MIN_DIM) return { ok: false, reason: 'bad_dimensions' };
      contentType = fmt === 'png' ? 'image/png' : 'image/jpeg';
      width = dims.width;
      height = dims.height;
    } else {
      // voice
      if (bytes.length > AUDIO_MAX_BYTES) return { ok: false, reason: 'too_large' };
      const fmt = sniffAudio(bytes);
      if (fmt === null) return { ok: false, reason: 'unsupported_type' };
      const d = input.durationMs ?? 0;
      if (d <= 0 || d > AUDIO_MAX_DURATION_MS) return { ok: false, reason: 'bad_duration' };
      contentType = fmt === 'wav' ? 'audio/wav' : fmt === 'ogg' ? 'audio/ogg' : fmt === 'webm' ? 'audio/webm' : 'audio/mp4';
      durationMs = d;
    }

    this.seq += 1;
    const id = input.id ?? `media-${this.seq}`;
    const key = mediaKey(input.storefrontId, kind, id, contentType, input.pid);
    const stored = await this.store.put(key, bytes, contentType); // SERVER-SIDE write; the app never touches the bucket
    const record: MediaRecord = {
      id,
      storefrontId: input.storefrontId,
      kind,
      ...(input.pid !== undefined ? { pid: input.pid } : {}),
      url: stored.url,
      contentType,
      // cover/avatar are held for review; voice lives on store.
      status: REQUIRES_REVIEW[kind] ? 'pending_review' : 'live',
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      uploadedAt: input.at,
    };
    this.byId.set(id, record);
    return { ok: true, record };
  }

  /** Séra review passes → the held record goes live (buyer-visible). Idempotent; absent → undefined. */
  approve(id: string): MediaRecord | undefined {
    const rec = this.byId.get(id);
    if (rec === undefined) return undefined;
    if (rec.status === 'live') return rec;
    const live: MediaRecord = { ...rec, status: 'live' };
    this.byId.set(id, live);
    return live;
  }

  /** Séra review refuses → the held record is dropped (never goes live). */
  reject(id: string): boolean {
    return this.byId.delete(id);
  }

  get(id: string): MediaRecord | undefined {
    return this.byId.get(id);
  }

  /** All records for a storefront (moderation console view — includes held ones). */
  records(storefrontId: string): readonly MediaRecord[] {
    return [...this.byId.values()].filter((r) => r.storefrontId === storefrontId);
  }

  /**
   * THE BUYER PROJECTION — the buyer only ever receives LIVE media, mapped onto the
   * canon fields. A `pending_review` cover/avatar is NEVER exposed (cover stays
   * `none`, avatar stays `monogram`); a held voice note is absent. The newest live
   * record per surface wins (a re-upload supersedes on approval).
   */
  buyerMedia(storefrontId: string): BuyerMedia {
    const live = this.records(storefrontId).filter((r) => r.status === 'live');
    const newest = (kind: MediaKind, pid?: string): MediaRecord | undefined =>
      live
        .filter((r) => r.kind === kind && (pid === undefined || r.pid === pid))
        .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
        .at(-1);

    const cover = newest('cover');
    const avatar = newest('avatar');
    const notes: Record<string, { status: 'ready'; url: string; durationMs: number }> = {};
    for (const r of live.filter((x) => x.kind === 'voice')) {
      if (r.pid !== undefined) notes[r.pid] = { status: 'ready', url: r.url, durationMs: r.durationMs ?? 0 };
    }
    return {
      cover: cover ? { status: 'live', url: cover.url } : { status: 'none' },
      avatar: avatar ? { mode: 'photo', url: avatar.url } : { mode: 'monogram' },
      notes,
    };
  }
}

/** The buyer-facing media, in canon field shapes (cover/avatar) + the voice-note map. */
export interface BuyerMedia {
  readonly cover: { readonly status: 'none' } | { readonly status: 'live'; readonly url: string };
  readonly avatar: { readonly mode: 'monogram' } | { readonly mode: 'photo'; readonly url: string };
  readonly notes: Readonly<Record<string, { readonly status: 'ready'; readonly url: string; readonly durationMs: number }>>;
}

/** The object key under which media is stored — namespaced by storefront + kind (+ pid for voice). */
export function mediaKey(storefrontId: string, kind: MediaKind, id: string, contentType: string, pid?: string): string {
  const ext = contentType.split('/')[1] ?? 'bin';
  const suffix = kind === 'voice' && pid !== undefined ? `${pid}-${id}` : id;
  return `storefronts/${storefrontId}/${kind}/${suffix}.${ext}`;
}
