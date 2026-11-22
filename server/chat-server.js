'use strict';
// DriftLobby chat relay. Needs Node 18 or newer; no packages are needed unless AI replies are turned on.
// Anyone can read the chat. Sending a message needs a Discord sign-in, which is
// checked with Discord on the server so names and avatars cannot be faked.
// Optionally the chat characters' replies are written by AI (chat-ai.js); see the bottom of this file.
// Tips: players can send each other play credits. Each tip must be confirmed with a code that the
// site's Discord bot sends to the sender by direct message, which needs DISCORD_BOT_TOKEN.
// Player flips: one player puts up play credits on heads or tails, another takes the other side,
// and this server flips the coin. The winner is owed both stakes.
const http=require('node:http');
const fs=require('node:fs');
const crypto=require('node:crypto');

const HISTORY_LIMIT=80,MAX_LENGTH=200,MAX_BODY=2048,IDENTITY_TTL=10*60*1000;

function cleanText(raw){
  return typeof raw==='string'?raw.replace(/[\u0000-\u001f\u007f\s]+/g,' ').trim().slice(0,MAX_LENGTH):'';
}

// How long after a message each AI line appears: people need a few seconds to read and type.
function humanDelay(line,first){return (first?3500+Math.random()*5000:2500+Math.random()*5000)+line.text.length*45}

// ai, when given, is the object from chat-ai.js that writes the characters' replies.
const TIP_LIMIT=1000000,TIP_TRIES=5,FLIPS_EACH=3,FLIP_RESULTS=8;

