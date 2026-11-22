const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const {createChatServer, cleanText} = require('../server/chat-server.js');

function loadClient(){
  const context = {URLSearchParams};
  vm.runInNewContext(fs.readFileSync('dist/chat.js','utf8')+';globalThis.api={parseDiscordReturn,discordAvatar,discordName,mentionHandle,mentionParts}',context);
  return context.api;
}
const listen = server => new Promise(resolve => server.listen(0,'127.0.0.1',() => resolve('http://127.0.0.1:'+server.address().port)));

test('Discord return is only accepted with the state this browser issued', () => {
  const {parseDiscordReturn} = loadClient();
  assert.equal(parseDiscordReturn('#wallet','abc'), null);
  assert.equal(parseDiscordReturn('', 'abc'), null);
  const ok = parseDiscordReturn('#token_type=Bearer&access_token=tok123&expires_in=60&scope=identify&state=abc','abc',1000);
  assert.equal(ok.token,'tok123');
  assert.equal(ok.expires,61000);
  assert.equal(parseDiscordReturn('#access_token=tok123&state=other','abc').error,'state');
  assert.equal(parseDiscordReturn('#access_token=tok123&state=abc',undefined).error,'state');
  assert.equal(parseDiscordReturn('#error=access_denied&state=abc','abc').error,'denied');
});

test('avatar addresses are built only from valid Discord ids and hashes', () => {
  const {discordAvatar, discordName} = loadClient();
  const hash = 'a'.repeat(32);
  assert.equal(discordAvatar({id:'80351110224678912',avatar:hash}),'https://cdn.discordapp.com/avatars/80351110224678912/'+hash+'.png?size=64');
  assert.match(discordAvatar({id:'80351110224678912',avatar:null}),/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
  assert.match(discordAvatar({id:'x" onerror="1',avatar:'../../evil'}),/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/0\.png$/);
  assert.equal(discordName({global_name:'Colin',username:'colin_b'}),'Colin');
  assert.equal(discordName({username:'colin_b'}),'colin_b');
});

test('@mentions are found for known people only and flag the viewer', () => {
  const {mentionHandle, mentionParts} = loadClient();
  assert.equal(mentionHandle('Big Milo!'),'BigMilo');
  assert.equal(mentionHandle('xyz.wrl'),'xyz.wrl');
  const known = new Set(['col','nyx','bigmilo']);
  const read = (text,mine) => Array.from(mentionParts(text,known,mine),p => (p.mention?(p.me?'[ME:':'[')+p.text+']':p.text)).join('');
  assert.equal(read('yo @Col you there',['col']),'yo [ME:@Col] you there');
  assert.equal(read('@nyx how',['col']),'[@nyx] how');
  assert.equal(read('gg @nyx.',['col']),'gg [@nyx].');
  assert.equal(read('hey @BigMilo and @col!!',['col']),'hey [@BigMilo] and [ME:@col]!!');
  assert.equal(read('mail me@nyx.com or @stranger',['col']),'mail me@nyx.com or @stranger');
  assert.equal(read('<b>@nyx</b>',[]),'<b>[@nyx]</b>');
  assert.equal(read('no mentions here',['col']),'no mentions here');
});

test('message text is trimmed, flattened, and capped', () => {
  assert.equal(cleanText('  hi\n\nthere\t '),'hi there');
  assert.equal(cleanText('x'.repeat(500)).length,200);
  assert.equal(cleanText({}),'');
  assert.equal(cleanText(' \n '),'');
});

test('chat relay verifies Discord sign-in before broadcasting', async () => {
  const accounts = {
    'good-token-123':{application:{id:'app1'},user:{id:'80351110224678912',username:'colin_b',global_name:'Colin',avatar:'b'.repeat(32)}},
    'other-app-token':{application:{id:'someone-else'},user:{id:'80351110224678913',username:'imposter'}}
  };
  const discord = http.createServer((req,res) => {
    const account = accounts[(req.headers.authorization||'').replace('Bearer ','')];
    res.writeHead(req.url==='/oauth2/@me'&&account?200:401,{'Content-Type':'application/json'});
    res.end(JSON.stringify(account||{message:'401: Unauthorized'}));
  });
  const discordApi = await listen(discord);
  const chat = createChatServer({clientId:'app1',origins:['http://site.test'],discordApi,minGap:60000});
  const base = await listen(chat.server);
  const post = (token,text,origin='http://site.test') => fetch(base+'/messages',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({text})});
  try{
    const events = await fetch(base+'/events',{headers:{Origin:'http://site.test'}});
    assert.equal(events.headers.get('access-control-allow-origin'),'http://site.test');
    const reader = events.body.getReader(), decoder = new TextDecoder();
    let seen = '';
    const until = async text => {while(!seen.includes(text)){const {value,done} = await reader.read();if(done)throw new Error('stream ended');seen += decoder.decode(value)}};
    await until('event: history\ndata: []');

    assert.equal((await post(null,'hello')).status,401);
    assert.equal((await post('bad-token-999','hello')).status,401);
    assert.equal((await post('other-app-token','hello')).status,401);
    assert.equal((await post('good-token-123','hello','http://evil.test')).status,403);
    assert.equal((await post('good-token-123','   ')).status,400);

    assert.equal((await post('good-token-123','  hello <b>there</b> ')).status,201);
    await until('event: message');
    await until('\n\n');
    const message = JSON.parse(seen.slice(seen.indexOf('event: message')).split('\n')[1].replace('data: ',''));
    assert.equal(message.text,'hello <b>there</b>');
    assert.deepEqual(message.user,{id:'80351110224678912',name:'Colin',avatar:'b'.repeat(32)});

    assert.equal((await post('good-token-123','again')).status,429);
    await reader.cancel();
    const late = await fetch(base+'/events');
    const first = decoder.decode((await late.body.getReader().read()).value);
    assert.ok(first.includes('retry: 3000'));
  }finally{
    await chat.close();
    discord.closeAllConnections();
    await new Promise(resolve => discord.close(resolve));
  }
});

