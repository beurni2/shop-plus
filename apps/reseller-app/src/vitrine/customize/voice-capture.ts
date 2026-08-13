/**
 * NOTES VOCALES — the REAL capture adapter (expo-audio). This is the native
 * implementation of the `VoiceRecorderAdapter` seam: it records on-device,
 * returns the take's local file URI + elapsed time, and plays her own take back.
 *
 * Native-only by construction: it imports expo-audio (a native module), so it is
 * NOT imported by any test (the Metro-safe law — vitest cannot load a native
 * module). The pure reducer + the demo double live in ./voice and are what the
 * Node tests exercise; this hook is what the screen uses at runtime. tsc is the
 * gate on the API here (no emulator in CI — on-device behaviour is founder-
 * device-verified, per the standing RN device-matrix note).
 *
 * CAPTURE AND PLAYBACK ONLY — persistence is NOT here, and it is NOT mocked:
 * publish uploads the take's bytes to the real storefront service and adopts
 * the url the service minted (voice-sheet's `VoiceUploader`, wired in App.tsx).
 * An earlier version of this banner said « persistence stays mocked »; it was
 * stale and misled an investigation on 2026-08-13.
 */

import { useMemo, useRef } from 'react';
import {
  useAudioRecorder,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
  type AudioPlayer,
} from 'expo-audio';
import type { VoiceRecorderAdapter } from './voice';

/**
 * VOIX-CARTE — how long a load may stay silent before the failure road is
 * taken. A short note over 3G loads in well under this; a load that has said
 * NOTHING for ten seconds is the no-error-listener dead end described in
 * `play()` below, and she must get her button back rather than a « Pause »
 * over permanent silence.
 */
const GARDE_CHARGEMENT_MS = 10_000;

/**
 * The real seam, as a hook (expo-audio's recorder is hook-provided). Returns a
 * stable adapter the screen drives imperatively. One shared player instance is
 * reused across takes and released with each replace.
 */
