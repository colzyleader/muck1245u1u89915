const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createBot,settingsFromEnv,RANKS,ROLLERS}=require('../server/discord-bot.js');
const {decodePng}=require('../server/card-images.js');

const quiet={log(){},error(){}};
const person=(id,name)=>({id:String(id),username:name,global_name:name});
const colin=person('100000000001','Col'),rv=person('100000000002','rvveya');
const run=(bot,user,name,options={},extra={})=>bot.handle({type:2,id:'9',token:'tok-'+name,data:{name,options:Object.entries(options).map(([key,value])=>({name:key,value})),...extra},member:{user}});
const click=(bot,user,id,token='tok-press')=>bot.handle({type:3,id:'9',token,data:{custom_id:id},member:{user}});
const credits=(bot,user)=>bot.store.data.players[user.id].credits;
const buttons=reply=>(reply.data.components||[]).flatMap(line=>line.components);
const text=reply=>reply.data.content||reply.data.embeds.map(embed=>[embed.title,embed.description,embed.footer?.text].join('\n')).join('\n');
const hidden=reply=>reply.data.flags===64;
// Pictures are left out unless a test is about them: drawing one for every press would slow the long runs.
const fresh=options=>createBot({log:quiet,flipDelay:0,pictures:false,...options});
const type=(bot,user,content,extra={})=>bot.handleMessage({id:'700',channel_id:'800',guild_id:'900',author:user,content,member:{roles:[]},mentions:[],...extra});
// A stand-in for Discord's REST API that records each call. Form uploads are read back into {body, files}.
function recorder(answer=()=>({})){
  const calls=[];
  const fetchImpl=async(url,init)=>{
    const form=typeof FormData!=='undefined'&&init.body instanceof FormData;
    const call={url,method:init.method,auth:init.headers.authorization,body:form?JSON.parse(init.body.get('payload_json')):init.body&&JSON.parse(init.body),files:form?[...init.body.entries()].filter(([key])=>key.startsWith('files[')).map(([,file])=>file):[]};
    calls.push(call);
    const result=answer(call)??{};
    return {ok:!result.__status||result.__status<400,status:result.__status||200,json:async()=>result,text:async()=>JSON.stringify(result)};
  };
  return {calls,fetchImpl};
}

test('bot: commands fit Discord’s limits and the bet-sized games point to the guide',()=>{
  const bot=fresh(),defs=bot.definitions();
  assert.ok(defs.length>=20&&defs.length<=100);
  for(const def of defs){
    assert.match(def.name,/^[a-z]{1,32}$/);
    assert.ok(def.description.length>=1&&def.description.length<=100,def.name+' description is '+def.description.length+' long');
    assert.ok(def.options.length<=25);
    let optional=false;
    for(const option of def.options){
      assert.match(option.name,/^[a-z]{1,32}$/);
      assert.ok(option.description.length<=100);
      // Discord wants required options listed before optional ones.
      assert.ok(!(option.required&&optional),def.name+' has a required option after an optional one');
      if(!option.required)optional=true;
      for(const choice of option.choices||[])assert.ok(typeof choice.name==='string'&&choice.name.length<=100);
    }
  }
  for(const name of ['coinflip','dice','limbo','wheel','war','rps','mines','tower','hilo'])
    assert.match(defs.find(def=>def.name===name).description,/Bigger bets win less often.*\/guide/,name);
  // Nothing offers a way to pay in or cash out.
  assert.ok(!defs.some(def=>/deposit|withdraw|cashout|buy/.test(def.name)));
  // The odds and daily commands were retired; the guide carries the bet-size odds instead.
  assert.ok(!defs.some(def=>['odds','daily'].includes(def.name)));
  assert.equal(type(bot,colin,'$odds'),null);assert.equal(type(bot,colin,'$daily'),null);
  assert.match(text(run(bot,colin,'guide')),/A bet over 1,500 cannot win/);
  for(const name of ['help','guide','ranks'])assert.doesNotMatch(run(bot,colin,name).data.embeds.map(embed=>embed.description).join('\n'),/\$odds|\$daily|daily/,name);
  assert.match(text(run(bot,colin,'help')),/cannot be withdrawn or cashed out/);
});

test('bot: a new player starts with 1,000 credits and each quick game settles the bet',()=>{
  const bot=fresh();
  assert.match(text(run(bot,colin,'balance')),/1,000/);
  const games=[['coinflip',{side:'Heads'}],['dice',{direction:'under',target:50}],['limbo',{target:2}],['wheel',{}],['war',{}],['rps',{throw:0}],['roulette',{pick:'Red'}],['plinko',{}]];
  for(const [name,options] of games)for(let i=0;i<40;i++){
    bot.store.data.players[colin.id].credits=1000;
    const reply=run(bot,colin,name,{bet:10,...options});
    assert.equal(reply.type,4);assert.ok(!hidden(reply),name+' answered privately: '+text(reply));
    const after=credits(bot,colin),change=after-1000;
    assert.ok(change>=-10&&Number.isFinite(after),name+' changed the balance by '+change);
    assert.match(text(reply),/Balance/);
    assert.match(reply.data.embeds[0].footer.text,/chance at this bet|Chance of 2× or more|Same odds at any bet/i);
  }
  const p=bot.store.data.players[colin.id];
  assert.equal(p.rounds,games.length*40);
  assert.equal(p.wagered,games.length*400);
  // Too big a bet, a missing number, and a bad bet are refused without touching the balance.
  p.credits=30;
  assert.ok(hidden(run(bot,colin,'coinflip',{bet:31,side:'Heads'})));
  assert.ok(hidden(run(bot,colin,'roulette',{bet:5,pick:'Number'})));
  assert.ok(hidden(run(bot,colin,'wheel',{bet:1.5})));
  assert.equal(p.credits,30);
});

