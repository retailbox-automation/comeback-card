export default {
  contractName: 'FirstPurchaseStampCov',
  constructorInputs: [
    { name: 'stampPk', type: 'pubkey' },
    { name: 'merchantLockingBytecode', type: 'bytes' },
    { name: 'sponsorLockingBytecode', type: 'bytes' },
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
    { name: 'reclaim', inputs: [] },
  ],
  bytecode: 'OP_5 OP_PICK OP_0 OP_NUMEQUAL OP_IF OP_6 OP_ROLL OP_SWAP OP_CHECKSIGVERIFY OP_TXINPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_4 OP_ROLL OP_SUB OP_GREATERTHANOREQUAL OP_NIP OP_NIP OP_NIP OP_ELSE OP_5 OP_ROLL OP_1 OP_NUMEQUALVERIFY OP_3 OP_ROLL OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TXINPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTBYTECODE OP_3 OP_ROLL OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_4 OP_ROLL OP_SUB OP_GREATERTHANOREQUAL OP_NIP OP_NIP OP_ENDIF',
  source: 'pragma cashscript ^0.14.0;\n\n// First Purchase stamp, variant C: reclaim is a covenant, no signature needed.\n//\n// One contract instance (one UTXO) per stamp.\n// - spend:   whoever holds the stamp key can pay the full stamp value to ONE merchant.\n//            The only freedom is the miner fee, capped by maxFee.\n// - reclaim: after the expiry time anyone may trigger it, but the money can only go\n//            back to the sponsor\'s address, minus at most maxFee.\ncontract FirstPurchaseStampCov(\n    pubkey stampPk,\n    bytes merchantLockingBytecode,\n    bytes sponsorLockingBytecode,\n    int expiry,\n    int maxFee\n) {\n    function spend(sig stampSig) {\n        require(checkSig(stampSig, stampPk), "stamp key signature required");\n        require(tx.inputs.length == 1, "stamp must be spent alone");\n        require(tx.outputs.length == 1, "exactly one output: the merchant");\n        require(tx.outputs[0].lockingBytecode == merchantLockingBytecode, "output must pay the merchant");\n        require(tx.outputs[0].value >= tx.inputs[0].value - maxFee, "fee above the cap");\n    }\n\n    function reclaim() {\n        require(tx.time >= expiry, "stamp has not expired yet");\n        require(tx.inputs.length == 1, "stamp must be reclaimed alone");\n        require(tx.outputs.length == 1, "exactly one output: the sponsor");\n        require(tx.outputs[0].lockingBytecode == sponsorLockingBytecode, "output must pay the sponsor");\n        require(tx.outputs[0].value >= tx.inputs[0].value - maxFee, "fee above the cap");\n    }\n}\n',
  fingerprint: '5bbe96f6384832db34033ba6d75be6fbb50a3e39ad9a42992e028b5817853938',
  debug: {
    bytecode: '5579009c63567a7cadc3519dc4519d00cd8800cc00c6547a94a277777767557a519d537ab175c3519dc4519d00cd537a8800cc00c6547a94a2777768',
    sourceMap: '17:4:23:5;;;;;18:25:18:33;;:35::42;:8::77:1;19:16:19:32:0;:36::37;:8::68:1;20:16:20:33:0;:37::38;:8::76:1;21:27:21:28:0;:16::45:1;:8::106;22:27:22:28:0;:16::35:1;:49::50:0;:39::57:1;:60::66:0;;:39:::1;:8::89;17:33:23:5;;;:4;25::31::0;;;;26:27:26:33;;:8::64:1;;27:16:27:32:0;:36::37;:8::72:1;28:16:28:33:0;:37::38;:8::75:1;29:27:29:28:0;:16::45:1;:49::71:0;;:8::104:1;30:27:30:28:0;:16::35:1;:49::50:0;:39::57:1;:60::66:0;;:39:::1;:8::89;25:23:31:5;;10:0:32:1',
    logs: [],
    requires: [
      { ip: 13, line: 18, message: 'stamp key signature required' },
      { ip: 16, line: 19, message: 'stamp must be spent alone' },
      { ip: 19, line: 20, message: 'exactly one output: the merchant' },
      { ip: 22, line: 21, message: 'output must pay the merchant' },
      { ip: 31, line: 22, message: 'fee above the cap' },
      { ip: 41, line: 26, message: 'stamp has not expired yet' },
      { ip: 45, line: 27, message: 'stamp must be reclaimed alone' },
      { ip: 48, line: 28, message: 'exactly one output: the sponsor' },
      { ip: 53, line: 29, message: 'output must pay the sponsor' },
      { ip: 62, line: 30, message: 'fee above the cap' },
    ],
    sourceTags: '26:28:sc;57:58:sc',
  },
  compiler: {
    name: 'cashc',
    version: '0.14.0',
    options: {
      enforceFunctionParameterTypes: true,
      enforceLocktimeGuard: true,
    },
  },
  updatedAt: '2026-11-13T16:41:22.147Z',
} as const;
