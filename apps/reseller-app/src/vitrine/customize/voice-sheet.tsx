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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { t, tf } from '../../i18n';
import { DEFAULT_VOICE_NOTES, cancelRecording, deleteNote, failPublish, fmtVoiceDuration, fusionnerNotesStockees, noteOf, publishNote, readyNote, startRecording, stopRecording, type ProductVoiceNote, type ProductVoiceNotes } from './voice';
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
  /**
   * VOIX-ÉTAT-2 (founder 2026-08-09) — « the seconds are not counting ». They
   * could not: both controls printed `fmtVoiceDuration(n.durationMs)`, the
   * take's TOTAL, which is the same number before, during and after playback.
   * This is the live position, in whole seconds, of whichever take is playing.
   */
  readonly playingSec: number;
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
/**
 * VOIX-SUPPRIMER-1 — the REMOVE seam (founder, 2026-08-12: « build the real
 * delete »). Same shape and same reasons as {@link VoiceUploader}: the App owns
 * identity and the service adapter, the sheet owns the button.
 *
 * OPTIONAL for the same reason too — a preview build with no service still
 * records and plays back. What it may NOT do is claim a removal it could not
 * perform, so an absent remover clears nothing and says so.
 */
export type VoiceRemover = (pid: string) => Promise<{ ok: true } | { ok: false; reason: string }>;

export type VoiceUploader = (
  pid: string,
  fileUri: string,
  durationMs: number,
) => Promise<{ ok: true; url: string } | { ok: false; reason: string }>;

/** One recorder, one controller — hosted at the App level, shared by every
 * card mic and the sheet. Async takes land via a functional setState so a stale
 * closure can never overwrite a later state. */