// botToken turns tipping on. tipTtl is how long a code lasts; tipGap is the wait between code requests.
// storeFile, when given, keeps owed credits and open flips on disk so a restart does not lose them. flipTtl is how long an unjoined flip stays open.
// Once a flip is joined there is a countdown (flipCountdown), then the coin is tossed and shown spinning (flipSpin) before anyone is paid.
function createChatServer({clientId='',origins=[],discordApi='https://discord.com/api',minGap=1000,ai=null,aiDelay=humanDelay,botToken='',tipTtl=5*60*1000,tipGap=15000,storeFile='',flipTtl=60*60*1000,flipCountdown=10000,flipSpin=6000,flipKeep=20*60*1000}={}){
  // people: everyone who has signed in since the server started. tipCodes: one unconfirmed tip per sender.
  // inbox: confirmed tips waiting for the person they are for to open the site.
  const people=new Map(),tipCodes=new Map(),inbox=new Map(),lastTipAsk=new Map();
  // flips: coin flips waiting for a second player. flipResults: the latest finished ones, newest first.
  // A finished flip stays on the list for flipKeep (twenty minutes) and is then dropped.
  const flips=new Map(),flipResults=[];
  if(storeFile){
    try{
      const saved=JSON.parse(fs.readFileSync(storeFile,'utf8'));
      for(const [id,items] of saved.inbox||[])inbox.set(id,items);
      for(const flip of saved.flips||[])flips.set(flip.id,flip);
    }catch{}
  }
  function persist(){
    if(!storeFile)return;
    try{fs.writeFileSync(storeFile,JSON.stringify({inbox:[...inbox],flips:[...flips.values()]}))}catch{}
  }
  // Credits owed to a player wait here until their browser collects them.
  function owe(userId,item){inbox.set(userId,[...(inbox.get(userId)||[]),item].slice(-50));persist()}
  // now and spin let each browser line its countdown and coin up with this server's clock.
  const flipView=()=>({now:Date.now(),spin:flipSpin,open:[...flips.values()].sort((a,b)=>a.at-b.at),recent:flipResults.filter(flip=>Date.now()-flip.at<=flipKeep)});
  function refundFlip(flip,now){
    flips.delete(flip.id);
    owe(flip.creator.id,{kind:'refund',id:flip.id,amount:flip.amount,at:now});
    broadcast('flips',flipView());
  }
  function later(run,wait){
    const timer=setTimeout(()=>{pending.delete(timer);run()},Math.max(0,wait));
    pending.add(timer);
  }
  // A joined flip: wait out the countdown, toss the coin, let it be seen spinning, then pay.
  function runFlip(flip){
    later(()=>{
      if(!flips.has(flip.id))return;
      if(!flip.result){
        // The coin: one fair random bit, chosen only now that the countdown is over.
        flip.result=crypto.randomInt(2)?'Heads':'Tails';
        flip.winner=flip.result===flip.side?flip.creator.id:flip.joiner.id;
        flip.status='flipping';flip.tossedAt=Date.now();
        persist();broadcast('flips',flipView());
      }
      later(()=>settleFlip(flip),flip.tossedAt+flipSpin-Date.now());
    },flip.flipAt-Date.now());
  }
  function settleFlip(flip){
    if(!flips.delete(flip.id))return;
    const now=Date.now(),creatorWon=flip.winner===flip.creator.id;
    flip.status='done';flip.at=now;
    flipResults.unshift(flip);flipResults.length=Math.min(flipResults.length,FLIP_RESULTS);
    // Both players are told the result; the winner is owed both stakes.
    for(const [player,other,won] of [[flip.creator,flip.joiner,creatorWon],[flip.joiner,flip.creator,!creatorWon]])
      owe(player.id,{kind:'flip',id:flip.id,stake:flip.amount,payout:won?flip.amount*2:0,won,opponent:{id:other.id,name:other.name},result:flip.result,at:now});
    const [winner,loser]=creatorWon?[flip.creator,flip.joiner]:[flip.joiner,flip.creator];
    const line={id:crypto.randomUUID(),user:winner,text:'won a '+flip.amount.toLocaleString('en-US')+' credit coin flip against '+loser.name,at:now,duel:{amount:flip.amount,result:flip.result,loser:{id:loser.id,name:loser.name}}};
    remember(line);broadcast('message',line);
    broadcast('flips',flipView());
  }

  // Sends a direct message from the site's bot. False when Discord will not deliver it
  // (the person shares no server with the bot, or has direct messages turned off).
  async function directMessage(userId,content){
    const headers={authorization:'Bot '+botToken,'content-type':'application/json'};
    const opened=await fetch(discordApi+'/users/@me/channels',{method:'POST',headers,body:JSON.stringify({recipient_id:userId})});
    if(!opened.ok)return false;
    const channel=await opened.json();
    const sent=await fetch(discordApi+'/channels/'+channel.id+'/messages',{method:'POST',headers,body:JSON.stringify({content})});
    return sent.ok;
  }
  const allowed=new Set(origins),history=[],readers=new Set(),identities=new Map(),lastSent=new Map(),pending=new Set();
  function remember(message){history.push(message);if(history.length>HISTORY_LIMIT)history.shift()}
  // Asks the AI what the characters say back, then posts their lines one at a time at a human pace.
  // A message marked ai:true tells the site not to add its own scripted replies. If the request
  // fails, the mark is taken back ("aifail") so the scripted replies can step in.
  async function answer(message){
    let lines;
    try{lines=await ai.replies(message,history.filter(line=>line.id!==message.id).slice(-12))}
    catch{message.ai=false;broadcast('aifail',{id:message.id});return}
    let due=message.at;
    lines.forEach((line,i)=>{
      due+=aiDelay(line,i===0);
      const timer=setTimeout(()=>{
        pending.delete(timer);
        const reply={id:crypto.randomUUID(),user:{id:'crowd-'+line.index,name:line.name},text:line.text,at:Date.now(),crowd:true,re:message.id};
        remember(reply);broadcast('message',reply);
      },Math.max(0,due-Date.now()));
      pending.add(timer);
    });
  }

  function cors(req){
    const origin=req.headers.origin;
    if(!origin)return {};
    if(!allowed.has('*')&&!allowed.has(origin))return null;
    return {'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Max-Age':'600'};
  }
  function emit(res,event,data){res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n')}
  function broadcast(event,data){for(const res of readers)emit(res,event,data)}

  // Resolves to a user, null for a bad sign-in, or throws when Discord cannot be reached.
  async function identify(header){
    const match=/^Bearer ([\w.-]{10,200})$/.exec(header||'');
    if(!match)return null;
    const key=crypto.createHash('sha256').update(match[1]).digest('hex'),known=identities.get(key);
    if(known&&known.until>Date.now())return known.user;
    const reply=await fetch(discordApi+'/oauth2/@me',{headers:{authorization:'Bearer '+match[1]}});
    if(reply.status===401||reply.status===403)return null;
    if(!reply.ok)throw new Error('Discord replied '+reply.status);
    const info=await reply.json(),account=info.user;
    // Only accept sign-ins made through this site's own Discord application.
    if(!account?.id||(clientId&&info.application?.id!==clientId))return null;
    const user={id:String(account.id),name:String(account.global_name||account.username||'Player').slice(0,32),avatar:/^(a_)?[0-9a-f]{32}$/.test(account.avatar||'')?account.avatar:null};
    identities.set(key,{user,until:Math.min(Date.now()+IDENTITY_TTL,Date.parse(info.expires)||Infinity)});
    people.set(user.id,user);
    return user;
  }
  function readJson(req){
    return new Promise((resolve,reject)=>{
      let body='';
      req.setEncoding('utf8');
      req.on('data',chunk=>{body+=chunk;if(body.length>MAX_BODY){reject(new Error('too large'));req.destroy()}});
      req.on('end',()=>{try{resolve(JSON.parse(body))}catch(error){reject(error)}});
      req.on('error',reject);
    });
  }

  async function handle(req,res){
    const headers=cors(req),path=new URL(req.url,'http://chat').pathname;
    const send=(status,data)=>{res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(data))};
    if(!headers){res.writeHead(403);res.end();return}
    if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return}
    if(req.method==='GET'&&path==='/health')return send(200,{ok:true});
    if(req.method==='GET'&&path==='/events'){
      res.writeHead(200,{...headers,'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
      res.write('retry: 3000\n\n');
      emit(res,'history',history);
      emit(res,'flips',flipView());
      readers.add(res);broadcast('online',readers.size);
      req.on('close',()=>{readers.delete(res);broadcast('online',readers.size)});
      return;
    }
    if(req.method==='POST'&&path==='/messages'){
      let user;
      try{user=await identify(req.headers.authorization)}catch{return send(503,{error:'Discord is unavailable.'})}
      if(!user)return send(401,{error:'Connect Discord to chat.'});
      let body;
      try{body=await readJson(req)}catch{return send(400,{error:'Bad message.'})}
      const text=cleanText(body?.text);
      if(!text)return send(400,{error:'Empty message.'});
      const now=Date.now();
      if(now-(lastSent.get(user.id)||0)<minGap)return send(429,{error:'Slow down.'});
      lastSent.set(user.id,now);
      const message={id:crypto.randomUUID(),user,text,at:now};
      if(ai&&ai.allow(now))message.ai=true;
      remember(message);
      broadcast('message',message);
      send(201,{id:message.id});
      if(message.ai)answer(message);
      return;
    }
    if(path.startsWith('/tips/')){
      let user;
      try{user=await identify(req.headers.authorization)}catch{return send(503,{error:'Discord is unavailable.'})}
      if(!user)return send(401,{error:'Connect Discord first.'});
      const now=Date.now();
      // Who can be tipped: everyone else who has signed in.
      if(req.method==='GET'&&path==='/tips/people')return send(200,{enabled:Boolean(botToken),people:[...people.values()].filter(person=>person.id!==user.id)});
      // Tips that were confirmed while this person was away. Handing them over empties the list.
      if(req.method==='POST'&&path==='/tips/claim'){
        const waiting=inbox.get(user.id)||[];
        if(inbox.delete(user.id))persist();
        return send(200,{tips:waiting});
      }
      if(req.method==='POST'&&path==='/tips/request'){
        if(!botToken)return send(503,{error:'Tipping is not set up.'});
        let body;
        try{body=await readJson(req)}catch{return send(400,{error:'Bad request.'})}
        const to=people.get(String(body?.to??'')),amount=body?.amount;
        if(!to||to.id===user.id)return send(400,{error:'Pick someone else who has signed in.'});
        if(!Number.isSafeInteger(amount)||amount<1||amount>TIP_LIMIT)return send(400,{error:'Enter a whole number of credits.'});
        if(now-(lastTipAsk.get(user.id)||0)<tipGap)return send(429,{error:'Wait a moment before asking for another code.'});
        lastTipAsk.set(user.id,now);
        const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
        let delivered=false;
        try{delivered=await directMessage(user.id,'**DriftLobby** · confirm your tip of **'+amount.toLocaleString('en-US')+' play credits** to **'+to.name+'**.\nYour code is **'+code+'**\nIt expires in '+Math.round(tipTtl/60000)+' minutes. If you did not ask for this, ignore this message.')}catch{}
        if(!delivered)return send(403,{error:'The DriftLobby bot could not message you. Join the DriftLobby Discord server and allow direct messages from server members.'});
        tipCodes.set(user.id,{to,amount,code,expires:now+tipTtl,tries:0});
        return send(200,{to:{id:to.id,name:to.name},amount,expires:now+tipTtl});
      }
      if(req.method==='POST'&&path==='/tips/confirm'){
        let body;
        try{body=await readJson(req)}catch{return send(400,{error:'Bad request.'})}
        const waiting=tipCodes.get(user.id);
        if(!waiting||waiting.expires<=now){tipCodes.delete(user.id);return send(410,{error:'That code has expired. Start the tip again.'})}
        if(String(body?.code??'').trim()!==waiting.code){
          if(++waiting.tries>=TIP_TRIES){tipCodes.delete(user.id);return send(410,{error:'Too many wrong codes. Start the tip again.'})}
          return send(400,{error:'That code is not right.',left:TIP_TRIES-waiting.tries});
        }
        tipCodes.delete(user.id);
        const tip={id:crypto.randomUUID(),from:{id:user.id,name:user.name},to:{id:waiting.to.id,name:waiting.to.name},amount:waiting.amount,at:now};
        owe(tip.to.id,tip);
        // The tip also shows in chat, which tells the receiver's browser to collect it.
        const line={id:tip.id,user,text:'tipped '+tip.to.name+' '+tip.amount.toLocaleString('en-US')+' credits',at:now,tip:{to:tip.to,amount:tip.amount}};
        remember(line);broadcast('message',line);
        return send(200,{id:tip.id,to:tip.to,amount:tip.amount});
      }
    }
    if(path.startsWith('/flips/')&&req.method==='POST'){
      let user,body;
      try{user=await identify(req.headers.authorization)}catch{return send(503,{error:'Discord is unavailable.'})}
      if(!user)return send(401,{error:'Connect Discord first.'});
      try{body=await readJson(req)}catch{return send(400,{error:'Bad request.'})}
      const now=Date.now(),flip=flips.get(String(body?.id??''));
      if(path==='/flips/create'){
        const amount=body?.amount,side=body?.side;
        if(!Number.isSafeInteger(amount)||amount<1||amount>TIP_LIMIT)return send(400,{error:'Enter a whole number of credits.'});
        if(side!=='Heads'&&side!=='Tails')return send(400,{error:'Pick heads or tails.'});
        if([...flips.values()].filter(open=>open.creator.id===user.id).length>=FLIPS_EACH)return send(429,{error:'You already have '+FLIPS_EACH+' flips open.'});
        const made={id:crypto.randomUUID(),creator:{id:user.id,name:user.name,avatar:user.avatar},amount,side,at:now,status:'open'};
        flips.set(made.id,made);persist();
        broadcast('flips',flipView());
        return send(201,{flip:made});
      }
      if(path==='/flips/cancel'){
        if(!flip||flip.creator.id!==user.id||flip.status!=='open')return send(404,{error:'That flip is gone or already under way.'});
        refundFlip(flip,now);
        return send(200,{id:flip.id});
      }
      if(path==='/flips/join'){
        if(!flip||flip.status!=='open')return send(404,{error:'That flip is gone. Someone else may have taken it.'});
        if(flip.creator.id===user.id)return send(400,{error:'You cannot join your own flip.'});
        Object.assign(flip,{joiner:{id:user.id,name:user.name,avatar:user.avatar},status:'countdown',flipAt:now+flipCountdown});
        persist();broadcast('flips',flipView());
        runFlip(flip);
        return send(200,{flip});
      }
    }
    send(404,{error:'Not found.'});
  }

  const server=http.createServer((req,res)=>{handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end()})});
  // Keeps idle connections open through proxies and clears expired sign-in checks.
  function sweep(){
    const now=Date.now();
    for(const [key,entry] of identities)if(entry.until<=now)identities.delete(key);
    for(const [id,at] of lastSent)if(now-at>60000)lastSent.delete(id);
    for(const [id,waiting] of tipCodes)if(waiting.expires<=now)tipCodes.delete(id);
    for(const [id,at] of lastTipAsk)if(now-at>60000)lastTipAsk.delete(id);
    // A flip nobody joined is closed and its stake returned.
    for(const flip of [...flips.values()])if(flip.status==='open'&&now-flip.at>flipTtl)refundFlip(flip,now);
    // Finished flips that have been shown long enough come off everyone's list.
    const shown=flipResults.length;
    for(let i=flipResults.length-1;i>=0;i--)if(now-flipResults[i].at>flipKeep)flipResults.splice(i,1);
    if(flipResults.length!==shown)broadcast('flips',flipView());
  }
  const tick=setInterval(()=>{for(const res of readers)res.write(': ping\n\n');sweep()},25000);
  tick.unref();
  function close(){
    clearInterval(tick);
    for(const timer of pending)clearTimeout(timer);
    for(const res of readers)res.end();
    const closed=new Promise(resolve=>server.close(resolve));
    server.closeAllConnections();
    return closed;
  }
  // Flips that were mid-countdown when the server last stopped carry on from where they were.
  for(const flip of flips.values())if(flip.status==='countdown'||flip.status==='flipping')runFlip(flip);
  return {server,close,sweep};
}

