export default {
  contractName: 'FirstPurchaseStamp',
  constructorInputs: [
    { name: 'stampPk', type: 'pubkey' },
    { name: 'merchantLockingBytecode', type: 'bytes' },
    { name: 'sponsorPk', type: 'pubkey' },
    { name: 'expiry', type: 'int' },
    { name: 'maxFee', type: 'int' },
  ],
  abi: [
    {
      name: 'spend',
      inputs: [
        { name: 'stampSig', type: 'sig' },
      ],
    },
    {
      name: 'reclaim',
      inputs: [
        { name: 'sponsorSig', type: 'sig' },
      ],
    },
  ],
  bytecode: 'OP_5 OP_PICK OP_0 OP_NUMEQUAL OP_IF OP_6 OP_ROLL OP_SWAP OP_CHECKSIGVERIFY OP_TXINPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_4 OP_ROLL OP_SUB OP_GREATERTHANOREQUAL OP_NIP OP_NIP OP_NIP OP_ELSE OP_5 OP_ROLL OP_1 OP_NUMEQUALVERIFY OP_5 OP_ROLL OP_3 OP_ROLL OP_CHECKSIGVERIFY OP_ROT OP_CHECKLOCKTIMEVERIFY OP_2DROP OP_2DROP OP_1 OP_ENDIF',
  source: 'pragma cashscript ^0.14.0;\n\n// First Purchase stamp, variant A: the sponsor signs the reclaim.\n//\n// One contract instance (one UTXO) per stamp.\n// - spend:   whoever holds the stamp key can pay the full stamp value to ONE merchant.\n//            The only freedom is the miner fee, capped by maxFee.\n// - reclaim: after the expiry time, the sponsor takes the stamp back with their own key.\ncontract FirstPurchaseStamp(\n    pubkey stampPk,\n    bytes merchantLockingBytecode,\n    pubkey sponsorPk,\n    int expiry,\n    int maxFee\n) {\n    function spend(sig stampSig) {\n        require(checkSig(stampSig, stampPk), "stamp key signature required");\n        require(tx.inputs.length == 1, "stamp must be spent alone");\n        require(tx.outputs.length == 1, "exactly one output: the merchant");\n        require(tx.outputs[0].lockingBytecode == merchantLockingBytecode, "output must pay the merchant");\n        require(tx.outputs[0].value >= tx.inputs[0].value - maxFee, "fee above the cap");\n    }\n\n    function reclaim(sig sponsorSig) {\n        require(checkSig(sponsorSig, sponsorPk), "sponsor signature required");\n        require(tx.time >= expiry, "stamp has not expired yet");\n    }\n}\n',
  fingerprint: '9bb5ebe4e2e0339589f77f4f6fa1e683643566ed9922c314350182b3eef0196e',
  debug: {
    bytecode: '5579009c63567a7cadc3519dc4519d00cd8800cc00c6547a94a277777767557a519d557a537aad7bb16d6d5168',
    sourceMap: '16:4:22:5;;;;;17:25:17:33;;:35::42;:8::77:1;18:16:18:32:0;:36::37;:8::68:1;19:16:19:33:0;:37::38;:8::76:1;20:27:20:28:0;:16::45:1;:8::106;21:27:21:28:0;:16::35:1;:49::50:0;:39::57:1;:60::66:0;;:39:::1;:8::89;16:33:22:5;;;:4;24::27::0;;;;25:25:25:35;;:37::46;;:8::79:1;26:27:26:33:0;:8::64:1;24:37:27:5;;;9:0:28:1',
    logs: [],
    requires: [
      { ip: 13, line: 17, message: 'stamp key signature required' },
      { ip: 16, line: 18, message: 'stamp must be spent alone' },
      { ip: 19, line: 19, message: 'exactly one output: the merchant' },
      { ip: 22, line: 20, message: 'output must pay the merchant' },
      { ip: 31, line: 21, message: 'fee above the cap' },
      { ip: 43, line: 25, message: 'sponsor signature required' },
      { ip: 45, line: 26, message: 'stamp has not expired yet' },
    ],
    sourceTags: '26:28:sc',
  },
  compiler: {
    name: 'cashc',
    version: '0.14.0',
    options: {
      enforceFunctionParameterTypes: true,
      enforceLocktimeGuard: true,
    },
  },
  updatedAt: '2026-11-13T16:41:21.954Z',
} as const;
