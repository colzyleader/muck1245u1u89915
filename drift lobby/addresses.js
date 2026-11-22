import { bech32, base58, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { keccak_256 } from '@noble/hashes/sha3';

export const networks = { LTC:'Litecoin', BTC:'Bitcoin', SOL:'Solana', ETH:'Ethereum', BNB:'BNB Smart Chain', AVAX:'Avalanche C-Chain' };

export function addresses(keys) {
  function publicKey(symbol, length) {
    const value = keys[symbol];
    if (typeof value !== 'string' || value.length !== 2 * length) throw Error('Invalid public key');
    return hex.decode(value);
  }
  function segwit(symbol, prefix) {
    const key = publicKey(symbol, 33);
    secp256k1.ProjectivePoint.fromHex(key);
    return bech32.encode(prefix, [0, ...bech32.toWords(ripemd160(sha256(key)))]);
  }
  const ethKey = secp256k1.ProjectivePoint.fromHex(publicKey('ETH', 33)).toRawBytes(false);
  const lower = hex.encode(keccak_256(ethKey.slice(1)).slice(-20));
  const checksum = hex.encode(keccak_256(new TextEncoder().encode(lower)));
  const evm = '0x' + Array.from(lower, (v,i) => parseInt(checksum[i],16) >= 8 ? v.toUpperCase() : v).join('');
  const sol = publicKey('SOL',32);
  ed25519.ExtendedPoint.fromHex(sol);
  return { LTC:segwit('LTC','ltc'), BTC:segwit('BTC','bc'), SOL:base58.encode(sol), ETH:evm, BNB:evm, AVAX:evm };
}
