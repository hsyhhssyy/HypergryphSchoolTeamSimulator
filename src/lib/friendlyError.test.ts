import { describe, expect, it } from 'vitest';
import {
  friendlyErrorMessage,
  NETWORK_ERROR_MESSAGE,
} from './friendlyError';

describe('friendlyErrorMessage', () => {
  const FALLBACK = '加载失败，请重试';

  it('maps a fetch TypeError (network down) to the network message', () => {
    // Browser fetch throws TypeError("Failed to fetch") — the raw English
    // text must NEVER reach the user.
    expect(friendlyErrorMessage(new TypeError('Failed to fetch'), FALLBACK)).toBe(
      NETWORK_ERROR_MESSAGE,
    );
    expect(friendlyErrorMessage(new TypeError(), FALLBACK)).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('maps unknown thrown values (strings, plain Errors, null) to the fallback', () => {
    expect(friendlyErrorMessage(new Error('boom'), FALLBACK)).toBe(FALLBACK);
    expect(friendlyErrorMessage('boom', FALLBACK)).toBe(FALLBACK);
    expect(friendlyErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(friendlyErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it('never returns a message that contains raw error text', () => {
    const raw = 'Failed to fetch';
    const result = friendlyErrorMessage(new TypeError(raw), FALLBACK);
    expect(result).not.toContain(raw);
    expect(result).not.toContain('stack');
  });
});
