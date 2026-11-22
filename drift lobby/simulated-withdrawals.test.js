import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { base58, bech32, bech32m } from '@scure/base';
import {
  handleWithdrawalSimulation, openWithdrawalSimulation, simulatedNoticeText, validSimulationDestination
} from './simulated-withdrawals.js';

const addresses = Object.fromEntries(['LTC','BTC','SOL','ETH','BNB','AVAX'].map(coin => [
  coin,
  coin === 'LTC' || coin === 'BTC'
    ? bech32.encode(coin === 'LTC' ? 'ltc' : 'bc',[0,...bech32.toWords(new Uint8Array(20).fill(5))])
    : coin === 'SOL' ? base58.encode(new Uint8Array(32).fill(5)) : '0x' + '12'.repeat(20)
]));

test('witness checks reject wrong networks and wrong checksum versions', () => {
  const words=bech32.toWords(new Uint8Array(32).fill(5));
  assert.ok(validSimulationDestination('BTC',bech32m.encode('bc',[1,...words])));
  assert.ok(!validSimulationDestination('BTC',bech32.encode('bc',[1,...words])));
  assert.ok(!validSimulationDestination('LTC',addresses.BTC));
  assert.ok(!validSimulationDestination('BTC',addresses.LTC));
  assert.ok(!validSimulationDestination('ETH','0x52908400098527886e0f7030069857D2e4169EE7'));
});

for (const [coin,address] of Object.entries(addresses)) {
  test(coin + ' mock withdrawal stays private, reserves once, and survives restarts', async () => {
    const dir = mkdtempSync(join(tmpdir(),'withdraw-sim-'));
    const file = join(dir,'simulation.sqlite');
    let simulation=openWithdrawalSimulation(file), second;
    const dm=[], channel=[];
    async function send(content, inServer=false, member='alice'){
      const replies=inServer?channel:dm;
      assert.equal(await handleWithdrawalSimulation({
        content,author:{id:member,send: async value=>dm.push(value)},
        inGuild:()=>inServer,reply: async value=>replies.push(value)
      },simulation),true);
      return replies.at(-1);
    }
    try{
      assert.match(await send('$withdraw '+coin,true),/Check your DMs/);
      assert.match(dm.at(-1),/Simulation only.*\$amount/);
      assert.match(await send('$amount 1'),/Insufficient mock/);
      assert.match(await send('$amount 0.7'),/\$address/);
      assert.match(await send('$address invalid'),/Invalid address/);
      assert.match(await send('$address '+address,true),/Use that command in a DM/);
      const quote=await send('$address '+address);
      assert.match(quote,/Estimated mock fee/);
      assert.match(quote,/Total mock debit/);
      assert.ok(!channel.some(line=>line.includes(address)));
      const id=quote.match(/\$confirm ([\da-f-]{36})/)[1];
      assert.match(await send('$confirm '+id,false,'bob'),/unavailable/);

      // A second concurrent quote can be displayed, but only the first may reserve funds.
      await send('$withdraw '+coin);await send('$amount 0.7');
      const other=(await send('$address '+address)).match(/\$confirm ([\da-f-]{36})/)[1];
      second=openWithdrawalSimulation(file);
      assert.match(await send('$confirm '+id),/Mock debit reserved/);
      assert.match(second.confirm('alice',other),/Insufficient mock/);
      assert.match(await send('$confirm '+id),/Already pending/);
      const pending=await send('$simbal '+coin);
      assert.match(pending,/Pending debit: 0\.7/);
      simulation.close();simulation=openWithdrawalSimulation(file);
      simulation.completePending();second.completePending();

      // A Discord DM timeout after completion may retry notification after restart.
      simulation.close();simulation=openWithdrawalSimulation(file);
      simulation.completePending();
      const [notice]=simulation.notices();
      assert.equal(simulation.notices().length,1);
      assert.match(simulatedNoticeText(notice),/Simulation only.*Completed mock payout/);
      assert.match(notice.txid,/^sim-[0-9a-f]{64}$/);
      assert.ok((await send('$confirm '+id)).includes(notice.txid));
      const totals=await send('$simbal '+coin);
      assert.match(totals,new RegExp('Pending debit: 0 '+coin));
      assert.match(totals,/Completed debit: 0\.7/);
      simulation.notified(notice.request_id);
      assert.deepEqual(second.notices(),[]);
      assert.ok(!await handleWithdrawalSimulation({author:{id:'alice'},content:'$b'},simulation));
    }finally{
      second?.close();simulation.close();rmSync(dir,{recursive:true,force:true});
    }
  });
}

test('expired quotes cannot reserve balances',()=>{
 let tick=1000;
 const sim=openWithdrawalSimulation(':memory:',{now:()=>tick});
 try{
   const id=sim.start('member','BTC');sim.enterAmount('member','0.1');sim.enterAddress('member',addresses.BTC);
   tick+=15*60*1000;
   assert.match(sim.confirm('member',id),/expired/);
   assert.equal(sim.balance('member','BTC').pending,0n);
 } finally {sim.close();}
});
