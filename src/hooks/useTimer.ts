import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/**
 * Seconds deducted from the clock on a wrong click (todo 13 GameScreen calls
 * `timer.deductTime(WRONG_TIME_PENALTY_SECONDS)` alongside dispatch(WRONG_CLICK)).
 * The game reducer never touches time — this hook owns it exclusively.
 */
export const WRONG_TIME_PENALTY_SECONDS = 5;

export interface UseTimerOptions {
  /** Countdown duration in seconds. */
  initialSeconds: number;
  /** Called after every 1s tick with the remaining seconds (may be 0). */
  onTick?: (remaining: number) => void;
  /** Called exactly once when the countdown reaches 0. */
  onTimeUp?: () => void;
}

export interface TimerControls {
  /** Remaining seconds, never below 0. */
  timeLeft: number;
  /** Whether the countdown is currently ticking. */
  isRunning: boolean;
  /** Start (or resume) the countdown. Restarts from `initialSeconds` if timeLeft is 0. */
  start: () => void;
  /** Stop the countdown without changing timeLeft. */
  pause: () => void;
  /** Stop and restore timeLeft to `initialSeconds` (or `seconds` if given). */
  reset: (seconds?: number) => void;
  /** Add `seconds` to the remaining time. */
  addTime: (seconds: number) => void;
  /**
   * Remove `seconds` from the remaining time, clamped at 0. If the countdown
   * is running and this exhausts the clock, fires onTimeUp immediately.
   */
  deductTime: (seconds: number) => void;
}

const TICK_MS = 1000;

/**
 * Countdown timer hook. One setInterval (no setTimeout chains, no drift from
 * re-scheduling); the interval lives in a `[isRunning]`-keyed effect, so
 * repeated start() calls, pause(), reset(), and unmount all funnel through a
 * single effect cleanup — duplicates and leaks are impossible by construction.
 */
export function useTimer({ initialSeconds, onTick, onTimeUp }: UseTimerOptions): TimerControls {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);

  // Refs mirror the latest values so the interval callback never closes over
  // a stale render.
  const timeLeftRef = useRef(timeLeft);
  const isRunningRef = useRef(isRunning);
  const initialSecondsRef = useRef(initialSeconds);
  const onTickRef = useRef(onTick);
  const onTimeUpRef = useRef(onTimeUp);

  useEffect(() => {
    initialSecondsRef.current = initialSeconds;
    onTickRef.current = onTick;
    onTimeUpRef.current = onTimeUp;
  });

  useEffect(() => {
    timeLeftRef.current = timeLeft;
    isRunningRef.current = isRunning;
  });

  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      // Guard: after a deduct-to-0 or time-up the ref hits 0 before the
      // interval is cleared — never tick (or fire onTimeUp) below 0.
      if (timeLeftRef.current <= 0) return;

      const next = timeLeftRef.current - 1;
      timeLeftRef.current = next;
      setTimeLeft(next);
      onTickRef.current?.(next);
      if (next <= 0) {
        setIsRunning(false);
        onTimeUpRef.current?.();
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [isRunning]);

  const start = useCallback(() => {
    if (timeLeftRef.current <= 0) {
      timeLeftRef.current = initialSecondsRef.current;
      setTimeLeft(initialSecondsRef.current);
    }
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback((seconds?: number) => {
    setIsRunning(false);
    const next = seconds ?? initialSecondsRef.current;
    timeLeftRef.current = next;
    setTimeLeft(next);
  }, []);

  const addTime = useCallback((seconds: number) => {
    const next = timeLeftRef.current + seconds;
    timeLeftRef.current = next;
    setTimeLeft(next);
  }, []);

  const deductTime = useCallback((seconds: number) => {
    const next = Math.max(0, timeLeftRef.current - seconds);
    timeLeftRef.current = next;
    setTimeLeft(next);
    if (next === 0 && isRunningRef.current) {
      setIsRunning(false);
      onTimeUpRef.current?.();
    }
  }, []);

  return { timeLeft, isRunning, start, pause, reset, addTime, deductTime };
}
