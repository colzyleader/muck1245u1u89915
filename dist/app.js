'use strict';
const $=s=>document.querySelector(s);
const icons={
 gamepad:'<path d="M7 6h10a4 4 0 0 1 4 3l1 7c.4 3-2 4-4 2l-2-2H8l-2 2c-2 2-4.4 1-4-2l1-7a4 4 0 0 1 4-3Z"/><path d="M5.5 11h5M8 8.5v5"/><circle cx="16" cy="10" r=".7"/><circle cx="18" cy="13" r=".7"/>',
 history:'<path d="M3 10a9 9 0 1 1 1.3 7M3 4v6h6M12 7v5l3 2"/>',coin:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><path d="m12 9 2 3-2 3-2-3z"/>',user:'<circle cx="12" cy="8" r="3.4"/><path d="M5 20v-2a7 6 0 0 1 14 0v2"/>',spark:'<path d="m12 2 2.2 7.5L22 12l-7.8 2.4L12 22l-2.4-7.6L2 12l7.6-2.5z" fill="currentColor" stroke="none"/>',tiles:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',heart:'<path d="M20.5 4.8a5.5 5.5 0 0 0-8.5 1 5.5 5.5 0 0 0-8.5 7L12 21l8.5-8.2a5.5 5.5 0 0 0 0-8Z"/>',shield:'<path d="m12 2 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5z"/><path d="m8.5 12 2.4 2.5 4.8-5"/>',play:'<path d="M5 2.5 21 12 5 21.5Z" fill="currentColor" stroke="none"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.5"/>',x:'<path d="m5 5 14 14M19 5 5 19"/>'};
