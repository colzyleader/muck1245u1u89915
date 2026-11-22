import { networks } from './addresses.js';
import { policy } from './watch.js';
export async function handleMessage(m,store,check){
 if(m.author.bot)return;
 const [cmd,symbol='LTC',...extra]=m.content.trim().split(/\s+/);
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
