/**
 * WO-4.4 — the location voice note (§6.2 location capture; DESIGN-LANGUAGE §5
 * « La voix »: the audio path is a visible, first-class interface element).
 * Deterministic law: voice = RECORDED audio via the browser MediaRecorder —
 * never synthesized. The state machine below is pure and unit-tested; the
 * browser adapter is a thin seam around getUserMedia/MediaRecorder.
 *
 * HONESTY LAW (queued = pending, never done): there is no server in the
 * sandbox and none is pretended — a note a buyer keeps is QUEUED
 * (« envoyée dès que le réseau revient »), never « sent ». Going offline
 * mid-journey keeps the note queued; coming back online does NOT flip it to
 * done (no server exists to receive it).
 */

export type VoiceNoteState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  /** A recorded take: playback + re-record both live from here. */
  | { kind: 'recorded' }
  /** Kept with the order — pending in the outbox, never « done ». */
  | { kind: 'queued' }
  /** Mic refused or MediaRecorder absent — a designed state, never a wall. */
  | { kind: 'unavailable'; reasonKey: 'voix.micro_refuse' | 'voix.indisponible' };

export type VoiceNoteEvent =
  | { type: 'RECORD_STARTED' }
  | { type: 'RECORD_STOPPED' }
  | { type: 'RE_RECORD' }
  | { type: 'KEEP' }
  | { type: 'MIC_REFUSED' }
  | { type: 'RECORDER_ABSENT' };

/** Pure reducer — illegal transitions return the state unchanged (a stray
 * event must never corrupt the walk). */
export function voiceNoteReduce(state: VoiceNoteState, event: VoiceNoteEvent): VoiceNoteState {
  switch (event.type) {
    case 'RECORD_STARTED':
      return state.kind === 'idle' || state.kind === 'recorded' ? { kind: 'recording' } : state;
    case 'RECORD_STOPPED':
      return state.kind === 'recording' ? { kind: 'recorded' } : state;
    case 'RE_RECORD':
      return state.kind === 'recorded' ? { kind: 'recording' } : state;
    case 'KEEP':
      return state.kind === 'recorded' ? { kind: 'queued' } : state;
    case 'MIC_REFUSED':
      return { kind: 'unavailable', reasonKey: 'voix.micro_refuse' };
    case 'RECORDER_ABSENT':
      return { kind: 'unavailable', reasonKey: 'voix.indisponible' };
  }
}

/** The browser seam. Returns the recorded take's object URL on stop. */
export interface RecorderAdapter {
  start(): Promise<void>;
  /** Resolves with a playable object URL for the finished take. */
  stop(): Promise<string>;
}

export function createMediaRecorderAdapter(): RecorderAdapter | null {
  if (typeof MediaRecorder !== 'function' || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  return {
    async start() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
    },
    stop() {
      return new Promise<string>((resolve, reject) => {
        const r = recorder;
        if (!r) {
          reject(new Error('recorder was never started'));
          return;
        }
        r.onstop = () => {
          r.stream.getTracks().forEach((track) => track.stop());
          resolve(URL.createObjectURL(new Blob(chunks, { type: r.mimeType || 'audio/webm' })));
        };
        r.stop();
      });
    },
  };
}
