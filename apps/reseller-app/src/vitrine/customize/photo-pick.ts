import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';

/**
 * PERSONNALISER-MEDIA-1 — THE REAL PHOTO, from her phone.
 *
 * Before this, K3's cover was a `setTimeout` cycle: none → uploading → pending →
 * live, with no file ever chosen and no bytes ever sent. The app had no image
 * picker dependency at all, so photo capture was not broken — it did not exist.
 *
 * WHY THE GALLERY AND NOT THE CAMERA (recommendation, founder-approved): the
 * gallery needs one permission and no viewfinder, and every phone already holds
 * the photos she took of her own goods. The camera is a later, separate act.
 *
 * WHY BYTES AND NOT A URI: the service must see the FILE — it validates the real
 * type from the magic bytes (never the caller's content-type), the byte cap and
 * the dimension box before storing. A URI would make the app the authority on
 * what it uploaded, which is the shape this project refuses everywhere.
 *
 * EVERY FAILURE IS NAMED (the voice-note lesson — a generic « interrompu » toast
 * cost the founder an evening): refused permission, her own cancel, and an
 * unreadable file are three different things to say, so they stay three values.
 */
export type PickOutcome =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly contentType: string }
  | { readonly ok: false; readonly reason: 'refused' | 'cancelled' | 'unreadable' };

/** Quality is a DESIGN choice, not a default: a market phone on patchy data
 *  should not push a 6 MB original through the network, and the service's own
 *  byte cap would refuse it anyway. 0.7 keeps a cover honest at a fraction. */
const QUALITY = 0.7;

export async function pickPhoto(): Promise<PickOutcome> {
  // ASK FIRST, and treat a refusal as a REFUSAL — never as a failure. She is
  // allowed to say no, and the screen should say what happened, not apologise.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'refused' };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: QUALITY,
    allowsMultipleSelection: false,
  });
  if (picked.canceled) return { ok: false, reason: 'cancelled' };
  const asset = picked.assets[0];
  if (asset === undefined) return { ok: false, reason: 'cancelled' };

  try {
    const bytes = await new File(asset.uri).bytes();
    if (bytes.length === 0) return { ok: false, reason: 'unreadable' };
    // The declared type is a HINT the service does not trust: it reads the real
    // format from the magic bytes. Sent so the request is well-formed, never as
    // the authority on what these bytes are.
    return { ok: true, bytes, contentType: asset.mimeType ?? 'image/jpeg' };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