test('bot: the chance shown follows the bet, and a bet over 1,500 is only taken after a warning',()=>{
  const bot=fresh();
  run(bot,colin,'balance');
  const p=bot.store.data.players[colin.id];
  p.credits=100000;
  assert.match(text(run(bot,colin,'coinflip',{bet:1,side:'Heads'})),/Win chance at this bet: 50%/);
  assert.match(text(run(bot,colin,'coinflip',{bet:500,side:'Heads'})),/Win chance at this bet: 30% \(60% of normal\)/);
  // Over 200 credits a coin flip wins about 30% of the time, and pays 2× when it does.
  let wins=0;
  for(let i=0;i<4000;i++){p.credits=1000;const before=p.credits;run(bot,colin,'coinflip',{bet:201,side:'Tails'});const change=p.credits-before;assert.ok(change===201||change===-201);if(change>0)wins++}
  assert.ok(Math.abs(wins/4000-0.3)<0.04,'won '+wins+' of 4000');
  // Over 1,500: nothing is taken until the player confirms, and then the bet always loses.
  p.credits=100000;
  const warning=run(bot,colin,'coinflip',{bet:2000,side:'Heads'});
  assert.ok(hidden(warning));assert.match(text(warning),/cannot win/);assert.equal(p.credits,100000);
  assert.deepEqual(buttons(warning).map(b=>b.custom_id),['shut:'+colin.id+':yes','shut:'+colin.id+':no']);
  assert.ok(hidden(click(bot,rv,'shut:'+colin.id+':yes')));
  const cancelled=click(bot,colin,'shut:'+colin.id+':no');
  assert.equal(cancelled.type,7);assert.equal(p.credits,100000);
  assert.match(click(bot,colin,'shut:'+colin.id+':yes').data.content,/expired/);
  for(let i=0;i<30;i++){
    const before=p.credits;
    run(bot,colin,'dice',{bet:1501,direction:'under',target:98});
    const played=click(bot,colin,'shut:'+colin.id+':yes');
    assert.equal(played.type,4);assert.ok(!hidden(played));
    assert.equal(p.credits,before-1501);
    assert.match(text(played),/Bets over 1,500 cannot win/);
  }
  // Roulette, Plinko and Blackjack take any bet without a warning: their odds do not depend on it.
  assert.ok(!hidden(run(bot,colin,'roulette',{bet:2000,pick:'Black'})));
  assert.ok(!hidden(run(bot,colin,'plinko',{bet:2000})));
});

test('bot: blackjack, mines, tower and hi-lo are played with buttons and always settle',()=>{
  const bot=fresh();
  run(bot,colin,'balance');
  const p=bot.store.data.players[colin.id];
  const starts={blackjack:{},mines:{mines:3},tower:{level:'Easy'},hilo:{}};
  for(const [name,options] of Object.entries(starts))for(let game=0;game<60;game++){
    p.credits=1000;
    let reply=run(bot,colin,name,{bet:20,...options}),presses=0;
    assert.equal(reply.type,4);
    while(bot.rounds.has(colin.id)){
      const live=buttons(reply).filter(b=>!b.disabled);
      assert.ok(live.length,name+' left a round open with no buttons');
      assert.ok(reply.data.components.length<=5&&reply.data.components.every(line=>line.components.length<=5));
      for(const b of live)assert.ok(b.custom_id.length<=100&&(b.label||b.emoji));
      assert.equal(bot.store.data.held['round:'+colin.id].id,colin.id);
      // While a round is open another one cannot start, and nobody else can press its buttons.
      if(!presses){
        assert.ok(hidden(run(bot,colin,name,{bet:20,...options})));
        assert.match(text(click(bot,rv,live[0].custom_id)),/someone else/);
      }
      // Collect once there is something to collect a third of the time, otherwise keep playing.
      const collect=live.find(b=>/collect/.test(b.custom_id)),others=live.filter(b=>b!==collect);
      const choice=collect&&(presses%3===2||!others.length)?collect:others[(game+presses)%others.length];
      reply=click(bot,colin,choice.custom_id);
      assert.equal(reply.type,7,name+': '+text(reply));
      assert.ok(++presses<80);
    }
    assert.equal(bot.store.data.held['round:'+colin.id],undefined);
    const left=buttons(reply).filter(b=>!b.custom_id.startsWith('a:'));
    assert.ok(left.every(b=>b.disabled),name+' left live buttons on a finished round');
    assert.equal(buttons(reply).filter(b=>b.custom_id.startsWith('a:')).length,1,name+' has no Play again button');
    assert.match(text(reply),/Balance/);
    assert.ok(p.credits>=0&&p.credits===Math.round(p.credits*100)/100);
    // A finished round's buttons do nothing.
    if(left.length)assert.match(text(click(bot,colin,left[0].custom_id)),/ended/);
  }
  // Mines pays the fair multiple: one gem with 3 mines among 20 tiles returns 20/17 of the bet.
  for(let tries=0;tries<200;tries++){
    p.credits=1000;
    const board=run(bot,colin,'mines',{bet:100,mines:3});
    const turned=click(bot,colin,buttons(board)[0].custom_id);
    if(!bot.rounds.has(colin.id)){assert.equal(p.credits,900);continue}
    click(bot,colin,buttons(turned).find(b=>/collect/.test(b.custom_id)).custom_id);
    assert.equal(p.credits,900+Math.floor(100*20/17+1e-8));
    return;
  }
  assert.fail('no first tile was ever safe');
});

test('bot: an idle round is finished for the player and an unplayed one is refunded',()=>{
  let clock=1_000_000;
  const bot=fresh({now:()=>clock});
  run(bot,colin,'mines',{bet:50});
  assert.equal(credits(bot,colin),950);
  clock+=11*60_000;bot.sweep();
  assert.equal(bot.rounds.size,0);assert.equal(credits(bot,colin),1000);
  assert.equal(bot.store.data.players[colin.id].rounds,0);
  run(bot,colin,'blackjack',{bet:50});
  // A blackjack hand left alone is stood on, so it counts as a played round.
  clock+=11*60_000;bot.sweep();
  assert.equal(bot.rounds.size,0);
  assert.equal(bot.store.data.players[colin.id].rounds,1);
  assert.ok([950,1000,1050,1075].includes(credits(bot,colin)));
  assert.deepEqual(Object.keys(bot.store.data.held),[]);
});

