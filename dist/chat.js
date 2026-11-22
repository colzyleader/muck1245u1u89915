'use strict';
const CHAT_PREF='driftlobby.chat.v1',DISCORD_KEY='driftlobby.discord.v1',DISCORD_STATE='driftlobby.discord.state';
const chatCfg=Object.assign({discordClientId:'',chatServer:'',discordApi:'https://discord.com/api',discordAuthorize:'https://discord.com/oauth2/authorize'},globalThis.DRIFT_CHAT);

// Reads what Discord appends to the address after the sign-in screen.
// Returns null when the hash is an ordinary page link such as #wallet.
function parseDiscordReturn(hash,expectedState,now=Date.now()){
  const q=new URLSearchParams(String(hash).replace(/^#/,''));
  const token=q.get('access_token');
  if(!token&&!(q.get('error')&&q.has('state')))return null;
  if(!expectedState||q.get('state')!==expectedState)return {error:'state'};
  if(!token)return {error:'denied'};
  return {token,expires:now+(Number(q.get('expires_in'))||0)*1000};
}
function discordAvatar(user,size=64){
  const id=String(user?.id??''),avatar=String(user?.avatar??'');
  if(/^\d{5,25}$/.test(id)&&/^(a_)?[0-9a-f]{32}$/.test(avatar))return 'https://cdn.discordapp.com/avatars/'+id+'/'+avatar+'.png?size='+size;
  let index=0;try{index=Number((BigInt(id)>>22n)%6n)}catch{}
  return 'https://cdn.discordapp.com/embed/avatars/'+index+'.png';
}
function discordName(user){return String(user?.global_name||user?.name||user?.username||'Player').slice(0,32)}
// The name someone is @mentioned by: their name without spaces or symbols.
function mentionHandle(name){return String(name??'').replace(/[^\w.]+/g,'')}
// Splits a message into plain text and @mentions of known people.
// known is a Set of lowercase handles; mine lists the viewer's own lowercase handles.
function mentionParts(text,known,mine=[]){
  const parts=[];
  let done=0;
  for(const found of String(text).matchAll(/(^|[^\w@.])@([\w.]{2,32})/g)){
    const tag=found[2].replace(/\.+$/,''),start=found.index+found[1].length;
    if(!known.has(tag.toLowerCase()))continue;
    if(start>done)parts.push({text:text.slice(done,start)});
    parts.push({text:'@'+tag,mention:true,me:mine.includes(tag.toLowerCase())});
    done=start+1+tag.length;
  }
  if(done<text.length)parts.push({text:text.slice(done)});
  return parts;
}

// How other parts of the site (player flips) reach the chat server as the signed-in player.
// on.* are called when something changes; handlers.* collect credits the server says are owed.
const chatLink={server:'',me:()=>null,call:null,claim:()=>{},status:()=>{},on:{},handlers:{}};

if(typeof document!=='undefined')(()=>{
  const log=$('#chatLog'),foot=$('#chatFoot'),statusLine=$('#chatStatus'),online=$('#chatOnline');
  const server=chatCfg.chatServer.replace(/\/+$/,''),wide=matchMedia('(min-width:1100px)');
  const clock=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',second:'2-digit'});
  const read=(store,key)=>{try{return store.getItem(key)}catch{return null}};
  const write=(store,key,value)=>{try{value===null?store.removeItem(key):store.setItem(key,value)}catch{}};
  const setStatus=text=>{statusLine.textContent=text};
  let session=null,stream=null,live=false;
  // Simulated chatter (chat-crowd.js) is mixed in with whatever the chat server sends. It is worked
  // out from the clock and from the real messages, so it is the same for every viewer and after a refresh.
  const crowd=chatCfg.crowd!==false&&typeof crowdBlock==='function';
  const crowdBlocks=new Map(),crowdReplies=new Map(),crowdShown=new Set();
  let serverLog=[],crowdLog=[],realOnline=1,extraOnline=crowd?crowdHeadcount(Date.now()):0;
  function showOnline(){
    online.hidden=!crowd&&!live;
    online.textContent=fmt(realOnline+extraOnline)+' online';
  }
  try{session=JSON.parse(read(localStorage,DISCORD_KEY))}catch{}
  if(!session?.token||!session.user?.id||!(session.expires>Date.now()))session=null;

  function setOpen(open,remember=true){
    document.body.classList.toggle('chat-open',open);
    $('#chatShow').setAttribute('aria-expanded',open);
    if(remember)write(localStorage,CHAT_PREF,JSON.stringify({open}));
    if(open){listen();log.scrollTop=log.scrollHeight}
  }
  $('#chatHide').onclick=()=>{setOpen(false);$('#chatShow').focus()};
  $('#chatShow').onclick=()=>{setOpen(true);($('#chatInput')||$('#discordConnect')).focus()};

  // Everyone who can be @mentioned, keyed by lowercase handle: real people seen in chat first, then the characters.
  const castList=crowd?createCrowd().members:[];
  const myHandles=()=>session?[mentionHandle(discordName(session.user)),session.user.username].map(handle=>handle.toLowerCase()).filter(Boolean):[];
  function directory(){
    const people=new Map();
    const add=(name,icon)=>{const handle=mentionHandle(name);if(handle.length>=2&&!people.has(handle.toLowerCase()))people.set(handle.toLowerCase(),{handle,name,icon})};
    for(let i=serverLog.length-1;i>=0;i--)add(discordName(serverLog[i].user),pictureOf(serverLog[i]));
    for(let i=crowdLog.length-1;i>=0;i--)add(crowdLog[i].user.name,crowdLog[i].user.icon);
    for(const member of castList)add(member.name,member.icon);
    return people;
  }
  const knownHandles=()=>new Set([...directory().keys(),...myHandles()]);
  // A character's picture comes from this site's own cast, including for lines the chat server's AI wrote.
  const pictureOf=m=>m.crowd?(m.user.icon||castList.find(member=>member.id===m.user.id)?.icon||discordAvatar(m.user)):discordAvatar(m.user);
  const shortClock=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
  function row(m,known=knownHandles()){
    const li=document.createElement('li'),own=Boolean(session&&m.user.id===session.user.id);
    // A tip shows as a line of its own that @mentions the receiver, so it is highlighted for them.
    // A finished player flip is announced the same way, naming the loser.
    const named=m.tip?m.tip.to.name:m.duel?m.duel.loser.name:'';
    const text=m.tip?'tipped @'+mentionHandle(named)+' '+fmt(m.tip.amount)+' credits':m.duel?'won a '+fmt(m.duel.amount)+' credit coin flip against @'+mentionHandle(named):m.text;
    const parts=mentionParts(text,named?new Set([...known,mentionHandle(named).toLowerCase()]):known,myHandles());
    // A message that @mentions the viewer is highlighted for them.
    li.className='chat-msg'+(own?' mine':'')+(!own&&parts.some(part=>part.me)?' pinged':'')+(m.tip?' tip':m.duel?' won-flip':'');
    li.title=clock.format(m.at);li.dataset.handle=own?'':mentionHandle(discordName(m.user));
    li.innerHTML='<img src="'+escapeText(pictureOf(m))+'" alt="" width="40" height="40" loading="lazy" referrerpolicy="no-referrer"><div><span class="chat-who"><b>'+escapeText(discordName(m.user))+'</b><time>'+shortClock.format(m.at)+'</time></span><p>'+parts.map(part=>part.mention?'<span class="mention'+(part.me?' me':'')+'">'+escapeText(part.text)+'</span>':escapeText(part.text)).join('')+'</p></div>';
    return li;
  }
  function showHistory(){
    const list=[...serverLog,...crowdLog].sort((a,b)=>a.at-b.at).slice(-100);
    const known=knownHandles();
    if(list.length)log.replaceChildren(...list.map(m=>row(m,known)));
    else log.innerHTML='<li class="chat-empty">'+(server?'No messages yet. Say hi.':'Chat is offline. No chat server is set in chat-config.js.')+'</li>';
    log.scrollTop=log.scrollHeight;
  }
  function addMessage(m,fromServer=false){
    const kept=fromServer?serverLog:crowdLog;
    kept.push(m);if(kept.length>100)kept.shift();
    // The chat server checks each sender with Discord, so the player's own messages carry their current picture.
    if(!m.crowd&&session&&m.user.id===session.user.id&&(m.user.avatar||null)!==session.user.avatar)setProfile({avatar:m.user.avatar||null});
    const pinned=log.scrollHeight-log.scrollTop-log.clientHeight<80;
    log.querySelector('.chat-empty')?.remove();
    const added=row(m);
    log.append(added);
    if(added.classList.contains('pinged')&&(typeof siteSettings==='undefined'||siteSettings.mentionPing))ArcadeSound.play('mention');
    while(log.children.length>100)log.firstChild.remove();
    if(pinned||(session&&m.user.id===session.user.id))log.scrollTop=log.scrollHeight;
  }
  function listen(){
    if(stream)return;
    if(!server)return;
    stream=new EventSource(server+'/events');
    stream.addEventListener('history',e=>{serverLog=JSON.parse(e.data);live=true;if(crowd)crowdRebuild();showHistory();showOnline();setStatus('')});
    stream.addEventListener('message',e=>{
      const m=JSON.parse(e.data);
      addMessage(m,true);
      if(m.tip&&session&&m.tip.to.id===session.user.id)claimTips();
    });
    stream.addEventListener('flips',e=>chatLink.on.flips?.(JSON.parse(e.data)));
    // The server's AI could not answer this message after all, so the built-in replies take over.
    stream.addEventListener('aifail',e=>{
      const failed=serverLog.find(m=>m.id===JSON.parse(e.data).id);
      if(failed){failed.ai=false;crowdReplies.delete(failed.id)}
    });
    stream.addEventListener('online',e=>{realOnline=JSON.parse(e.data);live=true;showOnline()});
    // With simulated chatter running, a missing server only matters once the player tries to send.
    stream.onerror=()=>{live=false;realOnline=1;showOnline();if(!crowd)setStatus('Can’t reach the chat server. Retrying…')};
  }
  // Every simulated line due between two moments, oldest first: the clock's chatter plus the
  // characters' answers to real messages. Chatter gives way while they are answering someone.
  function crowdLines(from,to){
    const lines=[],busy=[];
    for(const m of serverLog){
      // A character's line written by the server's AI: ordinary chatter makes room around it.
      if(m.crowd){busy.push([m.at-1500,m.at+4500]);continue}
      // The server's AI is answering this message, so no built-in reply is added. Tips get none either.
      if(m.ai||m.tip||m.duel)continue;
      if(!crowdReplies.has(m.id))crowdReplies.set(m.id,crowdReply(m));
      const reply=crowdReplies.get(m.id);
      if(reply.lines.length){busy.push([reply.from,reply.until]);lines.push(...reply.lines)}
    }
    for(let block=Math.floor(from/CROWD_BLOCK);block<=Math.floor(to/CROWD_BLOCK);block++){
      if(!crowdBlocks.has(block))crowdBlocks.set(block,crowdBlock(block));
      for(const line of crowdBlocks.get(block))if(!busy.some(([start,end])=>line.at>=start&&line.since<end))lines.push(line);
    }
    return lines.filter(line=>line.at>from&&line.at<=to).sort((a,b)=>a.at-b.at);
  }
  // Fills the panel with the last few minutes of chatter, as anyone else would see it right now.
  function crowdRebuild(){
    const now=Date.now(),lines=crowdLines(now-CROWD_BLOCK,now);
    crowdShown.clear();for(const line of lines)crowdShown.add(line.id);
    crowdLog=lines.slice(-40);
  }
  function crowdTick(){
    const now=Date.now();
    for(const line of crowdLines(now-60000,now))if(!crowdShown.has(line.id)){crowdShown.add(line.id);addMessage(line)}
    for(const block of crowdBlocks.keys())if(block<Math.floor(now/CROWD_BLOCK)-1)crowdBlocks.delete(block);
    for(const id of crowdReplies.keys())if(!serverLog.some(m=>m.id===id))crowdReplies.delete(id);
    extraOnline=crowdHeadcount(now);showOnline();
  }
  // ---- Tips: play credits sent to another signed-in player, confirmed with a code the site's bot sends by Discord DM ----
  const tipCall=(path,body)=>fetch(server+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:body===undefined?undefined:JSON.stringify(body)});
  async function tipWindow(){
    if(!server){setStatus('Tips need the chat server.');return}
    panel('DRIFTLOBBY','Send a tip','<div class="tip-pane"><p class="help">Loading…</p></div>');
    const pane=$('.tip-pane');
    let listing;
    try{
      const reply=await tipCall('/tips/people');
      if(reply.status===401){dlg.close();signOut('Your Discord sign-in expired. Connect again.');return}
      listing=await reply.json();
    }catch{pane.innerHTML='<p class="help">The chat server isn’t reachable right now.</p>';return}
    if(!pane.isConnected)return;
    if(!listing.enabled){pane.innerHTML='<p class="help">Tipping isn’t set up on this chat server yet.</p>';return}
    if(!listing.people.length){pane.innerHTML='<p class="help">Nobody else has signed in yet. You can tip a friend once they have connected Discord on the site.</p>';return}
    const names=new Map(listing.people.map(person=>[person.id,person.name]));
    pane.innerHTML='<p class="help">Tips move play credits to another player. The DriftLobby bot will send a code to your Discord direct messages to confirm it’s you.</p><form id="tipForm">'+
      selectBox('tipTo','Send to',[...names.keys()],listing.people[0].id,id=>escapeText(names.get(id)))+
      '<label class="tip-field" for="tipAmount">Amount<span class="wager-value"><input id="tipAmount" inputmode="numeric" maxlength="7" autocomplete="off" value="'+Math.min(100,Math.floor(player().credits))+'"><span>credits</span></span></label>'+
      '<p class="tip-balance">Your balance: <b>'+fmt(player().credits)+'</b></p><button class="primary">Send code to my Discord</button><p id="tipStatus" class="result" role="status"></p></form>';
    $('#tipForm').onsubmit=async e=>{
      e.preventDefault();
      const to=$('#tipTo').value,raw=$('#tipAmount').value.trim(),error=wagerError(raw,player().credits),button=e.target.querySelector('button.primary');
      if(error){$('#tipStatus').textContent=error;return}
      button.disabled=true;$('#tipStatus').textContent='Sending a code to your Discord…';
      try{
        const reply=await tipCall('/tips/request',{to,amount:Number(raw)}),data=await reply.json();
        if(!reply.ok){$('#tipStatus').textContent=data.error||'That didn’t work. Try again.';return}
        tipConfirm(data);
      }catch{$('#tipStatus').textContent='The chat server isn’t reachable right now.'}
      finally{button.disabled=false}
    };
  }
  function tipConfirm(pending){
    const pane=$('.tip-pane');
    if(!pane)return;
    pane.innerHTML='<p class="help">Check your Discord direct messages for a 6-digit code from the DriftLobby bot. It confirms your tip of <b>'+fmt(pending.amount)+' credits</b> to <b>'+escapeText(pending.to.name)+'</b>.</p><form id="tipCodeForm"><label class="tip-field" for="tipCode">Code<span class="wager-value"><input id="tipCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"></span></label><div class="paired"><button class="primary">Confirm tip</button><button type="button" id="tipCancel" class="secondary">Cancel</button></div><p id="tipStatus" class="result" role="status"></p></form>';
    $('#tipCode').focus();
    $('#tipCancel').onclick=()=>dlg.close();
    $('#tipCodeForm').onsubmit=async e=>{
      e.preventDefault();
      const status=$('#tipStatus'),button=e.target.querySelector('button.primary');
      // The balance may have changed while the code was on its way.
      if(pending.amount>player().credits){status.textContent='You no longer have '+fmt(pending.amount)+' credits.';return}
      button.disabled=true;
      try{
        const reply=await tipCall('/tips/confirm',{code:$('#tipCode').value.trim()}),data=await reply.json();
        if(!reply.ok){status.textContent=(data.error||'That didn’t work.')+(data.left?' '+data.left+' tries left.':'');if(reply.status===410)$('#tipCodeForm button.primary').remove();return}
        moveCredits(player(),-data.amount,'tipOut');player().ledger[0].who=data.to.name;save();
        ArcadeSound.play('collect');
        pane.innerHTML='<p class="tip-done">'+svg('gift')+'<b>'+fmt(data.amount)+' credits sent to '+escapeText(data.to.name)+'</b><span>They get them the next time they are on the site.</span></p>';
      }catch{status.textContent='The chat server isn’t reachable right now.'}
      finally{if(button.isConnected)button.disabled=false}
    };
  }
  // Collects tips that were confirmed for this player, now or while they were away.
  let claiming=false;
  async function claimTips(){
    if(!session||!server||claiming)return;
    claiming=true;
    try{
      const reply=await tipCall('/tips/claim',{});
      if(!reply.ok)return;
      const owed=(await reply.json()).tips,tips=owed.filter(item=>!item.kind);
      // Flip results and refunds are handed to the player-flips code; the rest are tips.
      for(const item of owed)if(item.kind)chatLink.handlers[item.kind]?.(item);
      for(const tip of tips){moveCredits(player(),tip.amount,'tipIn');player().ledger[0].who=tip.from.name}
      if(owed.length&&!tips.length)save();
      if(tips.length){
        save();ArcadeSound.play('collect');
        if(location.hash==='#wallet')renderWallet();
        setStatus(tips.length===1?tips[0].from.name+' tipped you '+fmt(tips[0].amount)+' credits.':'You received '+tips.length+' tips: '+fmt(tips.reduce((sum,tip)=>sum+tip.amount,0))+' credits.');
      }
    }catch{}
    finally{claiming=false}
  }

  // Stores a changed Discord name or picture and redraws everywhere it is shown.
  function setProfile(changes){
    Object.assign(session.user,changes);
    write(localStorage,DISCORD_KEY,JSON.stringify(session));
    renderFoot();
  }
  // The saved sign-in keeps the name and picture from when it was made, so ask Discord for the current ones.
  async function refreshProfile(){
    if(!session)return;
    const token=session.token;
    try{
      const reply=await fetch(chatCfg.discordApi+'/users/@me',{headers:{Authorization:'Bearer '+token}});
      if(session?.token!==token)return;
      if(reply.status===401){signOut('Your Discord sign-in expired. Connect again.');return}
      if(!reply.ok)return;
      const me=await reply.json(),now={username:String(me.username),global_name:me.global_name||null,avatar:me.avatar||null};
      if(session?.token===token&&Object.keys(now).some(key=>now[key]!==session.user[key]))setProfile(now);
    }catch{}
  }
  // Puts the signed-in account's profile (or the guest profile) in play.
  function useProfile(){
    const i=session?accountProfile(session.user.id,discordName(session.user)):guestProfile();
    if(i!==db.current)switchPlayer(i);else save();
  }
  // switching asks Discord to show its sign-in screen again, where "Not you?" picks another account.
  function connectDiscord(switching=false){
    if(!chatCfg.discordClientId){setOpen(true,false);setStatus('Discord login isn’t set up yet. Add the Client ID in chat-config.js.');return}
    const state=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
    write(sessionStorage,DISCORD_STATE,JSON.stringify({state,page:location.hash}));
    location.assign(chatCfg.discordAuthorize+'?'+new URLSearchParams({client_id:chatCfg.discordClientId,response_type:'token',scope:'identify',redirect_uri:location.origin+location.pathname,state,...(switching?{prompt:'consent'}:{})}));
  }
  function signOut(message=''){
    session=null;write(localStorage,DISCORD_KEY,null);useProfile();renderFoot();setStatus(message);
    log.querySelectorAll('.mine').forEach(li=>li.classList.remove('mine'));
  }
  // Top-right profile button and its account menu.
  const account=$('#accountMenu');
  function placeAccount(){
    const box=$('#profile').getBoundingClientRect();
    account.style.top=box.bottom+8+'px';account.style.right=Math.max(8,innerWidth-box.right)+'px';
  }
  function renderHeaderProfile(){
    const button=$('#profile'),user=session?.user;
    const who=user?'<img src="'+escapeText(discordAvatar(user))+'" alt="" width="30" height="30" referrerpolicy="no-referrer"><span><b>'+escapeText(discordName(user))+'</b><small>@'+escapeText(user.username)+'</small></span>':'';
    button.classList.toggle('linked',Boolean(user));
    button.innerHTML=who||svg('user');
    account.innerHTML=user?
      '<div class="account-id">'+who+'</div><button type="button" id="accountSwitch">'+svg('swap')+'Switch account</button><button type="button" id="accountSignOut">'+svg('logout')+'Sign out</button><small>To switch, choose “Not you?” on Discord’s screen.</small>':
      '<p>Sign in with Discord to chat and play on your own account.</p><button type="button" id="accountConnect" class="discord-btn">'+svg('discord')+'Connect Discord</button>';
    const close=()=>{try{account.hidePopover()}catch{}};
    if(user){
      $('#accountSwitch').onclick=()=>{close();connectDiscord(true)};
      $('#accountSignOut').onclick=()=>{close();signOut()};
    }else $('#accountConnect').onclick=()=>{close();connectDiscord()};
  }
  $('#profile').onclick=()=>{if(account.togglePopover){placeAccount();account.togglePopover()}else connectDiscord()};
  account.addEventListener('toggle',e=>$('#profile').setAttribute('aria-expanded',String(e.newState==='open')));
  document.addEventListener('scroll',()=>{try{if(account.matches(':popover-open'))placeAccount()}catch{}},true);
  window.addEventListener('resize',()=>{try{if(account.matches(':popover-open'))placeAccount()}catch{}});
  function renderFoot(){
    renderHeaderProfile();
    chatLink.on.session?.();
    if(!session){
      foot.innerHTML='<button id="discordConnect" class="discord-btn">'+svg('discord')+'Connect Discord</button><small>Sign in with Discord to chat.</small>';
      $('#discordConnect').onclick=()=>connectDiscord();return;
    }
    const user=session.user;
    foot.innerHTML='<div class="chat-me"><img src="'+escapeText(discordAvatar(user))+'" alt="" width="34" height="34" referrerpolicy="no-referrer"><span><b>'+escapeText(discordName(user))+'</b><small>@'+escapeText(user.username)+'</small></span><button id="tipOpen" class="iconbtn" aria-label="Send a tip" title="Send a tip">'+svg('gift')+'</button><button id="discordLeave" class="iconbtn" aria-label="Disconnect Discord" title="Disconnect Discord">'+svg('logout')+'</button></div><form id="chatForm"><input id="chatInput" maxlength="200" autocomplete="off" placeholder="Say something" aria-label="Chat message"><button class="chat-send" aria-label="Send message">'+svg('send')+'</button></form>';
    $('#discordLeave').onclick=()=>signOut();
    $('#tipOpen').onclick=()=>tipWindow();
    $('#chatForm').onsubmit=sendMessage;
    $('#chatForm').insertAdjacentHTML('beforebegin','<ul id="mentionList" class="mention-list" role="listbox" aria-label="People to mention" hidden></ul>');
    const input=$('#chatInput'),list=$('#mentionList');
    input.addEventListener('input',showMentions);
    input.addEventListener('click',showMentions);
    input.addEventListener('blur',()=>setTimeout(()=>{list.hidden=true},120));
    input.addEventListener('keydown',e=>{
      if(list.hidden)return;
      const options=[...list.children],at=options.findIndex(option=>option.getAttribute('aria-selected')==='true');
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();
        const next=(at+(e.key==='ArrowDown'?1:options.length-1))%options.length;
        options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===next)));
      }else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();pickMention(options[Math.max(0,at)].dataset.handle)}
      else if(e.key==='Escape'){e.stopPropagation();list.hidden=true}
    });
    // mousedown, so the box keeps focus while a name is chosen.
    list.addEventListener('mousedown',e=>{const option=e.target.closest('li');if(option){e.preventDefault();pickMention(option.dataset.handle)}});
  }
  // The "@partial" being typed just before the caret, if any.
  function mentionQuery(input){
    const before=input.value.slice(0,input.selectionStart),found=/(^|\s)@([\w.]*)$/.exec(before);
    return found?{word:found[2].toLowerCase(),from:before.length-found[2].length-1}:null;
  }
  function showMentions(){
    const input=$('#chatInput'),list=$('#mentionList'),query=mentionQuery(input),mine=myHandles();
    const matches=query?[...directory().values()].filter(person=>!mine.includes(person.handle.toLowerCase())&&person.handle.toLowerCase().startsWith(query.word)).slice(0,6):[];
    list.hidden=!matches.length;
    list.innerHTML=matches.map((person,i)=>'<li role="option" data-handle="'+escapeText(person.handle)+'" aria-selected="'+(i===0)+'"><img src="'+escapeText(person.icon)+'" alt="" width="22" height="22" referrerpolicy="no-referrer"><b>'+escapeText(person.name)+'</b><small>@'+escapeText(person.handle)+'</small></li>').join('');
  }
  // Writes "@handle " into the message box, replacing the partial name being typed if there is one.
  function pickMention(handle){
    const input=$('#chatInput'),query=mentionQuery(input),to=input.selectionStart,from=query?query.from:to;
    const gap=!query&&from>0&&!/\s$/.test(input.value.slice(0,from))?' ':'';
    input.value=input.value.slice(0,from)+gap+'@'+handle+' '+input.value.slice(to);
    const caret=from+gap.length+handle.length+2;
    input.focus();input.setSelectionRange(caret,caret);
    $('#mentionList').hidden=true;
  }
  // Clicking someone's name in the chat starts a mention of them.
  log.addEventListener('click',e=>{
    const name=e.target.closest('.chat-who b'),handle=name?.closest('li').dataset.handle;
    if(handle&&$('#chatInput'))pickMention(handle);
  });
  async function sendMessage(e){
    e.preventDefault();
    const input=$('#chatInput'),button=e.target.querySelector('button'),text=input.value.trim();
    if(!text)return;
    if(!server){setStatus('Chat is offline.');return}
    button.disabled=true;
    try{
      const reply=await fetch(server+'/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({text})});
      if(reply.status===401){signOut('Your Discord sign-in expired. Connect again.');return}
      if(reply.status===429){setStatus('Slow down a little.');return}
      if(!reply.ok)throw new Error('send failed');
      input.value='';setStatus('');
    }catch{setStatus(live?'Message not sent. Try again.':'The chat server isn’t reachable right now.')}
    finally{button.disabled=false;if(input.isConnected)input.focus()}
  }

  async function finishDiscordReturn(){
    let pending=null;try{pending=JSON.parse(read(sessionStorage,DISCORD_STATE))}catch{}
    const back=parseDiscordReturn(location.hash,pending?.state);
    if(!back)return;
    // Drop the token from the address bar and go back to the page the player was on.
    history.replaceState(null,'',location.pathname+location.search+(pending?.page||''));
    write(sessionStorage,DISCORD_STATE,null);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    setOpen(true,false);
    if(back.error){setStatus(back.error==='denied'?'Discord sign-in was cancelled.':'Discord sign-in could not be confirmed. Try again.');return}
    try{
      const reply=await fetch(chatCfg.discordApi+'/users/@me',{headers:{Authorization:'Bearer '+back.token}});
      if(!reply.ok)throw new Error('profile failed');
      const me=await reply.json();
      session={token:back.token,expires:back.expires,user:{id:String(me.id),username:String(me.username),global_name:me.global_name||null,avatar:me.avatar||null}};
      write(localStorage,DISCORD_KEY,JSON.stringify(session));
      useProfile();renderFoot();setStatus('');claimTips();
    }catch{setStatus('Couldn’t load your Discord profile. Try again.')}
  }

  let pref=null;try{pref=JSON.parse(read(localStorage,CHAT_PREF))}catch{}
  useProfile();renderFoot();
  showHistory();showOnline();
  if(crowd){
    crowdRebuild();showHistory();
    setInterval(crowdTick,500);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)crowdTick()});
  }
  // On a wide screen the chat starts open unless the player closed it last time.
  setOpen(wide.matches&&pref?.open!==false,false);
  Object.assign(chatLink,{server,me:()=>session?.user||null,call:tipCall,claim:claimTips,status:setStatus});
  // The chat server is also where player flips live, so connect even if the chat panel is closed.
  listen();
  finishDiscordReturn();
  refreshProfile();
  claimTips();
})();
