/**
 * RENDU-RÉEL (Shop+ reseller) — the SMALL native boundaries, doubled together.
 *
 * EACH ONE IS INERT ON PURPOSE, and none of them is what any walk asserts.
 * They exist so the real screens MOUNT: without them `App.tsx` cannot even be
 * imported under vitest, which is the whole reason this app had no screen test
 * until today. A walk that started depending on one of these would be testing
 * the double, so none does — every assertion in `rendu-vitrine.test.tsx` is
 * about the app's own state, its own ports, and `globalThis.fetch`.
 *
 * AND THEY MAKE NO CLAIM ABOUT MEDIA. A picker that answers « cancelled » is
 * not a statement that picking works; the upload paths keep their own tests.
 */

/* ── expo-status-bar ─────────────────────────────────────────────────────── */
export const StatusBar = (): null => null;

/* ── expo-font ───────────────────────────────────────────────────────────── */
export const useFonts = (): [boolean, null] => [true, null];
export const loadAsync = async (): Promise<void> => {};
export const isLoaded = (): boolean => true;

/* ── expo-updates ────────────────────────────────────────────────────────── */
export const checkForUpdateAsync = async (): Promise<{ isAvailable: boolean }> => ({ isAvailable: false });
export const fetchUpdateAsync = async (): Promise<{ isNew: boolean }> => ({ isNew: false });
export const reloadAsync = async (): Promise<void> => {};
export const isEnabled = false;
export const channel: string | null = null;
export const updateId: string | null = null;
export const runtimeVersion: string | null = null;

/* ── expo-image-picker ───────────────────────────────────────────────────── */
export const MediaTypeOptions = { Images: 'Images', Videos: 'Videos', All: 'All' } as const;
export const launchImageLibraryAsync = async (): Promise<{ canceled: true }> => ({ canceled: true });
export const launchCameraAsync = async (): Promise<{ canceled: true }> => ({ canceled: true });
export const requestMediaLibraryPermissionsAsync = async (): Promise<{ granted: boolean }> => ({ granted: true });
export const requestCameraPermissionsAsync = async (): Promise<{ granted: boolean }> => ({ granted: true });

/* ── expo-image-manipulator ──────────────────────────────────────────────── */
export const SaveFormat = { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' } as const;
export const manipulateAsync = async (uri: string): Promise<{ uri: string; width: number; height: number }> => ({
  uri,
  width: 1000,
  height: 1000,
});

/**
 * The object API (`ImageManipulator.manipulate(uri).resize().renderAsync()`, SDK 54 onward),
 * which is what `src/vitrine/customize/photo-pick.ts` actually calls.
 *
 * IT RESIZES NOTHING. Every call answers the same 1000×1000 handle, so no walk
 * may read a dimension, a crop or an encoded byte from here — the real resize,
 * re-encode and EXIF-strip laws keep their own suites over the real module. This
 * exists so a screen that CAN pick a photo still mounts.
 */
interface ManipHandle {
  resize(): ManipHandle;
  crop(): ManipHandle;
  renderAsync(): Promise<{ width: number; height: number; saveAsync(): Promise<{ uri: string }> }>;
}
export const ImageManipulator = {
  manipulate: (uri: string): ManipHandle => {
    const handle: ManipHandle = {
      resize: () => handle,
      crop: () => handle,
      renderAsync: async () => ({
        width: 1000,
        height: 1000,
        saveAsync: async () => ({ uri }),
      }),
    };
    return handle;
  },
};
