import { BadRequestException } from '@nestjs/common';
import { CHANGE_TYPE_FILTER_GROUPS } from '@repo/shared';
import {
  CHANGE_TYPE_GROUPS,
  decodeCursor,
  encodeCursor,
} from './change-read.service';

const id = '3f1c2b9a-8d7e-4c6b-9a5f-1e2d3c4b5a69';
const t = '2026-09-22T00:00:00.123456Z';

describe('change read helpers', () => {
  it('keeps the local type groups equal to the shared contract', () => {
    expect(CHANGE_TYPE_GROUPS).toEqual(CHANGE_TYPE_FILTER_GROUPS);
  });

  it('round-trips cursors for both orderings', () => {
    const attention = { o: 'a' as const, p: 2, t, i: id };
    const recent = { o: 't' as const, p: null, t, i: id };
    expect(decodeCursor(encodeCursor(attention), 'a')).toEqual(attention);
    expect(decodeCursor(encodeCursor(recent), 't')).toEqual(recent);
  });

  it.each([
    ['garbage', 'not-base64-json!'],
    ['other view', encodeCursor({ o: 't', p: null, t, i: id })],
    ['bad id', encodeCursor({ o: 'a', p: 1, t, i: 'x' })],
    ['bad time', encodeCursor({ o: 'a', p: 1, t: '2026-09-22', i: id })],
    ['bad priority', encodeCursor({ o: 'a', p: 9, t, i: id })],
    ['array', Buffer.from('[1]').toString('base64url')],
  ])('rejects a %s cursor with 400', (_label, raw) => {
    expect(() => decodeCursor(raw, 'a')).toThrow(BadRequestException);
  });
});