test('bot: a player flip is a fair toss between two players and the winner takes both stakes',()=>{
  const bot=fresh();
  let ownerWins=0;
  const games=400;
  for(let i=0;i<games;i++){
    run(bot,colin,'balance');run(bot,rv,'balance');
    bot.store.data.players[colin.id].credits=1000;bot.store.data.players[rv.id].credits=1000;
    const offer=run(bot,colin,'flip',{bet:300,side:i%2?'Heads':'Tails'});
    assert.equal(credits(bot,colin),700);
    const [join,cancel]=buttons(offer);
    if(i===0){
      // Only one open flip each; the maker cannot join it; nobody else can cancel it; a poor player cannot join.
      assert.ok(hidden(run(bot,colin,'flip',{bet:10,side:'Heads'})));
      assert.ok(hidden(click(bot,colin,join.custom_id)));
      assert.ok(hidden(click(bot,rv,cancel.custom_id)));
      bot.store.data.players[rv.id].credits=299;
      assert.ok(hidden(click(bot,rv,join.custom_id)));
      bot.store.data.players[rv.id].credits=1000;
      assert.equal(credits(bot,colin),700);
    }
    const result=click(bot,rv,join.custom_id);
    assert.equal(result.type,7);assert.equal(buttons(result).length,0);
    assert.equal(credits(bot,colin)+credits(bot,rv),2000);
    assert.ok([[1300,700],[700,1300]].some(([a,b])=>credits(bot,colin)===a&&credits(bot,rv)===b));
    if(credits(bot,colin)===1300)ownerWins++;
    assert.ok(hidden(click(bot,rv,join.custom_id)));
  }
  assert.ok(Math.abs(ownerWins/games-0.5)<0.12,'the maker won '+ownerWins+' of '+games);
  assert.equal(bot.flips.size,0);assert.deepEqual(Object.keys(bot.store.data.held),[]);
  // Cancelling gives the stake back.
  bot.store.data.players[colin.id].credits=1000;
  const offer=run(bot,colin,'flip',{bet:1000,side:'Heads'});
  assert.equal(credits(bot,colin),0);
  click(bot,colin,buttons(offer)[1].custom_id);
  assert.equal(credits(bot,colin),1000);
});

test('bot: an unjoined flip is refunded, and the result is posted after the coin has been in the air',async()=>{
  let clock=5_000_000;
  const {calls,fetchImpl}=recorder();
  const bot=createBot({log:quiet,flipDelay:5,now:()=>clock,fetchImpl,appId:'42',token:'x'});
  run(bot,colin,'flip',{bet:200,side:'Heads'});
  clock+=11*60_000;bot.sweep();
  assert.equal(credits(bot,colin),1000);assert.equal(bot.flips.size,0);
  assert.match(calls[0].url,/\/webhooks\/42\/tok-flip\/messages\/@original$/);
  assert.match(calls[0].body.embeds[0].description,/Nobody joined/);
  const offer=run(bot,colin,'flip',{bet:200,side:'Heads'});
  const waiting=click(bot,rv,buttons(offer)[0].custom_id,'tok-join');
  assert.match(text(waiting),/in the air/);
  // The toss is already settled; only the announcement waits.
  assert.equal(credits(bot,colin)+credits(bot,rv),2000);
  await new Promise(done=>setTimeout(done,40));
  assert.equal(calls.length,2);
  assert.match(calls[1].url,/\/webhooks\/42\/tok-join\/messages\/@original$/);
  assert.match(calls[1].body.embeds[0].description,/wins \*\*400\*\*/);
});

test('bot: tips and the free refill move credits as described',()=>{
  let clock=Date.UTC(2026,10,22,12);
  const bot=fresh({now:()=>clock});
  const resolved={resolved:{users:{[rv.id]:rv,'100000000009':{id:'100000000009',username:'helper',bot:true}}}};
  const tip=run(bot,colin,'tip',{player:rv.id,amount:250},resolved);
  assert.deepEqual(tip.data.allowed_mentions,{users:[rv.id]});
  assert.equal(credits(bot,colin),750);assert.equal(credits(bot,rv),1250);
  assert.ok(hidden(run(bot,colin,'tip',{player:colin.id,amount:5},{resolved:{users:{[colin.id]:colin}}})));
  assert.ok(hidden(run(bot,colin,'tip',{player:'100000000009',amount:5},resolved)));
  assert.ok(hidden(run(bot,colin,'tip',{player:rv.id,amount:751},resolved)));
  assert.ok(hidden(run(bot,colin,'tip',{player:rv.id,amount:5})));
  assert.equal(credits(bot,colin),750);
  // Refill only below 10 credits.
  assert.ok(hidden(run(bot,colin,'refill')));
  bot.store.data.players[colin.id].credits=9;
  assert.ok(!hidden(run(bot,colin,'refill')));
  assert.equal(credits(bot,colin),1000);
  assert.match(text(run(bot,colin,'leaderboard')),new RegExp('<@'+rv.id+'>[^\\n]*1,250'));
  assert.match(text(run(bot,colin,'profile')),/Col/);
  assert.match(text(run(bot,colin,'balance',{player:rv.id})),/1,250/);
});

test('bot: balances are saved, and a stake left in play when the bot stops is given back',()=>{
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'drift-bot-')),'bot-data.json');
  const first=fresh({storeFile:file});
  run(first,colin,'mines',{bet:400});
  run(first,rv,'flip',{bet:150,side:'Tails'});
  first.close();
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(saved.players[colin.id].credits,600);
  assert.equal(saved.players[rv.id].credits,850);
  const second=fresh({storeFile:file});
  assert.equal(credits(second,colin),1000);assert.equal(credits(second,rv),1000);
  assert.deepEqual(Object.keys(second.store.data.held),[]);
  second.close();
  fs.rmSync(path.dirname(file),{recursive:true});
});