test('simulated chatter fills every slot, holds conversations, and answers the player', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync('dist/chat-crowd.js','utf8')+';globalThis.createCrowd=createCrowd',context);
  let seed = 7;
  const random = () => (seed = (seed*16807)%2147483647)/2147483647;
  const crowd = context.createCrowd(random);
  const now = 1_000_000_000;
  const lines = [];
  let followUps = 0;
  for(let i=0;i<1500;i++){if(crowd.pending())followUps++;lines.push(crowd.say(now+i))}
  // A good share of lines answer the one before them.
  assert.ok(followUps>500&&followUps<1300,String(followUps));
  for(const [i,m] of lines.entries()){
    assert.ok(m.crowd&&m.text.trim().length>0);
    assert.ok(!/[{}]/.test(m.text),m.text);
    assert.ok(!/undefined|NaN/.test(m.text),m.text);
    assert.match(m.user.id,/^crowd-\d+$/);
    assert.match(m.user.icon,/^data:image\/svg\+xml,/);
    assert.ok(m.since<=m.at);
    // A character may add a second line to its own point, but never three in a row.
    if(i>1)assert.ok(!(m.user.id===lines[i-1].user.id&&m.user.id===lines[i-2].user.id),m.text);
  }
  assert.equal(new Set(lines.map(m => m.id)).size,lines.length);
  // The characters answer the player, and the answer fits what was said.
  const kinds = {'yo chat':'hello','shut up guys':'hush','are you guys bots':'real','gn everyone':'bye','what game should i play':'pick',
    'i just hit 40x on limbo':'brag','i lost everything':'sad','lmao':'laugh','hey tamsin':'hello','tamsin you there':'called',
    'plinko is the best':'game','is it worth it?':'yesno','anyone know the odds?':'answer','this site is cool':'chat','how are yall':'howru',
    'some1 explain sybau':'explain','what does push mean':'explain','whats ts':'explain','explain flurbo':'unknown','yall are so dumb':'roast',
    'this game is rigged':'salty','im bored':'bored','who wants to 1v1 coinflip':'invite','why do i always lose':'why','how do i change my name':'how',
    'should i go all in':'should','someone give me credits':'beg','where are you from':'personal','yall are the best':'praise'};
  for(const [text,kind] of Object.entries(kinds)){
    const reply = crowd.answer('Col',text,now);
    assert.equal(reply.kind,kind,text);
    assert.ok(reply.lines.length>=1&&reply.lines.length<=3);
    assert.equal(new Set(reply.lines.map(m => m.user.id)).size,reply.lines.length);
    assert.equal(new Set(reply.lines.map(m => m.text)).size,reply.lines.length);
    for(const m of reply.lines)assert.ok(m.crowd&&m.text.trim()&&!/[{}]|undefined|NaN/.test(m.text),m.text);
    assert.ok(kind==='hush'?reply.quiet>=25000:reply.quiet<=9000);
    assert.equal(crowd.pending(),false);
  }
  assert.match(crowd.answer('Col','yo chat',now).lines[0].text,/col/i);
  // A word they know gets explained; one they do not gets an honest shrug that names it or passes the question on.
  assert.match(crowd.answer('Col','some1 explain sybau',now).lines[0].text,/shut up/i);
  assert.match(crowd.answer('Col','what does push mean',now).lines[0].text,/tie/i);
  assert.ok(!/shut up|tie/i.test(crowd.answer('Col','explain flurbo',now).lines[0].text));
  assert.equal(crowd.answer('Col','tamsin you there',now).lines[0].user.name,'tamsin');
  assert.match(crowd.answer('Col','plinko is the best',now).lines.map(m => m.text).join(' '),/plinko|col|best game/i);
  // Scripted conversations use only speakers a to d, and lines are sorted into the right kind of reaction.
  const moods = vm.runInNewContext(fs.readFileSync('dist/chat-crowd.js','utf8')+";[CROWD_THREADS.every(t => t.every(turn => /^[abcd]: \\S/.test(turn))),crowdMood('limbo 1.02x. pain','game'),crowdMood('keno 7 of 10 lets gooo','game'),crowdMood('what are yall listening to','random'),crowdMood('gm','random'),crowdMood('eating ramen rn','random'),crowdMood('chat on the left is nice','site')]",{});
  assert.deepEqual(Array.from(moods),[true,'loss','win','question','greet','food','site']);
  // Every character has its own picture, and pictures stay the same between visits.
  assert.equal(new Set(crowd.members.map(m => m.icon)).size,crowd.members.length);
  assert.deepEqual(context.createCrowd().members.map(m => m.icon),crowd.members.map(m => m.icon));
  assert.ok(crowd.members.every(m => !/NaN|undefined/.test(decodeURIComponent(m.icon))));
  // Pictures from the pfps folder replace the drawn ones, one per character.
  const files = Array.from({length:12},(_,i) => 'pic '+(i+1)+'.png');
  const pictured = context.createCrowd(random,files);
  assert.equal(pictured.members.length,12);
  assert.deepEqual(Array.from(pictured.members,m => m.icon),files.map(f => 'art/pfps/'+encodeURIComponent(f)));
  const few = context.createCrowd(random,['a.jpg','b.jpg']);
  assert.equal(few.members.length,8);
  assert.equal(few.members[1].icon,'art/pfps/b.jpg');
  assert.match(few.members[2].icon,/^data:image/);
});

