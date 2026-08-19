import type { CSSProperties, ReactNode } from 'react';
import {
  Player,
  type PlayerAudio,
  type SceneState,
  type Timeline,
} from './core';
import './viz-player.css';

export type { PlayerAudio, SceneState, Timeline } from './core';

export interface VideoScene {
  timeline: Timeline;
  render: (state: SceneState) => ReactNode;
}

export interface VizPlayerProps {
  scene: VideoScene;
  audio?: PlayerAudio;
  width?: number;
  height?: number;
  loop?: boolean;
  autoplay?: boolean;
  showCaptions?: boolean;
  className?: string;
}

export interface VideoEmbedProps {
  /** A direct media asset or a public player URL. */
  src: string;
  title?: string;
  className?: string;
  /** CSS aspect-ratio for iframe embeds. Defaults to 16 / 9. */
  aspectRatio?: CSSProperties['aspectRatio'];
  controls?: boolean;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  poster?: string;
  allowFullScreen?: boolean;
}

function isDirectVideo(src: string): boolean {
  return /\.(?:mp4|webm|ogg)(?:[?#]|$)/i.test(src);
}

/**
 * A small public boundary around the timeline engine's player. Consumers own
 * scene loading and asset URLs; the package owns the clock, transport,
 * caption rendering, keyboard controls, and optional narration sync.
 */
export function VizPlayer({
  scene,
  audio,
  width,
  height,
  loop,
  autoplay,
  showCaptions,
  className,
}: VizPlayerProps) {
  return (
    <div className={className} data-viz-player="">
      <Player
        timeline={scene.timeline}
        {...(width === undefined ? {} : { width })}
        {...(height === undefined ? {} : { height })}
        {...(loop === undefined ? {} : { loop })}
        {...(autoplay === undefined ? {} : { autoplay })}
        {...(showCaptions === undefined ? {} : { showCaptions })}
        {...(audio === undefined ? {} : { audio })}
      >
        {scene.render}
      </Player>
    </div>
  );
}

/**
 * URL-based companion for markdown/document renderers. Direct media files use
 * the native video element; hosted players use a sandbox-free iframe.
 */
export function VideoEmbed({
  src,
  title = 'Video',
  className,
  aspectRatio = '16 / 9',
  controls = true,
  autoplay = false,
  loop = false,
  muted = false,
  poster,
  allowFullScreen = true,
}: VideoEmbedProps) {
  const mediaClass = `video-embed__media ${className ?? ''}`.trim();
  if (isDirectVideo(src)) {
    return (
      <video
        className={mediaClass}
        src={src}
        title={title}
        controls={controls}
        autoPlay={autoplay}
        loop={loop}
        muted={muted}
        poster={poster}
        playsInline
      />
    );
  }
  return (
    <iframe
      className={mediaClass}
      src={src}
      title={title}
      loading="lazy"
      allow="autoplay; fullscreen"
      allowFullScreen={allowFullScreen}
      style={{ aspectRatio }}
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

export function createVideoScene(
  timeline: Timeline,
  render: VideoScene['render'],
): VideoScene {
  return { timeline, render };
}