icons.profit='<path d="M3 19h18M5 15l5-5 3 3 7-8M15 5h5v5"/>';
icons.wallet='<path d="M4 6l12-3 3 4M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2"/><path d="M21 11h-5a2 2 0 0 0 0 5h5"/>';
icons.gear='<path d="m9.5 3-.6 2.2-2 .9-2-.7L2.8 9l1.6 1.4v2.8L3 14.7l2.2 3.7 2-.7 2 .9.6 2.2h4.5l.6-2.2 2-.9 2 .7 2.1-3.7-1.5-1.5v-2.8L21 9l-2.1-3.6-2 .7-2-.9-.6-2.2z"/><circle cx="12" cy="12" r="3"/>';
icons.chat='<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>';
icons.send='<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>';
icons.logout='<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 8l-4 4 4 4M6 12h9"/>';
icons.discord='<path fill="currentColor" stroke="none" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.04.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .031-.055c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.032-.029ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418Z"/>';
icons.chevron='<path d="m6 9 6 6 6-6"/>';
icons.swap='<path d="M4 8h15l-3.500-3.500M20 16H5l3.500 3.500"/>';
icons.gift='<path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM3 7h18v4H3zM12 7v14M12 7c-1.500-3-5-4-5-1.500S9 7 12 7c1.500-3 5-4 5-1.500S15 7 12 7"/>';
icons.reset='<path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/>';
const svg=n=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[n]+'</svg>';
document.querySelectorAll('[data-icon]').forEach(el=>el.replaceWith(document.createRange().createContextualFragment(svg(el.dataset.icon))));
const games = {
  blackjack:['Blackjack','Dealer table'], keno:['Keno','Number draw'], roulette:['Roulette','Single zero'],
  plinko:['Plinko','Peg board'], mines:['Mines','Gem hunt'], baccarat:['Baccarat','Punto banco'],
  wheel:['Wheel','Spin wheel'], limbo:['Limbo','Target multiplier'], dice:['Dice','Over / under'],
  tower:['Tower','Floor climb'], hilo:['Hi-Lo','Card streak'],
  coinflip:['Coinflip','Heads or tails'], war:['War','High card'],
  rps:['Rock Paper Scissors','Hand duel']
};
const KEY='nightshift.freeplay.v1', COST=10;
function selectedStake(){return player().wager??COST}
function wagerError(raw,balance){
  const n=Number(raw);
  if(!/^\d+$/.test(String(raw))||!Number.isSafeInteger(n)||n<1)return 'Enter a whole number of at least 1.';
  if(n>balance)return 'Available balance: '+fmt(balance)+' cr.';
  return '';
}
// Live stats: a running tally of completed rounds since the player last reset it.
// It is separate from profit.net, which is the all-time total and is never reset.
const LIVE_POINTS=240;
let liveStatsChanged=null;
function liveStats(p){return p.live||(p.live={wagered:0,profit:0,wins:0,losses:0,series:[0]})}
function trackRound(p,returned,cost){
  const s=liveStats(p),net=returned-cost,cents=n=>Math.round(n*100)/100;
  s.wagered=cents(s.wagered+cost);s.profit=cents(s.profit+net);
  if(net>0)s.wins++;else if(net<0)s.losses++;
  s.series.push(s.profit);
  if(s.series.length>LIVE_POINTS)s.series.splice(0,s.series.length-LIVE_POINTS);
}
function resetLiveStats(p){delete p.live;return liveStats(p)}
const makePlayer=name=>({name,credits:1000,favorites:[],history:[],profit:{net:0,partial:false},mine:null,rank:null});
// Puts a profile back to a fresh start. The name, Discord link, and favourites are kept.
function resetProfile(p){
  Object.assign(p,{credits:1000,history:[],profit:{net:0,partial:false},mine:null,streak:null,tower:null,blackjack:null,
    ledger:[{kind:'welcome',amount:1000,balance:1000,at:Date.now()}]});
  delete p.live;delete p.duels;
}
// Tamper seal. Every save carries a keyed checksum of its contents. A save whose contents no longer
// match its seal was changed outside the game (for example by editing the browser's storage), and
// its profiles are reset. A save from before seals existed has none and is accepted as it is.
// This deters casual editing; it cannot stop someone who rewrites the game's own code.
function sealOf(text){
  const salted='d7#lobby|'+text+'|kf2~drift';
  let a=0x9e3779b9^salted.length,b=0x85ebca6b;
  for(let i=0;i<salted.length;i++){
    const code=salted.charCodeAt(i);
    a=Math.imul(a^code,2654435761);b=Math.imul(b^code,1597334677);a^=b>>>13;b^=a>>>11;
  }
  a=Math.imul(a^a>>>16,2246822507)^Math.imul(b^b>>>13,3266489909);
  b=Math.imul(b^b>>>16,2246822507)^Math.imul(a^a>>>13,3266489909);
  return (a>>>0).toString(36)+'.'+(b>>>0).toString(36);
}
const sealedText=state=>JSON.stringify({current:state.current,players:state.players});
let db,saveWasEdited=false;
try{db=JSON.parse(localStorage.getItem(KEY))}catch{}
if(!db?.players?.[db.current])db={current:0,players:[makePlayer('Player 1')]};
else if(db.seal!==undefined&&db.seal!==sealOf(sealedText(db))){
  saveWasEdited=true;
  for(const p of db.players)resetProfile(p);
}
let favoritesOnly=false,activeGame=null,animation=0;
const player=()=>db.players[db.current];
const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Whole credits print plain; fractional ones always show two places (1,463.50).
const fmt=n=>n.toLocaleString('en-US',Number.isInteger(n)?undefined:{minimumFractionDigits:2,maximumFractionDigits:2});
// Site settings kept in this browser (Settings window).
const SETTINGS_KEY='driftlobby.settings.v1';
const siteSettings={mentionPing:true,chatTimes:false,chatCompact:false,hideBalance:false,hotkeys:false};
try{Object.assign(siteSettings,JSON.parse(localStorage.getItem(SETTINGS_KEY)))}catch{}
const shownBalance=()=>siteSettings.hideBalance?'••••':fmt(player().credits);
function applySettings(){
  const page=$('body');
  page.classList.toggle('chat-times',siteSettings.chatTimes);page.classList.toggle('chat-compact',siteSettings.chatCompact);
}
function setSetting(name,value){
  siteSettings[name]=value;
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(siteSettings))}catch{}
  applySettings();refreshBalance();
}
applySettings();
function save(){db.seal=sealOf(sealedText(db));try{localStorage.setItem(KEY,JSON.stringify(db))}catch{}refreshBalance();liveStatsChanged?.()}
function refreshBalance(){$('#balance').textContent=shownBalance();$('#profile').setAttribute('aria-label','Account menu, playing as '+player().name)}
function renderCards(){
 const term=$('#search').value.trim().toLowerCase();
 const entries=Object.entries(games).filter(([k,v])=>(!favoritesOnly||player().favorites.includes(k))&&v.join(' ').toLowerCase().includes(term));
 $('#cards').innerHTML=entries.map(([k,[name,type]])=>'<article class="card '+k+'"><button class="cardmain" data-play="'+k+'" aria-label="Play '+name+'"><div class="cover"><img src="art/'+k+'.webp?v=6" alt=""></div><div class="cardfoot"><div><span class="type">'+type.toUpperCase()+'</span><h3>'+name+'</h3></div><span class="cardplay">'+svg('play')+'</span></div></button><button class="favorite" data-favorite="'+k+'" aria-label="Favorite '+name+'" aria-pressed="'+player().favorites.includes(k)+'">'+svg('heart')+'</button></article>').join('')||(term?'<p class="empty">No games match your search.</p>':'<p class="empty">Tap the heart on a game to save it here.</p>');
 $('#all').setAttribute('aria-pressed',!favoritesOnly);$('#fav').setAttribute('aria-pressed',favoritesOnly)
}
function filter(only){favoritesOnly=only;renderCards()}
$('#search').oninput=renderCards;
$('#all').onclick=()=>filter(false);$('#fav').onclick=()=>filter(true);
function gameName(key){return games[key]?.[0] || ({duel:'Player flip',moles:'Moles (retired)',chicken:'Chicken Cross (retired)'}[key]||'Past game')}
function renderHistory(){renderStats();$('#records').innerHTML='<p class="inline-note">'+escapeText(player().name)+' · Last 50 rounds on this device</p>'+(player().history.map(r=>'<div class="log"><strong>'+gameName(r.game)+'</strong><small>'+escapeText(r.detail)+'</small><b class="'+(r.net<0?'loss':'gain')+'">'+(r.net>0?'+':'')+fmt(r.net)+'</b></div>').join('')||'<p class="empty">Your completed rounds will appear here.</p>')}
function navigate(){
  const page=['flips','history','wallet'].includes(location.hash.slice(1))?location.hash.slice(1):'lobby';
  for(const id of ['lobby','flips','history','wallet']){
    $('#'+id).hidden=id!==page;
    const nav=$('#nav'+id.charAt(0).toUpperCase()+id.slice(1));
    nav.classList.toggle('active',id===page);
    if(id===page)nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');
  }
  if(page==='history')renderHistory();
  if(page==='wallet')renderWallet();
}
$('#navLobby').onclick=()=>location.hash='lobby';$('#navFlips').onclick=()=>location.hash='flips';$('#navHistory').onclick=()=>location.hash='history';window.addEventListener('hashchange',navigate);
const dlg=$('#dialog'),body=$('#body');dlg.setAttribute('aria-labelledby','dlgTitle');
function panel(kicker,title,html){dlg.classList.toggle('table-room',Boolean(activeGame));if(!dlg.open)dlg.showModal();$('#dlgKicker').textContent=kicker;$('#dlgTitle').textContent=title;body.innerHTML=html;dlg.scrollTop=0}
$('#close').onclick=()=>dlg.close();dlg.addEventListener('click',e=>{if(e.target===dlg){const r=dlg.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dlg.close()}});dlg.addEventListener('close',()=>{cancelAnimationFrame(animation);activeGame=null;renderHistory()});
$('#rules').onclick=()=>panel('DRIFTLOBBY','Arcade rules','<div class="info"><p>Each player starts with 1,000 free credits. Choose a whole-credit wager before each round. Doubling or splitting in Blackjack adds the same amount as the hand’s bet. You can refill for free whenever you have fewer than 10.</p><p>Credits are a score on this device. They cannot be bought, sold, or redeemed for money, items, or prizes. You can tip credits to another signed-in player, or stake them against one in a player coin flip; either way they are still only play credits. Keep outside bets out of the arcade.</p><p>Sign in with Discord from the profile button to chat and play on your own account. Each Discord account keeps its own credits, favorites, and history in this browser.</p><p>Some lobby chat is simulated chatter from scripted characters.</p></div>');
function switchPlayer(i){db.current=i;initLedger(player(),true);save();renderCards();renderHistory();navigate();dlg.close()}
// Each Discord account gets its own saved profile in this browser. The first account
// to sign in keeps the profile that was already being played; signed-out play uses a guest profile.
function accountProfile(discordId,name){
  let i=db.players.findIndex(p=>p.discordId===discordId);
  if(i<0){
    if(player().discordId){db.players.push(makePlayer(name));i=db.players.length-1}
    else i=db.current;
    db.players[i].discordId=discordId;db.players[i].name=name;
  }
  return i;
}
function guestProfile(){
  let i=db.players.findIndex(p=>!p.discordId);
  if(i<0){db.players.push(makePlayer('Guest'));i=db.players.length-1}
  return i;
}
function record(game,returned,detail,cost=selectedStake()){let p=player();p.profit.net=Math.round((p.profit.net+returned-cost)*100)/100;trackRound(p,returned,cost);lastRound={net:Math.round((returned-cost)*100)/100,at:Date.now()};if(returned>0)moveCredits(p,returned,'return',game);p.history.unshift({game,detail,net:returned-cost,at:Date.now()});p.history=p.history.slice(0,50);save()}
function charge(){
  const p=player(),field=$('#wager');
  if(p.credits<1){refillPanel();return false}
  const raw=field?.value??selectedStake(),error=wagerError(raw,p.credits);
  if(error){
    if(field){$('#wager-error').textContent=error;field.setAttribute('aria-invalid','true');field.focus()}
    return false;
  }
  p.wager=Number(raw);
  moveCredits(p,-p.wager,'entry',activeGame);ArcadeSound.entry(activeGame);return true}