test('every viewer gets the same chatter for the same time and the same real message', () => {
  // Two separate "browsers" load the script on their own.
  const viewer = () => {
    const context = {};
    vm.runInNewContext(fs.readFileSync('dist/chat-crowd.js','utf8')+';globalThis.api={crowdBlock,crowdReply,crowdHeadcount,CROWD_BLOCK}',context);
    return context.api;
  };
  const one = viewer(), two = viewer(), plain = lines => Array.from(lines,m => [m.id,m.user.name,m.text,m.at,m.since].join('|'));
  const block = 2_991_234;
  const first = one.crowdBlock(block);
  assert.deepEqual(plain(first),plain(two.crowdBlock(block)));
  assert.deepEqual(plain(first),plain(one.crowdBlock(block)));
  assert.notDeepEqual(plain(first).map(row => row.split('|')[2]),plain(one.crowdBlock(block+1)).map(row => row.split('|')[2]));
  assert.ok(first.length>30&&first.length<220,String(first.length));
  assert.ok(first.every((m,i) => m.at>=block*one.CROWD_BLOCK&&m.at<(block+1)*one.CROWD_BLOCK&&(i===0||m.at>first[i-1].at)));
  assert.ok(first.every(m => !/[{}]|undefined|NaN/.test(m.text)));

  const message = {id:'8c0f1d3a-real',user:{id:'80351110224678912',name:'Col'},text:'shut up guys',at:1_795_000_000_000};
  const reply = one.crowdReply(message);
  assert.deepEqual(plain(reply.lines),plain(two.crowdReply(message).lines));
  assert.equal(reply.kind,'hush');
  assert.ok(reply.lines.length>=2&&reply.lines.every((m,i) => m.at>message.at&&(i===0||m.at>reply.lines[i-1].at)));
  // Nobody answers instantly: the first reply takes at least a few seconds and the next ones are spaced out.
  assert.ok(reply.lines[0].at-message.at>=3500);
  assert.ok(reply.lines.every((m,i) => i===0||m.at-reply.lines[i-1].at>=2500));
  assert.ok(reply.from>message.at&&reply.from<reply.lines[0].at);
  assert.ok(reply.until-reply.lines.at(-1).at>=25000);
  assert.notDeepEqual(plain(reply.lines),plain(one.crowdReply({...message,id:'another-id'}).lines));
  // Small talk is sometimes left unanswered, and then chatter is not held back.
  const quiet = Array.from({length:60},(_,i) => one.crowdReply({...message,id:'chat-'+i,text:'this site is cool'}));
  assert.ok(quiet.some(r => r.lines.length===0&&r.until===message.at)&&quiet.some(r => r.lines.length>0));

  for(let t=1_795_000_000_000;t<1_795_010_000_000;t+=61_000){
    const heads = one.crowdHeadcount(t);
    assert.equal(heads,two.crowdHeadcount(t));
    assert.ok(heads>=20&&heads<=70,String(heads));
  }
});

