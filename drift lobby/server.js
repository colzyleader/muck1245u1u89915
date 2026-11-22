import { Client,GatewayIntentBits,Partials,Events } from 'discord.js';
import { readFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openStore } from './store.js';
import { handleMessage } from './commands.js';
import { scan,policy,displayAmount } from './watch.js';
import { setTimeout as pause } from 'node:timers/promises';
if(!process.env.DISCORD_TOKEN)throw Error('Set DISCORD_TOKEN in .env');
const dir=resolve(process.env.DATA_DIR||'data');mkdirSync(dir,{recursive:true});
const store=openStore(resolve(dir,'wallets.sqlite'));
store.install(JSON.parse(readFileSync(process.env.PUBLIC_POOL||'public-pool.json','utf8')));
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.DirectMessages,GatewayIntentBits.MessageContent],partials:[Partials.Channel],allowedMentions:{parse:[],repliedUser:false}});
client.on('messageCreate',m=>handleMessage(m,store,scan).catch(async e=>{
 console.error('Deposit command failed:',e.code||e.name);
 await m.reply(e.message.startsWith('No deposit addresses')?e.message:'Deposit request failed. Try again shortly.').catch(()=>{});
}));
async function watch(coin){
 while(true){
   for(const w of store.watches().filter(x=>x.coin===coin)){
     try{await scan(w,store);}catch(e){console.error(coin+' scan:',e.message);}
     await pause(550);
   }
   await pause(20000);
 }
}
async function deliver(){
 while(true){
   for(const e of store.queue()){
     try{
       const user=await client.users.fetch(e.user);
       const nonce=createHash('sha256').update([e.user,e.coin,e.tx,e.state].join('|')).digest('hex').slice(0,24);
       const sent=await user.send({content:'**'+e.state+'** · '+displayAmount(e.amount,e.coin)+' '+e.coin+'\nTransaction ID\n`'+e.tx+'`',nonce,enforceNonce:true});
       store.delivered(e,sent.id);
     }catch(err){console.error('DM pending retry:',err.code||err.name);}
   }
   await pause(6000);
 }
}
client.once(Events.ClientReady,()=>{
 console.log('Deposit bot connected.');
 for(const coin of Object.keys(policy))void watch(coin);
 void deliver();
});
await client.login(process.env.DISCORD_TOKEN);
