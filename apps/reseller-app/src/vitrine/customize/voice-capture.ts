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
        // Release the recording session so playback routes to the speaker.
        await setAudioModeAsync({ allowsRecording: false });
        return { url: recorder.uri, durationMs };
      },
      async play(url: string) {
        if (player.current === null) player.current = createAudioPlayer(null);
        player.current.replace({ uri: url });
        player.current.play();
      },
      async stopPlayback() {
        player.current?.pause();
      },
    }),
    [recorder],
  );
}
