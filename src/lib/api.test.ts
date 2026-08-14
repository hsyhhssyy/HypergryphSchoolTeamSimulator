/**
 * API client tests. `fetch` is mocked globally per test — the wire contract
 * (URL, method, headers, body) is asserted against the mock's call record.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '@shared/types';
import {
  ApiError,
  fetchAdminImage,
  fetchPendingSubmissions,
  fetchQuestions,
  isForbiddenError,
  rateQuestion,
  resolveImageUrl,
  reviewSubmission,
  submitWorkshopQuestion,
} from '@/lib/api';

const BASE = 'http://localhost:8080';

const question: Question = {
  id: 'q-1',
  mode: 'spot_diff',
  title: '测试题',
  description: '找出两图的不同',
  imageA: 'https://picsum.photos/800/600',
  differences: [{ type: 'circle', x: 10, y: 20, radius: 5 }],
  showCount: true,
  source: 'workshop',
  status: 'approved',
  likes: 1,
  dislikes: 0,
  createdAt: '2026-08-14T00:00:00Z',
};

type FetchMock = ReturnType<typeof vi.fn>;

/** Stub global fetch with a JSON (or raw BodyInit) response. */
function stubFetch(opts: { status: number; body?: unknown; raw?: BodyInit }): FetchMock {
  const bodyInit: BodyInit | null =
    opts.raw !== undefined
      ? opts.raw
      : opts.body === undefined
        ? null
        : JSON.stringify(opts.body);
  const fn: FetchMock = vi.fn(async () => new Response(bodyInit, { status: opts.status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Stub global fetch that rejects (network failure). */
function stubFetchReject(error: Error): FetchMock {
  const fn: FetchMock = vi.fn(async () => {
    throw error;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Unwrap the first recorded fetch call into { url, init }. */
function firstCall(fn: FetchMock): { url: string; init: RequestInit } {
  const call = fn.mock.calls[0];
  expect(call).toBeTruthy();
  const init: RequestInit = (call?.[1] as RequestInit | undefined) ?? {};
  return { url: String(call?.[0]), init };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchQuestions', () => {
  it('returns the parsed Question array from a 200 response', async () => {
    // Given a 200 with a question list
    const fetchMock = stubFetch({ status: 200, body: [question] });
    // When
    const result = await fetchQuestions('spot_diff', 'mixed', 5);
    // Then
    expect(result).toEqual([question]);
    const { url } = firstCall(fetchMock);
    expect(url).toBe(`${BASE}/api/questions?mode=spot_diff&source=mixed&count=5`);
  });

  it('throws the server message from a 500 response, never raw JSON', async () => {
    // Given a 500 whose body is { error: ... }
    stubFetch({ status: 500, body: { error: 'database exploded' } });
    // When
    const error = await fetchQuestions('find_area', 'official', 3).catch(
      (e: unknown) => e,
    );
    // Then the message field surfaces verbatim; the raw JSON does not leak
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toBe('database exploded');
    expect(message).not.toContain('{');
  });
});

describe('submitWorkshopQuestion', () => {
  it('returns { id } from a 201 response and POSTs the FormData as-is', async () => {
    // Given
    const fetchMock = stubFetch({ status: 201, body: { id: 'new-q' } });
    const form = new FormData();
    form.append('title', '我的题目');
    // When
    const result = await submitWorkshopQuestion(form);
    // Then
    expect(result).toEqual({ id: 'new-q' });
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe(`${BASE}/api/workshop`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(form);
  });
});

describe('rateQuestion', () => {
  it('POSTs the snake_case rating body as JSON', async () => {
    // Given
    const fetchMock = stubFetch({ status: 200, body: { likes: 0, dislikes: 1 } });
    // When
    await rateQuestion('q-1', 'user-9', 'dislike');
    // Then
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe(`${BASE}/api/ratings`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      question_id: 'q-1',
      user_id: 'user-9',
      vote: 'dislike',
    });
  });

  it('rethrows when fetch rejects (network error)', async () => {
    // Given a network failure
    stubFetchReject(new TypeError('network down'));
    // When / Then
    await expect(rateQuestion('q-1', 'user-1', 'like')).rejects.toThrow(
      'network down',
    );
  });
});

describe('fetchPendingSubmissions', () => {
  it('sends the EXACT admin key in the X-Admin-Key header and keeps it out of the URL', async () => {
    // Given
    const fetchMock = stubFetch({
      status: 200,
      body: { items: [question], nextCursor: 'abc' },
    });
    // When
    const result = await fetchPendingSubmissions('admin-secret-123');
    // Then
    expect(result).toEqual({ items: [question], nextCursor: 'abc' });
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe(`${BASE}/api/workshop/pending`);
    const headers = new Headers(init.headers);
    expect(headers.get('X-Admin-Key')).toBe('admin-secret-123');
    expect(url).not.toContain('admin-secret-123');
  });

  it('throws the server message when the admin key is wrong (403)', async () => {
    // Given a 403
    stubFetch({ status: 403, body: { error: 'invalid admin key' } });
    // When / Then
    await expect(fetchPendingSubmissions('wrong-key')).rejects.toThrow(
      'invalid admin key',
    );
  });

  it('throws an ApiError carrying the HTTP status (403 → 无权限 mapping)', async () => {
    // Given a 403
    stubFetch({ status: 403, body: { error: 'invalid admin key' } });
    // When
    const err: unknown = await fetchPendingSubmissions('wrong-key').catch((e: unknown) => e);
    // Then
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).message).toBe('invalid admin key');
    expect(isForbiddenError(err)).toBe(true);
  });

  it('appends the keyset cursor for the next page and keeps the key out of the URL', async () => {
    // Given a base64(created_at|id) cursor and a pending page
    const cursor = btoa('2026-08-14 05:30:00|q-9');
    const fetchMock = stubFetch({ status: 200, body: { items: [], nextCursor: null } });
    // When
    await fetchPendingSubmissions('admin-secret-123', cursor);
    // Then
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe(`${BASE}/api/workshop/pending?cursor=${encodeURIComponent(cursor)}`);
    const headers = new Headers(init.headers);
    expect(headers.get('X-Admin-Key')).toBe('admin-secret-123');
    expect(url).not.toContain('admin-secret-123');
  });
});

describe('reviewSubmission', () => {
  it('POSTs { id, status } with the X-Admin-Key header', async () => {
    // Given
    const fetchMock = stubFetch({ status: 200, body: {} });
    // When
    await reviewSubmission('q-7', 'approved', 'admin-key');
    // Then
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe(`${BASE}/api/workshop/review`);
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('X-Admin-Key')).toBe('admin-key');
    expect(JSON.parse(String(init.body))).toEqual({ id: 'q-7', status: 'approved' });
  });
});

describe('resolveImageUrl', () => {
  it('uses full external http(s) URLs as-is', () => {
    expect(resolveImageUrl('https://picsum.photos/800/600')).toBe(
      'https://picsum.photos/800/600',
    );
  });

  it('maps R2 keys onto the Worker image route', () => {
    expect(resolveImageUrl('abc123-1.png')).toBe(`${BASE}/images/abc123-1.png`);
  });
});

describe('fetchAdminImage', () => {
  it('GETs /images/:filename with the X-Admin-Key header and returns a Blob', async () => {
    // Given
    const blob = new Blob(['img-bytes']);
    const fetchMock = stubFetch({ status: 200, raw: blob });
    // When
    const result = await fetchAdminImage('abc123-1.png', 'admin-key');
    // Then
    expect(result).toBeInstanceOf(Blob);
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe(`${BASE}/images/abc123-1.png`);
    const headers = new Headers(init.headers);
    expect(headers.get('X-Admin-Key')).toBe('admin-key');
  });
});