const help=s=>'<p class="help">'+s+'</p>';
const result='<p id="result" class="result" role="status" aria-live="polite"></p>';
// Shows a table message as a card. The first message after a round is recorded
// (other than "Rolling…" style progress text) is treated as that round's result
// and gets a win, loss, or push colour plus the net credits.
let lastRound=null;
function announce(msg){
  const box=$('#result'),text=String(msg??'').replace(/\.$/,'');
  if(!text){box.className='result';box.textContent='';return}
  const interim=text.endsWith('…'),settled=!interim&&lastRound&&Date.now()-lastRound.at<8000?lastRound:null;
  if(settled)lastRound=null;
  const [head,...rest]=text.split(' · ');
  box.className='result'+(interim?' interim':settled?(settled.net>0?' win':settled.net<0?' loss':' push'):'');
  box.innerHTML='<span class="result-text"><b>'+escapeText(head)+'</b>'+(rest.length?'<small>'+escapeText(rest.join(' · '))+'</small>':'')+'</span>'+(settled?'<strong>'+(settled.net>0?'+':'')+fmt(settled.net)+'</strong>':'');
}
const primary=(id,label)=>'<button id="'+id+'" class="primary">'+label+'</button>';
document.addEventListener('click',e=>{let play=e.target.closest('[data-play]'),fav=e.target.closest('[data-favorite]');if(play)game(play.dataset.play);if(fav){const k=fav.dataset.favorite,p=player();p.favorites=p.favorites.includes(k)?p.favorites.filter(v=>v!==k):[...p.favorites,k];save();renderCards();document.querySelector('[data-favorite="'+k+'"]')?.focus()}});
// Optional shortcut: Space presses the table's main button (deal, spin, roll, flip) while a game is open.
document.addEventListener('keydown',e=>{
  if(!siteSettings.hotkeys||e.code!=='Space'||e.repeat||!activeGame||!dlg.open)return;
  if(e.target.closest?.('input,textarea,select,button,summary,[contenteditable],[popover]'))return;
  const main=body.querySelector('.table-action.primary:not(:disabled)')||body.querySelector('.table-action:not(:disabled)');
  if(main){e.preventDefault();main.click()}
});
