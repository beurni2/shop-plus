import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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
 *
 * ═══ MEDIA-2 — THE DOWNSCALE IS WHAT MAKES THIS WORK AT ALL (blocker) ═══
 *
 * MEDIA-1 sent the picked file as-is and the service refuses anything over
 * IMAGE_STANDARD_MAX_DIM (2048 px). A phone camera produces 3264×2448 or larger,
 * so EVERY photograph Aïcha takes of her own goods was refused — permanently,
 * with « Essayez une image plus légère », which sent her to compress a file whose
 * DIMENSIONS were the problem. Only an already-downscaled image (a WhatsApp
 * forward) could ever succeed. `quality` did not save it: it is a JPEG
 * compression factor, and expo-image-picker has no max-dimension option at all.
 *
 * So the resize happens here, on the device, before a byte leaves the phone —
 * which is also the only version that respects a patchy-data budget: she uploads
 * ~300 KB instead of ~6 MB.
 */
export type PickOutcome =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly contentType: string }
  | { readonly ok: false; readonly reason: 'refused' | 'cancelled' | 'unreadable' | 'too_small' };

/** Quality is a DESIGN choice, not a default: a market phone on patchy data
 *  should not push a 6 MB original through the network, and the service's own
 *  byte cap would refuse it anyway. 0.7 keeps a cover honest at a fraction. */
const QUALITY = 0.7;

/** Mirrors the service's IMAGE_STANDARD_MAX_DIM / IMAGE_MIN_DIM. Duplicated on
 *  purpose rather than imported: the app must not depend on the service package,
 *  and the SERVICE stays the authority — this is the courtesy that keeps her out
 *  of a refusal she cannot act on, never the check that protects the store. */
const MAX_DIM = 2048;
const MIN_DIM = 200;

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
    // RENDER FIRST TO LEARN THE TRUE SIZE. `asset.width`/`asset.height` are
    // documented as possibly 0 when the system did not provide them, so they are
    // not a basis for deciding whether to resize. `ImageRef` carries the real
    // dimensions of the decoded image.
    const original = await ImageManipulator.manipulate(asset.uri).renderAsync();
    const { width, height } = original;

    // Too small is a REFUSAL SHE CAN ACT ON, and she should hear it before the
    // upload rather than after: the service refuses under 200 px either way.
    if (width > 0 && height > 0 && (width < MIN_DIM || height < MIN_DIM)) {
      return { ok: false, reason: 'too_small' };
    }

    // Constrain the LONGER edge. Resizing width alone on a portrait photo leaves
    // the height over the box and the service still refuses it.
    const oversize = width > MAX_DIM || height > MAX_DIM;
    const fitted = oversize
      ? await ImageManipulator.manipulate(asset.uri)
          .resize(width >= height ? { width: MAX_DIM } : { height: MAX_DIM })
          .renderAsync()
      : original;

    // JPEG always, so the bytes on the wire are a format the service accepts and
    // the content-type we declare is the one we actually produced — not a guess
    // inherited from whatever the gallery happened to hold.
    const saved = await fitted.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
    const bytes = await new File(saved.uri).bytes();
    if (bytes.length === 0) return { ok: false, reason: 'unreadable' };
    return { ok: true, bytes, contentType: 'image/jpeg' };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
