import bitcoin from 'bitcoinjs-lib';
import { secp256k1 } from '@noble/curves/secp256k1';

const network = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: { public: 0x019da462, private: 0x019d9cfe },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0
};
const txidPattern = /^[0-9a-f]{64}$/;
const maxMoney = 84000000 * 100000000;
const minOutput = 1000;
const maxInputs = 20;
const confirmations = 6;

function validUnits(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maxMoney;
}

export function createLtcSigner(privateKey, { api, fetchImpl = fetch, maxAmount, maxFee }) {
  if (!(privateKey instanceof Uint8Array) || privateKey.length !== 32) throw new Error('Expected a 32-byte payout key');
  if (!validUnits(maxAmount) || maxAmount < minOutput || !validUnits(maxFee) || maxFee === 0) {
    throw new Error('Set valid amount and fee limits in litoshis');
  }
  const endpoint = new URL(api);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('Expected an HTTPS explorer API URL');
  }
  const root = endpoint.href.replace(/\/$/, '');
  const key = Uint8Array.from(privateKey);
  const publicKey = Buffer.from(secp256k1.getPublicKey(key, true));
  const payment = bitcoin.payments.p2wpkh({ pubkey: publicKey, network });
  const signer = { publicKey, sign: hash => Buffer.from(secp256k1.sign(hash, key, { lowS: true }).toCompactRawBytes()) };

  async function request(path, options) {
    const response = await fetchImpl(root + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Litecoin API HTTP ' + response.status);
    return (await response.text()).trim();
  }

  async function prepare(destination, amount, feeRate) {
    if (!validUnits(amount) || amount < minOutput || amount > maxAmount) throw new Error('Amount outside payout limits');
    if (!Number.isSafeInteger(feeRate) || feeRate < 1 || feeRate > 1000) throw new Error('Fee rate outside payout limits');
    const outputScript = bitcoin.address.toOutputScript(destination, network);
    if (outputScript.equals(payment.output)) throw new Error('Destination is the payout wallet');
    const [tipText, body] = await Promise.all([
      request('/blocks/tip/height'),
      request('/address/' + payment.address + '/utxo')
    ]);
    if (!/^\d+$/.test(tipText) || !Number.isSafeInteger(Number(tipText))) throw new Error('Invalid chain height');
    const tip = Number(tipText), outputs = JSON.parse(body);
    if (!Array.isArray(outputs)) throw new Error('Invalid UTXO list');
    const eligible = outputs.filter(out =>
      out.status?.confirmed === true &&
      Number.isSafeInteger(out.status.block_height) &&
      out.status.block_height > 0 && tip - out.status.block_height + 1 >= confirmations &&
      txidPattern.test(out.txid) &&
      Number.isSafeInteger(out.vout) && out.vout >= 0 &&
      validUnits(out.value) && out.value > 0
    ).sort((a, b) => b.value - a.value);

    const psbt = new bitcoin.Psbt({ network });
    const used = new Set();
    let total = 0, fee = 0;
    for (const out of eligible) {
      if (psbt.inputCount === maxInputs) break;
      const outpoint = out.txid + ':' + out.vout;
      if (used.has(outpoint)) continue;
      used.add(outpoint);
      const parent = bitcoin.Transaction.fromHex(await request('/tx/' + out.txid + '/hex'));
      const prevout = parent.outs[out.vout];
      if (parent.getId() !== out.txid || !prevout || !prevout.script.equals(payment.output) || prevout.value !== out.value) {
        throw new Error('Explorer output failed verification');
      }
      psbt.addInput({ hash: out.txid, index: out.vout, witnessUtxo: prevout });
      total += out.value;
      fee = feeRate * (11 + 69 * psbt.inputCount + 9 + outputScript.length + 31);
      if (total >= amount + fee) break;
    }
    if (!psbt.inputCount || total < amount + fee) throw new Error('Insufficient confirmed Litecoin in payout wallet');
    if (!validUnits(total)) throw new Error('Invalid input total');

    psbt.addOutput({ script: outputScript, value: amount });
    const change = total - amount - fee;
    if (change >= minOutput) psbt.addOutput({ script: payment.output, value: change });
    else fee += change;
    if (fee > maxFee) throw new Error('Payout fee exceeds the configured cap');
    psbt.signAllInputs(signer).finalizeAllInputs();
    const tx = psbt.extractTransaction(true);
    if (fee < tx.virtualSize() * feeRate) throw new Error('Payout fee lower than the requested rate');
    return { txid: tx.getId(), raw: tx.toHex(), fee, inputs: [...used] };
  }

  // Callers must durably record the signed blob and reserve its inputs before submitting.
  // After an ambiguous result, retry only that same blob or reconcile its transaction ID.
  async function broadcast({ txid, raw }) {
    if (!txidPattern.test(txid) || bitcoin.Transaction.fromHex(raw).getId() !== txid) {
      throw new Error('Signed transaction ID mismatch');
    }
    const id = await request('/tx', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: raw });
    if (id !== txid) throw new Error('Broadcast response did not match the signed transaction ID');
    return id;
  }

  return { address: payment.address, prepare, broadcast };
}
