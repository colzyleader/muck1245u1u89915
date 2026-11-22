import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateMnemonic} from '@scure/bip39';
import {wordlist} from '@scure/bip39/wordlists/english';
import {publicKeys} from './derive.js';
import {openStore} from './store.js';
import {handleMessage} from './commands.js';
import {scan,displayAmount} from './watch.js';

test('two users, direct DMs, stable assignments and restart-safe status delivery',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'depo-')),path=join(dir,'db');
 let store=openStore(path);
 const original=global.fetch;
 try{
   store.install([1,2].map(()=>publicKeys(generateMnemonic(wordlist))));
   const {address}=store.issue('alice','LTC');
   assert.notEqual(address,store.issue('bob','LTC').address);
   const dms=[];
   await handleMessage({author:{id:'alice',send:async m=>dms.push(m)},content:'$depo LTC',inGuild:()=>true,reply:async m=>assert.equal(m,'Check your DMs.')},store);
   assert.ok(dms[0].includes(address));assert.ok(!dms[0].includes('http'));
   const w={user:'alice',coin:'LTC',address},tx={txid:'ab'.repeat(32),vin:[{}],vout:[{scriptpubkey_address:address,value:40000000}],status:{confirmed:false}};
   let height=500;
   global.fetch=async url=>Response.json(url.endsWith('height')?height:url.endsWith('/mempool')?(tx.status.confirmed?[]:[tx]):(tx.status.confirmed?[tx]:[]));
   await scan(w,store);const [pending]=store.queue();assert.equal(pending.state,'Pending');assert.equal(displayAmount(pending.amount,'LTC'),'0.4');
   store.delivered(pending,'dm1');store.close();store=openStore(path);
   assert.equal(store.issue('alice','LTC').address,address);
   tx.status={confirmed:true,block_height:500};await scan(w,store);assert.deepEqual(store.queue(),[]);
   height=505;await scan(w,store);
   const [confirmed]=store.queue();assert.equal(confirmed.tx,pending.tx);assert.equal(confirmed.state,'Confirmed');
   store.delivered(confirmed,'dm2');await scan(w,store);assert.deepEqual(store.queue(),[]);
 }finally{global.fetch=original;store.close();rmSync(dir,{recursive:true,force:true});}
});

test('Solana and EVM require a successful native transfer and the configured depth',async()=>{
 const original=global.fetch,apiKey=process.env.ETHERSCAN_API_KEY;
 process.env.ETHERSCAN_API_KEY='test';
 const store=openStore(':memory:');
 try{
 store.install([publicKeys(generateMnemonic(wordlist))]);
 for(const [coin,chain,depth] of [['SOL',0,0],['ETH',1,12],['BNB',56,15],['AVAX',43114,3]]){
  const {address}=store.issue('member',coin),w={address,coin,user:'member'};let deep=false,failed=true;
  global.fetch=async (url,options)=>{
   if(!options?.body)return Response.json({status:'1',result:[{to:address,hash:'testtx',isError:'0',value:'45'}]});
   const method=JSON.parse(options.body).method;
   const responses={
    getGenesisHash:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    getSignaturesForAddress:[{signature:'testtx',err:null,confirmationStatus:deep?'finalized':'confirmed'}],
    getTransaction:{meta:{err:failed?{}:null},transaction:{message:{instructions:[{programId:'11111111111111111111111111111111',parsed:{type:'transfer',info:{source:'outside',destination:address,lamports:45}}}]}}},
    eth_chainId:String(chain),eth_blockNumber:String(deep?100+depth-1:100),
    eth_getTransactionByHash:{hash:'testtx',to:address,from:'other',blockHash:'block',value:'45'},
    eth_getTransactionReceipt:{status:failed?'0x0':'0x1',blockHash:'block',blockNumber:'0x64'},
    eth_getBlockByNumber:{hash:'block'}};
   return Response.json({result:responses[method]});
  };
  await scan(w,store);assert.equal(store.queue().length,0);
  failed=false;await scan(w,store);let [e]=store.queue();assert.equal(e.state,'Pending');store.delivered(e,'1');
  deep=true;await scan(w,store);[e]=store.queue();assert.equal(e.state,'Confirmed');assert.equal(e.amount,'45');store.delivered(e,'2');
 }
 }finally{global.fetch=original;if(apiKey===undefined)delete process.env.ETHERSCAN_API_KEY;else process.env.ETHERSCAN_API_KEY=apiKey;store.close();}
});

test('DM deposit assignment credits the same member in the server exactly once',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'depo-total-')),path=join(dir,'db');
 let store=openStore(path);
 const dms=[],replies=[];
 const member={author:{id:'alice',send:async s=>dms.push(s)},inGuild:()=>false,content:'$depo LTC',reply:async s=>replies.push(s)};
 try{
   store.install([1,2].map(()=>publicKeys(generateMnemonic(wordlist))));
   await handleMessage(member,store);
   const w=store.watches()[0];assert.ok(dms[0].includes(w.address));
   member.inGuild=()=>true;member.content='$b';
   store.issue('bob','LTC');store.record({user:'bob',coin:'LTC'},'bobtx',700000000,'Confirmed');
   store.record(w,'deposit1',40000000,'Pending');
   await handleMessage(member,store);assert.match(replies.pop(),/No confirmed deposits/);
   store.record(w,'deposit1',40000000,'Confirmed');
   store.record(w,'deposit1',40000000,'Confirmed');
   store.record(w,'deposit2',10000000,'Confirmed');store.record(w,'deposit3',200000000,'Pending');
   store.record({user:'alice',coin:'ETH'},'ethdeposit',1000000000000000001n,'Confirmed');
   store.close();store=openStore(path);
   await handleMessage(member,store);
   assert.equal(replies.pop(),'**Your confirmed deposits**\n1.000000000000000001 ETH\n0.5 LTC');
   assert.equal(dms.length,1);
   member.content='$b <@bob>';await handleMessage(member,store);assert.match(replies.pop(),/your own/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
