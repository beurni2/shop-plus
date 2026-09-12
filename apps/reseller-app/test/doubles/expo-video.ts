import { createRequire } from 'node:module';
import type React from 'react';

/**
 * RENDU-RÉEL (Shop+ reseller) — expo-video, inert. The ESM face of
 * `expo-video.cjs`, which holds the one instance: vite's alias brings imports
 * here, and the app's guarded `require('expo-video')` reaches the same file
 * through Node's resolver (mapped in rendu.tsx). See the .cjs for the bounds:
 * a clip is a drawing, it plays nothing, and `joueurs.crees` counts players
 * asked for and nothing more.
 */
type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
interface Joueur {
  play: () => void;
  pause: () => void;
  replace: () => void;
  loop: boolean;
  muted: boolean;
}
const cjs = createRequire(import.meta.url)('./expo-video.cjs') as {
  VideoView: React.FC<AnyProps>;
  useVideoPlayer: () => Joueur;
  joueurs: { crees: number };
  resetJoueurs: () => void;
};

export const VideoView: React.FC<AnyProps> = cjs.VideoView;
export const useVideoPlayer: () => Joueur = cjs.useVideoPlayer;
export const joueurs: { crees: number } = cjs.joueurs;
export const resetJoueurs: () => void = cjs.resetJoueurs;
