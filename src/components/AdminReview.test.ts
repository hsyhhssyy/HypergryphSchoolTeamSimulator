import { describe, expect, it } from 'vitest';
import { ApiError, isForbiddenError } from '@/lib/api';
import { formatCreatedAt, modeLabel } from '@/components/AdminReview';

describe('modeLabel', () => {
  it('labels both modes with their Chinese names', () => {
    expect(modeLabel('spot_diff')).toBe('找不同');
    expect(modeLabel('find_area')).toBe('区域识别');
  });
});

describe('formatCreatedAt', () => {
  const fmt = (d: Date): string =>
    new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);

  it('treats SQLite UTC datetimes (space separator, no zone) as UTC', () => {
    // SQLite datetime('now') → "2026-08-14 05:30:00" (UTC); rendered local.
    expect(formatCreatedAt('2026-08-14 05:30:00')).toBe(fmt(new Date('2026-08-14T05:30:00Z')));
  });

  it('parses ISO strings with a zone as-is', () => {
    expect(formatCreatedAt('2026-08-14T00:00:00Z')).toBe(fmt(new Date('2026-08-14T00:00:00Z')));
  });

  it('falls back to the raw string for garbage input', () => {
    expect(formatCreatedAt('nonsense')).toBe('nonsense');
    expect(formatCreatedAt('')).toBe('');
  });
});

describe('isForbiddenError', () => {
  it('flags ApiError with status 403 (invalid admin key → 无权限)', () => {
    expect(isForbiddenError(new ApiError('forbidden', 403))).toBe(true);
  });

  it('does not flag other errors', () => {
    expect(isForbiddenError(new ApiError('boom', 500))).toBe(false);
    expect(isForbiddenError(new Error('boom'))).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
    expect(isForbiddenError('forbidden')).toBe(false);
  });
});