test('AI replies: the server asks Claude, posts the characters\' lines, and falls back when it cannot', async () => {
  const {createAi, readLines, loadCast} = require('../server/chat-ai.js');
  const cast = [{index:0,name:'kyro',voice:null},{index:1,name:'mavv',voice:null},{index:2,name:'lunaa',voice:null}];
  // The site's own character list can be read by the server.
  assert.ok(loadCast().length>=8&&loadCast()[0].name==='kyro');
  assert.deepEqual(readLines('Sure: [{"name":"MAVV","text":" hi\\n there "},{"name":"stranger","text":"x"},{"name":"mavv","text":"again"},{"name":"kyro","text":""}] ok',cast),[{index:1,name:'mavv',text:'hi there'}]);
  assert.deepEqual(readLines('no json here',cast),[]);

  const requests = [];
  let mode = 'answer';
  const respond = request => {
    requests.push(request);
    if(mode==='fail')throw new Error('network down');
    if(mode==='refuse')return {stop_reason:'refusal',content:[]};
    return {stop_reason:'end_turn',content:[{type:'thinking',thinking:''},{type:'text',text:'[{"name":"kyro","text":"yo Col"},{"name":"mavv","text":"sup <b>Col</b>"}]'}]};
  };
  const client = {beta:{messages:{create:async request => respond(request)}},messages:{create:async request => respond(request)}};
  const quiet = {error(){}};
  const ai = createAi({client,cast,perMinute:4,log:quiet});

  const discord = http.createServer((req,res) => {
    const ok = req.headers.authorization==='Bearer good-token-123';
    res.writeHead(ok?200:401,{'Content-Type':'application/json'});
    res.end(JSON.stringify(ok?{application:{id:'app1'},user:{id:'80351110224678912',username:'colin_b',global_name:'Col',avatar:null}}:{}));
  });
  const discordApi = await listen(discord);
  const chat = createChatServer({clientId:'app1',origins:['http://site.test'],discordApi,minGap:0,ai,aiDelay:() => 15});
  const base = await listen(chat.server);
  const post = text => fetch(base+'/messages',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://site.test',Authorization:'Bearer good-token-123'},body:JSON.stringify({text})});
  try{
    const events = await fetch(base+'/events',{headers:{Origin:'http://site.test'}});
    const reader = events.body.getReader(), decoder = new TextDecoder();
    let seen = '';
    const parsed = () => seen.split('\n\n').filter(part => part.startsWith('event: ')).map(part => {const [head,data] = part.split('\ndata: ');return {event:head.slice(7),data:JSON.parse(data)}});
    const until = async check => {for(;;){const found = check(parsed());if(found)return found;const {value,done} = await reader.read();if(done)throw new Error('stream ended');seen += decoder.decode(value)}};

    assert.equal((await post('yo chat')).status,201);
    const lines = await until(list => {const got = list.filter(e => e.event==='message');return got.length>=3&&got});
    assert.equal(lines[0].data.text,'yo chat');
    assert.equal(lines[0].data.ai,true);
    assert.deepEqual(lines.slice(1).map(e => [e.data.user.id,e.data.user.name,e.data.text,e.data.crowd,e.data.re===lines[0].data.id]),
      [['crowd-0','kyro','yo Col',true,true],['crowd-1','mavv','sup <b>Col</b>',true,true]]);
    assert.ok(lines[1].data.at>=lines[0].data.at&&lines[2].data.at>=lines[1].data.at);

    // What was sent to Claude.
    const request = requests[0];
    assert.equal(request.model,'claude-opus-5-5');
    assert.deepEqual(request.betas,['server-side-fallback-2026-07-01']);
    assert.equal(request.fallbacks,'default');
    assert.deepEqual(request.output_config,{effort:'low'});
    assert.equal('thinking' in request,false);
    assert.equal(request.system[0].cache_control.type,'ephemeral');
    assert.match(request.system[0].text,/do not claim to be human/);
    assert.match(request.system[0].text,/- kyro: /);
    assert.match(request.messages[0].content,/New message from "Col":\nyo chat$/);

    // The next request carries the recent chat, including what the characters said.
    assert.equal((await post('what should i play')).status,201);
    await until(list => list.filter(e => e.event==='message').length>=6);
    assert.match(requests[1].messages[0].content,/\[Col\] yo chat\n\[kyro\] yo Col\n\[mavv\] sup <b>Col<\/b>/);

    // A declined request posts nothing; a failed one hands the message back to the scripted replies.
    mode = 'refuse';
    assert.equal((await post('third')).status,201);
    mode = 'fail';
    assert.equal((await post('fourth')).status,201);
    const failed = await until(list => list.find(e => e.event==='aifail'));
    const fourth = parsed().find(e => e.event==='message'&&e.data.text==='fourth').data;
    assert.equal(failed.data.id,fourth.id);
    assert.equal(parsed().filter(e => e.event==='message').length,8);

    // Past the per-minute ceiling the AI is not asked at all.
    mode = 'answer';
    assert.equal((await post('fifth')).status,201);
    const fifth = await until(list => list.find(e => e.event==='message'&&e.data.text==='fifth'));
    assert.equal('ai' in fifth.data,false);
    assert.equal(requests.length,4);

    // A newcomer's history shows the failed message unmarked and the characters' lines in place.
    await reader.cancel();
    const late = await fetch(base+'/events');
    const first = decoder.decode((await late.body.getReader().read()).value);
    const history = JSON.parse(first.split('event: history\ndata: ')[1].split('\n\n')[0]);
    assert.equal(history.find(m => m.text==='fourth').ai,false);
    assert.equal(history.filter(m => m.crowd).length,4);
  }finally{
    await chat.close();
    discord.closeAllConnections();
    await new Promise(resolve => discord.close(resolve));
  }
});

test('AI replies: a model without server-side fallback gets a plain request', async () => {
  const {createAi} = require('../server/chat-ai.js');
  const calls = [];
  const client = {
    beta:{messages:{create:async request => {calls.push(['beta',request]);return {stop_reason:'end_turn',content:[{type:'text',text:'[]'}]}}}},
    messages:{create:async request => {calls.push(['plain',request]);return {stop_reason:'end_turn',content:[{type:'text',text:'[{"name":"kyro","text":"ok"}]'}]}}}
  };
  const ai = createAi({client,model:'claude-haiku-5-5',cast:[{index:0,name:'kyro',voice:null}],log:{error(){}}});
  assert.deepEqual(await ai.replies({id:'1',user:{name:'Col'},text:'hi'},[]),[{index:0,name:'kyro',text:'ok'}]);
  assert.equal(calls[0][0],'plain');
  assert.equal('fallbacks' in calls[0][1],false);
  assert.equal(calls[0][1].model,'claude-haiku-5-5');
});

test('tips: a code sent by Discord DM confirms the sender, and the tip waits for the receiver', async () => {
  const accounts = {
    'token-col-12345':{application:{id:'app1'},user:{id:'80351110224678912',username:'colin_b',global_name:'Col',avatar:null}},
    'token-rv-123456':{application:{id:'app1'},user:{id:'175928847299117063',username:'rvveya',global_name:'Rv',avatar:null}}
  };
  const dms = [];
  let dmsWork = true;
  const discord = http.createServer((req,res) => {
    let body = '';
    req.on('data',chunk => {body += chunk});
    req.on('end',() => {
      const reply = (status,data) => {res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))};
      if(req.url==='/oauth2/@me'){
        const account = accounts[(req.headers.authorization||'').replace('Bearer ','')];
        return reply(account?200:401,account||{});
      }
      if(req.headers.authorization!=='Bot secret-bot-token')return reply(401,{});
      if(req.url==='/users/@me/channels')return dmsWork?reply(200,{id:'dm-'+JSON.parse(body).recipient_id}):reply(403,{code:50007});
      const channel = /^\/channels\/(dm-\d+)\/messages$/.exec(req.url);
      if(channel){dms.push({channel:channel[1],content:JSON.parse(body).content});return reply(200,{id:'1'})}
      reply(404,{});
    });
  });
  const discordApi = await listen(discord);
  const call = (base,token,path,body) => fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://site.test',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});
  const col = 'token-col-12345', rv = 'token-rv-123456', rvId = '175928847299117063', colId = '80351110224678912';

  // Without a bot token tipping is off.
  const off = createChatServer({clientId:'app1',origins:['http://site.test'],discordApi});
  const offBase = await listen(off.server);
  const chat = createChatServer({clientId:'app1',origins:['http://site.test'],discordApi,botToken:'secret-bot-token',tipGap:0,tipTtl:60000});
  const base = await listen(chat.server);
  try{
    assert.equal((await (await call(offBase,col,'/tips/people')).json()).enabled,false);
    assert.equal((await call(offBase,col,'/tips/request',{to:rvId,amount:5})).status,503);

    assert.equal((await call(base,'bad-token-00000','/tips/people')).status,401);
    // Nobody else has signed in yet, so there is nobody to tip.
    assert.deepEqual(await (await call(base,col,'/tips/people')).json(),{enabled:true,people:[]});
    assert.equal((await call(base,col,'/tips/request',{to:rvId,amount:50})).status,400);
    // Rv signs in (collecting tips counts), and now appears for Col.
    assert.deepEqual(await (await call(base,rv,'/tips/claim',{})).json(),{tips:[]});
    assert.deepEqual((await (await call(base,col,'/tips/people')).json()).people.map(p => [p.id,p.name]),[[rvId,'Rv']]);

    for(const bad of [{to:colId,amount:50},{to:rvId,amount:0},{to:rvId,amount:1.5},{to:rvId,amount:'50'},{to:rvId,amount:1000001},{to:'nobody',amount:5}])
      assert.equal((await call(base,col,'/tips/request',bad)).status,400,JSON.stringify(bad));
    assert.equal(dms.length,0);

    // The bot cannot reach the sender: no tip is started.
    dmsWork = false;
    const blocked = await call(base,col,'/tips/request',{to:rvId,amount:250});
    assert.equal(blocked.status,403);
    assert.match((await blocked.json()).error,/Discord server/);
    assert.equal((await call(base,col,'/tips/confirm',{code:'000000'})).status,410);
    dmsWork = true;

    const asked = await call(base,col,'/tips/request',{to:rvId,amount:250});
    assert.equal(asked.status,200);
    assert.deepEqual((({to,amount}) => ({to,amount}))(await asked.json()),{to:{id:rvId,name:'Rv'},amount:250});
    // The code went to the sender's own DMs and is not in the reply.
    assert.equal(dms.length,1);
    assert.equal(dms[0].channel,'dm-'+colId);
    assert.match(dms[0].content,/250 play credits/);
    const code = /\*\*(\d{6})\*\*/.exec(dms[0].content)[1];

    // Someone else cannot confirm it, and a wrong code is counted.
    assert.equal((await call(base,rv,'/tips/confirm',{code})).status,410);
    const wrong = await call(base,col,'/tips/confirm',{code:code==='111111'?'222222':'111111'});
    assert.equal(wrong.status,400);
    assert.equal((await wrong.json()).left,4);
    assert.deepEqual(await (await call(base,rv,'/tips/claim',{})).json(),{tips:[]});

    const done = await call(base,col,'/tips/confirm',{code});
    assert.equal(done.status,200);
    assert.deepEqual((({to,amount}) => ({to,amount}))(await done.json()),{to:{id:rvId,name:'Rv'},amount:250});
    // A code works once.
    assert.equal((await call(base,col,'/tips/confirm',{code})).status,410);

    // The tip is held for Rv, shows in chat history, and is handed over exactly once.
    const events = await fetch(base+'/events');
    const first = new TextDecoder().decode((await events.body.getReader().read()).value);
    const history = JSON.parse(first.split('event: history\ndata: ')[1].split('\n\n')[0]);
    assert.deepEqual(history.map(m => [m.user.name,m.text,m.tip.to.name,m.tip.amount]),[['Col','tipped Rv 250 credits','Rv',250]]);
    assert.deepEqual(await (await call(base,col,'/tips/claim',{})).json(),{tips:[]});
    const claimed = (await (await call(base,rv,'/tips/claim',{})).json()).tips;
    assert.deepEqual(claimed.map(t => [t.from.name,t.to.id,t.amount]),[['Col',rvId,250]]);
    assert.deepEqual(await (await call(base,rv,'/tips/claim',{})).json(),{tips:[]});

    // Five wrong codes cancel a tip.
    assert.equal((await call(base,col,'/tips/request',{to:rvId,amount:10})).status,200);
    for(let i=0;i<4;i++)assert.equal((await call(base,col,'/tips/confirm',{code:'x'})).status,400);
    assert.equal((await call(base,col,'/tips/confirm',{code:'x'})).status,410);
    const lastCode = /\*\*(\d{6})\*\*/.exec(dms.at(-1).content)[1];
    assert.equal((await call(base,col,'/tips/confirm',{code:lastCode})).status,410);
  }finally{
    await chat.close();await off.close();
    discord.closeAllConnections();
    await new Promise(resolve => discord.close(resolve));
  }
});

