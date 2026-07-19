/**
 * PERSONNALISATION — K1…K7 (+K2b/K3b states), HANDOFF §5, Shop+ chrome §1.3.
 *
 * Values are the Phase-0 table's bytes (bp-K* blueprints): row 64/pad 10 16/
 * icon 38 r12 #F8E4EC/#701134, titles IS700 14.5, subs IS400 12 #6F6355,
 * theme cards r18 with the woven band, selected border 2 #A31D4E + check 26,
 * counted fields r14 border 1.5 #E5DCC9 focus #A31D4E, K5 rows 62, pills 9/800.
 * The dock is hidden by construction ('personnaliser' is not a HUB screen).
 *
 * RN-medium adaptations (documented in the Phase-4 audit — the PIXEL surface
 * is the buyer web; K is chrome on the reseller device):
 *  - woven bands render as striped Views (RN core has no CSS gradients);
 *  - cover art states use the soft/sand fills + monogram, no rayures pattern;
 *  - IS-800 pills map to the Bold(700) face — the planche's variable font
 *    clamps at 700 anyway (Instrument ships no 800);
 *  - the camera and star row glyphs are SVG (no-emoji gate); « Aa ◐ ≡ » stay text (lawful).
 *
 * §8.10: K7 is READ-ONLY — a product tap toasts, never navigates.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { t, tf } from '../../i18n';
import {
  COVER_UPLOAD_MS,
  COVER_VERIFY_MS,
  DEFAULT_STOREFRONT,
  FEATURED_CAP,
  NAME_MIN,
  SECTIONS_CAP,
  THEMES,
  coverTo,
  createSection,
  deleteSection,
  moveItem,
  renameSection,
  saveIdentity,
  setTheme,
  toggleSectionPid,
  togglePin,
  type Storefront,
  type VitrineThemeKey,
} from './storefront';



import { formatFcfa } from '../../earnings';
import { K_SEED } from './storefront';
import { K_RAW_STYLES } from './k-styles';
import {
  DEFAULT_VOICE_NOTES,
  fmtVoiceDuration,
  noteOf,
  startRecording,
  stopRecording,
  publishNote,
  cancelRecording,
  deleteNote,
  type ProductVoiceNotes,
} from './voice';
import { useVoiceCapture } from './voice-capture';
/** ONE money source — the app's canonical formatter (U+202F+FCFA, re-pin site). */
export const fmtFcfa = formatFcfa;

const SHOP = { accent: '#A31D4E', deep: '#701134', soft: '#F8E4EC' }; // §1.3 chrome fixe
const GOLD_K = '#E0A11B'; // §1.3 liseré or (K chrome)
const GOLD_BUYER = '#C89A3F';

type KRoute = 'k1' | 'k2' | 'k3' | 'k4' | 'k5' | 'k6' | 'k6b' | 'k7' | 'k8';

export interface CustomizeProps {
  onClose: () => void;
  onToast: (msg: string) => void;
  storefront?: Storefront;
  onStorefrontChange?: (sf: Storefront) => void;
}

/* -------------------------------------------------------------- helpers -- */

function IconCamera({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.4-2h5.8l1.4 2h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <Circle cx={12} cy={12.2} r={3.4} />
    </Svg>
  );
}

function IconStarK({ size, filled }: { size: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? SHOP.accent : 'none'} stroke={filled ? SHOP.accent : '#8A7D6B'} strokeWidth={1.8} strokeLinejoin="round">
      <Path d="M12 3.4l2.7 5.4 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.7l6-.9z" />
    </Svg>
  );
}

function IconEye({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  );
}

function IconBackK({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1C1710" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14.5 6l-6 6 6 6" />
    </Svg>
  );
}