test('bot: it registers its commands, signs in on the gateway, keeps the heartbeat going and answers interactions',async()=>{
  const sockets=[];
  const {calls,fetchImpl}=recorder(call=>call.method==='PUT'?call.body:call.method==='POST'&&/\/channels\//.test(call.url)?{id:'901',channel_id:'800'}:{});
  class FakeSocket{
    constructor(url){this.url=url;this.sent=[];sockets.push(this)}
    send(data){this.sent.push(JSON.parse(data))}
    close(code){this.closed=code;queueMicrotask(()=>this.onclose?.({code}))}
    push(message){this.onmessage({data:JSON.stringify(message)})}
  }
  const bot=createBot({log:quiet,token:'secret-token',appId:'42',guildId:'77',api:'https://discord.test/api',gateway:'wss://gateway.test',fetchImpl,WebSocketImpl:FakeSocket});
  await bot.start();
  assert.equal(calls[0].method,'PUT');
  assert.equal(calls[0].url,'https://discord.test/api/applications/42/guilds/77/commands');
  assert.equal(calls[0].auth,'Bot secret-token');
  assert.equal(calls[0].body.length,bot.definitions().length);
  const socket=sockets[0];
  assert.equal(socket.url,'wss://gateway.test/?v=10&encoding=json');
  socket.push({op:10,d:{heartbeat_interval:15}});
  assert.equal(socket.sent[0].op,2);
  assert.equal(socket.sent[0].d.token,'secret-token');
  // It asks to read server messages, direct messages and message text, for the $ commands.
  assert.equal(socket.sent[0].d.intents,(1<<9)|(1<<12)|(1<<15));
  socket.push({op:0,s:1,t:'READY',d:{session_id:'sess',resume_gateway_url:'wss://resume.test',user:{username:'DriftLobby'}}});
  await new Promise(done=>setTimeout(done,25));
  assert.deepEqual(socket.sent[1],{op:1,d:1});
  socket.push({op:11});
  socket.push({op:0,s:2,t:'INTERACTION_CREATE',d:{type:2,id:'555',token:'itok',data:{name:'balance'},member:{user:colin}}});
  await new Promise(done=>setTimeout(done,5));
  const answer=calls.find(call=>/\/interactions\/555\/itok\/callback$/.test(call.url));
  assert.equal(answer.method,'POST');assert.equal(answer.body.type,4);
  assert.match(answer.body.data.embeds[0].description,/1,000/);
  // A hand of blackjack goes up as a form: the JSON reply plus the picture of the table.
  socket.push({op:0,s:3,t:'INTERACTION_CREATE',d:{type:2,id:'556',token:'itok2',guild_id:'900',data:{name:'blackjack',options:[{name:'bet',value:10}]},member:{user:colin,roles:[]}}});
  await new Promise(done=>setTimeout(done,60));
  const hand=calls.find(call=>/\/interactions\/556\/itok2\/callback$/.test(call.url));
  assert.equal(hand.body.type,4);
  assert.deepEqual(hand.body.data.attachments,[{id:0,filename:'table.png'}]);
  assert.equal(hand.body.data.embeds[0].image.url,'attachment://table.png');
  assert.equal(hand.files.length,1);assert.equal(hand.files[0].name,'table.png');assert.equal(hand.files[0].type,'image/png');
  // A typed command is answered with a reply in the same channel; other messages are left alone.
  socket.push({op:0,s:4,t:'MESSAGE_CREATE',d:{id:'700',channel_id:'800',guild_id:'900',author:rv,content:'$balance',member:{roles:[]},mentions:[]}});
  socket.push({op:0,s:5,t:'MESSAGE_CREATE',d:{id:'701',channel_id:'800',guild_id:'900',author:rv,content:'that cost me $50',member:{roles:[]},mentions:[]}});
  await new Promise(done=>setTimeout(done,20));
  const typed=calls.filter(call=>call.method==='POST'&&/\/channels\/800\/messages$/.test(call.url));
  assert.equal(typed.length,1);
  assert.deepEqual(typed[0].body.message_reference,{message_id:'700',fail_if_not_exists:false});
  assert.match(typed[0].body.embeds[0].description,/1,000/);
  // Asked to reconnect, it opens a new connection to the resume address and resumes the session.
  socket.push({op:7});
  await new Promise(done=>setTimeout(done,1100));
  assert.equal(sockets.length,2);
  assert.equal(sockets[1].url,'wss://resume.test/?v=10&encoding=json');
  sockets[1].push({op:10,d:{heartbeat_interval:60000}});
  assert.deepEqual(sockets[1].sent[0],{op:6,d:{token:'secret-token',session_id:'sess',seq:5}});
  // A rejected token is not retried.
  sockets[1].onclose({code:4004});
  await new Promise(done=>setTimeout(done,20));
  assert.equal(sockets.length,2);
  bot.close();
  await assert.rejects(createBot({log:quiet}).start(),/DISCORD_BOT_TOKEN/);
});

test('bot: without the Message Content intent it carries on with slash commands only',async()=>{
  const sockets=[],notes=[];
  class FakeSocket{
    constructor(url){this.url=url;this.sent=[];sockets.push(this)}
    send(data){this.sent.push(JSON.parse(data))}
    close(code){queueMicrotask(()=>this.onclose?.({code}))}
    push(message){this.onmessage({data:JSON.stringify(message)})}
  }
  const {fetchImpl}=recorder(call=>call.method==='PUT'?call.body:{});
  const bot=createBot({log:{log(){},error:line=>notes.push(line)},token:'t',appId:'42',fetchImpl,WebSocketImpl:FakeSocket,gateway:'wss://gateway.test'});
  await bot.start();
  sockets[0].push({op:10,d:{heartbeat_interval:60000}});
  assert.notEqual(sockets[0].sent[0].d.intents,0);
  sockets[0].onclose({code:4014});
  await new Promise(done=>setTimeout(done,1100));
  assert.equal(sockets.length,2);
  sockets[1].push({op:10,d:{heartbeat_interval:60000}});
  assert.equal(sockets[1].sent[0].op,2);assert.equal(sockets[1].sent[0].d.intents,0);
  assert.match(notes.join('\n'),/Message Content Intent/);
  bot.close();
});

test('bot: $ commands read their words in any order, with short names and bet words',()=>{
  const bot=fresh();
  const flip=type(bot,colin,'$coinflip 50 heads');
  assert.equal(flip.type,4);assert.match(text(flip),/Coinflip[\s\S]*You called Heads/);
  assert.ok([950,1050].includes(credits(bot,colin)));
  bot.store.data.players[colin.id].credits=1000;
  assert.match(text(type(bot,colin,'$cf TAILS 25')),/You called Tails/);
  assert.ok([975,1025].includes(credits(bot,colin)));
  // Not commands: ordinary messages, prices, unknown names, and other bots.
  for(const content of ['hello','$50 for lunch','$','$ coinflip','$nothing 5','coinflip 50 heads'])assert.equal(type(bot,colin,content),null,content);
  assert.equal(type(bot,{...rv,bot:true},'$balance'),null);
  // Missing or unreadable words get the usage line, and nothing is bet.
  bot.store.data.players[colin.id].credits=1000;
  assert.match(text(type(bot,colin,'$coinflip')),/Add the bet.*\$coinflip <bet> <heads\|tails>/);
  assert.match(text(type(bot,colin,'$coinflip 50')),/Add the side/);
  assert.match(text(type(bot,colin,'$dice 50 under 99')),/could not read “99”/);
  assert.match(text(type(bot,colin,'$coinflip 50 heads extra')),/could not read “extra”/);
  assert.match(text(type(bot,colin,'$coinflip 2.5 heads')),/could not read/);
  assert.equal(credits(bot,colin),1000);
  // Options land where they belong.
  assert.match(text(type(bot,colin,'$dice 10 over 70')),/you needed over 70/);
  assert.match(text(type(bot,colin,'$limbo 10 3x')),/your target was 3×/);
  assert.match(text(type(bot,colin,'$roulette 10 number 17')),/You bet on number 17/);
  assert.match(text(type(bot,colin,'$r red 10')),/You bet on Red/);
  assert.match(text(type(bot,colin,'$plinko 10 16 high')),/16 rows · High risk/);
  assert.match(text(type(bot,colin,'$rps 10 scissors')),/You ✂️ Scissors/);
  assert.match(text(type(bot,colin,'$help')),/\$coinflip 50 heads/);
  // Button games start the same way.
  bot.store.data.players[colin.id].credits=1000;
  assert.match(text(type(bot,colin,'$tower 10 easy')),/Easy · 3 of 4 doors safe/);
  assert.match(text(type(bot,colin,'$bj 10')),/Finish your tower round first/);
  bot.rounds.clear();
  assert.match(text(type(bot,colin,'$mines 10 7')),/Mines \*\*7\*\*/);
  bot.rounds.clear();
  // "all", "half" and "1.5k" are bets; a bet that cannot win still gets its warning first.
  bot.store.data.players[colin.id].credits=640;
  type(bot,colin,'$roulette half red');
  assert.ok([320,960].includes(credits(bot,colin)));
  bot.store.data.players[colin.id].credits=640;
  type(bot,colin,'$roulette all black');
  assert.ok([0,1280].includes(credits(bot,colin)));
  bot.store.data.players[colin.id].credits=5000;
  const warning=type(bot,colin,'$coinflip 1.6k heads');
  assert.match(text(warning),/cannot win/);assert.equal(credits(bot,colin),5000);
  assert.equal(buttons(warning)[0].custom_id,'shut:'+colin.id+':yes');
  // Tips name the other player with a mention.
  bot.store.data.players[colin.id].credits=1000;
  type(bot,rv,'$bal');
  const tip=type(bot,colin,'$tip <@'+rv.id+'> 300',{mentions:[rv]});
  assert.deepEqual(tip.data.allowed_mentions,{users:[rv.id]});
  assert.equal(credits(bot,colin),700);assert.equal(credits(bot,rv),1300);
});

test('bot: Play again repeats the same game for the same player',()=>{
  const bot=fresh();
  const first=run(bot,colin,'dice',{bet:20,direction:'over',target:40});
  const again=buttons(first).find(b=>b.custom_id.startsWith('a:'));
  assert.match(again.label,/Play again · 20/);
  bot.store.data.players[colin.id].credits=1000;
  const second=click(bot,colin,again.custom_id);
  assert.equal(second.type,4);assert.match(text(second),/you needed over 40/);
  assert.ok([980,1013].includes(credits(bot,colin)),'balance '+credits(bot,colin));
  assert.ok(hidden(click(bot,rv,again.custom_id)));
  // After a finished button game it deals a new one.
  bot.store.data.players[colin.id].credits=1000;
  let hand=run(bot,colin,'blackjack',{bet:10});
  while(bot.rounds.has(colin.id))hand=click(bot,colin,buttons(hand).find(b=>/:stand$/.test(b.custom_id)).custom_id);
  const redeal=click(bot,colin,buttons(hand).find(b=>b.custom_id.startsWith('a:')).custom_id);
  assert.equal(redeal.type,4);assert.match(text(redeal),/Blackjack/);
});

test('bot: card games come with a picture of the table, other games with the site’s art',()=>{
  const bot=createBot({log:quiet,flipDelay:0});
  const png=file=>{assert.equal(file.type,'image/png');assert.deepEqual([...file.data.subarray(0,4)],[137,80,78,71]);return decodePng(file.data)};
  let hand=run(bot,colin,'blackjack',{bet:10});
  assert.equal(hand.files[0].name,'table.png');
  assert.equal(hand.data.embeds[0].image.url,'attachment://table.png');
  assert.deepEqual(hand.data.attachments,[{id:0,filename:'table.png'}]);
  const table=png(hand.files[0]);
  assert.ok(table.width>=400&&table.height>=400,'table is '+table.width+'×'+table.height);
  // Felt in the middle of the top edge, see-through at the corner.
  assert.equal(table.data[3],0);assert.equal(table.data[(10*table.width+table.width/2|0)*4+3],255);
  // With a picture the cards are not repeated as text.
  assert.doesNotMatch(hand.data.embeds[0].description,/`/);
  while(bot.rounds.has(colin.id)){
    hand=click(bot,colin,buttons(hand).find(b=>/:stand$/.test(b.custom_id)).custom_id);
    assert.equal(hand.files[0].name,'table.png');png(hand.files[0]);
  }
  const war=run(bot,colin,'war',{bet:5});
  const wide=png(war.files[0]);assert.ok(wide.width>wide.height);
  png(run(bot,colin,'hilo',{bet:5}).files[0]);
  const coin=run(bot,colin,'coinflip',{bet:5,side:'Heads'});
  assert.match(coin.files[0].name,/^(heads|tails)\.webp$/);
  assert.equal(coin.data.embeds[0].thumbnail.url,'attachment://'+coin.files[0].name);
  assert.equal(run(bot,rv,'mines',{bet:5}).files[0].name,'mines.webp');
  // Without the card sheet the cards are written out instead.
  const plain=fresh();
  const written=run(plain,colin,'blackjack',{bet:10});
  assert.equal(written.files,undefined);assert.match(written.data.embeds[0].description,/`/);
});

test('bot: ranks follow the total bet and high roller roles the biggest single bet',async()=>{
  assert.deepEqual(RANKS.map(rank=>rank.at),[1000,5000,25000,100000,500000,2000000]);
  // No role asks for a bet that cannot win.
  assert.ok(ROLLERS.every(tier=>tier.bet<=1500));
  const {calls,fetchImpl}=recorder();
  const bot=fresh({fetchImpl,token:'t',appId:'42'});
  const roles={bronze:'r-bronze',silver:'r-silver',gold:'r-gold',platinum:'r-plat',diamond:'r-dia',legend:'r-leg',roller:'r-roller',whale:'r-whale'};
  bot.store.data.guilds['900']={roles,channels:{}};
  run(bot,colin,'balance');
  const p=bot.store.data.players[colin.id],said=[];
  const sync=(held,before)=>bot.syncRoles({guild:'900',user:colin,roles:held,before,announce:async message=>{said.push(message.embeds[0].description)}});
  // Nothing bet yet: nothing to hand out.
  await sync([],{rank:-1,top:0});
  assert.equal(calls.length,0);
  // Past 5,000 bet with one bet of 600: Silver and High Roller arrive, Bronze goes.
  p.wagered=6000;p.topBet=600;
  await sync(['r-bronze','someone-elses-role'],{rank:0,top:100});
  assert.deepEqual(calls.map(call=>call.method+' '+call.url.split('/guilds/')[1]),[
    'PUT 900/members/'+colin.id+'/roles/r-silver','PUT 900/members/'+colin.id+'/roles/r-roller','DELETE 900/members/'+colin.id+'/roles/r-bronze']);
  assert.match(said[0],/reached \*\*🥈 Silver\*\*.*is now a \*\*🎩 High Roller\*\*/);
  // Already holding the right roles: nothing is sent and nothing is announced.
  calls.length=0;said.length=0;
  await sync(['r-silver','r-roller'],{rank:1,top:600});
  assert.equal(calls.length,0);assert.equal(said.length,0);
  // A server that has not been set up is left alone.
  await bot.syncRoles({guild:'901',user:colin,roles:[],before:{rank:-1,top:0},announce:async()=>{throw new Error('no')}});
  assert.equal(calls.length,0);
  // Playing moves the figures the roles are read from.
  p.credits=5000;p.wagered=0;p.topBet=0;
  run(bot,colin,'roulette',{bet:1200,pick:'Red'});
  assert.equal(p.wagered,1200);assert.equal(p.topBet,1200);
  assert.match(text(run(bot,colin,'profile')),/Rank \*\*🥉 Bronze\*\*/);
  assert.match(text(run(bot,colin,'ranks')),/🐋 Whale · one bet of 1,000 or more/);
});

test('bot: server setup adds roles and channels once and is restricted to xyzwrl',async()=>{
  const admin=person('1070154044779266118','xyzwrl');
  let made=0;
  const guild={id:'900',owner_id:admin.id,roles:[{id:'900',name:'@everyone',permissions:'0'},{id:'r-mod',name:'Mod',permissions:'32'}]},channels=[],messages=[];
  const {calls,fetchImpl}=recorder(call=>{
    const path=call.url.split('/api/v10')[1];
    if(call.method==='GET'&&path==='/guilds/900')return guild;
    if(call.method==='GET'&&path==='/guilds/900/channels')return channels;
    if(call.method==='POST'&&path==='/guilds/900/roles'){const role={id:'new-role-'+(++made),permissions:'0',...call.body};guild.roles.push(role);return role}
    if(call.method==='POST'&&path==='/guilds/900/channels'){const channel={id:'new-channel-'+(++made),...call.body};channels.push(channel);return channel}
    const inChannel=/^\/channels\/([^/?]+)(?:\/messages(?:\/([^/?]+))?)?/.exec(path);
    if(inChannel&&call.method==='PATCH'&&!path.includes('/messages')){const channel=channels.find(found=>found.id===inChannel[1]);Object.assign(channel,call.body);return channel}
    if(inChannel&&call.method==='GET')return messages.filter(message=>message.channel_id===inChannel[1]);
    if(inChannel&&call.method==='PATCH'){const message=messages.find(found=>found.id===inChannel[2]);Object.assign(message,call.body);return message}
    if(inChannel&&call.method==='POST'){const message={id:'message-'+(++made),channel_id:inChannel[1],author:{id:'42'},...call.body};messages.push(message);return message}
    return {};
  });
  const bot=fresh({fetchImpl,token:'t',appId:'42'});
  const posts=()=>calls.filter(call=>call.method==='POST');
  // A member with no say over the server is refused, by slash command and by $ command.
  const refused=run(bot,rv,'server',{},{options:[{type:1,name:'setup'}]});
  assert.equal(refused.task,undefined);assert.ok(hidden(refused));
  const typed=type(bot,rv,'$server setup');
  assert.equal(typed.task,undefined);
  assert.match(text(typed),/Only xyzwrl/);
  assert.equal(posts().length,0);
  assert.ok(hidden(bot.handle({type:2,id:'1',token:'t',data:{name:'server',options:[{type:1,name:'setup'}]},user:colin})));
  // The owner runs it.
  const started=type(bot,admin,'$setup');
  assert.match(text(started),/Setting up/);
  const done=await started.task();
  assert.match(done.description,/Made \*\*8\*\* roles and \*\*16\*\* channels\. Posted or updated 7 info pages\./);
  const roleCalls=posts().filter(call=>/\/roles$/.test(call.url)).map(call=>call.body.name);
  assert.deepEqual(roleCalls,['🐋 Whale','🎩 High Roller','👑 Legend','💎 Diamond','💠 Platinum','🥇 Gold','🥈 Silver','🥉 Bronze']);
  assert.ok(posts().filter(call=>/\/roles$/.test(call.url)).every(call=>call.body.permissions==='0'&&call.body.hoist));
  const saved=bot.store.data.guilds['900'].roles;
  assert.deepEqual(Object.keys(saved).sort(),['bronze','diamond','gold','legend','platinum','roller','silver','whale']);
  assert.deepEqual(channels.filter(channel=>channel.type===4).map(channel=>channel.name),['📌 INFO','🎰 ARCADE','💬 LOUNGE','🎩 HIGH ROLLERS']);
  assert.equal(channels.filter(channel=>channel.type===0).length,12);
  assert.ok(!channels.some(channel=>/odds|daily/.test(channel.name)));
  const find=name=>channels.find(channel=>channel.name===name);
  // Info channels are read-only for everyone but the bot; the high roller rooms are hidden from everyone else.
  assert.deepEqual(find('📜・rules').permission_overwrites[0],{id:'900',type:0,deny:'2048'});
  assert.equal(find('📜・rules').parent_id,find('📌 INFO').id);
  assert.equal(find('🎲・table-1').permission_overwrites,undefined);
  const lounge=find('🎩・high-roller-lounge').permission_overwrites;
  assert.deepEqual(lounge[0],{id:'900',type:0,deny:'1024'});
  assert.deepEqual(lounge.filter(entry=>entry.type===0&&entry.allow==='1024').map(entry=>entry.id).sort(),[saved.roller,saved.whale].sort());
  assert.deepEqual(find('🐋・whale-table').permission_overwrites.filter(entry=>entry.type===0&&entry.allow).map(entry=>entry.id),[saved.whale]);
  // The info channels each get their page (the guide is four messages), and nothing was deleted or edited.
  const pages=posts().filter(call=>/\/messages$/.test(call.url)).map(call=>call.body.embeds[0].title);
  assert.deepEqual(pages,['👋 Welcome to DriftLobby','📜 Rules','📖 How to play','⚡ Quick games','🎮 Button games','🧾 Every command','🎖 Ranks and roles']);
  assert.equal(find('📖・how-to-play').parent_id,find('📌 INFO').id);
  assert.deepEqual(find('📖・how-to-play').permission_overwrites[0],{id:'900',type:0,deny:'2048'});
  assert.ok(calls.every(call=>['GET','POST'].includes(call.method)));
  assert.ok(messages.every(message=>!/\$odds|\$daily/.test(message.embeds[0].description)));
  // A moderator is refused. Rerunning setup as xyzwrl keeps everything in place.
  const before=posts().length;
  assert.match(text(type(bot,rv,'$server setup',{member:{roles:['r-mod']}})),/Only xyzwrl/);
  const again=await type(bot,admin,'$server setup').task();
  assert.match(again.description,/Made \*\*0\*\* roles and \*\*0\*\* channels \(24 were already here and were kept\)\.$/m);
  assert.equal(posts().length,before);
  assert.ok(calls.every(call=>['GET','POST'].includes(call.method)));
  // A page whose text has gone stale is edited in place, a deleted one is posted again, and a channel
  // made under an earlier name is renamed instead of being made twice. Other people's messages are left alone.
  const welcome=messages.find(message=>message.embeds[0].title==='👋 Welcome to DriftLobby');
  welcome.embeds=[{title:welcome.embeds[0].title,description:'Old text that mentions $daily.'}];
  messages.splice(messages.findIndex(message=>message.embeds[0].title==='📜 Rules'),1);
  messages.push({id:'someone',channel_id:welcome.channel_id,author:{id:colin.id},embeds:[{title:'👋 Welcome to DriftLobby',description:'not the bot’s'}]});
  find('🎁・free-credits').name='🎁・daily-claims';
  const refreshed=await type(bot,admin,'$server setup').task();
  assert.match(refreshed.description,/Renamed 1 of my channels\. Posted or updated 2 info pages\./);
  assert.doesNotMatch(welcome.embeds[0].description,/daily/);
  assert.equal(messages.find(message=>message.id==='someone').embeds[0].description,'not the bot’s');
  assert.equal(messages.filter(message=>message.embeds[0].title==='📜 Rules').length,1);
  assert.equal(channels.filter(channel=>/daily-claims|free-credits/.test(channel.name)).length,1);
  assert.match(find('🎁・free-credits').topic,/\$refill/);
  assert.ok(calls.every(call=>call.method!=='DELETE'));
  const slash=bot.handle({type:2,id:'1',token:'t',guild_id:'900',data:{name:'server',options:[{type:1,name:'setup'}]},member:{user:rv,roles:[],permissions:'8'}});
  assert.equal(slash.task,undefined);
  assert.match(text(slash),/Only xyzwrl/);
  const authorized=bot.handle({type:2,id:'1',token:'t',guild_id:'900',data:{name:'server',options:[{type:1,name:'setup'}]},member:{user:admin,roles:[],permissions:'32'}});
  assert.equal(typeof authorized.task,'function');
  assert.equal(bot.definitions().find(def=>def.name==='server').default_member_permissions,'32');
  assert.match(bot.inviteLink(),/client_id=42&scope=bot\+applications\.commands&permissions=268553232$/);
});

test('bot: a second copy refuses to start while the first is running',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'drift-lock-')),file=path.join(dir,'bot-data.json');
  class FakeSocket{constructor(){}send(){}close(){}}
  const {fetchImpl}=recorder(call=>call.method==='PUT'?call.body:{});
  const make=()=>createBot({log:quiet,token:'t',appId:'42',storeFile:file,fetchImpl,WebSocketImpl:FakeSocket,pictures:false});
  // Another live process holds the lock (this test's parent stands in for the other bot).
  fs.writeFileSync(file+'.lock',String(process.ppid));
  await assert.rejects(make().start(),/already running/);
  // A lock left behind by a process that has gone is taken over, and given up on close.
  fs.writeFileSync(file+'.lock','999999');
  const bot=make();
  await bot.start();
  assert.equal(fs.readFileSync(file+'.lock','utf8'),String(process.pid));
  bot.close();
  assert.equal(fs.existsSync(file+'.lock'),false);
  fs.rmSync(dir,{recursive:true});
});