test('tips: a code expires and code requests are spaced out', async () => {
  const discord = http.createServer((req,res) => {
    req.resume();
    req.on('end',() => {
      res.writeHead(200,{'Content-Type':'application/json'});
      const token = (req.headers.authorization||'').replace('Bearer ','');
      res.end(JSON.stringify(req.url==='/oauth2/@me'?{application:{id:'app1'},user:{id:token==='token-aaaaaaaaa'?'11111111111':'22222222222',username:'u'+token.slice(6,7),global_name:null,avatar:null}}:{id:'dm'}));
    });
  });
  const discordApi = await listen(discord);
  const chat = createChatServer({clientId:'app1',origins:[],discordApi,botToken:'bot',tipGap:60000,tipTtl:1});
  const base = await listen(chat.server);
  const call = (token,path,body) => fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  try{
    await call('token-bbbbbbbbb','/tips/claim',{});
    assert.equal((await call('token-aaaaaaaaa','/tips/request',{to:'22222222222',amount:5})).status,200);
    assert.equal((await call('token-aaaaaaaaa','/tips/request',{to:'22222222222',amount:5})).status,429);
    await new Promise(resolve => setTimeout(resolve,10));
    assert.equal((await call('token-aaaaaaaaa','/tips/confirm',{code:'123456'})).status,410);
  }finally{
    await chat.close();
    discord.closeAllConnections();
    await new Promise(resolve => discord.close(resolve));
  }
});

