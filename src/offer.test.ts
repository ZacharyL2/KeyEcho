import { describe, expect, it } from 'vitest';

import { formatUsd, promoFrom } from './offer';

const served = {
  name: 'Black Friday',
  code: 'BF2026',
  priceUsd: 5.99,
  endsAt: '2026-12-03T08:00:00.000Z',
};
const end = Date.parse(served.endsAt);

describe('served all-access offer', () => {
  it('is on until the end instant and off from it', () => {
    expect(promoFrom(served, end - 1)?.code).toBe('BF2026');
    expect(promoFrom(served, end)).toBeUndefined();
    expect(promoFrom(served, end + 1)).toBeUndefined();
  });

  it('names the last day in US Pacific time', () => {
    expect(promoFrom(served, end - 1)?.endsLabel).toBe('Dec 2');
  });

  it('shows nothing without an offer or with an unreadable end', () => {
    expect(promoFrom(undefined, end - 1)).toBeUndefined();
    expect(promoFrom({ ...served, endsAt: 'soon' }, end - 1)).toBeUndefined();
  });

  it('prints prices with cents', () => {
    expect(formatUsd(served.priceUsd)).toBe('$5.99');
    expect(formatUsd(9.99)).toBe('$9.99');
  });
});
