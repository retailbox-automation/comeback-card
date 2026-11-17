// The shop counter tells a Comeback Card payment from a stamp payment and from an ordinary one,
// using real transactions built on Mocknet.
import { describe, expect, it } from 'vitest';
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo } from 'cashscript';
import { generatePrivateKey, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import { approveShopAddress, buildCardSpend, cardContract, CARD_MAX_FEE, CARD_MIN_CHANGE } from '../src/core/card';
import { classifyPayment } from '../src/core/shop';
import { buildSpend, lockingBytecodeOf, publicKeyOf, stampContract } from '../src/core/stamp';

const p2pkh = (k: Uint8Array) => publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(k), prefix: 'bchtest' }).address;

describe('shop counter: where a payment came from', () => {
  const provider = new MockNetworkProvider();
  const shopAddr = p2pkh(generatePrivateKey());
  const shopLB = lockingBytecodeOf(shopAddr);

  it('a card payment is "from a card", not "from a stamp", and counts only what reached the shop', () => {
    const shopKey = generatePrivateKey();
    const cardKey = generatePrivateKey();
    const approval = approveShopAddress(shopKey, shopLB);
    const c = cardContract(
      { cardPk: publicKeyOf(cardKey), shopPk: publicKeyOf(shopKey), giverLockingBytecode: lockingBytecodeOf(p2pkh(generatePrivateKey())), expiry: 1_796_000_000n, maxFee: CARD_MAX_FEE, minChange: CARD_MIN_CHANGE },
      provider,
    );
    const u = provider.addUtxo(c.address, randomUtxo({ satoshis: 50_000n }));
    const s = buildCardSpend(c, provider, u, cardKey, approval, 12_000n);
    const p = classifyPayment('aa'.repeat(32), s.builder.build(), 0, shopLB);
    expect(p).toMatchObject({ fromCard: true, fromStamp: false, receivedSatoshis: 12_000n, confirmed: false });
  });

  it('a stamp payment is "from a stamp", not "from a card"', () => {
    const stampKey = generatePrivateKey();
    const c = stampContract(
      { variant: 'cov', stampPk: publicKeyOf(stampKey), merchantLockingBytecode: shopLB, sponsorLockingBytecode: lockingBytecodeOf(p2pkh(generatePrivateKey())), expiry: 1_796_000_000n, maxFee: 2000n },
      provider,
    );
    const u = provider.addUtxo(c.address, randomUtxo({ satoshis: 20_000n }));
    const { builder } = buildSpend(c, provider, u, stampKey, shopLB);
    expect(classifyPayment('bb'.repeat(32), builder.build(), 977_000, shopLB)).toMatchObject({ fromCard: false, fromStamp: true, confirmed: true });
  });

  it('an ordinary wallet payment is neither', () => {
    const k = generatePrivateKey();
    const u = provider.addUtxo(p2pkh(k), randomUtxo({ satoshis: 30_000n }));
    const hex = new TransactionBuilder({ provider })
      .addInput(u, new SignatureTemplate(k).unlockP2PKH())
      .addOutput({ to: shopAddr, amount: 25_000n })
      .build();
    expect(classifyPayment('cc'.repeat(32), hex, 0, shopLB)).toMatchObject({ fromCard: false, fromStamp: false, receivedSatoshis: 25_000n });
  });
});
