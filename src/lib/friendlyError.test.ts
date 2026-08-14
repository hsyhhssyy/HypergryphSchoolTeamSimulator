import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import {
  friendlyErrorMessage,
  NETWORK_ERROR_MESSAGE,
  RATE_LIMIT_MESSAGE,
  SERVER_ERROR_MESSAGE,
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

  it('maps HTTP 429 (ApiError) to the rate-limit message', () => {
    expect(friendlyErrorMessage(new ApiError('submission rate limit exceeded', 429), FALLBACK)).toBe(
      RATE_LIMIT_MESSAGE,
    );
  });

  it('maps HTTP >= 500 (ApiError) to the service message, never the body', () => {
    // Server body is English/technical — only the mapped text may surface.
    expect(friendlyErrorMessage(new ApiError('image upload failed', 500), FALLBACK)).toBe(
      SERVER_ERROR_MESSAGE,
    );
    expect(friendlyErrorMessage(new ApiError('D1 internal error', 502), FALLBACK)).toBe(
      SERVER_ERROR_MESSAGE,
    );
  });

  it('maps 4xx ApiError (non-429) to the caller fallback', () => {
    expect(friendlyErrorMessage(new ApiError('forbidden', 403), FALLBACK)).toBe(FALLBACK);
    expect(friendlyErrorMessage(new ApiError('bad request', 400), FALLBACK)).toBe(FALLBACK);
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
