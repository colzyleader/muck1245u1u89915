import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { ed25519 } from '@noble/curves/ed25519';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { hex } from '@scure/base';

export function publicKeys(words) {
  const seed = mnemonicToSeedSync(words);
  const root = HDKey.fromMasterSeed(seed);
  const keys = {};
  for (const [coin, path] of Object.entries({ BTC:"m/84'/0'/0'/0/0", LTC:"m/84'/2'/0'/0/0", ETH:"m/44'/60'/0'/0/0" })) {
    keys[coin] = hex.encode(root.derive(path).publicKey);
  }
  let node = hmac(sha512, 'ed25519 seed', seed);
  for (const index of [44, 501, 0, 0]) {
    const data = new Uint8Array(37);
    data.set(node.slice(0,32),1);
    new DataView(data.buffer).setUint32(33, 0x80000000 + index);
    node = hmac(sha512,node.slice(32),data);
  }
  keys.SOL = hex.encode(ed25519.getPublicKey(node.slice(0,32)));
  return keys;
}
