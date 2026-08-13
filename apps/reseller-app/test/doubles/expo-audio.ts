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

import { File } from './expo-file-system';

type Status = { currentTime?: number; playing?: boolean; didJustFinish?: boolean; playbackState?: string; isLoaded?: boolean };

/**
 * ═══ THE PLAYER LOG — what the app ASKED the player to do, and nothing more ═══
 *
 * VOIX-PRODUIT diagnosis: `canPress('Écouter')` was the only pin on the listen
 * press — a dead-wired `onPress` left every test green. A walk must be able to
 * assert the press REACHED the player, so `replace:`/`play:` calls are recorded
 * here, in order.
 *
 * ITS BOUND IS ABSOLUTE: an entry says the app CALLED the native surface with
 * that source. It may never be read as « audio was heard » — there is no sound
 * here, and whether a note is audible stays with the founder's own ear.
 */
export const journalLecteur: string[] = [];

class AudioPlayer {
  private dead = false;
  private loaded: boolean;
  private listener: ((s: Status) => void) | null = null;
  constructor(public source: string | null) {
    // A player created over a real source starts loading it; over null there is
    // nothing to load. Either way `replace()` below is what the app drives.
    this.loaded = source !== null;
  }

  private native(name: string): void {
    if (this.dead) {
      throw new Error(`Unable to find the native object associated with the given JavaScript object (${name})`);
    }
  }

  /** « whether the player is finished loading » (AudioModule.types l.44). The
   *  double loads a source INSTANTLY on `replace` — the walks' takes are local
   *  files; the play-before-loaded race keeps its own pin in repere-audio. */
  get isLoaded(): boolean {
    return !this.dead && this.loaded;
  }

  play(): void {
    this.native('play');
    journalLecteur.push(`play:${this.source ?? '(rien)'}`);
    this.listener?.({ playing: true, currentTime: 0 });
  }
  pause(): void {
    this.native('pause');
  }
  seekTo(): void {
    this.native('seekTo');
  }
  /** Native: swap the loaded source. Loads synchronously here (see isLoaded). */
  replace(src: { uri: string } | string | null): void {
    this.native('replace');
    this.source = typeof src === 'string' ? src : src === null ? null : src.uri;
    this.loaded = this.source !== null;
    journalLecteur.push(`replace:${this.source ?? '(rien)'}`);
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

export function createAudioPlayer(source: string | null): AudioPlayer {
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
 * here and no audio: what the native side yields to the app is a FILE URI
 * (`recorder.uri` after `stop()`), and that — a canned uri whose « bytes » are
 * a marker string written into the expo-file-system double — is ALL this
 * produces. A walk may assert the take travelled (the port was called, the
 * POST carried bytes); it may NEVER claim audio was truly captured or heard —
 * that stays with the voice-capture suites over the real seam and finally the
 * founder's own ear on a phone.
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

/** Where the canned take « lands » — dir + name, so the expo-file-system
 *  double's `File` finds it under the same key the app will read. */
const PRISE_DIR = 'file:///rendu-cache/';
const PRISE_NOM = 'prise-rendu.m4a';
export const PRISE_URI = `${PRISE_DIR}${PRISE_NOM}`;
/** The « bytes »: a marker string, never audio (the bound above). */
const PRISE_OCTETS = 'prise-rendu — aucun octet audio, voir la borne en tête de fichier';

/** The recorder session is MODULE state, as the native recorder's is: the hook
 *  hands back a fresh object every render, and a take started on one render
 *  must still be there when a later render stops it. */
let enCours = false;
let prise: string | null = null;

export function useAudioRecorder(): AudioRecorderDouble {
  return {
    get uri(): string | null {
      return prise;
    },
    get isRecording(): boolean {
      return enCours;
    },
    async prepareToRecordAsync(): Promise<void> {},
    record(): void {
      enCours = true;
    },
    async stop(): Promise<void> {
      // A stop over a live take yields the canned uri and writes its marker
      // « bytes » where the app's file port will look. A stop with nothing
      // running (the cancel path) yields nothing new — as the device does.
      if (enCours) {
        prise = PRISE_URI;
        new File(PRISE_DIR, PRISE_NOM).write(PRISE_OCTETS);
      }
      enCours = false;
    },
  };
}

/** Permission is GRANTED here — the refusal branch has its own unit test, and a
 *  double that refused would block every screen behind a dialog nobody can tap. */
export async function requestRecordingPermissionsAsync(): Promise<{ granted: boolean }> {
  return { granted: true };
}
