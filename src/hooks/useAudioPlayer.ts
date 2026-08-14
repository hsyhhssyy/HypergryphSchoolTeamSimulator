import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/**
 * BGM playlist — todo 26.
 *
 * Static assets served from /public/audio (Vite copies them as-is; they are
 * lazy-loaded by the browser via `<audio src>`, never part of the JS bundle).
 * Swap in licensed music by replacing files + editing this list (see
 * public/audio/README.md).
 */
export interface Track {
  /** Display name shown in the player panel. */
  name: string;
  /** Static asset URL. */
  src: string;
}

export const TRACKS: readonly Track[] = [
  { name: '晨曦散步 · 曲目 1', src: '/audio/track-01.wav' },
  { name: '欢快闯关 · 曲目 2', src: '/audio/track-02.wav' },
  { name: '平静收尾 · 曲目 3', src: '/audio/track-03.wav' },
];

const STORAGE_VOLUME_KEY = 'h5sd.bgm.volume';
const STORAGE_MUTED_KEY = 'h5sd.bgm.muted';
const DEFAULT_VOLUME = 0.8;

export interface AudioPlayerApi {
  /** Ref callback — bind to the single `<audio>` element in the component. */
  audioRef: (el: HTMLAudioElement | null) => void;
  currentTrackIndex: number;
  isPlaying: boolean;
  volume: number;
  muted: boolean;
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

function restoreVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function restoreMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Single HTML5 `<audio>` element, playlist managed in JS:
 * - `loop` OFF — sequential playback driven by the `ended` event.
 * - `preload="metadata"` — track bytes are fetched lazily, not eagerly.
 * - NO autoplay: `play()` is only ever called from a user gesture (or from
 *   the sequential-playlist continuation, which requires an earlier gesture).
 * - Volume/mute persisted to localStorage and restored on load.
 */
export function useAudioPlayer(): AudioPlayerApi {
  // Callback ref → reactive element handle (refs alone don't trigger effects).
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolumeState] = useState<number>(restoreVolume);
  const [muted, setMutedState] = useState<boolean>(restoreMuted);
  const [isPlaying, setIsPlaying] = useState(false);

  const indexRef = useRef(0);
  const playingRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);

  /** Refs stay in sync so event handlers never read stale state. */
  useEffect(() => {
    indexRef.current = currentTrackIndex;
  }, [currentTrackIndex]);
  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  const advanceTo = useCallback((index: number) => {
    indexRef.current = index;
    setCurrentTrackIndex(index);
  }, []);

  // ——— element wiring ——————————————————————————————————————————————
  useEffect(() => {
    const el = audioEl;
    if (el === null) return;

    // Single element: swap src per track, never eager preload.
    el.preload = 'metadata';
    el.loop = false;

    const onPlaying = () => {
      consecutiveErrorsRef.current = 0;
      playingRef.current = true;
      setIsPlaying(true);
    };
    const onPause = () => {
      playingRef.current = false;
      setIsPlaying(false);
    };
    /** Playlist end → continue with the next track (loop = false + ended). */
    const onEnded = () => {
      // 'ended' fires without 'pause'; we WANT the playlist to continue.
      playingRef.current = true;
      advanceTo((indexRef.current + 1) % TRACKS.length);
    };
    /** Broken/unplayable track → graceful skip to the next one. */
    const onError = () => {
      consecutiveErrorsRef.current += 1;
      // All tracks broken? Stop skipping forever in a loop.
      if (consecutiveErrorsRef.current >= TRACKS.length) return;
      advanceTo((indexRef.current + 1) % TRACKS.length);
    };

    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [audioEl, advanceTo]);

  // ——— track change: swap src; keep playing if playback was in progress ——
  useEffect(() => {
    const el = audioEl;
    if (el === null) return;
    const track = TRACKS[currentTrackIndex] ?? TRACKS[0];
    if (track === undefined) return;
    el.src = track.src;
    el.load();
    if (playingRef.current) {
      void el.play().catch(() => {
        playingRef.current = false;
        setIsPlaying(false);
      });
    }
  }, [audioEl, currentTrackIndex]);

  // ——— volume/mute: apply + persist ————————————————————————————————
  useEffect(() => {
    if (audioEl === null) return;
    audioEl.volume = volume;
    audioEl.muted = muted;
  }, [audioEl, volume, muted]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_VOLUME_KEY, String(volume));
    } catch {
      // storage unavailable — volume simply won't persist
    }
  }, [volume]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MUTED_KEY, muted ? '1' : '0');
    } catch {
      // storage unavailable — mute simply won't persist
    }
  }, [muted]);

  const play = useCallback(() => {
    const el = audioEl;
    if (el === null) return;
    playingRef.current = true;
    void el.play().catch(() => {
      // Autoplay policy / decode error — surface paused, never throw.
      playingRef.current = false;
      setIsPlaying(false);
    });
  }, [audioEl]);

  const pause = useCallback(() => {
    playingRef.current = false;
    audioEl?.pause();
  }, [audioEl]);

  const next = useCallback(() => {
    advanceTo((indexRef.current + 1) % TRACKS.length);
  }, [advanceTo]);

  const prev = useCallback(() => {
    advanceTo((indexRef.current - 1 + TRACKS.length) % TRACKS.length);
  }, [advanceTo]);

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.min(1, Math.max(0, v));
      setVolumeState(clamped);
      // Raising the slider is an explicit "I want sound" — clear mute.
      if (clamped > 0 && muted) setMutedState(false);
    },
    [muted],
  );

  const toggleMute = useCallback(() => {
    setMutedState((m) => !m);
  }, []);

  return {
    audioRef: setAudioEl,
    currentTrackIndex,
    isPlaying,
    volume,
    muted,
    play,
    pause,
    next,
    prev,
    setVolume,
    toggleMute,
  };
}
