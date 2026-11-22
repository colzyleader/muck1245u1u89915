'use strict';
// Player flips (the Flips page): one signed-in player puts play credits on heads or tails, another
// takes the other side, and the chat server tosses the coin after a ten-second countdown.
// The winner gets both stakes; there is no fee. Stakes leave the balance when a flip is created or
// joined and are tracked in the profile's `duels` list until the result (or a refund) is collected.
if(typeof document!=='undefined')(()=>{
  const box=$('#duels');
  if(!box)return;
  let view={now:Date.now(),spin:6000,open:[],recent:[]},skew=0;
  let watching=null,drawn='',lastCount=null;   // the flip shown in the viewer, and what is drawn there
  const announced=new Set(),tossed=new Set();  // flips already opened for this player / already animated here
  const other=side=>side==='Heads'?'Tails':'Heads';
  const face=side=>'art/'+side.toLowerCase()+'.webp?v=6';
  const serverNow=()=>Date.now()+skew;
  const find=id=>view.open.find(flip=>flip.id===id)||view.recent.find(flip=>flip.id===id);
  const secondsLeft=flip=>Math.max(0,Math.ceil((flip.flipAt-serverNow())/1000));
  const involves=(flip,me)=>Boolean(me)&&(flip.creator.id===me.id||flip.joiner?.id===me.id);
  const post=async(path,body)=>{const reply=await chatLink.call(path,body);return {ok:reply.ok,status:reply.status,data:await reply.json().catch(()=>({}))}};
  const winnerOf=flip=>flip.winner===flip.creator.id?flip.creator:flip.joiner;

  // One player's place in a flip: their picture with the coin face they hold. An empty seat shows "?".
  function seat(user,side,won=false){
    return '<span class="flip-seat'+(won?' won':'')+(user?'':' vacant')+'">'+
      (user?'<img class="flip-face" src="'+escapeText(discordAvatar(user))+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="flip-face">?</span>')+
      '<img class="flip-chip" src="'+face(side)+'" alt="'+side+'"></span>';
  }
  function stateText(flip){
    if(flip.status==='open')return 'Waiting for a challenger';
    if(flip.status==='countdown')return 'Flipping in '+secondsLeft(flip);
    if(flip.status==='flipping')return 'Flipping…';
    return flip.result+' · '+escapeText(winnerOf(flip).name)+' won';
  }
  function row(flip){
    const me=chatLink.me(),mine=flip.creator.id===me?.id,done=flip.status==='done';
    const action=flip.status!=='open'?'<button type="button" class="secondary" data-flip-view="'+flip.id+'">View</button>':
      mine?'<button type="button" class="secondary" data-flip-cancel="'+flip.id+'">Cancel</button>':'<button type="button" class="primary" data-flip-view="'+flip.id+'">Join</button>';
    return '<article class="flip-row '+flip.status+(involves(flip,me)?' mine':'')+'" data-flip="'+flip.id+'"><div class="flip-pair">'+
      seat(flip.creator,flip.side,done&&flip.winner===flip.creator.id)+'<i>VS</i>'+seat(flip.joiner,other(flip.side),done&&flip.winner===flip.joiner?.id)+'</div>'+
      '<span class="flip-names"><b>'+escapeText(flip.creator.name)+(flip.joiner?' vs '+escapeText(flip.joiner.name):'')+'</b><small class="flip-state">'+stateText(flip)+'</small></span>'+
      '<img class="flip-coin'+(flip.status==='flipping'||flip.status==='countdown'?' turning':'')+'" src="'+face(done?flip.result:flip.side)+'" alt="">'+
      '<span class="flip-amount">'+svg('coin')+fmt(flip.amount)+'</span>'+action+'</article>';
  }
  function render(){
    const me=chatLink.me();
    if(!chatLink.server){box.innerHTML='<p class="empty">Player flips need the chat server, so they are not available in this copy.</p>';return}
    const rows=[...view.open,...view.recent].map(row).join('');
    box.innerHTML='<div class="flips-bar"><p>'+(me?'Put credits on heads or tails. Another player takes the other side, the coin is tossed after a ten-second countdown, and the winner gets both stakes.':'Connect Discord in the chat to flip against other players. The winner gets both stakes.')+'</p><button type="button" id="duelCreate" class="primary">'+svg('play')+'Create flip</button></div>'+
      '<div class="flip-list">'+(rows||'<p class="empty">No flips yet. Create one and wait for a challenger.</p>')+'</div>';
    $('#duelCreate').onclick=createWindow;
  }

  // ---- Creating ----
  function createWindow(){
    if(!chatLink.me()){panel('DRIFTLOBBY','Create a coin flip','<p class="help">Connect Discord from the chat or the profile button first. Player flips need a signed-in account.</p>');return}
    watching=null;
    let side='Heads';
    const balance=Math.floor(player().credits);
    const sides=['Heads','Tails'].map((name,i)=>'<button type="button" class="flip-side" data-side="'+name+'" aria-pressed="'+(!i)+'" aria-label="'+name+'" title="'+name+'"><img alt="" src="'+face(name)+'"></button>').join('');
    panel('DRIFTLOBBY','Create a coin flip','<form id="duelForm" class="flip-create"><label class="flip-money" for="duelAmount">'+svg('coin')+'<input id="duelAmount" inputmode="numeric" maxlength="7" autocomplete="off" placeholder="0" aria-label="Your stake in credits"></label>'+
      '<div class="flip-quick">'+[10,50,100,500].map(amount=>'<button type="button" data-quick="'+amount+'">'+amount+'</button>').join('')+'<button type="button" data-quick="'+balance+'">Max</button></div>'+
      '<div class="flip-create-foot"><span>Balance <b>'+fmt(player().credits)+'</b></span><span class="flip-sides">'+sides+'</span><button class="primary">Create</button></div>'+
      '<p id="duelStatus" class="result" role="status"></p><p class="help">Your credits are held until someone joins. If nobody does within an hour, or you cancel, they come back.</p></form>');
    for(const button of body.querySelectorAll('[data-side]'))button.onclick=()=>{
      side=button.dataset.side;
      for(const each of body.querySelectorAll('[data-side]'))each.setAttribute('aria-pressed',String(each===button));
    };
    for(const button of body.querySelectorAll('[data-quick]'))button.onclick=()=>{$('#duelAmount').value=button.dataset.quick;$('#duelStatus').textContent=''};
    $('#duelAmount').focus();
    $('#duelForm').onsubmit=async e=>{
      e.preventDefault();
      const raw=$('#duelAmount').value.trim(),error=wagerError(raw,player().credits),status=$('#duelStatus'),button=e.target.querySelector('button.primary');
      if(error){status.textContent=error;return}
      button.disabled=true;
      try{
        const made=await post('/flips/create',{amount:Number(raw),side});
        if(!made.ok){status.textContent=made.data.error||'That didn’t work. Try again.';return}
        hold(made.data.flip);
        dlg.close();
        if(location.hash!=='#flips')location.hash='flips';
      }catch{status.textContent='The chat server isn’t reachable right now.'}
      finally{if(button.isConnected)button.disabled=false}
    };
  }
  // Takes a stake out of the balance and notes it as in play.
  function hold(flip){
    const p=player();
    moveCredits(p,-flip.amount,'entry','duel');
    p.duels=[...(p.duels||[]),{id:flip.id,amount:flip.amount}];
    save();ArcadeSound.play('coin');
  }
  const release=id=>{const p=player();p.duels=(p.duels||[]).filter(held=>held.id!==id)};

  // ---- Watching a flip: both players, the countdown, the coin, and the result ----
  function openViewer(id){watching=id;drawn='';drawViewer()}
  function drawViewer(){
    const flip=watching&&find(watching);
    if(!flip){watching=null;return}
    // Another window (settings, a game) has taken over the dialog: stop following.
    if(drawn&&$('.flip-view')?.dataset.id!==flip.id){watching=null;return}
    const me=chatLink.me(),mine=flip.creator.id===me?.id,done=flip.status==='done';
    if(drawn!==flip.id+':'+flip.status){
      // Keep the coin that is already spinning instead of redrawing it when the result is confirmed.
      if(done&&tossed.has(flip.id)&&$('.flip-view'))return;
      drawn=flip.id+':'+flip.status;lastCount=null;
      const error=wagerError(String(flip.amount),player().credits);
      const stage=flip.status==='open'?(mine?'<p class="flip-wait">Waiting for a challenger…</p><button type="button" id="flipCancel" class="secondary">Cancel flip</button>':
          !me?'<p class="flip-wait">Connect Discord in the chat to join this flip.</p>':
          '<p class="flip-wait">You take <b>'+other(flip.side)+'</b>. You each put in '+fmt(flip.amount)+' credits.</p><button type="button" id="flipJoin" class="primary" '+(error?'disabled':'')+'>Join for '+fmt(flip.amount)+' credits</button>'+(error?'<p class="result">You need '+fmt(flip.amount)+' credits to join.</p>':''))
        :flip.status==='countdown'?'<p class="flip-count" id="flipCount" aria-live="polite"></p><p class="flip-wait">Flipping in…</p>'
        :'<p class="flip-outcome" id="flipOutcome" role="status">'+(done?outcome(flip,me):'Flipping…')+'</p>';
      panel('DRIFTLOBBY','Coin flip','<div class="flip-view" data-id="'+flip.id+'"><div class="flip-versus"><div class="flip-side-card">'+seat(flip.creator,flip.side,done&&flip.winner===flip.creator.id)+'<b>'+escapeText(flip.creator.name)+'</b><small>'+flip.side+'</small></div>'+
        '<div class="duel-stage"><div class="duel-coin"><img src="'+face('Heads')+'" alt=""><img src="'+face('Tails')+'" alt=""></div></div>'+
        '<div class="flip-side-card">'+seat(flip.joiner,other(flip.side),done&&flip.winner===flip.joiner?.id)+'<b>'+(flip.joiner?escapeText(flip.joiner.name):'Open seat')+'</b><small>'+other(flip.side)+'</small></div></div>'+
        '<p class="flip-pot">'+svg('coin')+'<b>'+fmt(flip.amount*2)+'</b> to the winner</p><div class="flip-stage-text">'+stage+'<p id="duelStatus" class="result" role="status"></p></div></div>');
      const coin=$('.duel-coin');
      // Before the toss the coin rests on the creator's side; once it is over, on the result.
      coin.style.transform='rotateX('+((done?flip.result:flip.side)==='Heads'?0:180)+'deg)';
      if($('#flipCancel'))$('#flipCancel').onclick=()=>cancel(flip.id);
      if($('#flipJoin'))$('#flipJoin').onclick=()=>join(flip);
      if(flip.status==='flipping')toss(flip,coin);
    }
    if(flip.status==='countdown'){
      const left=secondsLeft(flip);
      if(left!==lastCount){lastCount=left;$('#flipCount').textContent=left;if(left<=3&&left>0)ArcadeSound.play('tap')}
    }
  }
  const outcome=(flip,me)=>'<b>'+flip.result+'</b><span class="'+(flip.winner===me?.id?'gain':involves(flip,me)?'loss':'')+'">'+
    (flip.winner===me?.id?'You won '+fmt(flip.amount*2)+' credits':escapeText(winnerOf(flip).name)+' won '+fmt(flip.amount*2)+' credits')+'</span>';
  // The long toss: the coin spins for as long as the server holds the result back, then lands on it.
  function toss(flip,coin){
    const me=chatLink.me(),landing=()=>{
      if(!coin.isConnected)return;
      $('#flipOutcome').innerHTML=outcome(flip,me);
      for(const card of body.querySelectorAll('.flip-seat'))card.classList.remove('won');
      body.querySelectorAll('.flip-side-card')[flip.winner===flip.creator.id?0:1].querySelector('.flip-seat').classList.add('won');
      ArcadeSound.play('coinland');
      if(involves(flip,me))ArcadeSound.play(flip.winner===me.id?'collect':'thud',0,.35);
    };
    const remaining=flip.tossedAt+view.spin-serverNow(),from=flip.side==='Heads'?0:180;
    tossed.add(flip.id);
    if(noMotion()||remaining<400){coin.style.transform='rotateX('+(flip.result==='Heads'?0:180)+'deg)';landing();return}
    // Whole turns for the time available, ending face-up on the result.
    const turns=Math.max(3,Math.round(remaining/380)),end=turns*360+(flip.result==='Heads'?0:180);
    ArcadeSound.play('cointoss');
    for(let at=1.2;at<remaining/1000-1.4;at+=1.5)ArcadeSound.play('coinspin',0,at);
    coin.animate([{transform:'rotateX('+from+'deg) translateY(0)'},{transform:'rotateX('+(from+(end-from)*.55)+'deg) translateY(-46px)',offset:.45},{transform:'rotateX('+end+'deg) translateY(0)'}],
      {duration:remaining,easing:'cubic-bezier(.3,.1,.3,1)',fill:'forwards'}).finished.then(landing,()=>{});
  }
  async function join(flip){
    const status=$('#duelStatus');
    $('#flipJoin').disabled=true;
    try{
      const joined=await post('/flips/join',{id:flip.id});
      if(!joined.ok){status.textContent=joined.data.error||'That didn’t work. Try again.';return}
      announced.add(flip.id);
      hold(joined.data.flip);
    }catch{status.textContent='The chat server isn’t reachable right now.';if($('#flipJoin'))$('#flipJoin').disabled=false}
  }
  async function cancel(id){
    try{const gone=await post('/flips/cancel',{id});if(gone.ok){if(watching===id)dlg.close();chatLink.claim()}}catch{}
  }

  // Credits and results owed by the chat server, collected through the same route as tips.
  chatLink.handlers.flip=item=>{
    release(item.id);
    record('duel',item.payout,(item.won?'Won':'Lost')+' vs '+item.opponent.name+' · '+item.result,item.stake);
    lastRound=null;   // this was not a table round, so it must not colour the next table message
    // Anyone who was not watching the coin still gets told.
    if(watching!==item.id)chatLink.status(item.won?'You won '+fmt(item.payout)+' credits in a flip against '+item.opponent.name+'.':item.opponent.name+' won your '+fmt(item.stake)+' credit flip.');
  };
  chatLink.handlers.refund=item=>{
    release(item.id);
    moveCredits(player(),item.amount,'duelRefund','duel');
  };
  chatLink.on.flips=next=>{
    view=next;skew=next.now-Date.now();
    const me=chatLink.me();
    render();
    // A flip of mine has been joined: bring up the countdown, unless a game table is open.
    for(const flip of view.open)if(flip.status!=='open'&&involves(flip,me)&&!announced.has(flip.id)){
      announced.add(flip.id);
      if(!activeGame&&watching!==flip.id)openViewer(flip.id);
    }
    drawViewer();
    // A flip of mine that has left the list has finished, been cancelled, or timed out: collect what it left me.
    if(me&&(player().duels||[]).some(held=>!view.open.some(open=>open.id===held.id)))chatLink.claim();
  };
  chatLink.on.session=()=>{render();drawn='';drawViewer()};
  // Countdowns tick here, in the list and in the viewer.
  setInterval(()=>{
    for(const flip of view.open)if(flip.status==='countdown'){
      const label=box.querySelector('[data-flip="'+flip.id+'"] .flip-state');
      if(label)label.textContent=stateText(flip);
    }
    if(watching)drawViewer();
  },200);
  dlg.addEventListener('close',()=>{watching=null;drawn=''});
  box.addEventListener('click',e=>{
    const look=e.target.closest('[data-flip-view]'),stop=e.target.closest('[data-flip-cancel]');
    if(look)openViewer(look.dataset.flipView);
    if(stop){stop.disabled=true;cancel(stop.dataset.flipCancel)}
  });
  render();
})();
