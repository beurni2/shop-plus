/**
 * NOTES VOCALES — the per-product record SHEET, opened from the mic on each Ma
 * Vitrine product card (founder ruling 2026-07-19, Option A: recording lives
 * WITH the product, not behind an « Aa » screen — the buried K8 entry failed the
 * 5-second test on device). Same real capture (expo-audio), same honesty
 * (publish → pending, never « en ligne »), same seam.
 *
 * `useVoiceNotes` hosts the state + the real recorder at the App level so the
 * card and the sheet share one controller. Native-only (imports expo-audio via
 * useVoiceCapture) → not imported by any test; the pure reducer + demo double in
 * ./voice are what Node tests exercise.
 */

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { t, tf } from '../../i18n';
import {
  DEFAULT_VOICE_NOTES,
  fmtVoiceDuration,
  noteOf,
  startRecording,
  stopRecording,
  publishNote,
  cancelRecording,
  deleteNote,
  type ProductVoiceNote,
  type ProductVoiceNotes,
} from './voice';
import { useVoiceCapture } from './voice-capture';
import { K_RAW_STYLES } from './k-styles';

const S = K_RAW_STYLES as unknown as Record<keyof typeof K_RAW_STYLES, ViewStyle & TextStyle>;

/* ------------------------------------------------------------ icons ------ */

function IconMic({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
      <Path d="M6 11a6 6 0 0 0 12 0" />
      <Path d="M12 17v3.5" />
    </Svg>
  );
}
function IconPlayK({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 5.5l11 6.5-11 6.5z" fill={color} />
    </Svg>
  );
}
function IconPauseK({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={6.5} y={5} width={3.5} height={14} rx={1} fill={color} />
      <Rect x={14} y={5} width={3.5} height={14} rx={1} fill={color} />
    </Svg>
  );
}

/* ----------------------------------------------- the shared controller --- */

export interface VoiceNotesController {
  readonly notes: ProductVoiceNotes;
  readonly micDenied: boolean;
  readonly playingPid: string | null;
  readonly anyRecording: boolean;
  startRec(pid: string): void;
  stopRec(pid: string): void;
  cancelRec(pid: string): void;
  playRec(pid: string, url: string): void;
  publishRec(pid: string): void;
  deleteRec(pid: string): void;
  retryPermission(): void;
}

/** One recorder, one controller — hosted at the App level, shared by every
 * card mic and the sheet. Async takes land via a functional setState so a stale
 * closure can never overwrite a later state. */
export function useVoiceNotes(onToast: (m: string) => void): VoiceNotesController {
  const [notes, setNotes] = useState<ProductVoiceNotes>(DEFAULT_VOICE_NOTES);
  const [micDenied, setMicDenied] = useState(false);
  const [playingPid, setPlayingPid] = useState<string | null>(null);
  const recorder = useVoiceCapture();

  return useMemo<VoiceNotesController>(() => {
    const startRec = async (pid: string): Promise<void> => {
      const perm = await recorder.requestPermission();
      if (perm === 'denied') { setMicDenied(true); return; } // designed « micro refusé » state
      setMicDenied(false);
      try {
        await recorder.start();
        setNotes((cur) => startRecording(cur, pid));
      } catch {
        setNotes((cur) => cancelRecording(cur, pid));
        onToast(t('k.voix.interrompu'));
      }
    };
    const stopRec = async (pid: string): Promise<void> => {
      try {
        const take = await recorder.stop();
        if (!take.url) { setNotes((cur) => cancelRecording(cur, pid)); onToast(t('k.voix.interrompu')); return; }
        setNotes((cur) => stopRecording(cur, pid, take));
      } catch {
        setNotes((cur) => cancelRecording(cur, pid)); // mid-record interruption: drop the partial
        onToast(t('k.voix.interrompu'));
      }
    };
    const playRec = async (pid: string, url: string): Promise<void> => {
      if (playingPid === pid) { await recorder.stopPlayback(); setPlayingPid(null); return; }
      await recorder.play(url); // her own take, local file — real playback
      setPlayingPid(pid);
    };
    return {
      notes,
      micDenied,
      playingPid,
      anyRecording: Object.values(notes).some((n) => n.status === 'recording'),
      startRec: (pid) => void startRec(pid),
      stopRec: (pid) => void stopRec(pid),
      cancelRec: (pid) => {
        void recorder.stop().catch(() => undefined);
        setNotes((cur) => cancelRecording(cur, pid));
      },
      playRec: (pid, url) => void playRec(pid, url),
      publishRec: (pid) => {
        setNotes((cur) => publishNote(cur, pid));
        onToast(t('k.voix.toast_publiee')); // honesty: « publiée dès que le réseau revient », never « en ligne »
      },
      deleteRec: (pid) => {
        if (playingPid === pid) { void recorder.stopPlayback(); setPlayingPid(null); }
        setNotes((cur) => deleteNote(cur, pid));
        onToast(t('k.voix.toast_supprimee'));
      },
      retryPermission: () => {
        void recorder.requestPermission().then((p) => setMicDenied(p === 'denied'));
      },
    };
  }, [notes, micDenied, playingPid, recorder, onToast]);
}

/** The card label for a product's note — drives the mic affordance text. */
export function voiceCardLabel(note: ProductVoiceNote | undefined): string {
  const st = note?.status ?? 'none';
  if (st === 'pending' || st === 'ready') return t('k.voix.carte_en_attente');
  if (st === 'recorded') return t('k.voix.carte_a_publier');
  return t('k.voix.carte_ajouter');
}

/* ------------------------------------------------------- the controls ---- */

