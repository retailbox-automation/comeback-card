// Live chipnet checks (run with LIVE=1). They read the public chain; they never send money.
import { describe, expect, it } from 'vitest';
import { ElectrumNetworkProvider } from 'cashscript';
import { FailoverProvider, medianTimePast, singleServer } from '../../src/core/chain';

describe('chipnet, live', () => {
  it('median time past is a recent unix time, behind the wall clock', async () => {
    const mtp = await medianTimePast('chipnet');
    const now = BigInt(Math.floor(Date.now() / 1000));
    expect(mtp).toBeGreaterThan(now - 6n * 3600n);
    expect(mtp).toBeLessThanOrEqual(now + 60n);
    console.log(`chipnet MTP ${new Date(Number(mtp) * 1000).toISOString()} · lag ${(now - mtp) / 60n} min`);
  });

  it('second Fulcrum server answers the same tip', async () => {
    const a = await singleServer('chipnet', 0).getBlockHeight();
    const b = await singleServer('chipnet', 1).getBlockHeight();
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('failover: a dead first server does not stop reads', async () => {
    const dead = new ElectrumNetworkProvider('chipnet', { hostname: 'no-such-host.invalid' });
    const p = new FailoverProvider('chipnet', [dead, singleServer('chipnet', 0)]);
    expect(await p.getBlockHeight()).toBeGreaterThan(300_000);
  });
});
