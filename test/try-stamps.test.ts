import { describe, expect, it } from 'vitest';
import { parseTryStamps } from '../src/ui/TryRealStamps';

const ok = {
  net: 'mainnet',
  amountLabel: '$0.02',
  shopName: 'Maple Street Coffee (demo)',
  stamps: ['stamp.html#s1', 'stamp.html#s2'],
  expiredCampaign: 'campaign.html#e1',
  campaign: 'campaign.html#c1',
};

describe('try-stamps.json', () => {
  it('shows the stamps when the file matches the site network', () => {
    expect(parseTryStamps(ok, 'mainnet')).toEqual({ ...ok, net: 'mainnet' });
  });

  it('hides the block on another network, so chipnet builds never show mainnet stamps', () => {
    expect(parseTryStamps(ok, 'chipnet')).toBeNull();
  });

  it('keeps only links to our own stamp and campaign pages', () => {
    const r = parseTryStamps(
      {
        ...ok,
        stamps: ['https://evil.example/#x', 'stamp.html#s2', 'javascript:alert(1)'],
        expiredCampaign: 'stamp.html#not-a-campaign',
        campaign: 'https://x/campaign.html#c',
      },
      'mainnet',
    );
    expect(r?.stamps).toEqual(['stamp.html#s2']);
    expect(r?.expiredCampaign).toBeUndefined();
    expect(r?.campaign).toBeUndefined();
  });

  it('hides the block for a missing or broken file', () => {
    expect(parseTryStamps(null, 'mainnet')).toBeNull();
    expect(parseTryStamps({ ...ok, stamps: [] }, 'mainnet')).toBeNull();
    expect(parseTryStamps({ ...ok, amountLabel: 25 }, 'mainnet')).toBeNull();
  });
});
