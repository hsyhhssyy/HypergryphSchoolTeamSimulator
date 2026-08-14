import { useState } from 'preact/hooks';
import { TRACKS, useAudioPlayer } from '@/hooks/useAudioPlayer';

/**
 * Floating BGM player — todo 26.
 *
 * Collapsed round button pinned top-right on EVERY screen; tap to expand a
 * small panel (play/pause, prev/next, volume slider, mute toggle). Uses the
 * cartoon design tokens from src/index.css (btn/card/radius/shadow).
 *
 * NEVER autoplays: sound starts only from the user's tap on ▶.
 */

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function MusicNoteIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M18 5v14l-8-7z" fill="currentColor" stroke="none" />
      <rect x="6" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6 5v14l8-7z" fill="currentColor" stroke="none" />
      <rect x="15.5" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg {...ICON_PROPS}>
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
      {muted ? (
        <>
          <line x1="16" y1="9" x2="22" y2="15" />
          <line x1="22" y1="9" x2="16" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a10 10 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

/** Tiny animated equalizer — visible only while playing (state feedback). */
function Equalizer() {
  return (
    <span className="bgm-eq" aria-hidden>
      <span className="bgm-eq__bar" />
      <span className="bgm-eq__bar" />
      <span className="bgm-eq__bar" />
    </span>
  );
}

export function AudioPlayer() {
  const api = useAudioPlayer();
  const [expanded, setExpanded] = useState(false);

  const track = TRACKS[api.currentTrackIndex] ?? TRACKS[0];

  return (
    <div className="bgm-player">
      {/* Single HTML5 audio element — src swapped per track, lazy preload. */}
      <audio ref={api.audioRef} preload="metadata" loop={false} />

      <button
        type="button"
        className={`bgm-player__toggle${api.isPlaying ? ' is-playing' : ''}`}
        aria-expanded={expanded}
        aria-label={expanded ? '收起音乐面板' : '打开音乐面板'}
        onClick={() => setExpanded((e) => !e)}
      >
        {api.isPlaying ? <Equalizer /> : <MusicNoteIcon />}
      </button>

      {expanded && (
        <div className="bgm-player__panel" role="group" aria-label="背景音乐控制">
          <p className="bgm-player__track">
            {track?.name ?? ''}
            <span className="bgm-player__counter">
              {api.currentTrackIndex + 1}/{TRACKS.length}
            </span>
          </p>

          <div className="bgm-player__controls">
            <button
              type="button"
              className="bgm-player__btn"
              aria-label="上一首"
              onClick={api.prev}
            >
              <PrevIcon />
            </button>
            <button
              type="button"
              className="bgm-player__btn bgm-player__btn--main"
              aria-label={api.isPlaying ? '暂停' : '播放'}
              onClick={api.isPlaying ? api.pause : api.play}
            >
              {api.isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className="bgm-player__btn"
              aria-label="下一首"
              onClick={api.next}
            >
              <NextIcon />
            </button>
          </div>

          <div className="bgm-player__row">
            <button
              type="button"
              className="bgm-player__btn bgm-player__btn--small"
              aria-label={api.muted ? '取消静音' : '静音'}
              aria-pressed={api.muted}
              onClick={api.toggleMute}
            >
              <VolumeIcon muted={api.muted} />
            </button>
            <input
              type="range"
              className="bgm-player__slider"
              min={0}
              max={1}
              step={0.05}
              value={api.volume}
              aria-label="音量"
              onInput={(e) => api.setVolume(Number(e.currentTarget.value))}
            />
            <span className="bgm-player__vol">{Math.round(api.volume * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