module.exports={createChatServer,cleanText};

if(require.main===module){
  // Settings can be kept in server/.env (one NAME=value per line) instead of typed on the command line.
  try{process.loadEnvFile(require('node:path').join(__dirname,'.env'))}catch{}
  const port=Number(process.env.PORT)||8787;
  // Hosts that assign PORT expect the server to accept outside connections.
  const host=process.env.HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1');
  const origins=(process.env.ALLOWED_ORIGINS||'http://127.0.0.1:8000,http://localhost:8000').split(',').map(s=>s.trim().replace(/\/+$/,'')).filter(Boolean);
  const clientId=process.env.DISCORD_CLIENT_ID||'';
  if(!clientId)console.warn('DISCORD_CLIENT_ID is not set: sign-ins from any Discord application are accepted.');
  // AI replies: on when an Anthropic API key is in the environment (or CHAT_AI=on with an `ant auth login`
  // profile), off with CHAT_AI=off. CHAT_AI_MODEL picks the model and CHAT_AI_PER_MINUTE caps requests.
  let ai=null;
  const wanted=process.env.CHAT_AI!=='off'&&(process.env.CHAT_AI==='on'||process.env.ANTHROPIC_API_KEY||process.env.ANTHROPIC_AUTH_TOKEN);
  if(!wanted)console.log('AI replies are off. Set ANTHROPIC_API_KEY to turn them on; the site uses its scripted replies meanwhile.');
  else{
    const {connect,createAi}=require('./chat-ai.js'),link=connect();
    if(!link)console.warn('AI replies are off: run `npm install` in the server folder to add the Anthropic SDK.');
    else{
      ai=createAi({...link,model:process.env.CHAT_AI_MODEL||'claude-opus-5-5',perMinute:Number(process.env.CHAT_AI_PER_MINUTE)||20});
      console.log('AI replies are on: '+ai.model+', '+ai.cast.length+' characters.');
    }
  }
  const botToken=process.env.DISCORD_BOT_TOKEN||'';
  console.log(botToken?'Tips are on: codes are sent by Discord direct message.':'Tips are off. Set DISCORD_BOT_TOKEN to turn them on.');
  createChatServer({clientId,origins,ai,botToken,storeFile:require('node:path').join(__dirname,'data.json')}).server.listen(port,host,()=>console.log('DriftLobby chat on http://'+host+':'+port+' for '+origins.join(', ')));
}
