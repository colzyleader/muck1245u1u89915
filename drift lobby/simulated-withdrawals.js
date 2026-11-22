import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { base58, base58check, bech32, bech32m } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import { networks } from './addresses.js';

const policy = {
  LTC: { decimals: 8, fee: 10000n, prefix: 'ltc', legacy: [48, 50] },
  BTC: { decimals: 8, fee: 1000n, prefix: 'bc', legacy: [0, 5] },
  SOL: { decimals: 9, fee: 5000n },
  ETH: { decimals: 18, fee: 100000000000000n },
  BNB: { decimals: 18, fee: 100000000000000n },
  AVAX: { decimals: 18, fee: 100000000000000n }
};
const legacyCodec = base58check(sha256);
const label = 'Simulation only';
const quoteTtl = 15 * 60 * 1000;

function amountUnits(value, coin) {
  if (value.length > 40 || !/^\d+(\.\d+)?$/.test(value)) return 0n;
  const [whole, fraction = ''] = value.split('.');
  const { decimals } = policy[coin];
  if (fraction.length > decimals) return 0n;
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

function amountText(amount, coin) {
  const { decimals } = policy[coin];
  const value = String(amount).padStart(decimals + 1, '0');
  const fraction = value.slice(-decimals).replace(/0+$/, '');
  return value.slice(0, -decimals) + (fraction ? '.' + fraction : '') + ' ' + coin;
}

export function validSimulationDestination(coin, address) {
  if (!Object.hasOwn(policy, coin) || typeof address !== 'string' || address.length > 90) return false;
  const rule = policy[coin];
  try {
    if (rule.prefix) {
      if (address.toLowerCase().startsWith(rule.prefix + '1')) {
        for (const [version0, codec] of [[true, bech32], [false, bech32m]]) {
          const decoded = codec.decodeUnsafe(address);
          if (!decoded || decoded.prefix !== rule.prefix || !decoded.words.length) continue;
          const [version, ...words] = decoded.words;
          const size = codec.fromWords(words).length;
          return version0 ? version === 0 && (size === 20 || size === 32)
            : version >= 1 && version <= 16 && size >= 2 && size <= 40 && (version !== 1 || size === 32);
        }
        return false;
      }
      const decoded = legacyCodec.decode(address);
      return decoded.length === 21 && rule.legacy.includes(decoded[0]);
    }
    if (coin === 'SOL') return base58.decode(address).length === 32;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
    const value = address.slice(2), lower = value.toLowerCase();
    if (value === lower || value === value.toUpperCase()) return true;
    const hash = Buffer.from(keccak_256(lower)).toString('hex');
    return [...lower].map((char, i) => parseInt(hash[i], 16) >= 8 ? char.toUpperCase() : char).join('') === value;
  } catch {
    return false;
  }
}

export function openWithdrawalSimulation(file, { now = Date.now } = {}) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS simulation_requests(
      id TEXT PRIMARY KEY, member TEXT NOT NULL, coin TEXT NOT NULL, amount TEXT, destination TEXT,
      fee TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('amount','destination','quoted','pending','completed')),
      expires INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS simulation_one_active_draft
      ON simulation_requests(member) WHERE state IN ('amount','destination');
    CREATE INDEX IF NOT EXISTS simulation_member_coin ON simulation_requests(member,coin,state);
    CREATE TABLE IF NOT EXISTS simulation_payouts(
      request_id TEXT PRIMARY KEY REFERENCES simulation_requests(id), txid TEXT NOT NULL UNIQUE, notified INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0
    );
  `);
  function atomic(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  const draft = member => db.prepare("SELECT * FROM simulation_requests WHERE member=? AND state IN ('amount','destination')").get(member);
  const lookup = (member, id) => db.prepare('SELECT * FROM simulation_requests WHERE member=? AND id=?').get(member, id);
  const payout = id => db.prepare('SELECT * FROM simulation_payouts WHERE request_id=?').get(id);
  function balance(member, coin) {
    let pending = 0n, completed = 0n;
    const entries = db.prepare("SELECT amount,fee,state FROM simulation_requests WHERE member=? AND coin=? AND state IN ('pending','completed')");
    for (const item of entries.iterate(member, coin)) {
      const debit = BigInt(item.amount) + BigInt(item.fee);
      if (item.state === 'pending') pending += debit;
      else completed += debit;
    }
    return { available: 10n ** BigInt(policy[coin].decimals) - pending - completed, pending, completed };
  }
  function start(member, coin) {
    if (!Object.hasOwn(policy, coin)) throw new Error('Unsupported simulation asset');
    return atomic(() => {
      db.prepare("DELETE FROM simulation_requests WHERE member=? AND (state IN ('amount','destination') OR (state='quoted' AND expires<=?))")
        .run(member, now());
      const id = randomUUID();
      db.prepare("INSERT INTO simulation_requests(id,member,coin,fee,state,expires) VALUES(?,?,?,?,'amount',?)")
        .run(id, member, coin, String(policy[coin].fee), now() + quoteTtl);
      return id;
    });
  }
  function enterAmount(member, raw) {
    return atomic(() => {
      const row = draft(member);
      if (row?.state !== 'amount' || row.expires <= now()) return 'Start with $withdraw COIN.';
      const amount = amountUnits(raw, row.coin);
      if (amount <= 0n) return 'Enter a positive amount with valid decimal precision.';
      if (amount + BigInt(row.fee) > balance(member, row.coin).available) return 'Insufficient mock balance including fee.';
      db.prepare("UPDATE simulation_requests SET amount=?,state='destination' WHERE id=?").run(String(amount), row.id);
      return 'Reply with $address DESTINATION.';
    });
  }
  function enterAddress(member, address) {
    return atomic(() => {
      const row = draft(member);
      if (row?.state !== 'destination' || row.expires <= now()) return 'Start with $withdraw COIN, then enter the amount.';
      if (!validSimulationDestination(row.coin, address)) return 'Invalid address for ' + networks[row.coin] + '.';
      db.prepare("UPDATE simulation_requests SET destination=?,state='quoted',expires=? WHERE id=?")
        .run(address, now() + quoteTtl, row.id);
      return [
        'Mock withdrawal on ' + networks[row.coin],
        'Amount: ' + amountText(BigInt(row.amount), row.coin),
        'Simulated destination: ' + address,
        'Estimated mock fee: ' + amountText(BigInt(row.fee), row.coin),
        'Total mock debit: ' + amountText(BigInt(row.amount) + BigInt(row.fee), row.coin),
        'Reply with $confirm ' + row.id + ' within 15 minutes.'
      ].join('\n');
    });
  }
  function confirm(member, id) {
    return atomic(() => {
      const row = lookup(member, id);
      if (row?.state === 'completed') return 'Already completed. Simulated transaction ID: ' + payout(id).txid;
      if (row?.state === 'pending') return 'Already pending. You’ll receive a DM when the simulation completes.';
      if (row?.state !== 'quoted' || row.expires <= now()) return 'Quote unavailable or expired. Start a new simulation with $withdraw COIN.';
      if (BigInt(row.amount) + BigInt(row.fee) > balance(member, row.coin).available) return 'Insufficient mock balance including fee.';
      db.prepare("UPDATE simulation_requests SET state='pending' WHERE id=?").run(id);
      return 'Mock debit reserved. You’ll receive a DM when the simulation completes.';
    });
  }
  function completePending() {
    const waiting = db.prepare("SELECT id FROM simulation_requests WHERE state='pending' ORDER BY rowid LIMIT 100").all();
    for (const { id } of waiting) {
      atomic(() => {
        if (db.prepare('SELECT state FROM simulation_requests WHERE id=?').get(id)?.state !== 'pending') return;
        // The mock provider is just a durable event in the same transaction. It has no network or wallet access.
        const txid = 'sim-' + createHash('sha256').update(id).digest('hex');
        db.prepare('INSERT INTO simulation_payouts(request_id,txid) VALUES(?,?)').run(id, txid);
        db.prepare("UPDATE simulation_requests SET state='completed' WHERE id=?").run(id);
      });
    }
  }
  function notices() {
    return db.prepare(`SELECT p.request_id,p.txid,r.member,r.coin,r.amount FROM simulation_payouts p
      JOIN simulation_requests r ON r.id=p.request_id WHERE p.notified=0 AND p.next_attempt<=? ORDER BY p.rowid LIMIT 100`).all(now());
  }
  return { start, enterAmount, enterAddress, confirm, balance, completePending, notices,
    deferNotice: id => db.prepare('UPDATE simulation_payouts SET next_attempt=? WHERE request_id=?').run(now() + 60000, id),
    notified: id => db.prepare('UPDATE simulation_payouts SET notified=1 WHERE request_id=?').run(id),
    close: () => db.close() };
}

export async function handleWithdrawalSimulation(message, simulation) {
  if (message.author.bot) return false;
  const [command, value, ...extra] = message.content.trim().split(/\s+/);
  const cmd = command.toLowerCase();
  if (!['$withdraw','$amount','$address','$confirm','$simbal'].includes(cmd)) return false;

  const member = message.author.id;
  const coin = value?.toUpperCase();
  const reply = content => message.reply('**' + label + '** · ' + content);
  if (cmd === '$withdraw') {
    if (extra.length || !Object.hasOwn(policy, coin)) {
      await reply('Use $withdraw LTC, BTC, SOL, ETH, BNB, or AVAX.'); return true;
    }
    const text = '**' + label + '** · ' + networks[coin] + ' mock withdrawal. Reply with $amount AMOUNT.';
    simulation.start(member, coin);
    if (message.inGuild()) {
      try { await message.author.send(text); }
      catch { await reply('I couldn’t DM you. Enable server DMs or message me directly.'); return true; }
      await reply('Check your DMs.');
    } else await message.reply(text);
    return true;
  }
  if (message.inGuild()) { await reply('Use that command in a DM with me.'); return true; }
  if (cmd === '$simbal') {
    if (extra.length || !Object.hasOwn(policy, coin)) { await reply('Use $simbal COIN.'); return true; }
    const { available, pending, completed } = simulation.balance(member, coin);
    await reply([
      'Available: ' + amountText(available, coin),
      'Pending debit: ' + amountText(pending, coin),
      'Completed debit: ' + amountText(completed, coin)
    ].join('\n'));
    return true;
  }
  if (!value || extra.length) { await reply('Provide one value with ' + cmd + '.'); return true; }
  const response = cmd === '$amount' ? simulation.enterAmount(member, value)
    : cmd === '$address' ? simulation.enterAddress(member, value)
    : simulation.confirm(member, value);
  await reply(response);
  return true;
}

export function simulatedNoticeText(notice) {
  return '**' + label + '** · Completed mock payout of ' + amountText(BigInt(notice.amount), notice.coin)
    + '\nSimulated transaction ID: ' + notice.txid;
}
