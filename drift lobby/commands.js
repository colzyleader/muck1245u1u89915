import { networks } from './addresses.js';
import { policy, displayAmount } from './watch.js';
export async function handleMessage(m,store,check){
 if(m.author.bot)return;
 const [cmd,symbol='LTC',...extra]=m.content.trim().split(/\s+/);
 if(cmd.toLowerCase()==='$withdraw'){
   await m.reply('Automatic withdrawals are offline. No withdrawal was requested or sent. Use $b to view your confirmed deposits.');
   return;
 }
 if(cmd.toLowerCase()==='$b'){
   if(m.content.trim().split(/\s+/).length!==1){await m.reply('Type $b to see your own confirmed deposits.');return;}
   const totals=store.confirmedDeposits(m.author.id);
   const lines=Array.from(totals,([coin,amount])=>displayAmount(amount,coin)+' '+coin);
   await m.reply(lines.length ? ['**Your confirmed deposits**',...lines].join('\n') : 'No confirmed deposits recorded for you yet. Use $depo for your deposit address.');
   return;
 }
 if(cmd.toLowerCase()!=='$depo')return;
 const coin=symbol.toUpperCase();
 if(extra.length||!Object.hasOwn(networks,coin)){await m.reply('Use $depo LTC, BTC, SOL, ETH, BNB or AVAX.');return;}
 if(policy[coin].chain&&!process.env.ETHERSCAN_API_KEY){await m.reply(coin+' deposit monitoring is not configured.');return;}
 const {address,managed}=store.issue(m.author.id,coin);
 if(check) {
   try {await check({user:m.author.id,coin,address},store);}catch{await m.reply(coin+' monitoring is temporarily unavailable. Try again shortly.');return;}
 }
 const label=managed?'The server operator controls this deposit wallet.':'You control this previously linked wallet with your recovery words.';
 try{
   await m.author.send('Your **'+coin+'** deposit address on **'+networks[coin]+' mainnet**\n`'+address+'`\nSend only native '+coin+' on this network. '+label);
 }catch(error){
   if(error.code!==50007)throw error;
   if(m.inGuild())await m.reply('Enable DMs from this server, then run the command again.');
   return;
 }
 if(m.inGuild())await m.reply('Check your DMs.');
}