test('bot: the guide covers every game and command and fits in one Discord message',()=>{
  const bot=fresh();
  const reply=type(bot,colin,'$guide');
  assert.equal(reply.type,4);
  const embeds=reply.data.embeds,all=embeds.map(embed=>embed.title+'\n'+embed.description).join('\n');
  assert.deepEqual(embeds.map(embed=>embed.title),['📖 How to play','⚡ Quick games','🎮 Button games','🧾 Every command']);
  // Discord's limits: 4,096 characters in one embed, 6,000 across a message.
  for(const embed of embeds)assert.ok(embed.description.length<=4096,embed.title+' is '+embed.description.length+' long');
  assert.ok(all.length<=6000,'the guide is '+all.length+' characters');
  // Every command the bot has is named, with the words it takes.
  for(const def of bot.definitions())assert.ok(all.includes('`$'+def.name),'the guide leaves out $'+def.name);
  assert.match(all,/`\$coinflip <bet> <heads\|tails>`/);
  assert.match(all,/`\$dice <bet> <under\|over> \[target\]`/);
  assert.match(all,/`\$tower <bet> \[easy\|classic\|challenge\|expert\|master\]`/);
  assert.match(all,/`\$tip <@player> <amount>`/);
  assert.match(all,/`\$server setup`/);
  // The figures in it are the games' own.
  assert.match(all,/under 50 pays 2×, under 25 pays 4×, under 10 pays 10×/);
  assert.match(all,/Expert ×3 a floor \(1 of 3 safe\)/);
  assert.match(all,/A bet over 1,500 cannot win/);
  assert.match(all,/Over 200 you keep 60% of it\. A coin flip wins 30% of the time and the house 70%\./);
  assert.match(all,/cannot be bought, deposited, withdrawn or cashed out/);
  assert.equal(type(bot,colin,'$howto').data.embeds.length,4);
  assert.equal(run(bot,colin,'guide').data.embeds.length,4);
});

