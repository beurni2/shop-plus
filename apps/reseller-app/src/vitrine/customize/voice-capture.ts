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
      async play(url: string, onEnd?: () => void) {
        // Same reason as above: a take played from a screen that never recorded
        // in this session (she reopens the sheet) has had no `start()` to set
        // the mode, so playback would be silent on a silent-switched iPhone.
        // Setting it HERE makes « can I hear my note » independent of whatever
        // happened before.
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (player.current === null) player.current = createAudioPlayer(null);
        const p = player.current;
        fin.current?.remove(); // one listener at a time — takes replace, never stack
        // WHEN THE TAKE ENDS, SAY SO. Without this the screen never learns that
        // playback finished, so « Pause » sits over silence until she taps it.
        fin.current = p.addListener('playbackStatusUpdate', (st) => {
          if (st.didJustFinish) onEnd?.();
        });
        p.replace({ uri: url });
        p.play();
      },
      async stopPlayback() {
        player.current?.pause();
      },
    }),
    [recorder],
  );
}
