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
  readyNote,
  failPublish,
  cancelRecording,
  deleteNote,
  type ProductVoiceNote,
  type ProductVoiceNotes,
} from './voice';
import { useVoiceCapture } from './voice-capture';
import { K_RAW_STYLES } from './k-styles';
import { IS_PREVIEW } from '../../preview';

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

/**
 * VOIX-PRODUIT — the publish seam. Given the take's local file uri and how long
 * it ran, it uploads and answers with the url THE SERVICE minted.
 *
 * A SEAM RATHER THAN A SERVICE IMPORT, for the reason the recorder is one: this
 * module is loaded by the screen, and the App is where identity, the storefront
 * id and the service adapter live. It is OPTIONAL so a preview build with no
 * service configured still records and plays back — it simply cannot publish,
 * and says so instead of pretending.
 */
export type VoiceUploader = (
  pid: string,
  fileUri: string,
  durationMs: number,
) => Promise<{ ok: true; url: string } | { ok: false; reason: string }>;

/** One recorder, one controller — hosted at the App level, shared by every
 * card mic and the sheet. Async takes land via a functional setState so a stale
 * closure can never overwrite a later state. */
export function useVoiceNotes(onToast: (m: string) => void, upload?: VoiceUploader): VoiceNotesController {
  const [notes, setNotes] = useState<ProductVoiceNotes>(DEFAULT_VOICE_NOTES);
  const [micDenied, setMicDenied] = useState(false);
  const [playingPid, setPlayingPid] = useState<string | null>(null);
  const recorder = useVoiceCapture();

  return useMemo<VoiceNotesController>(() => {
    // BUG 1 step 1 — DIAGNOSTIC (temporary, IS_PREVIEW-gated). On the founder's
    // preview build, surface the ACTUAL failure instead of the calm « interrompu »
    // toast, so a permission cause (handled above → the « Micro refusé » banner) is
    // distinguishable from an expo-audio API throw (and which call threw). Production
    // profiles (IS_PREVIEW=false) keep the clean toast. Removed/narrowed in step 3
    // once the on-device cause is known. This is diagnostic text, not product copy.
    const interrupted = (stage: string, err?: unknown): string =>
      IS_PREVIEW
        ? `Diag micro (${stage}) : ${err instanceof Error ? err.message : err === undefined ? 'fichier vide (uri null)' : String(err)}`
        : t('k.voix.interrompu');

    const startRec = async (pid: string): Promise<void> => {
      const perm = await recorder.requestPermission();
      if (perm === 'denied') { setMicDenied(true); return; } // designed « micro refusé » state
      setMicDenied(false);
      try {
        await recorder.start();
        setNotes((cur) => startRecording(cur, pid));
      } catch (err) {
        setNotes((cur) => cancelRecording(cur, pid));
        onToast(interrupted('démarrage', err));
      }
    };
    const stopRec = async (pid: string): Promise<void> => {
      try {
        const take = await recorder.stop();
        if (!take.url) { setNotes((cur) => cancelRecording(cur, pid)); onToast(interrupted('fichier')); return; }
        setNotes((cur) => stopRecording(cur, pid, take));
      } catch (err) {
        setNotes((cur) => cancelRecording(cur, pid)); // mid-record interruption: drop the partial
        onToast(interrupted('arrêt', err));
      }
    };
    /**
     * PUBLIER — pending first, then the real upload, then the SERVICE's answer.
     *
     * The order is the honesty: she sees « publiée dès que le réseau revient »
     * the instant she taps (loi 7 — queued is pending, never done), and the note
     * only becomes `ready` when the service hands back the address it stored.
     * A failure puts the take back to `recorded` with its own reason, because
     * this app has no retry queue and a note stuck « pending » forever would be
     * the same lie told slowly.
     */
    const publishRec = async (pid: string): Promise<void> => {
      const note = noteOf(notes, pid);
      if (note.status !== 'recorded' || note.url === null) return;
      const take = { url: note.url, durationMs: note.durationMs };
      setNotes((cur) => publishNote(cur, pid));
      if (upload === undefined) {
        // No service in this build: it is genuinely queued nowhere. Say the
        // pending sentence and stop — never « en ligne ».
        onToast(t('k.voix.toast_publiee'));
        return;
      }
      onToast(t('k.voix.toast_publiee'));
      const res = await upload(pid, take.url, take.durationMs);
      if (res.ok) {
        setNotes((cur) => readyNote(cur, pid, res.url));
        onToast(t('k.voix.toast_en_ligne'));
        return;
      }
      setNotes((cur) => failPublish(cur, pid));
      onToast(t('k.voix.toast_echec'));
    };
    const playRec = async (pid: string, url: string): Promise<void> => {
      if (playingPid === pid) { await recorder.stopPlayback(); setPlayingPid(null); return; }
      // …and when the take ENDS on its own, the button must come back to
      // « Écouter ». Without this callback it stayed « Pause » over silence
      // until she tapped it — the founder's second report.
      await recorder.play(url, () => setPlayingPid((cur) => (cur === pid ? null : cur)));
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
      publishRec: (pid) => void publishRec(pid),
      deleteRec: (pid) => {
        if (playingPid === pid) { void recorder.stopPlayback(); setPlayingPid(null); }
        setNotes((cur) => deleteNote(cur, pid));
        onToast(t('k.voix.toast_supprimee'));
      },
      retryPermission: () => {
        void recorder.requestPermission().then((p) => setMicDenied(p === 'denied'));
      },
    };
  }, [notes, micDenied, playingPid, recorder, onToast, upload]);
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

      {/* ÉCOUTEZ-VOUS D'ABORD (founder 2026-08-04). The take she just made now
          gets its own block, tappable across its whole width, above everything
          else — because « did I say it well? » is the question she actually has
          at this moment, and « Écouter » used to be one chip among five, the
          same size as « Supprimer ». Publishing is the primary button BELOW it;
          refaire and supprimer whisper on their own row. Nothing new was wired:
          the playback was always real, it was merely hard to see. */}
      {n.status === 'recorded' && (
        <View style={{ gap: 12 }}>
          {n.url ? (
            <Pressable
              style={({ pressed }) => [S.vEcouteBloc, pressed && S.pressed]}
              onPress={() => ctl.playRec(pid, n.url!)}
              accessibilityRole="button"
              accessibilityState={{ selected: playing }}
              accessibilityLabel={t(playing ? 'k.voix.pause' : 'k.voix.ecouter')}
            >
              <View style={S.vEcouteDisque}>
                {playing ? <IconPauseK size={18} color="#FFF6EC" /> : <IconPlayK size={18} color="#FFF6EC" />}
              </View>
              <View style={S.vEcouteTexte}>
                <Text style={S.vEcouteTitre}>{t(playing ? 'k.voix.pause' : 'k.voix.ecouter')}</Text>
                <Text style={S.vEcouteSous}>{t('k.voix.avant_publier')}</Text>
              </View>
              <Text style={S.vEcouteDur}>{fmtVoiceDuration(n.durationMs)}</Text>
            </Pressable>
          ) : null}
          <Pressable style={({ pressed }) => [S.cta, pressed && S.pressed]} onPress={() => ctl.publishRec(pid)} accessibilityRole="button">
            <Text style={S.ctaText}>{t('k.voix.publier')}</Text>
          </Pressable>
          <View style={S.vSecondaires}>
            <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={() => ctl.startRec(pid)} accessibilityRole="button">
              <Text style={S.vGhostText}>{t('k.voix.refaire')}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [S.vGhost, S.vDanger, pressed && S.pressed]} onPress={() => ctl.deleteRec(pid)} accessibilityRole="button">
              <Text style={[S.vGhostText, S.vDangerText]}>{t('k.voix.supprimer')}</Text>
            </Pressable>
          </View>
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