function IconCheckK({ size, color, width = 2.8 }: { size: number; color: string; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

function IconDevantureK({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4.5 9.5L5.8 5h12.4l1.3 4.5" />
      <Path d="M5.5 9.5V19h13V9.5" />
      <Path d="M10 19v-5.5h4V19" />
    </Svg>
  );
}

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

/** Woven band — the §1.2/§1.3 liseré as striped Views (RN adaptation). */
export function WovenBand({ accent, gold, height }: { accent: string; gold: string; height: number }) {
  const seq: { c: string; w: number }[] = [];
  for (let i = 0; i < 12; i++) {
    seq.push({ c: accent, w: 18 }, { c: '#F4EFE6', w: 6 }, { c: gold, w: 8 }, { c: '#F4EFE6', w: 6 });
  }
  return (
    <View style={{ height, flexDirection: 'row', overflow: 'hidden' }}>
      {seq.map((s, i) => (
        <View key={i} style={{ width: s.w, height, backgroundColor: s.c }} />
      ))}
    </View>
  );
}

function KHeader({ title, onBack, pill }: { title: string; onBack: () => void; pill?: React.ReactNode }) {
  return (
    <View style={S.header}>
      <Pressable style={({ pressed }) => [S.backBtn, pressed && S.pressed]} onPress={onBack} accessibilityRole="button" accessibilityLabel={t('k.retour')}>
        <IconBackK size={17} />
      </Pressable>
      <Text style={S.headerTitle} numberOfLines={1}>{title}</Text>
      {pill}
    </View>
  );
}

/* ------------------------------------------------------------- the stack -- */

export function CustomizeStack({ onClose, onToast, storefront, onStorefrontChange }: CustomizeProps) {
  const [route, setRoute] = useState<KRoute>('k1');
  const [sf, setSfRaw] = useState<Storefront>(storefront ?? DEFAULT_STOREFRONT);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  // Per-product voice notes — a LOCAL structure PARALLEL to the storefront (canon
  // has no shape yet, and its schema is .strict() — a note field on `sf` would
  // fail conformance). Capture is REAL on-device (expo-audio); persistence stays
  // mocked (publish → pending). The pure reducer owns every transition.
  const [notes, setNotes] = useState<ProductVoiceNotes>(DEFAULT_VOICE_NOTES);
  const [micDenied, setMicDenied] = useState(false);
  const [playingPid, setPlayingPid] = useState<string | null>(null);
  const recorder = useVoiceCapture();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const voiceCount = Object.values(notes).filter((n) => n.status !== 'none' && n.status !== 'recording').length;

  const setSf = (next: Storefront): void => {
    setSfRaw(next);
    onStorefrontChange?.(next);
  };
  const th = THEMES[sf.theme];

  /** K3 [DEMO] — §4.4: none→uploading 1 400 ms→pending 2 600 ms→live. */
  const simulateUpload = (): void => {
    setSf(coverTo(sf, 'uploading'));
    timers.current.push(
      setTimeout(() => {
        setSfRaw((cur) => {
          const next = coverTo(cur, 'pending');
          onStorefrontChange?.(next);
          return next;
        });
        timers.current.push(
          setTimeout(() => {
            setSfRaw((cur) => {
              const next = coverTo(cur, 'live');
              onStorefrontChange?.(next);
              return next;
            });
            onToast(t('k.cover.toast_en_ligne'));
          }, COVER_VERIFY_MS),
        );
      }, COVER_UPLOAD_MS),
    );
  };

  // Notes vocales — REAL capture, one product at a time. Async takes land via a
  // functional setState so a stale closure can never overwrite a later state.
  // Permission denial and a mid-record interruption are both designed states.
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
      // Mid-record interruption (call, focus loss): drop the partial, honestly.
      setNotes((cur) => cancelRecording(cur, pid));
      onToast(t('k.voix.interrompu'));
    }
  };
  const cancelRec = (pid: string): void => {
    void recorder.stop().catch(() => undefined);
    setNotes((cur) => cancelRecording(cur, pid));
  };
  const playRec = async (pid: string, url: string): Promise<void> => {
    if (playingPid === pid) { await recorder.stopPlayback(); setPlayingPid(null); return; }
    await recorder.play(url); // her own take, local file — real playback
    setPlayingPid(pid);
  };
  const publishRec = (pid: string): void => {
    setNotes((cur) => publishNote(cur, pid));
    onToast(t('k.voix.toast_publiee')); // honesty: « publiée dès que le réseau revient », never « en ligne »
  };
  const deleteRec = (pid: string): void => {
    if (playingPid === pid) { void recorder.stopPlayback(); setPlayingPid(null); }
    setNotes((cur) => deleteNote(cur, pid));
    onToast(t('k.voix.toast_supprimee'));
  };
  const retryPermission = (): void => {
    void recorder.requestPermission().then((p) => setMicDenied(p === 'denied'));
  };

  const back = (): void => {
    if (route === 'k1') onClose();
    else if (route === 'k6b') setRoute('k6');
    else setRoute('k1');
  };

  return (
    <View style={S.root}>
      {route === 'k1' && <K1 sf={sf} th={th} voiceCount={voiceCount} onBack={onClose} go={setRoute} />}
      {route === 'k2' && (
        <K2
          sf={sf}
          onBack={back}
          onSave={(patch) => {
            const r = saveIdentity(sf, patch);
            if (r.ok) {
              setSf(r.next);
              onToast(t(r.toastKey ?? 'k.toast_enregistre'));
              setRoute('k1');
            }
          }}
        />
      )}
      {route === 'k3' && (
        <K3
          sf={sf}
          onBack={back}
          onSimulate={simulateUpload}
          onSimulateError={() => setSf(coverTo(sf, 'error'))}
          onRetire={() => {
            setSf(coverTo(sf, 'none'));
            onToast(t('k.cover.toast_retiree'));
          }}
          onRetry={() => setSf(coverTo(sf, 'none'))}
        />
      )}
      {route === 'k4' && (
        <K4
          sf={sf}
          onBack={back}
          onPick={(key) => {
            setSf(setTheme(sf, key));
            onToast(tf('k.theme.toast', { nom: THEMES[key].name }));
          }}
        />
      )}
      {route === 'k5' && (
        <K5
          sf={sf}
          onBack={back}
          onPin={(pid, inStock) => {
            const r = togglePin(sf, pid, inStock);
            if (r.ok) setSf(r.next);
            else onToast(t(r.toastKey));
          }}
          onMove={(pid, dir) => setSf(moveItem(sf, pid, dir))}
        />
      )}
      {route === 'k6' && (
        <K6
          sf={sf}
          onBack={back}
          onCreate={() => {
            const r = createSection(sf, `s${Date.now()}`, t('k.sections.nouvelle'));
            if (r.ok) {
              setSf(r.next);
              setEditingSection(r.next.sections[r.next.sections.length - 1]!.id);
              setRoute('k6b');
            } else onToast(t(r.toastKey));
          }}
          onEdit={(id) => {
            setEditingSection(id);
            setRoute('k6b');
          }}
        />
      )}
      {route === 'k6b' && editingSection && (
        <K6b
          sf={sf}
          sectionId={editingSection}
          onBack={() => setRoute('k6')}
          onRename={(name) => setSf(renameSection(sf, editingSection, name))}
          onTogglePid={(pid) => setSf(toggleSectionPid(sf, editingSection, pid))}
          onDelete={() => {
            const r = deleteSection(sf, editingSection);
            if (r.ok) {
              setSf(r.next);
              onToast(t(r.toastKey ?? ''));
              setRoute('k6');
            }
          }}
        />
      )}
      {route === 'k7' && <ApercuCliente sf={sf} onBack={() => setRoute('k1')} onReadOnlyTap={() => onToast(t('k.apercu.lecture_toast'))} />}
      {route === 'k8' && (
        <K8
          notes={notes}
          micDenied={micDenied}
          playingPid={playingPid}
          onBack={back}
          onRecord={(pid) => void startRec(pid)}
          onStop={(pid) => void stopRec(pid)}
          onCancel={cancelRec}
          onPublish={publishRec}
          onDelete={deleteRec}
          onPlay={(pid, url) => void playRec(pid, url)}
          onRetryPermission={retryPermission}
        />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------- K1 -- */

function K1({ sf, th, voiceCount, onBack, go }: { sf: Storefront; th: (typeof THEMES)[VitrineThemeKey]; voiceCount: number; onBack: () => void; go: (r: KRoute) => void }) {
  const initial = sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase();
  const coverSub =
    sf.cover.status === 'live' ? t('k.row.cover_live') : sf.cover.status === 'pending' ? t('k.row.cover_pending') : t('k.row.cover_defaut');
  const rows: { key: KRoute; glyph: React.ReactNode; title: string; sub: string }[] = [
    { key: 'k2', glyph: <Text style={S.rowGlyphText}>Aa</Text>, title: t('k.row.identite'), sub: sf.tagline || t('k.row.identite_sub') },
    { key: 'k3', glyph: <IconCamera size={18} color={SHOP.deep} />, title: t('k.row.cover'), sub: coverSub },
    { key: 'k4', glyph: <Text style={S.rowGlyphText}>◐</Text>, title: t('k.row.theme'), sub: sf.theme === 'laterite' ? tf('k.row.theme_defaut', { nom: th.name }) : th.name },
    { key: 'k5', glyph: <IconStarK size={18} filled={false} />, title: t('k.row.une'), sub: tf('k.row.une_sub', { n: String(sf.featuredItems.length), total: String(K_SEED.length) }) },
    { key: 'k6', glyph: <Text style={S.rowGlyphText}>≡</Text>, title: t('k.row.sections'), sub: sf.sections.length === 0 ? t('k.row.sections_zero') : tf('k.row.sections_n', { n: String(sf.sections.length) }) },
    { key: 'k8', glyph: <IconMic size={18} color={SHOP.deep} />, title: t('k.voix.row'), sub: voiceCount === 0 ? t('k.voix.row_sub_zero') : tf('k.voix.row_sub_n', { n: String(voiceCount) }) },
  ];
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader
        title={t('k.title')}
        onBack={onBack}
        pill={
          <View style={[S.etatPill, sf.discoverable ? S.etatPillOk : S.etatPillNeutre]}>
            <View style={[S.etatDot, { backgroundColor: sf.discoverable ? '#14603A' : '#6F6355' }]} />
            <Text style={[S.etatPillText, { color: sf.discoverable ? '#14603A' : '#6F6355' }]}>{t(sf.discoverable ? 'k.etat_publiee' : 'k.etat_privee')}</Text>
          </View>
        }
      />
      {/* C-K1 — carte aperçu en direct */}
      <View style={S.previewCard}>
        <View style={[S.previewCover, { backgroundColor: th.soft }]}>
          <Text style={[S.previewFiligrane, { color: th.accent }]}>{initial}</Text>
        </View>
        <View style={S.previewBody}>
          <View style={[S.previewAvatar, { backgroundColor: th.accent }]}>
            <Text style={[S.previewAvatarText, { color: th.on }]}>{initial}</Text>
          </View>
          <View style={S.previewNameRow}>
            <Text style={S.previewName} numberOfLines={1}>{sf.name}</Text>
            <IconCheckK size={13} color={th.accent} />
          </View>
          {sf.tagline ? <Text style={S.previewTagline} numberOfLines={1}>{sf.tagline}</Text> : null}
          <View style={[S.previewChip, { backgroundColor: th.soft }]}>
            <Text style={[S.previewChipText, { color: th.deep }]}>{t('vit.chip_sera')}</Text>
          </View>
        </View>
      </View>
      <Text style={S.previewLegend}>{t('k.apercu_legende')}</Text>
      {/* C-K2 — la carte 5 rangées */}
      <View style={S.rowsCard}>
        {rows.map((r, i) => (
          <Pressable key={r.key} style={({ pressed }) => [S.row, i > 0 && S.rowDivider, pressed && S.pressed]} onPress={() => go(r.key)} accessibilityRole="button">
            <View style={S.rowGlyph}>{r.glyph}</View>
            <View style={S.rowBody}>
              <Text style={S.rowTitle}>{r.title}</Text>
              <Text style={S.rowSub} numberOfLines={1}>{r.sub}</Text>
            </View>
            <Text style={S.rowChevron}>›</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={({ pressed }) => [S.ghostBtn, pressed && S.pressed]} onPress={() => go('k7')} accessibilityRole="button">
        <IconEye size={17} color="#1C1710" />
        <Text style={S.ghostBtnText}>{t('k.voir_cliente')}</Text>
      </Pressable>
      {/* bande encre — jamais modifiable */}
      <View style={S.inkBand}>
        <Text style={S.inkBandText}>
          <Text style={S.inkBandBold}>{t('k.jamais_titre')}</Text> {tf('k.jamais_corps', { slug: `/v/${sf.slug}` })}
        </Text>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------- K2 / K2b -- */

function K2({ sf, onBack, onSave }: { sf: Storefront; onBack: () => void; onSave: (p: { name: string; tagline: string; bio: string }) => void }) {
  const [name, setName] = useState(sf.name);
  const [tagline, setTagline] = useState(sf.tagline);
  const [bio, setBio] = useState(sf.bio);
  const nameInvalid = name.trim().length < NAME_MIN; // K2b state
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader title={t('k.identite.title')} onBack={onBack} />
      <CountedField label={t('k.identite.nom_label')} value={name} max={24} onChange={setName} invalid={nameInvalid} invalidNote={t('k.identite.nom_requis')} />
      <CountedField label={t('k.identite.tagline_label')} value={tagline} max={40} onChange={setTagline} placeholder={t('k.identite.tagline_ph')} />
      <CountedField label={t('k.identite.bio_label')} value={bio} max={160} onChange={setBio} placeholder={t('k.identite.bio_ph')} multiline />
      <View style={S.noteRose}>
        <Text style={S.noteRoseText}>{tf('k.identite.note_slug', { slug: `/v/${sf.slug}` })}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [S.cta, nameInvalid && S.ctaDisabled, pressed && !nameInvalid && S.pressed]}
        disabled={nameInvalid}
        onPress={() => onSave({ name, tagline, bio })}
        accessibilityRole="button"
        accessibilityState={{ disabled: nameInvalid }}
      >
        <Text style={[S.ctaText, nameInvalid && S.ctaTextDisabled]}>{t('k.enregistrer')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function CountedField({ label, value, max, onChange, placeholder, multiline, invalid, invalidNote }: { label: string; value: string; max: number; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; invalid?: boolean; invalidNote?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={S.field}>
      <View style={S.fieldHead}>
        <Text style={S.fieldLabel}>{label}</Text>
        <Text style={[S.fieldCount, value.length >= max && S.fieldCountLimit]}>{value.length}/{max}</Text>
      </View>
      <TextInput
        style={[S.fieldInput, multiline && S.fieldInputMulti, focused && S.fieldInputFocus, invalid && S.fieldInputError]}
        value={value}
        maxLength={max}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#8A7D6B"
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {invalid && invalidNote ? <Text style={S.fieldError}>{invalidNote}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------- K3 / K3b -- */

function K3({ sf, onBack, onSimulate, onSimulateError, onRetire, onRetry }: { sf: Storefront; onBack: () => void; onSimulate: () => void; onSimulateError: () => void; onRetire: () => void; onRetry: () => void }) {
  const st = sf.cover.status;
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader title={t('k.cover.title')} onBack={onBack} />
      <Text style={S.caps}>{t('k.cover.caps')}</Text>
      {/* C-K4 — le slot 5 états */}
      {st === 'none' && (
        <View style={[S.coverSlot, S.coverSlotDashed]}>
          <IconCamera size={26} color={SHOP.accent} />
          <Text style={S.coverAddText}>{t('k.cover.ajouter')}</Text>
          <Text style={S.coverSpecs}>{t('k.cover.specs')}</Text>
        </View>
      )}
      {st === 'uploading' && (
        <View style={[S.coverSlot, S.coverSlotFilled]}>
          <Text style={S.coverCapsState}>{t('k.cover.envoi')}</Text>
          <View style={S.coverTrack}><View style={S.coverBar} /></View>
        </View>
      )}
      {(st === 'pending' || st === 'live') && (
        <View style={[S.coverSlot, S.coverSlotPhoto]}>
          <View style={[S.pill, st === 'pending' ? S.pillWarn : S.pillOk]}>
            <Text style={[S.pillText, { color: st === 'pending' ? '#7A5104' : '#14603A' }]}>{t(st === 'pending' ? 'k.cover.pilule_verif' : 'k.cover.pilule_ligne')}</Text>
          </View>
        </View>
      )}
      {st === 'error' && (
        <View style={[S.coverSlot, S.coverSlotError]}>
          <Text style={S.coverErrTitle}>{t('k.cover.err_titre')}</Text>
          <Text style={S.coverErrBody}>{t('k.cover.err_corps')}</Text>
          <Pressable style={({ pressed }) => [S.ghostSmall, pressed && S.pressed]} onPress={onRetry}><Text style={S.ghostSmallText}>{t('k.cover.reessayer')}</Text></Pressable>
        </View>
      )}
      {st === 'none' && <View style={S.noteSable}><Text style={S.noteSableText}>{t('k.cover.note_defaut')}</Text></View>}
      {st === 'pending' && <View style={S.noteWarn}><Text style={S.noteWarnText}>{t('k.cover.note_verif')}</Text></View>}
      {st === 'live' && (
        <Pressable style={({ pressed }) => [S.ghostSmall, pressed && S.pressed]} onPress={onRetire}>
          <Text style={S.ghostSmallText}>{t('k.cover.retirer')}</Text>
        </Pressable>
      )}
      {/* [DEMO] — the §4.4 simulated cycle, honestly labelled */}
      {(st === 'none' || st === 'error') && (
        <View style={S.demoRow}>
          <Pressable style={({ pressed }) => [S.demoBtn, pressed && S.pressed]} onPress={onSimulate}><Text style={S.demoBtnText}>{t('k.cover.demo_envoi')}</Text></Pressable>
          {st === 'none' && (
            <Pressable style={({ pressed }) => [S.demoBtn, pressed && S.pressed]} onPress={onSimulateError}><Text style={S.demoBtnText}>{t('k.cover.demo_lourde')}</Text></Pressable>
          )}
        </View>
      )}
      <Text style={[S.caps, S.capsGap]}>{t('k.portrait.caps')}</Text>
      {/* C-K5 — segments portrait */}
      <PortraitSegments sf={sf} />
    </ScrollView>
  );
}

function PortraitSegments({ sf }: { sf: Storefront }) {
  const [mode, setMode] = useState<'monogram' | 'photo'>(sf.avatar.mode);
  const th = THEMES[sf.theme];
  const initial = sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase();
  return (
    <View>
      <View style={S.segTrack}>
        {(['monogram', 'photo'] as const).map((m) => (
          <Pressable key={m} style={[S.segBtn, mode === m && S.segBtnActive]} onPress={() => setMode(m)} accessibilityRole="button" accessibilityState={{ selected: mode === m }}>
            <Text style={[S.segText, mode === m && S.segTextActive]}>{t(m === 'monogram' ? 'k.portrait.monogramme' : 'k.portrait.photo')}</Text>
          </Pressable>
        ))}
      </View>
      {mode === 'monogram' ? (
        <View style={S.portraitRow}>
          <View style={[S.portraitDisc, { backgroundColor: th.accent }]}>
            <Text style={[S.portraitDiscText, { color: th.on }]}>{initial}</Text>
          </View>
          <Text style={S.portraitNote}>{t('k.portrait.note_monogramme')}</Text>
        </View>
      ) : (
        <View style={S.portraitRow}>
          <View style={S.portraitSlotDashed}>
            <IconCamera size={20} color="#8A7D6B" />
          </View>
          <Text style={S.portraitNote}>{t('k.portrait.note_photo')}</Text>
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------- K4 -- */

function K4({ sf, onBack, onPick }: { sf: Storefront; onBack: () => void; onPick: (k: VitrineThemeKey) => void }) {
  const ORDER: VitrineThemeKey[] = ['laterite', 'danfani', 'indigo', 'foret'];
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader title={t('k.theme.title')} onBack={onBack} />
      <Text style={S.caps}>{t('k.theme.caps')}</Text>
      <View style={S.themeGrid}>
        {ORDER.map((key) => {
          const th = THEMES[key];
          const selected = sf.theme === key;
          return (
            <Pressable key={key} style={[S.themeCard, selected ? S.themeCardSelected : S.themeCardRest]} onPress={() => onPick(key)} accessibilityRole="button" accessibilityState={{ selected }}>
              <WovenBand accent={th.accent} gold={GOLD_BUYER} height={10} />
              <View style={S.themeSwatches}>
                <View style={[S.swatch, { backgroundColor: th.accent }]} />
                <View style={[S.swatch, { backgroundColor: th.deep }]} />
                <View style={[S.swatch, { backgroundColor: th.soft }]} />
              </View>
              <View style={S.themeNameRow}>
                <Text style={S.themeName}>{th.name}</Text>
                {key === 'laterite' && (
                  <View style={S.defautPill}><Text style={S.defautPillText}>{t('k.theme.defaut')}</Text></View>
                )}
              </View>
              {selected && (
                <View style={S.themeCheck}>
                  <IconCheckK size={14} color="#FCF4EE" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={S.noteCard}><Text style={S.noteCardText}>{t('k.theme.note')}</Text></View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------- K5 -- */

function K5({ sf, onBack, onPin, onMove }: { sf: Storefront; onBack: () => void; onPin: (pid: string, inStock: boolean) => void; onMove: (pid: string, dir: -1 | 1) => void }) {
  const ordered = sf.curatedItems.map((pid) => K_SEED.find((p) => p.pid === pid)!).filter(Boolean);
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader
        title={t('k.une.title')}
        onBack={onBack}
        pill={<View style={[S.etatPill, S.etatPillNeutre]}><Text style={S.etatPillText}>{tf('k.une.pill', { n: String(sf.featuredItems.length), cap: String(FEATURED_CAP) })}</Text></View>}
      />
      <Text style={S.subTitle}>{t('k.une.sous_titre')}</Text>
      <View style={S.rowsCard}>
        {ordered.map((p, i) => {
          const pinned = sf.featuredItems.includes(p.pid);
          return (
            <View key={p.pid} style={[S.orderRow, i > 0 && S.rowDivider, !p.inStock && S.orderRowEpuise]}>
              <Text style={S.grip}>≡</Text>
              <View style={S.orderArt} />
              <View style={S.rowBody}>
                <View style={S.orderNameRow}>
                  <Text style={S.orderName} numberOfLines={1}>{p.name}</Text>
                  {pinned && <View style={S.unePill}><Text style={S.unePillText}>{t('k.une.pilule')}</Text></View>}
                  {!p.inStock && <View style={S.epuisePill}><Text style={S.epuisePillText}>{t('vit.epuise')}</Text></View>}
                </View>
                <Text style={S.orderPrice}>{fmtFcfa(p.priceFcfa)}</Text>
              </View>
              <Pressable style={({ pressed }) => [S.arrowBtn, pressed && S.pressed]} onPress={() => onMove(p.pid, -1)} accessibilityRole="button" accessibilityLabel={t('k.une.monter')}>
                <Text style={S.arrowText}>▲</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [S.arrowBtn, pressed && S.pressed]} onPress={() => onMove(p.pid, 1)} accessibilityRole="button" accessibilityLabel={t('k.une.descendre')}>
                <Text style={S.arrowText}>▼</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [S.starBtn, pinned && S.starBtnPinned, pressed && S.pressed]} onPress={() => onPin(p.pid, p.inStock)} accessibilityRole="button" accessibilityState={{ selected: pinned }}>
                <IconStarK size={17} filled={pinned} />
              </Pressable>
            </View>
          );
        })}
      </View>
      <View style={S.noteSable}><Text style={S.noteSableText}>{t('k.une.note_epuise')}</Text></View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------- K8 -- */

/** K8 — Notes vocales (per-product). Optional per article; record → recorded →
 * publish (lands on « en attente », never « en ligne » — honesty law); re-record
 * and delete from any state. Capture + playback are REAL on-device (expo-audio):
 * she records her own voice and plays her take back. Permission denial and a
 * mid-record interruption are designed states. Persistence stays mocked. */
function K8({
  notes,
  micDenied,
  playingPid,
  onBack,
  onRecord,
  onStop,
  onCancel,
  onPublish,
  onDelete,
  onPlay,
  onRetryPermission,
}: {
  notes: ProductVoiceNotes;
  micDenied: boolean;
  playingPid: string | null;
  onBack: () => void;
  onRecord: (pid: string) => void;
  onStop: (pid: string) => void;
  onCancel: (pid: string) => void;
  onPublish: (pid: string) => void;
  onDelete: (pid: string) => void;
  onPlay: (pid: string, url: string) => void;
  onRetryPermission: () => void;
}) {
  const anyRecording = Object.values(notes).some((n) => n.status === 'recording');
  const PlayBtn = ({ pid, url }: { pid: string; url: string }): React.ReactElement => {
    const playing = playingPid === pid;
    return (
      <Pressable style={({ pressed }) => [S.vPlayBtn, pressed && S.pressed]} onPress={() => onPlay(pid, url)} accessibilityRole="button" accessibilityState={{ selected: playing }}>
        {playing ? <IconPauseK size={15} color="#1C1710" /> : <IconPlayK size={15} color="#1C1710" />}
        <Text style={S.vGhostText}>{t(playing ? 'k.voix.pause' : 'k.voix.ecouter')}</Text>
      </Pressable>
    );
  };
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader title={t('k.voix.title')} onBack={onBack} />
      <Text style={S.subTitle}>{t('k.voix.sous_titre')}</Text>
      {micDenied && (
        <View style={S.vDeniedBanner}>
          <Text style={S.vDeniedText}>{t('k.voix.micro_refuse')}</Text>
          <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={onRetryPermission} accessibilityRole="button">
            <Text style={S.vGhostText}>{t('k.voix.reessayer')}</Text>
          </Pressable>
        </View>
      )}
      <View style={S.rowsCard}>
        {K_SEED.map((p, i) => {
          const n = noteOf(notes, p.pid);
          const kept = n.status === 'pending' || n.status === 'ready';
          return (
            <View key={p.pid} style={[S.vCard, i > 0 && S.rowDivider]}>
              <View style={S.vHead}>
                <View style={S.vArt} />
                <View style={S.rowBody}>
                  <Text style={S.vName} numberOfLines={1}>{p.name}</Text>
                  <Text style={S.vPrice}>{fmtFcfa(p.priceFcfa)}</Text>
                </View>
                {kept && <View style={S.vPendingPill}><Text style={S.vPendingText}>{t('k.voix.en_attente')}</Text></View>}
              </View>

              {n.status === 'none' && (
                <Pressable
                  style={({ pressed }) => [S.vRecBtn, anyRecording && S.ctaDisabled, pressed && !anyRecording && S.pressed]}
                  disabled={anyRecording}
                  onPress={() => onRecord(p.pid)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: anyRecording }}
                >
                  <IconMic size={17} color="#A31D4E" />
                  <Text style={S.vRecBtnText}>{t('k.voix.enregistrer')}</Text>
                </Pressable>
              )}

              {n.status === 'recording' && (
                <View style={S.vRecording}>
                  <View style={S.vRecDot} />
                  <Text style={S.vRecLabel}>{t('k.voix.en_cours')}</Text>
                  <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={() => onCancel(p.pid)} accessibilityRole="button">
                    <Text style={S.vGhostText}>{t('k.voix.annuler')}</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [S.vStopBtn, pressed && S.pressed]} onPress={() => onStop(p.pid)} accessibilityRole="button">
                    <Text style={S.vStopText}>{t('k.voix.arreter')}</Text>
                  </Pressable>
                </View>
              )}

              {n.status === 'recorded' && (
                <View style={S.vActions}>
                  {n.url ? <PlayBtn pid={p.pid} url={n.url} /> : null}
                  <Text style={S.vDur}>{fmtVoiceDuration(n.durationMs)}</Text>
                  <Pressable style={({ pressed }) => [S.vPublishBtn, pressed && S.pressed]} onPress={() => onPublish(p.pid)} accessibilityRole="button">
                    <Text style={S.vPublishText}>{t('k.voix.publier')}</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={() => onRecord(p.pid)} accessibilityRole="button">
                    <Text style={S.vGhostText}>{t('k.voix.refaire')}</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [S.vGhost, S.vDanger, pressed && S.pressed]} onPress={() => onDelete(p.pid)} accessibilityRole="button">
                    <Text style={[S.vGhostText, S.vDangerText]}>{t('k.voix.supprimer')}</Text>
                  </Pressable>
                </View>
              )}

              {kept && (
                <View style={S.vActions}>
                  {n.url ? <PlayBtn pid={p.pid} url={n.url} /> : null}
                  <Text style={S.vDur}>{fmtVoiceDuration(n.durationMs)}</Text>
                  <Pressable style={({ pressed }) => [S.vGhost, pressed && S.pressed]} onPress={() => onRecord(p.pid)} accessibilityRole="button">
                    <Text style={S.vGhostText}>{t('k.voix.refaire')}</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [S.vGhost, S.vDanger, pressed && S.pressed]} onPress={() => onDelete(p.pid)} accessibilityRole="button">
                    <Text style={[S.vGhostText, S.vDangerText]}>{t('k.voix.supprimer')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={S.noteSable}><Text style={S.noteSableText}>{t('k.voix.note')}</Text></View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------ K6 / K6b -- */

function K6({ sf, onBack, onCreate, onEdit }: { sf: Storefront; onBack: () => void; onCreate: () => void; onEdit: (id: string) => void }) {
  const full = sf.sections.length >= SECTIONS_CAP;
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader
        title={t('k.sections.title')}
        onBack={onBack}
        pill={<View style={[S.etatPill, S.etatPillNeutre]}><Text style={S.etatPillText}>{tf('k.sections.pill', { n: String(sf.sections.length), cap: String(SECTIONS_CAP) })}</Text></View>}
      />
      {sf.sections.length === 0 ? (
        <View style={S.dashedCard}>
          <Text style={S.dashedTitle}>{t('k.sections.zero_titre')}</Text>
          <Text style={S.dashedBody}>{t('k.sections.zero_corps')}</Text>
        </View>
      ) : (
        <View style={S.rowsCard}>
          {sf.sections.map((s, i) => (
            <Pressable key={s.id} style={({ pressed }) => [S.row, i > 0 && S.rowDivider, pressed && S.pressed]} onPress={() => onEdit(s.id)} accessibilityRole="button">
              <View style={S.rowBody}>
                <Text style={S.rowTitle}>{s.name}</Text>
                <Text style={S.rowSub}>{tf('k.sections.n_articles', { n: String(s.pids.length) })}</Text>
              </View>
              <Text style={S.rowChevron}>›</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Pressable style={({ pressed }) => [S.createBtn, full && S.ctaDisabled, pressed && !full && S.pressed]} disabled={full} onPress={onCreate} accessibilityRole="button" accessibilityState={{ disabled: full }}>
        <Text style={[S.createBtnText, full && S.ctaTextDisabled]}>{t(full ? 'k.sections.refus_cap' : 'k.sections.creer')}</Text>
      </Pressable>
      <View style={S.noteSable}><Text style={S.noteSableText}>{t('k.sections.note')}</Text></View>
    </ScrollView>
  );
}

function K6b({ sf, sectionId, onBack, onRename, onTogglePid, onDelete }: { sf: Storefront; sectionId: string; onBack: () => void; onRename: (name: string) => void; onTogglePid: (pid: string) => void; onDelete: () => void }) {
  const section = sf.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader title={t('k.section.title')} onBack={onBack} />
      <CountedField label={t('k.section.nom_label')} value={section.name} max={20} onChange={onRename} />
      <Text style={S.caps}>{t('k.section.articles_caps')}</Text>
      <View style={S.rowsCard}>
        {K_SEED.map((p, i) => {
          const checked = section.pids.includes(p.pid);
          return (
            <Pressable key={p.pid} style={({ pressed }) => [S.row, i > 0 && S.rowDivider, pressed && S.pressed]} onPress={() => onTogglePid(p.pid)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
              <View style={S.orderArt} />
              <View style={S.rowBody}><Text style={S.rowTitle} numberOfLines={1}>{p.name}</Text></View>
              <View style={[S.checkbox, checked && S.checkboxOn]}>
                {checked && <IconCheckK size={14} color="#FFFFFF" />}
              </View>
            </Pressable>
          );
        })}
      </View>
      {section.pids.length === 0 && <View style={S.noteSable}><Text style={S.noteSableText}>{t('k.section.note_vide')}</Text></View>}
      <Pressable style={({ pressed }) => [S.dangerGhost, pressed && S.pressed]} onPress={onDelete} accessibilityRole="button">
        <Text style={S.dangerGhostText}>{t('k.section.supprimer')}</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [S.cta, pressed && S.pressed]} onPress={onBack} accessibilityRole="button">
        <Text style={S.ctaText}>{t('k.enregistrer')}</Text>
      </Pressable>
    </ScrollView>
  );
}

/* -------------------------------------------------------------- K7 (vue) -- */

/** K7 — aperçu vue cliente (READ-ONLY, §8.10). Also mounted as the pubvitrine
 * screen's content (it replaces the old « Vitrine publique (aperçu) »). */
export function ApercuCliente({ sf, onBack, onReadOnlyTap }: { sf: Storefront; onBack: () => void; onReadOnlyTap: () => void }) {
  const th = THEMES[sf.theme];
  const initial = sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase();
  const sectioned = new Set(sf.sections.flatMap((s) => s.pids));
  const featured = sf.featuredItems.map((pid) => K_SEED.find((p) => p.pid === pid)!).filter((p) => p && p.inStock);
  const groups: { title: string; count: number; items: typeof K_SEED }[] = [];
  for (const s of sf.sections) {
    if (s.pids.length === 0) continue; // section vide = invisible côté cliente
    const items = s.pids.map((pid) => K_SEED.find((p) => p.pid === pid)!).filter(Boolean);
    groups.push({ title: s.name.toUpperCase(), count: items.length, items: [...items.filter((p) => p.inStock), ...items.filter((p) => !p.inStock)] });
  }
  const residual = sf.curatedItems.map((pid) => K_SEED.find((p) => p.pid === pid)!).filter((p) => p && !sectioned.has(p.pid));
  if (groups.length === 0 || residual.length > 0) {
    groups.push({ title: t('vit.groupe_tous'), count: residual.length, items: [...residual.filter((p) => p.inStock), ...residual.filter((p) => !p.inStock)] });
  }
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <View style={S.header}>
        <Pressable style={({ pressed }) => [S.backBtn, pressed && S.pressed]} onPress={onBack} accessibilityRole="button" accessibilityLabel={t('k.retour')}>
          <IconBackK size={17} />
        </Pressable>
        <Text style={S.apercuTitle} numberOfLines={1}>{t('k.apercu.title')}</Text>
        <View style={[S.etatPill, S.etatPillNeutre]}><Text style={S.etatPillText}>{t('k.apercu.lecture')}</Text></View>
      </View>
      <View style={[S.apercuCover, { backgroundColor: sf.cover.status === 'live' ? '#8A5A3A' : th.soft }]}>
        {sf.cover.status !== 'live' && <Text style={[S.previewFiligrane, { color: th.accent }]}>{initial}</Text>}
      </View>
      <View style={S.apercuIdentity}>
        <View style={[S.apercuAvatar, { backgroundColor: th.accent }]}>
          <Text style={[S.apercuAvatarText, { color: th.on }]}>{initial}</Text>
        </View>
        <View style={S.previewNameRow}>
          <Text style={S.apercuName}>{sf.name}</Text>
          <IconCheckK size={17} color={th.accent} width={2.6} />
        </View>
        {sf.tagline ? <Text style={S.previewTagline}>{sf.tagline}</Text> : null}
        <Text style={S.apercuZone}>{tf('k.apercu.verifiee', { zone: sf.zone })}</Text>
      </View>
      {featured.length > 0 && (
        <View>
          <Text style={S.caps}>{t('vit.a_la_une')}</Text>
          {featured.map((p) => (
            <Pressable key={p.pid} style={S.apercuFeatured} onPress={onReadOnlyTap} accessibilityRole="button">
              <View style={[S.apercuFeaturedArt, { backgroundColor: th.soft }]} />
              <View style={S.apercuFeaturedBody}>
                <Text style={S.apercuTileName}>{p.name}</Text>
                <Text style={[S.apercuTilePrice, { color: th.deep }]}>{fmtFcfa(p.priceFcfa)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {groups.map((g) => (
        <View key={g.title}>
          <View style={S.groupRow}>
            <Text style={S.caps}>{g.title}</Text>
            <Text style={S.groupCount}>· {g.count}</Text>
          </View>
          <View style={S.apercuGrid}>
            {g.items.map((p) => (
              <Pressable key={p.pid} style={S.apercuTile} onPress={onReadOnlyTap} accessibilityRole="button">
                <View style={[S.apercuTileArt, { backgroundColor: th.soft }]}>
                  {!p.inStock && (
                    <View style={S.apercuVeil}><Text style={S.apercuTampon}>{t('vit.epuise')}</Text></View>
                  )}
                </View>
                <Text style={S.apercuTileName} numberOfLines={2}>{p.name}</Text>
                <Text style={[S.apercuTilePrice, !p.inStock ? S.apercuPriceEpuise : { color: th.deep }]}>{fmtFcfa(p.priceFcfa)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <View style={S.inkBand}><Text style={S.inkBandText}>{t('vit.bande_apercu')}</Text></View>
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- styles -- */
/** Exported for the property tests — values are the Phase-0 table's bytes
 * (bp-K1…K7 blueprints); the test pins its own independently-derived literals. */
export const S = StyleSheet.create(K_RAW_STYLES as unknown as Record<keyof typeof K_RAW_STYLES, ViewStyle & TextStyle>);

