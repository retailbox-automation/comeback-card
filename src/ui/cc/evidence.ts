// Proof for each "what if" on the Rules page: a real transaction or a node's own refusal, per network.
// Every value here was copied from a live run's output (test/live/card.live.ts), never typed from memory.
import type { ChainNet } from '../../core/chain';

export interface Evidence {
  /** When and how it was produced. */
  source: string;
  funding: string;
  partial1: string;
  partial2: string;
  returned: string;
  cashOutRefusal: string;
  forgedShopRefusal: string;
}

export const EVIDENCE: Partial<Record<ChainNet, Evidence>> = {
  mainnet: {
    source: 'mainnet run, Nov 17, 2026 16:11 UTC (test/live/card.live.ts, demo sponsor and demo shop)',
    funding: 'ddf4eff8f1ca08f81ababb161ea074a3206b1ea203540819aebf05f1cacacd5a',
    partial1: 'd36b481a0cba12b21966200a1095796cc25a1e0ffd2fe3a60ff32835f0a8642c',
    partial2: '9ee228ce100142ac9c042522eff1cac5ff3236e901cf655a56c216d043758edf',
    returned: 'ca723a5da01ea0da320e5f32f417a233b145166b0b1525a9405eaa3eb6d0c1e9',
    cashOutRefusal: 'mandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation) (code 16)',
    forgedShopRefusal: 'mandatory-script-verify-flag-failed (Signature must be zero for failed CHECK(MULTI)SIG operation) (code 16)',
  },
  chipnet: {
    source: 'chipnet run, Nov 17, 2026 15:52 UTC (test/live/card.live.ts)',
    funding: '7bce8b7e8bce9f5363d7ac8320fca2ddf80bcd67d16b0b030f2dd8880811fb76',
    partial1: '7721b3d31bced75368f280207f0c717966c8cff9ae5e7aa61dd4f8566e6c4fed',
    partial2: '066a06f29a47a1be98402a529defdb55f5aa9eb8e23c8d8762ffe82314057f43',
    returned: '8ab08dc0ece90b48cca562c08b82c5677983ba0575f216ef07279b06b514161b',
    cashOutRefusal: 'mandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation) (code 16)',
    forgedShopRefusal: 'mandatory-script-verify-flag-failed (Signature must be zero for failed CHECK(MULTI)SIG operation) (code 16)',
  },
};