export function useVoiceCapture(): VoiceRecorderAdapter {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const startedAt = useRef<number | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  /** The current end-of-take subscription, so takes replace it rather than pile up. */
  const fin = useRef<{ remove: () => void } | null>(null);
  /** The load watchdog (see `play()`), hook-level so `stopPlayback` can clear
   *  it: her tapping Pause during a hung load is HER way out, and the failure
   *  toast must not fire after she has already left. */
  const garde = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useMemo<VoiceRecorderAdapter>(
    () => ({
      async requestPermission() {
        const res = await requestRecordingPermissionsAsync();
        return res.granted ? 'granted' : 'denied';
      },
      async start() {
        // Recording is LEAVING the listen road: a watchdog still waiting on a
        // hung load must die here, or its failure toast lands on the record
        // sheet ten seconds into her take (verifier, 2026-08-13).
        if (garde.current !== null) { clearTimeout(garde.current); garde.current = null; }
        // iOS needs the session flipped to recording; harmless on Android.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        startedAt.current = Date.now();
      },
      async stop() {
        await recorder.stop();
        const durationMs = startedAt.current === null ? 0 : Math.max(0, Date.now() - startedAt.current);
        startedAt.current = null;
        // ═══ THE SILENT PLAYBACK, AND WHY IT WAS SILENT ═══
        //
        // Founder, three times: « I am still not able to listen to the audio
        // recording from ma vitrine before publishing. » The button was there,
        // the take was there, the player ran — and he heard nothing.
        //
        // `setAudioModeAsync` SETS THE WHOLE MODE; it does not merge. `start()`
        // sets `playsInSilentMode: true` so recording works, and this call —
        // whose own comment says « so playback routes to the speaker » —
        // dropped that flag back to false. On an iPhone with the ringer switch
        // on silent (which is most iPhones, most of the time) iOS then plays
        // the take at zero volume. Nothing errors. Nothing is logged. The
        // feature simply has no sound.
        //
        // Both flags are passed now, every time, because a partial mode is a
        // mode that silently forgets the other half.
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        return { url: recorder.uri, durationMs };
      },
      async play(
        url: string,
        onEnd?: () => void,
        onTick?: (seconds: number) => void,
        onEchec?: (stage: 'idle' | 'delai') => void,
      ) {
        // FIRST, before any await: a previous take's watchdog dies the moment a
        // new listen begins. Clearing it after the mode await left a window
        // where take A's timer could fire DURING take B's start and toast about
        // A over B (verifier, 2026-08-13).
        if (garde.current !== null) { clearTimeout(garde.current); garde.current = null; }
        // Same reason as above: a take played from a screen that never recorded
        // in this session (she reopens the sheet) has had no `start()` to set
        // the mode, so playback would be silent on a silent-switched iPhone.
        // Setting it HERE makes « can I hear my note » independent of whatever
        // happened before.
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (player.current === null) player.current = createAudioPlayer(null);
        const p = player.current;
        fin.current?.remove(); // one listener at a time — takes replace, never stack
        /**
         * ═══ PLAY AFTER REPLACE IS SAFE; A LOAD THAT FAILS IS SILENT ═══
         *
         * (Verified against the installed expo-audio 1.1.1 native sources,
         * 2026-08-13 — this replaces an earlier race theory.) On Android,
         * `replace({uri})` is synchronous native-side: setMediaSource +
         * prepare() run immediately, and `play()` on the next line is NOT
         * lost — ExoPlayer's playWhenReady persists through buffering, so a
         * successful load starts on its own. `lancer()` therefore runs
         * UNCONDITIONALLY right after `replace()`; the isLoaded listener
         * below is kept as the iOS belt, and the `lance` once-flag keeps the
         * two roads from doubling up (play() on a playing player is a no-op).
         *
         * THE REAL HAZARD IS THE FAILURE ROAD. The installed library registers
         * NO error listener (zero onPlayerError hits in its android source): a
         * source that fails to load — offline, 404, dead file — drops to
         * ExoPlayer's 'idle' terminal, `isLoaded` never becomes true, and
         * NOTHING reaches JS. Without detection that is play() never starting
         * while the UI says « Pause »: permanent silence, the founder's
         * 2026-08-13 report. Two detectors close it: (a) a status carrying
         * playbackState 'idle' AFTER a non-idle state was seen (a healthy
         * replace moves straight to buffering, so a LATER idle is the error
         * terminal — arming after the first non-idle status keeps a
         * pre-buffering idle echo from false-firing); (b) the watchdog below,
         * for the load that never says anything at all.
         */
        let lance = false;
        const lancer = (): void => {
          if (lance) return;
          lance = true;
          p.play();
        };
        const annulerGarde = (): void => {
          if (garde.current !== null) { clearTimeout(garde.current); garde.current = null; }
        };
        // The failure fires ONCE (same once-flag idiom as `lance`), and firing
        // it clears the watchdog so 'idle' then timeout cannot toast her twice.
        let echec = false;
        const signalerEchec = (stage: 'idle' | 'delai'): void => {
          if (echec) return;
          echec = true;
          annulerGarde();
          onEchec?.(stage);
        };
        // The player's OWN word that the source loaded — the fact that stands
        // down both detectors. The unconditional `lancer()` after replace()
        // must NOT stand them down: a call queued on playWhenReady proves
        // nothing about the load it is waiting on.
        let charge = false;
        const chargeConfirmee = (): void => {
          charge = true;
          annulerGarde();
        };
        let vuActif = false; // a non-idle status was seen — arms detector (a)
        // WHEN THE TAKE ENDS, SAY SO. Without this the screen never learns that
        // playback finished, so « Pause » sits over silence until she taps it.
        fin.current = p.addListener('playbackStatusUpdate', (st) => {
          if (st.isLoaded) { chargeConfirmee(); lancer(); }
          if (st.playbackState === 'idle') {
            if (vuActif && !charge) signalerEchec('idle');
          } else {
            vuActif = true;
          }
          if (st.didJustFinish) annulerGarde();
          if (st.didJustFinish) { onEnd?.(); return; }
          // VOIX-ÉTAT-2 — the position, from the SAME event that already told
          // us the take had ended. Nothing new is polled and no timer of our own
          // runs alongside a note it cannot see.
          onTick?.(Math.max(0, Math.floor(st.currentTime)));
        });
        p.replace({ uri: url });
        // Unconditional — Android queues it via playWhenReady (see above); on a
        // load that fails it is inert and the detectors carry the outcome.
        lancer();
        // Already loaded (she is listening to the same take a second time) —
        // no further status may arrive, so take the player's word right here.
        if (p.isLoaded) chargeConfirmee();
        if (!charge) {
          garde.current = setTimeout(() => signalerEchec('delai'), GARDE_CHARGEMENT_MS);
        }
      },
      async stopPlayback() {
        // She left — by Pause, or by Pause over a HUNG load, which is her way
        // out of it. The watchdog must die with the wait: a failure toast
        // arriving after she already moved on would be noise about nothing.
        if (garde.current !== null) { clearTimeout(garde.current); garde.current = null; }
        player.current?.pause();
      },
    }),
    [recorder],
  );
}