test('player flips: after a countdown the server tosses the coin, shows it spinning, then pays the winner', async () => {
  const names = {'token-aaaaaaaaa':['11111111111','Ana'],'token-bbbbbbbbb':['22222222222','Ben'],'token-ccccccccc':['33333333333','Cy']};
  const discord = http.createServer((req,res) => {
    const who = names[(req.headers.authorization||'').replace('Bearer ','')];
    res.writeHead(who?200:401,{'Content-Type':'application/json'});
    res.end(JSON.stringify(who?{application:{id:'app1'},user:{id:who[0],username:who[1].toLowerCase(),global_name:who[1],avatar:null}}:{}));
  });
  const discordApi = await listen(discord);
  const storeFile = require('node:path').join(require('node:os').tmpdir(),'driftlobby-test-'+process.pid+'.json');
  try{fs.unlinkSync(storeFile)}catch{}
  const options = {clientId:'app1',origins:[],discordApi,storeFile,flipCountdown:120,flipSpin:120};
  let chat = createChatServer(options);
  let base = await listen(chat.server);
  const call = (token,path,body={}) => fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  const owed = async token => (await (await call(token,'/tips/claim')).json()).tips;
  const snapshot = async () => {
    const events = await fetch(base+'/events');
    const reader = events.body.getReader();
    const text = new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    return JSON.parse(text.split('event: flips\ndata: ')[1].split('\n\n')[0]);
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  const ana = 'token-aaaaaaaaa', ben = 'token-bbbbbbbbb', cy = 'token-ccccccccc';
  try{
    assert.equal((await call('bad-token-00000','/flips/create',{amount:5,side:'Heads'})).status,401);
    for(const bad of [{amount:0,side:'Heads'},{amount:2.5,side:'Heads'},{amount:'5',side:'Heads'},{amount:5,side:'Edge'},{amount:1000001,side:'Tails'}])
      assert.equal((await call(ana,'/flips/create',bad)).status,400,JSON.stringify(bad));

    const made = await call(ana,'/flips/create',{amount:200,side:'Heads'});
    assert.equal(made.status,201);
    const flip = (await made.json()).flip;
    assert.deepEqual([flip.creator.name,flip.amount,flip.side,flip.status],['Ana',200,'Heads','open']);
    assert.deepEqual((await snapshot()).open.map(f => f.id),[flip.id]);

    // Only three open at once, nobody can join their own, and only the creator can cancel.
    assert.equal((await call(ana,'/flips/create',{amount:1,side:'Tails'})).status,201);
    assert.equal((await call(ana,'/flips/create',{amount:1,side:'Tails'})).status,201);
    assert.equal((await call(ana,'/flips/create',{amount:1,side:'Tails'})).status,429);
    assert.equal((await call(ana,'/flips/join',{id:flip.id})).status,400);
    assert.equal((await call(ben,'/flips/cancel',{id:flip.id})).status,404);
    assert.equal((await call(ben,'/flips/join',{id:'nope'})).status,404);

    // Cancelling returns the stake.
    const spare = (await snapshot()).open.find(f => f.amount===1);
    assert.equal((await call(ana,'/flips/cancel',{id:spare.id})).status,200);
    assert.deepEqual((await owed(ana)).map(i => [i.kind,i.id,i.amount]),[['refund',spare.id,1]]);

    // Open flips and owed credits survive a restart.
    await chat.close();
    chat = createChatServer(options);
    base = await listen(chat.server);
    assert.equal((await snapshot()).open.length,2);

    // Ben joins: the countdown starts and nothing about the result exists yet.
    const joined = await call(ben,'/flips/join',{id:flip.id});
    assert.equal(joined.status,200);
    const counting = (await joined.json()).flip;
    assert.deepEqual([counting.status,counting.joiner.name,'result' in counting,'winner' in counting],['countdown','Ben',false,false]);
    assert.ok(counting.flipAt>Date.now());
    // From here it cannot be joined again or cancelled, and nobody is owed anything.
    assert.equal((await call(cy,'/flips/join',{id:flip.id})).status,404);
    assert.equal((await call(ana,'/flips/cancel',{id:flip.id})).status,404);
    const during = await snapshot();
    assert.ok(Math.abs(during.now-Date.now())<2000&&during.spin===120);
    assert.equal(during.open.find(f => f.id===flip.id).status,'countdown');
    assert.deepEqual(await owed(ben),[]);

    // The coin is tossed when the countdown ends: the result shows while it spins, before any payout.
    await pause(170);
    const spinning = (await snapshot()).open.find(f => f.id===flip.id);
    assert.equal(spinning.status,'flipping');
    assert.ok(['Heads','Tails'].includes(spinning.result));
    assert.deepEqual(await owed(ana),[]);

    // Then it settles. Exactly one side wins and is owed both stakes; the other is owed nothing.
    await pause(170);
    const after = await snapshot();
    assert.equal(after.open.length,1);
    const done = after.recent[0];
    assert.deepEqual([done.id,done.status,done.result],[flip.id,'done',spinning.result]);
    const anaWon = done.result==='Heads';
    assert.equal(done.winner,anaWon?'11111111111':'22222222222');
    const [forAna] = await owed(ana), [forBen] = await owed(ben);
    assert.deepEqual([forAna.kind,forAna.stake,forAna.payout,forAna.won,forAna.opponent.name,forAna.result],['flip',200,anaWon?400:0,anaWon,'Ben',done.result]);
    assert.deepEqual([forBen.kind,forBen.stake,forBen.payout,forBen.won,forBen.opponent.name],['flip',200,anaWon?0:400,!anaWon,'Ana']);
    assert.equal(forAna.payout+forBen.payout,400);
    assert.deepEqual(await owed(ana),[]);

    // A flip caught mid-countdown by a restart still finishes and pays.
    const second = (await (await call(cy,'/flips/create',{amount:7,side:'Tails'})).json()).flip;
    assert.equal((await call(ben,'/flips/join',{id:second.id})).status,200);
    await chat.close();
    chat = createChatServer(options);
    base = await listen(chat.server);
    await pause(320);
    const [cyGets] = await owed(cy), [benGets] = await owed(ben);
    assert.equal(cyGets.id,second.id);
    assert.equal(cyGets.payout+benGets.payout,14);
  }finally{
    await chat.close();
    try{fs.unlinkSync(storeFile)}catch{}
    discord.closeAllConnections();
    await new Promise(resolve => discord.close(resolve));
  }
});

test('player flips: over many flips each side wins about half the time', async () => {
  const names = {'token-bbbbbbbbb':['22222222222','Ben'],'token-ccccccccc':['33333333333','Cy']};
  const discord = http.createServer((req,res) => {
    const who = names[(req.headers.authorization||'').replace('Bearer ','')];
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({application:{id:'app1'},user:{id:who[0],username:who[1].toLowerCase(),global_name:who[1],avatar:null}}));
  });
  const discordApi = await listen(discord);
  const chat = createChatServer({clientId:'app1',origins:[],discordApi,flipCountdown:0,flipSpin:0});
  const base = await listen(chat.server);
  const call = (token,path,body={}) => fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  try{
    let heads = 0, settled = 0;
    const rounds = 300;
    for(let i=0;i<rounds;i++){
      const id = (await (await call('token-ccccccccc','/flips/create',{amount:1,side:'Heads'})).json()).flip.id;
      await call('token-bbbbbbbbb','/flips/join',{id});
      for(let tries=0;tries<50;tries++){
        const items = (await (await call('token-bbbbbbbbb','/tips/claim')).json()).tips;
        if(items.length){settled++;if(items[0].result==='Heads')heads++;break}
        await new Promise(resolve => setTimeout(resolve,2));
      }
    }
    assert.equal(settled,rounds);
    assert.ok(heads>rounds*0.38&&heads<rounds*0.62,String(heads));
  }finally{
    await chat.close();
    discord.closeAllConnections();
    await new Promise(resolve => discord.close(resolve));
  }
});

