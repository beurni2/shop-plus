/**
 * PERSONNALISATION — per-product VOICE NOTES (§ voice/audio are first-class UI).
 *
 * The reseller records an OPTIONAL short note about a product, then publishes
 * it. Pure state + pure §4.3-style actions (mirrors storefront.ts's shape); a
 * thin RecorderAdapter seam does the capture. This module has NO react-native
 * import so the state machine is tested Node-side (Metro-safe law) — drift fails
 * in vitest, never on a device.
 *
 * DATA MODEL (pid → note) is byte-identical to the buyer PWA's local shape
 * (src/vitrine/profile.ts) — ONE shape, two apps, so the eventual canon pin is a
 * SWAP not a rebuild. CANON WOULD NEED one additive, defaulted field on
 * StorefrontSchema: `productNotes?: Record<pid, { status; url; durationMs }>`.
 *
 * HONESTY LAW (queued = pending, never done): with no media backend, a
 * published note is `pending` (« publiée dès que le réseau revient ») — the
 * reducer NEVER produces `ready`. `ready` is the buyer-visible, backend-stored
 * state only; a conformance test pins that the reseller never emits it.
 *
 * FLAG STOREFRONT-MEDIA-BACKING: capture is DEMO-FED — createDemoRecorder()
 * captures nothing (url stays null); it only measures the real elapsed time so
 * the duration is honest. The real native recorder (a future expo-audio adapter)
 * swaps THIS seam, never the reducer or the screen.
 */

export type ProductVoiceStatus = 'none' | 'recording' | 'recorded' | 'pending' | 'ready';

export interface ProductVoiceNote {
  readonly status: ProductVoiceStatus;
  /** Captured take's source; null under the demo-fed seam and until captured. */
  readonly url: string | null;
  /** Real elapsed record time (« 0:08 »); 0 before a take exists. */
  readonly durationMs: number;
}

/** pid → note. An absent pid = no note (the buyer renders nothing). */
export type ProductVoiceNotes = Readonly<Record<string, ProductVoiceNote>>;

export const NONE_NOTE: ProductVoiceNote = { status: 'none', url: null, durationMs: 0 };

/** The demo seed is EMPTY — every product starts « sans note » (honest: nothing
 * is pre-published). The full cycle (record → recorded → pending) is reachable
 * live from the screen; nothing is faked as already « en ligne ». */
export const DEFAULT_VOICE_NOTES: ProductVoiceNotes = {};

export function noteOf(notes: ProductVoiceNotes, pid: string): ProductVoiceNote {
  return notes[pid] ?? NONE_NOTE;
}

/* ---------------------------------------------------- pure §4.3 actions -- */

/** « Enregistrer » / « Refaire » — both START a take (re-record is just a start
 * on an existing note). A no-op if already recording. */
export function startRecording(notes: ProductVoiceNotes, pid: string): ProductVoiceNotes {
  if (noteOf(notes, pid).status === 'recording') return notes;
  return { ...notes, [pid]: { status: 'recording', url: null, durationMs: 0 } };
}

/** « Arrêter » — a recording becomes a reviewable take. Ignored unless recording. */
export function stopRecording(
  notes: ProductVoiceNotes,
  pid: string,
  take: { url: string | null; durationMs: number },
): ProductVoiceNotes {
  if (noteOf(notes, pid).status !== 'recording') return notes;
  return { ...notes, [pid]: { status: 'recorded', url: take.url, durationMs: Math.max(0, take.durationMs) } };
}

/** « Publier » — a recorded take is queued. HONESTY: it lands on `pending`
 * (never `ready`/« en ligne ») because no backend persists it yet. */
export function publishNote(notes: ProductVoiceNotes, pid: string): ProductVoiceNotes {
  const n = noteOf(notes, pid);
  if (n.status !== 'recorded') return notes;
  return { ...notes, [pid]: { ...n, status: 'pending' } };
}

/** « Annuler » a live recording — back to no note (drops the in-progress take). */
export function cancelRecording(notes: ProductVoiceNotes, pid: string): ProductVoiceNotes {
  if (noteOf(notes, pid).status !== 'recording') return notes;
  return deleteNote(notes, pid);
}

/** « Supprimer » — remove the note entirely, from ANY state. */
export function deleteNote(notes: ProductVoiceNotes, pid: string): ProductVoiceNotes {
  if (!(pid in notes)) return notes;
  const next = { ...notes };
  delete (next as Record<string, ProductVoiceNote>)[pid];
  return next;
}

/* --------------------------------------------------- the capture seam ---- */

export type MicPermission = 'granted' | 'denied';

/** The capture seam — capture ONLY (no persistence; that stays mocked). The
 * REAL implementation is `useVoiceCapture()` (voice-capture.ts, expo-audio);
 * the demo double below is for the Node tests, which cannot load a native
 * module. A future storage backend is a SEPARATE swap (publish → upload), so
 * this seam does not change when persistence lands. */
export interface VoiceRecorderAdapter {
  /** Ask for the mic (native prompt). Denial is a designed state, never a wall. */
  requestPermission(): Promise<MicPermission>;
  start(): Promise<void>;
  /** Resolves with the finished take — a real local file `url` + elapsed ms. */
  stop(): Promise<{ url: string | null; durationMs: number }>;
  /** Play a recorded take back (her own voice, local file). */
  play(url: string): Promise<void>;
  stopPlayback(): Promise<void>;
}

/**
 * DEMO-FED double — for the Node reducer tests ONLY (a native recorder cannot
 * run under vitest). Grants permission, captures nothing (url null) but measures
 * real elapsed time so durations are honest, and no-ops playback. The app uses
 * the real expo-audio adapter; this never ships in a screen. `now` is injectable
 * so the duration is deterministically testable.
 */
export function createDemoRecorder(now: () => number = () => Date.now()): VoiceRecorderAdapter {
  let startedAt: number | null = null;
  return {
    requestPermission() {
      return Promise.resolve('granted');
    },
    start() {
      startedAt = now();
      return Promise.resolve();
    },
    stop() {
      const elapsed = startedAt === null ? 0 : Math.max(0, now() - startedAt);
      startedAt = null;
      return Promise.resolve({ url: null, durationMs: elapsed });
    },
    play() {
      return Promise.resolve();
    },
    stopPlayback() {
      return Promise.resolve();
    },
  };
}

/** « m:ss » — a short note reads « 0:08 »; never a bare number (mirrors buyer). */
export function fmtVoiceDuration(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
