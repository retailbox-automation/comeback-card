// Live chipnet checks (run with LIVE=1). They read the public chain; they never send money.
import { describe, expect, it } from 'vitest';
import { medianTimePast, provider } from '../../src/core/chain';

describe('chipnet, live', () => {
  it('median time past is a recent unix time, behind the wall clock', async () => {
    const mtp = await medianTimePast('chipnet');
    const now = BigInt(Math.floor(Date.now() / 1000));
    expect(mtp).toBeGreaterThan(now - 6n * 3600n);
    expect(mtp).toBeLessThanOrEqual(now + 60n);
    console.log(`chipnet MTP ${new Date(Number(mtp) * 1000).toISOString()} · lag ${(now - mtp) / 60n} min`);
  });

  it('second Fulcrum server answers the same tip', async () => {
    const a = await provider('chipnet', 0).getBlockHeight();
    const b = await provider('chipnet', 1).getBlockHeight();
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });
});
