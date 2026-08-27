/**
 * ═══ REPERE-AUDIO-REEL — the REAL recorder behind « Enregistrer le repère » ═══
 *
 * Law 5's own sentence — voice = RECORDED AUDIO — finally recorded. This
 * module owns the phone's microphone road: `getUserMedia` → `MediaRecorder`
 * → one Blob → base64 for the order wire + a blob URL for her own replay.
 * The FLOW owns everything else (states, the ticking clock, the 30 s cap).
 *
 * HONEST REFUSALS, TWO KINDS, ONE ANSWER: a browser with no recorder and a
 * buyer who refused the permission prompt both come back `'refused'` — the
 * screen's standing refus state already says the honest sentence (« Le micro
 * n'est pas disponible. Écrivez le repère au-dessus — ça marche aussi
 * bien. ») and the typed repère remains the primary road.
 *
 * The mimeType ladder is what phones actually emit: Android Chrome speaks
 * WebM/Opus, iOS Safari speaks MP4/AAC. The media door sniffs MAGIC BYTES
 * server-side, so the type chosen here is a preference, never a claim.
 */

export interface NoteEnregistree {
  /** The note's raw bytes, base64'd — exactly what rides `contact.audioB64`. */
  readonly audioB64: string;
  /** A local URL for HER OWN replay before ordering. Never leaves the phone. */
  readonly blobUrl: string;
}

export interface EnregistreurNote {
  /** Ask for the microphone and start recording. */
  demarrer(): Promise<'recording' | 'refused'>;
  /** Stop, assemble the note. `null` when nothing usable was captured. */
  arreter(): Promise<NoteEnregistree | null>;
}

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function base64Of(bytes: Uint8Array): string {
  // Chunked btoa — a single String.fromCharCode(...bytes) overflows the
  // argument limit on a note of any real length.
  let bin = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(bin);
}

/** LISTE-VOIX — an optional bitrate REQUEST (the browser may approximate):
 *  the liste's repère records five minutes, and only a voice-grade Opus
 *  stream keeps five minutes inside the wire's ~1 MiB base64 bound. The
 *  checkout's own recorder passes nothing and behaves exactly as before. */
export interface ReglagesNote {
  readonly audioBitsPerSecond?: number;
}

export function creerEnregistreurNote(reglages?: ReglagesNote): EnregistreurNote {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];

  const liberer = (): void => {
    // The microphone light goes OFF the moment the note ends — never held.
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recorder = null;
  };

  return {
    async demarrer(): Promise<'recording' | 'refused'> {
      const media = (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      if (media?.getUserMedia === undefined || typeof MediaRecorder === 'undefined') return 'refused';
      try {
        stream = await media.getUserMedia({ audio: true });
      } catch {
        return 'refused'; // she said no, or the device has no mic — same honest state
      }
      const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
      try {
        recorder = new MediaRecorder(stream, {
          ...(mime !== undefined ? { mimeType: mime } : {}),
          ...(reglages?.audioBitsPerSecond !== undefined ? { audioBitsPerSecond: reglages.audioBitsPerSecond } : {}),
        });
      } catch {
        liberer();
        return 'refused';
      }
      chunks = [];
      recorder.addEventListener('dataavailable', (e: BlobEvent) => {
        if (e.data.size > 0) chunks.push(e.data);
      });
      recorder.start();
      return 'recording';
    },

    async arreter(): Promise<NoteEnregistree | null> {
      const active = recorder;
      if (active === null) return null;
      const done = new Promise<void>((resolve) => {
        active.addEventListener('stop', () => resolve(), { once: true });
      });
      try {
        active.stop();
      } catch {
        liberer();
        return null;
      }
      await done;
      liberer();
      if (chunks.length === 0) return null;
      const blob = new Blob(chunks, chunks[0]!.type !== '' ? { type: chunks[0]!.type } : {});
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length === 0) return null;
      return { audioB64: base64Of(bytes), blobUrl: URL.createObjectURL(blob) };
    },
  };
}