export function useVoiceNotes(
  onToast: (m: string) => void,
  upload?: VoiceUploader,
  /**
   * WHAT THE SHOP HOLDS (`Storefront.productNotes`), handed down on every read.
   *
   * Without it this controller only ever knew about takes made in THIS session,
   * so a note the service had stored was invisible and unplayable — the founder's
   * 2026-08-12 report. `fusionnerNotesStockees` owns the merge and its one rule:
   * a take she is recording, reviewing or publishing is never overwritten.
   */
  stockees?: unknown,
  /** VOIX-SUPPRIMER-1 — the act that makes « Supprimer » true on the service. */
  remove?: VoiceRemover,
): VoiceNotesController {
  const [notes, setNotes] = useState<ProductVoiceNotes>(DEFAULT_VOICE_NOTES);
  // The merge returns its input by IDENTITY when nothing moves, so this settles
  // in one pass instead of re-rendering forever.
  useEffect(() => {
    setNotes((cur) => fusionnerNotesStockees(cur, stockees));
  }, [stockees]);
  const [micDenied, setMicDenied] = useState(false);
  const [playingPid, setPlayingPid] = useState<string | null>(null);
  const [playingSec, setPlayingSec] = useState(0);
  /**
   * Which take the player is on, readable from inside a callback the PLAYER
   * owns. `playingPid` is captured stale by that closure — it still holds the
   * previous take when `play()` is called — so the ref is set eagerly at the
   * moment we decide, and cleared everywhere playback ends. A tick that arrives
   * after she has moved on must never drive another take's clock.
   */
  const playingPidRef = useRef<string | null>(null);
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
      if (playingPid === pid) {
        playingPidRef.current = null;
        await recorder.stopPlayback();
        setPlayingPid(null);
        setPlayingSec(0);
        return;
      }
      playingPidRef.current = pid;
      setPlayingSec(0);
      // …and when the take ENDS on its own, the button must come back to
      // « Écouter ». Without this callback it stayed « Pause » over silence
      // until she tapped it — the founder's second report.
      await recorder.play(
        url,
        () => {
          if (playingPidRef.current === pid) playingPidRef.current = null;
          setPlayingPid((cur) => (cur === pid ? null : cur));
          setPlayingSec(0);
        },
        // VOIX-ÉTAT-2 — the clock. Guarded on the pid so a tick from a take she
        // has already left cannot drive the number under the current one.
        (sec) => { if (playingPidRef.current === pid) setPlayingSec(sec); },
        /**
         * VOIX-CARTE — THE FAILURE ROAD (founder 2026-08-13: « when i tap to
         * listen back, i am not hearing anything »). A source that fails to
         * load reaches JS as nothing at all (expo-audio registers no error
         * listener), so the adapter detects it and this callback gives the
         * button back and tells her — instead of « Pause » over permanent
         * silence, which was his symptom. The IS_PREVIEW suffix is the same
         * diag pattern as `interrupted()` above: which detector fired, in
         * parentheses — diagnostic text, not product copy.
         */
        (stage) => {
          // A stale failure is NOT this listen's business (verifier,
          // 2026-08-13): if she already left — paused, or started another
          // take — the ref no longer names this pid, and a toast about the
          // abandoned load would land over whatever she is doing now.
          if (playingPidRef.current !== pid) return;
          playingPidRef.current = null;
          setPlayingPid((cur) => (cur === pid ? null : cur));
          setPlayingSec(0);
          onToast(IS_PREVIEW ? `${t('k.voix.lecture_echec')} (${stage})` : t('k.voix.lecture_echec'));
        },
      );
      setPlayingPid(pid);
    };
    return {
      notes,
      micDenied,
      playingPid,
      playingSec,
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
        if (playingPid === pid) {
          playingPidRef.current = null;
          void recorder.stopPlayback();
          setPlayingPid(null);
          setPlayingSec(0);
        }
        /**
         * ═══ IT REMOVES IT FROM HER SHOP, NOT ONLY FROM HER PHONE ═══
         *
         * This used to clear the local note and toast « Note supprimée. » with
         * nothing sent anywhere: buyers went on hearing the audio on the fiche,
         * and once the shop's own notes reached this controller the note
         * REAPPEARED on her screen at the next read. A button that says a thing
         * is gone must make it gone (founder, 2026-08-12).
         *
         * THE LOCAL CLEAR HAPPENS FIRST and is not conditional — she tapped it,
         * and a screen that argues with her tap while the network decides is the
         * opposite of calm. If the service refuses, the note comes back on the
         * next read (that merge is exactly what makes this safe) and she is told
         * plainly rather than left believing it is gone.
         */
        setNotes((cur) => deleteNote(cur, pid));
        if (remove === undefined) {
          onToast(t('k.voix.toast_supprimee'));
          return;
        }
        void remove(pid).then((r) => {
          onToast(t(r.ok ? 'k.voix.toast_supprimee' : 'k.voix.toast_suppr_echec'));
        });
      },
      retryPermission: () => {
        void recorder.requestPermission().then((p) => setMicDenied(p === 'denied'));
      },
    };
    // `playingSec` IS A DEPENDENCY, and leaving it out cost the whole fix.
    // Nothing else in this list changes during a take — `notes` and `micDenied`
    // are untouched, `playingPid` is fixed for the take, `recorder` is a stable
    // hook object, `onToast` is a setState, `upload` a useCallback — so every
    // `setPlayingSec(n)` re-rendered and this memo handed back the CACHED
    // controller with the old value. The clock read « 0:00 » for the entire
    // note: worse than the frozen total it replaced. There is no eslint in this
    // workspace, so `react-hooks/exhaustive-deps` never ran; the source pin in
    // test/voice.test.ts is what stands in its place.
  }, [notes, micDenied, playingPid, playingSec, recorder, onToast, upload, remove]);
}

/** The card label for a product's note — drives the mic affordance text. */
export function voiceCardLabel(note: ProductVoiceNote | undefined): string {
  const st = note?.status ?? 'none';
  // `ready` USED TO SHARE THE « en attente » SENTENCE with `pending`, so a note
  // the service had already stored still read as waiting — the second half of
  // the founder's report (« it does not show as a recorded audio »). They are
  // different facts and now say different things: queued vs live.
  if (st === 'ready') return t('k.voix.carte_en_ligne');
  if (st === 'pending') return t('k.voix.carte_en_attente');
  if (st === 'recorded') return t('k.voix.carte_a_publier');
  return t('k.voix.carte_ajouter');
}

/* ------------------------------------------------------- the controls ---- */

export function PlayBtn({ playing, onPress }: { playing: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable style={({ pressed }) => [S.vPlayBtn, pressed && S.pressed]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: playing }}>
      {playing ? <IconPauseK size={15} color="#1C1710" /> : <IconPlayK size={15} color="#1C1710" />}
      <Text style={S.vGhostText}>{t(playing ? 'k.voix.pause' : 'k.voix.ecouter')}</Text>
    </Pressable>
  );
}

