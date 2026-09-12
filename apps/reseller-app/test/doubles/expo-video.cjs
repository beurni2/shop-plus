'use strict';
/**
 * RENDU-RÉEL (Shop+ reseller) — expo-video, inert, in the ONE form BOTH roads
 * into the native module can reach:
 *   · `import … from 'expo-video'` — vite's alias points at `expo-video.ts`,
 *     which re-exports THIS module;
 *   · `require('expo-video')` — the app's guarded runtime load (product-clip
 *     resolves the native module at module scope so an older binary degrades
 *     to the photograph instead of crashing). vite-node hands that `require`
 *     to Node, which knows nothing of vite's aliases; the harness (rendu.tsx)
 *     maps the name onto this file in Node's resolver, the same table.
 * One CommonJS instance, so the counter below is the same object wherever it
 * is read.
 *
 * A clip is a DRAWING here: it renders as a host node so a card that carries
 * one still mounts, and it plays nothing. No walk may claim anything about
 * playback from this.
 *
 * OPPORTUNITES-LEGER-1 (AUDIT-SHOP-2 F-49) — `joueurs.crees` is HOW MANY
 * PLAYERS THE APP ASKED FOR: every `useVideoPlayer` call is one native player
 * on a real phone. That number, and nothing more — not timing, not playback,
 * not what is on screen.
 */
const React = require('react');

const VideoView = (props) => React.createElement('VideoView', props);
VideoView.displayName = 'VideoView';

const joueurs = { crees: 0 };
function resetJoueurs() {
  joueurs.crees = 0;
}
// ONE PLAYER PER MOUNTED COMPONENT, as the real hook: it creates on the first
// render and hands the same player back on every later one. Counting calls
// instead would count re-renders, which are not players.
const useVideoPlayer = () => {
  const [joueur] = React.useState(() => {
    joueurs.crees += 1;
    return { play: () => {}, pause: () => {}, replace: () => {}, loop: false, muted: true };
  });
  return joueur;
};

module.exports = { VideoView, useVideoPlayer, joueurs, resetJoueurs };
