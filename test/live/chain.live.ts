// Live checks on chipnet and mainnet (run with LIVE=1). They read the public chain; they never send money.
import { describe, expect, it } from 'vitest';
import { ElectrumNetworkProvider } from 'cashscript';
import { FailoverProvider, medianTimePast, singleServer, type ChainNet } from '../../src/core/chain';

// Rough floor for the tip height, so a server stuck on an old chain or the wrong network fails.
const MIN_HEIGHT: Record<ChainNet, number> = { chipnet: 300_000, mainnet: 970_000 };

describe.each(['chipnet', 'mainnet'] as const)('%s, live', (net) => {
  it('median time past is a recent unix time, behind the wall clock', async () => {
    const mtp = await medianTimePast(net);
    const now = BigInt(Math.floor(Date.now() / 1000));
    expect(mtp).toBeGreaterThan(now - 6n * 3600n);
    expect(mtp).toBeLessThanOrEqual(now + 60n);
    console.log(`${net} MTP ${new Date(Number(mtp) * 1000).toISOString()} · lag ${(now - mtp) / 60n} min`);
  });

  it('both Fulcrum servers answer the same tip', async () => {
    const a = await singleServer(net, 0).getBlockHeight();
    const b = await singleServer(net, 1).getBlockHeight();
    expect(a).toBeGreaterThan(MIN_HEIGHT[net]);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('failover: a dead first server does not stop reads', async () => {
    const dead = new ElectrumNetworkProvider(net, { hostname: 'no-such-host.invalid' });
    const p = new FailoverProvider(net, [dead, singleServer(net, 0)]);
    expect(await p.getBlockHeight()).toBeGreaterThan(MIN_HEIGHT[net]);
  });
});

it('chipnet and mainnet servers are on different chains (control for the height floors)', async () => {
  const chip = await singleServer('chipnet', 0).getBlockHeight();
  const main = await singleServer('mainnet', 0).getBlockHeight();
  expect(main - chip).toBeGreaterThan(500_000);
});