/**
 * VOIX-CARTE (founder 2026-08-13: « i want it to display with play and pause
 * button attach to the product and with a button at the end right for redo
 * it ») — the player ON the Ma Vitrine card, for a note that exists. Play /
 * pause and the clock are the sheet's own controls re-composed (same PlayBtn,
 * same horloge expression); « Refaire » sits at the row's right edge. What
 * redoing MEANS is the App's decision (`onRefaire` opens the sheet AND starts
 * the take) — a Refaire that did not actually redo would be a two-tap lie.
 * Publier and Supprimer stay sheet-only; the strip above this row opens it.
 */
export function VoiceCardRow({
  pid,
  ctl,
  onRefaire,
}: {
  pid: string;
  ctl: VoiceNotesController;
  onRefaire: () => void;
}): React.ReactElement {
  const n = noteOf(ctl.notes, pid);
  const playing = ctl.playingPid === pid;
  const horloge = fmtVoiceDuration(playing ? ctl.playingSec * 1000 : n.durationMs);
  return (
    <View style={S.vActions}>
      {n.url ? <PlayBtn playing={playing} onPress={() => ctl.playRec(pid, n.url!)} /> : null}
      <Text style={S.vDur}>{horloge}</Text>
      <Pressable
        style={({ pressed }) => [S.vGhost, S.vCarteRefaire, ctl.anyRecording && S.ctaDisabled, pressed && !ctl.anyRecording && S.pressed]}
        disabled={ctl.anyRecording}
        onPress={onRefaire}
        accessibilityRole="button"
        accessibilityState={{ disabled: ctl.anyRecording }}
        accessibilityLabel={t('k.voix.refaire_note')}
      >
        <Text style={S.vGhostText}>{t('k.voix.refaire')}</Text>
      </Pressable>
    </View>
  );
}

/** The per-product controls — state machine surfaced (record → recorded →
 * publish; re-record + delete + real playback). Shared by the sheet. */
export function VoiceNoteControls({ pid, ctl }: { pid: string; ctl: VoiceNotesController }): React.ReactElement {
  const n = noteOf(ctl.notes, pid);
  const kept = n.status === 'pending' || n.status === 'ready';
  const playing = ctl.playingPid === pid;
  /**
   * VOIX-ÉTAT-2 — WHILE IT PLAYS, the clock is the POSITION; at rest it is the
   * TOTAL she recorded. Both controls used to print the total unconditionally,
   * so the number never moved and « did that actually start? » had no answer.
   */
  const horloge = fmtVoiceDuration(playing ? ctl.playingSec * 1000 : n.durationMs);
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
              <Text style={S.vEcouteDur}>{horloge}</Text>
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
          {/**
            * ═══ QUEUED AND LIVE ARE DIFFERENT FACTS, HERE TOO (verifier BLOCKER) ═══
            *
            * `voiceCardLabel` was taught the difference and this block was not,
            * so the CARD said « Note vocale en ligne » and the sheet she opens
            * to listen — one tap below it — answered « En attente » over a note
            * the service had been serving to buyers for a day. The screen
            * contradicted itself about the state of her own shop, which is the
            * founder's report still on screen after its fix.
            *
            * Ten-Laws #7 is « queued = pending, never done ». Saying done is
            * queued is the same rule broken from the other side, and it is the
            * one that makes her doubt a shop that is working.
            */}
          <View style={n.status === 'ready' ? S.vLivePill : S.vPendingPill}>
            <Text style={n.status === 'ready' ? S.vLiveText : S.vPendingText}>
              {t(n.status === 'ready' ? 'k.voix.en_ligne' : 'k.voix.en_attente')}
            </Text>
          </View>
          <View style={S.vActions}>
            {n.url ? <PlayBtn playing={playing} onPress={() => ctl.playRec(pid, n.url!)} /> : null}
            <Text style={S.vDur}>{horloge}</Text>
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
              {/* The same split as the pill: the « nothing is sent until the
                * network returns » half is true of a QUEUED note and false of a
                * live one, and printing it under a live note is what told her
                * the shop was waiting when it was not. */}
              <Text style={S.noteSableText}>
                {t(noteOf(ctl.notes, product.pid).status === 'ready' ? 'k.voix.note_en_ligne' : 'k.voix.note')}
              </Text>
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