test('player flips: a flip nobody joins is refunded when it expires', async () => {
  const discord = http.createServer((req,res) => {
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({application:{id:'app1'},user:{id:'11111111111',username:'ana',global_name:'Ana',avatar:null}}));
  });
  const discordApi = await listen(discord);
  const chat = createChatServer({clientId:'app1',origins:[],discordApi,flipTtl:5});
  const base = await listen(chat.server);
  const call = (path,body={}) => fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer token-aaaaaaaaa'},body:JSON.stringify(body)});
  try{
    const flip = (await (await call('/flips/create',{amount:75,side:'Tails'})).json()).flip;
    await new Promise(resolve => setTimeout(resolve,20));
    chat.sweep();
    assert.deepEqual((await (await call('/tips/claim')).json()).tips.map(i => [i.kind,i.id,i.amount]),[['refund',flip.id,75]]);
    assert.equal((await call('/flips/cancel',{id:flip.id})).status,404);
  }finally{
    await chat.close();
    discord.closeAllConnections();
    await new Promise(resolve => discord.close(resolve));
  }
});

test('player flips: a finished flip drops off the list once it has been shown long enough', async () => {
  const names = {'token-aaaaaaaaa':['11111111111','Ana'],'token-bbbbbbbbb':['22222222222','Ben']};
  const discord = http.createServer((req,res) => {
    const who = names[(req.headers.authorization||'').replace('Bearer ','')];
    res.writeHead(who?200:401,{'Content-Type':'application/json'});
    res.end(JSON.stringify(who?{application:{id:'app1'},user:{id:who[0],username:who[1].toLowerCase(),global_name:who[1],avatar:null}}:{}));
  });
  const discordApi = await listen(discord);
  const chat = createChatServer({clientId:'app1',origins:[],discordApi,flipCountdown:20,flipSpin:20,flipKeep:400});
  const base = await listen(chat.server);
  const call = (token,path,body={}) => fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  const recent = async () => {
    const events = await fetch(base+'/events');
    const reader = events.body.getReader();
    const text = new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    return JSON.parse(text.split('event: flips\ndata: ')[1].split('\n\n')[0]).recent;
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  try{
    const flip = (await (await call('token-aaaaaaaaa','/flips/create',{amount:10,side:'Heads'})).json()).flip;
    assert.equal((await call('token-bbbbbbbbb','/flips/join',{id:flip.id})).status,200);
    await pause(150);
    assert.deepEqual((await recent()).map(done => done.id),[flip.id]);
    await pause(450);
    chat.sweep();
    assert.deepEqual(await recent(),[]);
    // The winnings are still owed after the flip has left the list.
    const owed = [await (await call('token-aaaaaaaaa','/tips/claim')).json(),await (await call('token-bbbbbbbbb','/tips/claim')).json()].flatMap(reply => reply.tips);
    assert.deepEqual(owed.map(item => item.payout).sort((a,b) => a-b),[0,20]);
  }finally{
    chat.close();
    await new Promise(resolve => chat.server.close(resolve));
    await new Promise(resolve => discord.close(resolve));
  }
});
