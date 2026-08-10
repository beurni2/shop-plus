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
 * CAPTURE ONLY. Persistence stays mocked (publish → pending in the reducer);
 * a storage backend is a SEPARATE, later swap and does not touch this seam.
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

  return useMemo<VoiceRecorderAdapter>(
    () => ({
      async requestPermission() {
        const res = await requestRecordingPermissionsAsync();
        return res.granted ? 'granted' : 'denied';
      },
      async start() {
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
      async play(url: string, onEnd?: () => void, onTick?: (seconds: number) => void) {
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
         * ═══ ⚠ PLAY BEFORE LOADED IS PLAY THAT NEVER HAPPENS ═══
         *
         * FOUNDER, AGAIN (2026-08-10): « on ma vitrine when I record an audio
         * and want to play it back it's not working. » The silent-switch half
         * of this was fixed above and was real; this is the OTHER half, and it
         * is why the fix did not finish the job.
         *
         * `replace()` hands the player a new source; loading it is ASYNC.
         * `play()` on the very next line asks a player that has nothing loaded
         * yet to start — it returns without error and without sound. Whether
         * anything is heard then depends on a race the code never acknowledged:
         * a short local take on a fast phone sometimes won it, which is exactly
         * why this looked intermittent rather than broken.
         *
         * So playback now waits for the player's OWN word. `isLoaded` is the
         * fact (`AudioModule.types` l.44 — « whether the player is finished
         * loading »), delivered on the same `playbackStatusUpdate` this
         * listener already reads. Both roads are covered and neither can double
         * up: the flag starts it once, whether the player was already loaded
         * (a second listen to the same take) or becomes loaded a moment later.
         */
        let lance = false;
        const lancer = (): void => {
          if (lance) return;
          lance = true;
          p.play();
        };
        // WHEN THE TAKE ENDS, SAY SO. Without this the screen never learns that
        // playback finished, so « Pause » sits over silence until she taps it.
        fin.current = p.addListener('playbackStatusUpdate', (st) => {
          if (st.isLoaded) lancer();
          if (st.didJustFinish) { onEnd?.(); return; }
          // VOIX-ÉTAT-2 — the position, from the SAME event that already told
          // us the take had ended. Nothing new is polled and no timer of our own
          // runs alongside a note it cannot see.
          onTick?.(Math.max(0, Math.floor(st.currentTime)));
        });
        p.replace({ uri: url });
        // Already loaded (she is listening to the same take a second time) —
        // no further status may arrive, so do not sit waiting for one.
        if (p.isLoaded) lancer();
      },
      async stopPlayback() {
        player.current?.pause();
      },
    }),
    [recorder],
  );
}
