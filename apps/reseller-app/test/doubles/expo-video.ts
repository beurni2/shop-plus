import React from 'react';

/**
 * RENDU-RÉEL (Shop+ reseller) — expo-video, inert. A clip is a DRAWING here:
 * it renders as a host node so a card that carries one still mounts, and it
 * plays nothing. No walk may claim anything about playback from this.
 */
type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
export const VideoView: React.FC<AnyProps> = (props) => React.createElement('VideoView', props as never);
VideoView.displayName = 'VideoView';
export const useVideoPlayer = (): {
  play: () => void;
  pause: () => void;
  replace: () => void;
  loop: boolean;
  muted: boolean;
} => ({ play: () => {}, pause: () => {}, replace: () => {}, loop: false, muted: true });