function PlayBtn({ playing, onPress }: { playing: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable style={({ pressed }) => [S.vPlayBtn, pressed && S.pressed]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: playing }}>
      {playing ? <IconPauseK size={15} color="#1C1710" /> : <IconPlayK size={15} color="#1C1710" />}
      <Text style={S.vGhostText}>{t(playing ? 'k.voix.pause' : 'k.voix.ecouter')}</Text>
    </Pressable>
  );
}

/** The per-product controls — state machine surfaced (record → recorded →
 * publish; re-record + delete + real playback). Shared by the sheet. */
export function VoiceNoteControls({ pid, ctl }: { pid: string; ctl: VoiceNotesController }): React.ReactElement {
  const n = noteOf(ctl.notes, pid);
  const kept = n.status === 'pending' || n.status === 'ready';
  const playing = ctl.playingPid === pid;
  return (
    <View style={{ gap: 12 }}>
      {ctl.micDenied && (
        <View style={S.vDeniedBanner}>
          <Text style={S.vDeniedText}>{t('k.voix.micro_refuse')}</Text>
          <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={ctl.retryPermission} accessibilityRole="button">
            <Text style={S.vGhostText}>{t('k.voix.reessayer')}</Text>
          </Pressable>
        </View>
      )}

      {n.status === 'none' && (
        <Pressable
          style={({ pressed }) => [S.vRecBtn, ctl.anyRecording && S.ctaDisabled, pressed && !ctl.anyRecording && S.pressed]}
          disabled={ctl.anyRecording}
          onPress={() => ctl.startRec(pid)}
          accessibilityRole="button"
          accessibilityState={{ disabled: ctl.anyRecording }}
        >
          <IconMic size={17} color="#A31D4E" />
          <Text style={S.vRecBtnText}>{t('k.voix.enregistrer')}</Text>
        </Pressable>
      )}

      {n.status === 'recording' && (
        <View style={S.vRecording}>
          <View style={S.vRecDot} />
          <Text style={S.vRecLabel}>{t('k.voix.en_cours')}</Text>
          <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={() => ctl.cancelRec(pid)} accessibilityRole="button">
            <Text style={S.vGhostText}>{t('k.voix.annuler')}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [S.vStopBtn, pressed && S.pressed]} onPress={() => ctl.stopRec(pid)} accessibilityRole="button">
            <Text style={S.vStopText}>{t('k.voix.arreter')}</Text>
          </Pressable>
        </View>
      )}

      {n.status === 'recorded' && (
        <View style={S.vActions}>
          {n.url ? <PlayBtn playing={playing} onPress={() => ctl.playRec(pid, n.url!)} /> : null}
          <Text style={S.vDur}>{fmtVoiceDuration(n.durationMs)}</Text>
          <Pressable style={({ pressed }) => [S.vPublishBtn, pressed && S.pressed]} onPress={() => ctl.publishRec(pid)} accessibilityRole="button">
            <Text style={S.vPublishText}>{t('k.voix.publier')}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={() => ctl.startRec(pid)} accessibilityRole="button">
            <Text style={S.vGhostText}>{t('k.voix.refaire')}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [S.vGhost, S.vDanger, pressed && S.pressed]} onPress={() => ctl.deleteRec(pid)} accessibilityRole="button">
            <Text style={[S.vGhostText, S.vDangerText]}>{t('k.voix.supprimer')}</Text>
          </Pressable>
        </View>
      )}

      {kept && (
        <>
          <View style={S.vPendingPill}><Text style={S.vPendingText}>{t('k.voix.en_attente')}</Text></View>
          <View style={S.vActions}>
            {n.url ? <PlayBtn playing={playing} onPress={() => ctl.playRec(pid, n.url!)} /> : null}
            <Text style={S.vDur}>{fmtVoiceDuration(n.durationMs)}</Text>
            <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={() => ctl.startRec(pid)} accessibilityRole="button">
              <Text style={S.vGhostText}>{t('k.voix.refaire')}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [S.vGhost, S.vDanger, pressed && S.pressed]} onPress={() => ctl.deleteRec(pid)} accessibilityRole="button">
              <Text style={[S.vGhostText, S.vDangerText]}>{t('k.voix.supprimer')}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/* --------------------------------------------------------- the sheet ----- */

/** The record SHEET — a bottom modal for ONE product, opened from its card mic.
 * `product` null = closed. Tapping the backdrop or « Fermer » closes it (any
 * in-progress recording is cancelled honestly on close). */
export function VoiceNoteSheet({
  product,
  ctl,
  onClose,
}: {
  product: { pid: string; name: string } | null;
  ctl: VoiceNotesController;
  onClose: () => void;
}): React.ReactElement {
  const visible = product !== null;
  const close = (): void => {
    if (product) {
      // Don't strand a live recording behind a closed sheet.
      if (noteOf(ctl.notes, product.pid).status === 'recording') ctl.cancelRec(product.pid);
      if (ctl.playingPid === product.pid) ctl.playRec(product.pid, ''); // toggles playback off
    }
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={S.vSheetBackdrop} onPress={close} accessibilityLabel={t('k.voix.fermer')}>
        <Pressable style={S.vSheetCard} onPress={() => undefined} accessibilityViewIsModal>
          <View style={S.vSheetHandle} />
          {product && (
            <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
              <Text style={S.vSheetKicker}>{t('k.voix.note_produit')}</Text>
              <Text style={S.vSheetTitle} numberOfLines={2}>{product.name}</Text>
              <VoiceNoteControls pid={product.pid} ctl={ctl} />
              <Text style={S.noteSableText}>{t('k.voix.note')}</Text>
              <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={close} accessibilityRole="button">
                <Text style={S.vGhostText}>{t('k.voix.fermer')}</Text>
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// StyleSheet.create validation (parity with screens.tsx — the raw table is the pin).
StyleSheet.create(K_RAW_STYLES as Parameters<typeof StyleSheet.create>[0]);