test('bot: a flip that is over has its message deleted twenty minutes later',async()=>{
  let clock=9_000_000;
  const {calls,fetchImpl}=recorder();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'drift-clear-')),file=path.join(dir,'bot-data.json');
  const make=()=>createBot({log:quiet,flipDelay:0,pictures:false,now:()=>clock,fetchImpl,appId:'42',token:'x',storeFile:file});
  let bot=make();
  const press=(user,id,message)=>bot.handle({type:3,id:'9',token:'tok-press',channel_id:'800',message:{id:message},data:{custom_id:id},member:{user}});
  const deleted=()=>calls.filter(call=>call.method==='DELETE').map(call=>call.url.split('/api/v10')[1]);
  // One flip is played, one is cancelled, one runs out with nobody joining.
  const played=run(bot,colin,'flip',{bet:50,side:'Heads'});
  press(rv,buttons(played)[0].custom_id,'msg-played');
  clock+=60_000;
  const cancelled=run(bot,colin,'flip',{bet:50,side:'Tails'});
  press(colin,buttons(cancelled)[1].custom_id,'msg-cancelled');
  const lonely=type(bot,rv,'$flip 50 heads');
  lonely.onSent({id:'msg-lonely',channel_id:'801'});
  // An open flip is never cleared, and nothing goes before its twenty minutes are up.
  clock+=9*60_000;bot.sweep();
  assert.deepEqual(deleted(),[]);
  clock+=60_000;bot.sweep();
  assert.equal(bot.flips.size,0);
  // The record survives a restart.
  bot.close();bot=make();
  clock+=8.5*60_000;bot.sweep();
  assert.deepEqual(deleted(),[]);
  clock+=60_000;bot.sweep();
  assert.deepEqual(deleted(),['/channels/800/messages/msg-played']);
  clock+=60_000;bot.sweep();
  assert.deepEqual(deleted(),['/channels/800/messages/msg-played','/channels/800/messages/msg-cancelled']);
  clock+=10*60_000;bot.sweep();
  assert.deepEqual(deleted(),['/channels/800/messages/msg-played','/channels/800/messages/msg-cancelled','/channels/801/messages/msg-lonely']);
  assert.deepEqual(bot.store.data.cleanup,[]);
  // Solo games are left alone.
  run(bot,colin,'coinflip',{bet:5,side:'Heads'});
  clock+=60*60_000;bot.sweep();
  assert.equal(deleted().length,3);
  bot.close();
  await new Promise(done=>setTimeout(done,10));
  fs.rmSync(dir,{recursive:true});
});

