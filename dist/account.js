'use strict';
const journalLimit=100;
function initLedger(p,fresh=false){
  if(Array.isArray(p.ledger))return;
  p.ledger=[{kind:fresh?'welcome':'opening',amount:p.credits,balance:p.credits,at:Date.now()}];
}
function moveCredits(p,amount,kind,game){
  initLedger(p);
  p.credits=Math.round((p.credits+amount)*100)/100;
  p.ledger.unshift({kind,game,amount,balance:p.credits,at:Date.now()});
  p.ledger.length=Math.min(p.ledger.length,journalLimit);
}
function inPlayCredits(p){
  const hands=(p.blackjack?.hands||[]).reduce((total,hand)=>total+hand.cost,0);
  // Stakes held in open player flips count as in play too.
  const duels=(p.duels||[]).reduce((total,held)=>total+held.amount,0);
  return hands+duels+[p.mine,p.streak,p.tower].reduce((total,run)=>total+(run?(run.stake??COST):0),0);
}
function initProfit(p){
  if(p.profit)return;
  const hasStart=p.ledger.some(entry=>entry.kind==='welcome');
  if(hasStart){
    const granted=p.ledger.reduce((sum,r)=>sum+(['welcome','refill'].includes(r.kind)?r.amount:0),0);
    p.profit={net:p.credits+inPlayCredits(p)-granted,partial:false};
  }else{
    p.profit={net:p.history.reduce((sum,r)=>sum+r.net,0),partial:p.history.length>=50};
  }
}
function profitSummary(p){
  return '<div class="stat-box profit-stat"><span>'+(p.profit.partial?'Tracked':'All-time')+' profit / loss</span><b class="'+(p.profit.net<0?'loss':p.profit.net>0?'gain':'')+'">'+signed(p.profit.net)+' cr</b>'+(p.profit.partial?'<small>Earlier rounds unavailable.</small>':'')+'</div>';
}
function refillCredits(){
  const p=player();if(p.credits>=COST)return false;
  moveCredits(p,1000,'refill');save();ArcadeSound.play('collect');return true;
}
const activityKinds={welcome:'Starting credits',opening:'Opening balance',entry:'Round entry',return:'Round return',refill:'Free refill',double:'Double down',split:'Split hand',retired:'Retired round refund',tipOut:'Tip sent',tipIn:'Tip received',duelRefund:'Flip refunded'};
function signed(n){return (n>0?'+':'')+fmt(n)}
function renderStats(){
  const history=player().history;
  const net=history.reduce((sum,r)=>sum+r.net,0);
  const best=history.length?Math.max(...history.map(r=>r.net)):null;
  $('#stats').innerHTML=profitSummary(player())+'<div class="stat-box"><span>Rounds shown</span><b>'+history.length+'</b></div><div class="stat-box"><span>Net in rounds shown</span><b>'+signed(net)+'</b></div><div class="stat-box"><span>Best round</span><b>'+(best===null?'—':signed(best))+'</b></div>';
}
let walletFilter='all';
const journalDate=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
function renderWallet(){
  const p=player();initLedger(p);
  const entries=p.ledger.filter(r=>walletFilter==='all'||(walletFilter==='in'?r.amount>0:r.amount<0));
  const inPlay=inPlayCredits(p);
  const filters=[['all','All'],['in','Credits in'],['out','Credits out']].map(([key,label])=>'<button data-wallet-filter="'+key+'" aria-pressed="'+(walletFilter===key)+'">'+label+'</button>').join('');
  const rows=entries.map(r=>{
    const label=activityKinds[r.kind]||'Credit activity',numeric=signed(r.amount);
    return '<li class="wallet-row"><span class="journal-icon '+(r.amount<0?'debit':'')+'" aria-hidden="true">'+(r.amount<0?'−':'+')+'</span><div class="entry-name"><strong>'+escapeText(label)+'</strong><small>'+(r.game?escapeText(gameName(r.game))+' · ':r.who?escapeText(r.who)+' · ':'')+journalDate.format(r.at)+'</small></div><div class="entry-value"><b class="'+(r.amount<0?'':'gain')+'">'+numeric+' cr</b><small>Balance '+fmt(r.balance)+'</small></div></li>';
  }).join('');
  $('#walletContent').innerHTML='<div class="wallet-layout"><section class="wallet-summary"><div class="credit-card"><div class="credit-card-top"><span>PLAY CREDITS</span>'+svg('coin')+'</div><small>Available balance</small><strong>'+fmt(p.credits)+' <em>cr</em></strong><div class="credit-owner">'+svg('user')+' '+escapeText(p.name)+'</div></div>'+profitSummary(p)+'<div class="wallet-info"><div><span>In unfinished rounds</span><b>'+fmt(inPlay)+' cr</b></div><p>Free credits stay with this player on this browser. They have no cash value.</p><button id="walletRefill" class="secondary" '+(p.credits>=COST?'disabled':'')+'>Add 1,000 free credits</button><small>Available when your balance falls below 10.</small></div></section><section class="ledger"><div class="ledger-head"><h2>Credit activity</h2><div class="tabs" aria-label="Filter activity">'+filters+'</div></div>'+(rows?'<ul>'+rows+'</ul>':'<p class="empty">No matching credit activity yet.</p>')+'<p class="ledger-note">Latest 100 entries on this browser.</p></section></div>';
  document.querySelectorAll('[data-wallet-filter]').forEach(b=>b.onclick=()=>{walletFilter=b.dataset.walletFilter;renderWallet();document.querySelector('[data-wallet-filter="'+walletFilter+'"]').focus()});
  $('#walletRefill').onclick=()=>{if(refillCredits())renderWallet()};
}
// Removes everything DriftLobby has saved in this browser, then starts over.
function eraseSiteData(){
  for(const name of [KEY,SETTINGS_KEY,'nightshift.preferences.v1','driftlobby.discord.v1','driftlobby.chat.v1','driftlobby.stats.v1'])try{localStorage.removeItem(name)}catch{}
  for(const name of ['driftlobby.splash','driftlobby.discord.state'])try{sessionStorage.removeItem(name)}catch{}
  location.reload();
}
function settings(){
  const prefs=ArcadeSound.preferences;
  const toggle=(id,label,desc,on)=>'<label class="pref-toggle"><span><b>'+label+'</b><small>'+desc+'</small></span><input type="checkbox" id="'+id+'" '+(on?'checked':'')+'><i aria-hidden="true"></i></label>';
  const switchFor=(name,label,desc)=>toggle('set-'+name,label,desc,siteSettings[name]);
  const dataRow=(id,label,desc,button)=>'<div class="data-row"><span><b>'+label+'</b><small>'+desc+'</small></span><button type="button" class="secondary" id="'+id+'" data-label="'+button+'">'+button+'</button></div>';
  panel('DRIFTLOBBY','Settings','<div class="settings-pane">'+
    '<h3>Sound</h3><section class="set-card">'+toggle('soundSwitch','Game sounds','Card slides, wheel ticks, and peg hits.',prefs.sound)+
      '<div class="volume-row"><label for="volume">Master volume <output id="volumeValue">'+prefs.volume+'%</output></label><input id="volume" type="range" min="0" max="100" value="'+prefs.volume+'" style="--fill:'+prefs.volume+'%"><button id="previewSound" class="secondary">Test sound</button><span id="audioStatus" class="inline-note" role="status"></span></div>'+
      switchFor('mentionPing','Mention sound','Play a ping when someone @mentions you in chat.')+'</section>'+
    '<h3>Gameplay</h3><section class="set-card"><form id="betForm" class="field-row"><label for="defaultBet"><b>Default bet</b><small>The bet amount tables open with.</small></label><div class="rename-row"><input id="defaultBet" inputmode="numeric" maxlength="12" value="'+selectedStake()+'"><button class="secondary">Save</button></div><span id="betStatus" role="status"></span></form>'+
      switchFor('hotkeys','Space bar plays','Press Space to deal, spin, roll, or flip while a table is open.')+
      toggle('motionSwitch','Reduce motion','Shorten game reveals and stop decorative animation.',prefs.reducedMotion)+'</section>'+
    '<h3>Chat</h3><section class="set-card">'+switchFor('chatTimes','Message times','Show the time next to each chat message.')+
      switchFor('chatCompact','Compact messages','Smaller pictures and tighter spacing in chat.')+'</section>'+
    '<h3>Privacy</h3><section class="set-card">'+switchFor('hideBalance','Hide balance','Show •••• instead of your credits in the header and at tables.')+'</section>'+
    '<h3>Player profile</h3><section class="set-card"><form id="renameForm"><label for="rename">Display name</label><div class="rename-row"><input id="rename" maxlength="22" required value="'+escapeText(player().name)+'"><button class="secondary">Save name</button></div><span id="renameStatus" role="status"></span></form></section>'+
    '<h3>Data on this browser</h3><section class="set-card">'+
      dataRow('wipeStats','Live stats','Zero the profit tracker for this profile.','Reset')+
      dataRow('wipeHistory','Round history','Remove this profile’s list of past rounds.','Clear')+
      dataRow('wipeProfile','This profile','Back to 1,000 credits with no history. Unfinished rounds are dropped.','Reset profile')+
      dataRow('wipeAll','Everything','Erase all profiles, settings, and the Discord sign-in saved here.','Erase all')+
      '<span id="dataStatus" class="inline-note" role="status"></span></section>'+
    '<h3>About</h3><section class="set-card about-card"><p>DriftLobby is a private arcade played with free credits. Credits have no cash value and cannot be bought or redeemed.</p><nav class="legal-links" aria-label="Policies">'+legalLinks()+'</nav></section>'+
    '<small>Settings are saved in this browser.</small></div>');
  const sound=$('#soundSwitch'),volume=$('#volume'),test=$('#previewSound'),status=$('#audioStatus');
  function sync(){
    volume.disabled=!sound.checked;test.disabled=!sound.checked||Number(volume.value)===0||!ArcadeSound.available();
    status.textContent=!ArcadeSound.available()?'Audio is unavailable in this browser.':test.disabled?'Muted.':'';
  }
  sound.onchange=()=>{ArcadeSound.set('sound',sound.checked);sync();if(sound.checked)ArcadeSound.play('peg')};
  volume.oninput=()=>{volume.style.setProperty('--fill',volume.value+'%');ArcadeSound.set('volume',Number(volume.value));$('#volumeValue').value=volume.value+'%';sync()};
  volume.onchange=()=>ArcadeSound.play('peg');
  test.onclick=()=>{ArcadeSound.play('card');ArcadeSound.play('peg',2,.14);ArcadeSound.play('coin',0,.33);status.textContent='Playing sound preview.'};
  $('#motionSwitch').onchange=e=>ArcadeSound.set('reducedMotion',e.target.checked);
  for(const name of ['mentionPing','hotkeys','chatTimes','chatCompact','hideBalance'])$('#set-'+name).onchange=e=>{
    setSetting(name,e.target.checked);
    if(name==='mentionPing'&&e.target.checked)ArcadeSound.play('mention');
  };
  $('#betForm').onsubmit=e=>{
    e.preventDefault();
    const raw=$('#defaultBet').value.trim(),error=wagerError(raw,player().credits);
    if(!error){player().wager=Number(raw);save()}
    $('#betStatus').textContent=error||'Default bet saved.';
  };
  $('#renameForm').onsubmit=e=>{
    e.preventDefault();const value=$('#rename').value.trim(),status=$('#renameStatus');
    if(!value||db.players.some((p,i)=>i!==db.current&&p.name.toLowerCase()===value.toLowerCase())){status.textContent='Choose a different name.';return}
    player().name=value;save();navigate();status.textContent='Name saved.';
  };
  // Data buttons ask for a second click before doing anything.
  const guarded=(id,done,run)=>{
    const button=$('#'+id);
    button.onclick=()=>{
      if(button.dataset.armed){delete button.dataset.armed;button.textContent=button.dataset.label;run();if(done)$('#dataStatus').textContent=done;return}
      button.dataset.armed='1';button.textContent='Click again to confirm';
      setTimeout(()=>{if(button.isConnected&&button.dataset.armed){delete button.dataset.armed;button.textContent=button.dataset.label}},4000);
    };
  };
  guarded('wipeStats','Live stats reset.',()=>{resetLiveStats(player());save()});
  guarded('wipeHistory','Round history cleared.',()=>{player().history=[];save()});
  guarded('wipeProfile','Profile reset to 1,000 credits.',()=>{resetProfile(player());save();renderCards();navigate()});
  guarded('wipeAll','',eraseSiteData);
  sync();
}
$('#navWallet').onclick=$('#balanceLink').onclick=()=>{location.hash='wallet'};
$('#settingsLink').onclick=settings;
let existing=false;try{existing=Boolean(localStorage.getItem(KEY))}catch{}
for(const p of db.players){
  initLedger(p,!existing);
  for(const key of ['moles','chicken']){
    p.favorites=p.favorites.filter(favorite=>favorite!==key);
    if(p[key])moveCredits(p,COST,'retired',key);
    delete p[key];
  }
  initProfit(p);
}
save();renderCards();navigate();
if(typeof saveWasEdited!=='undefined'&&saveWasEdited)panel('DRIFTLOBBY','Save reset','<div class="info"><p>The saved data in this browser was changed outside the game, so its profiles have been put back to 1,000 credits.</p><p>Balances only change by playing rounds or using the free refill.</p></div>');
