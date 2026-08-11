/**
 * ═══ RENDU-RÉEL — expo-audio, WITH ITS REAL FAILURE MODE ═══
 *
 * THIS DOUBLE EXISTS TO BE HARSH, NOT KIND. The « écran blanc » the founder
 * hit was a native throw: `SharedObject.release()` detaches the JS object from
 * its native counterpart, and expo-modules-core documents that « any
 * subsequent calls to native functions of the object will throw ». `remove()`
 * IS such a native function (`AudioModule.types.d.ts` l.176, over
 * `requireNativeModule('ExpoAudio')`).
 *
 * A double that let a released player keep answering would make the crash
 * unreproducible here — and the whole point of this harness is that the crash
 * must be reproducible. So: `release()` kills the object, and every native
 * call afterwards throws exactly as the device does.
 *
 * Contract-certified to the same bounds as `test/repere-audio.test.ts`'s fake,
 * which was derived from the installed package and the native sources.
 */

type Status = { currentTime?: number; playing?: boolean; didJustFinish?: boolean; playbackState?: string };

class AudioPlayer {
  private dead = false;
  private listener: ((s: Status) => void) | null = null;
  constructor(readonly source: string) {}

  private native(name: string): void {
    if (this.dead) {
      throw new Error(`Unable to find the native object associated with the given JavaScript object (${name})`);
    }
  }

  play(): void {
    this.native('play');
    this.listener?.({ playing: true, currentTime: 0 });
  }
  pause(): void {
    this.native('pause');
  }
  seekTo(): void {
    this.native('seekTo');
  }
  /** Native: drops the module's reference. Does NOT detach. */
  remove(): void {
    this.native('remove');
  }
  /** SharedObject.release(): DETACHES. Safe on an already-detached object. */
  release(): void {
    this.dead = true;
  }
  addListener(_event: 'playbackStatusUpdate', fn: (s: Status) => void): { remove: () => void } {
    this.listener = fn;
    return { remove: () => { this.listener = null; } };
  }
}

export function createAudioPlayer(source: string): AudioPlayer {
  return new AudioPlayer(source);
}

export async function setAudioModeAsync(): Promise<void> {}

/* ════════════════════════════════════════════════════════════════════════════
 * THE RECORDER HALF — added for the Shop+ reseller harness.
 *
 * `src/vitrine/customize/voice-capture.ts` takes a recorder hook and a preset,
 * and it runs at MOUNT (a hook, on the customize stack), so the App cannot be
 * imported without them.
 *
 * IT RECORDS NOTHING AND NO WALK MAY CLAIM IT DOES. There is no microphone
 * here, no audio, no duration that means anything. Whether a take is captured,
 * encoded and uploaded is proved by the voice-capture and upload suites over
 * the real seam, and finally by the founder's own ear on a phone. This exists
 * so the screens mount.
 * ══════════════════════════════════════════════════════════════════════════ */

export const RecordingPresets = {
  HIGH_QUALITY: { extension: '.m4a', sampleRate: 44_100, numberOfChannels: 2, bitRate: 128_000 },
  LOW_QUALITY: { extension: '.m4a', sampleRate: 22_050, numberOfChannels: 1, bitRate: 64_000 },
} as const;

export interface AudioRecorderDouble {
  readonly uri: string | null;
  readonly isRecording: boolean;
  prepareToRecordAsync(): Promise<void>;
  record(): void;
  stop(): Promise<void>;
}

export function useAudioRecorder(): AudioRecorderDouble {
  return {
    uri: null,
    isRecording: false,
    async prepareToRecordAsync(): Promise<void> {},
    record(): void {},
    async stop(): Promise<void> {},
  };
}

/** Permission is GRANTED here — the refusal branch has its own unit test, and a
 *  double that refused would block every screen behind a dialog nobody can tap. */
export async function requestRecordingPermissionsAsync(): Promise<{ granted: boolean }> {
  return { granted: true };
}