test('bot: hosting settings choose where the data is kept and whether the one-copy lock is used',async()=>{
  const home=settingsFromEnv({DISCORD_BOT_TOKEN:'t',DISCORD_CLIENT_ID:'42'});
  assert.equal(home.storeFile,path.join(__dirname,'..','server','bot-data.json'));
  assert.equal(home.lock,true);assert.equal(home.prefix,'$');assert.equal(home.token,'t');assert.equal(home.appId,'42');
  const hosted=settingsFromEnv({DATA_DIR:'/var/data',BOT_LOCK:'off',BOT_PREFIX:'!'});
  assert.equal(hosted.storeFile,path.join('/var/data','bot-data.json'));
  assert.equal(hosted.lock,false);assert.equal(hosted.prefix,'!');
  // With the lock off, a leftover lock file from a copy that looks alive does not stop the bot starting.
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'drift-host-')),file=path.join(dir,'bot-data.json');
  fs.writeFileSync(file+'.lock',String(process.ppid));
  class FakeSocket{constructor(){}send(){}close(){}}
  const {fetchImpl}=recorder(call=>call.method==='PUT'?call.body:{});
  const bot=createBot({log:quiet,token:'t',appId:'42',storeFile:file,lock:false,fetchImpl,WebSocketImpl:FakeSocket,pictures:false});
  await bot.start();
  run(bot,colin,'balance');
  bot.close();
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).players[colin.id].credits,1000);
  assert.equal(fs.readFileSync(file+'.lock','utf8'),String(process.ppid));
  fs.rmSync(dir,{recursive:true});
  // The Blueprint keeps the token out of the repository and puts the data on the disk.
  const blueprint=fs.readFileSync(path.join(__dirname,'..','render.yaml'),'utf8');
  assert.match(blueprint,/type: worker/);
  assert.match(blueprint,/key: DISCORD_BOT_TOKEN\n\s+sync: false/);
  assert.match(blueprint,/key: DATA_DIR\n\s+value: \/var\/data/);
  assert.match(blueprint,/mountPath: \/var\/data/);
  assert.doesNotMatch(blueprint,/[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/);
});

test('hosted wallet server has no arcade commands or playable old buttons',()=>{
  const bot=fresh({arcadeEnabled:false});
  assert.deepEqual(bot.definitions().map(command=>command.name).sort(),['help','server']);
  for(const command of ['$bal','$balance','$refill','$tip','$coinflip','$depo','$b']){
    assert.equal(type(bot,colin,command),null);
  }
  assert.match(text(run(bot,colin,'help')),/\$depo LTC/);
  assert.match(text(click(bot,colin,'a:'+colin.id+':coinflip')),/retired/);
  assert.deepEqual(bot.store.data.players,{});
});
