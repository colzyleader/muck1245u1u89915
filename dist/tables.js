'use strict';
const tableGames = {blackjack, dice, mines, hilo, plinko};
const prefs = {direction:'under',target:50,mines:3,side:5,rows:12,risk:'Medium'};
const suits = ['♠','♥','♦','♣'];
const suitsText = ['spades','hearts','diamonds','clubs'];
const maxFactor=100000;
const pointsFor=(factor,stake)=>Math.floor(stake*Math.min(maxFactor,factor)+1e-8);
// The nine games whose win chance depends on the size of the bet (Arcade.share). In the three
// played pick by pick, the bet size counts on the first pick only.
const sizedGames=new Set(['tower','mines','limbo','dice','hilo','coinflip','rps','wheel','war']);
const firstPick={tower:'first floor',mines:'first tile',hilo:'first paying call'};
const firstPickEnd={tower:'of being safe',mines:'of being safe',hilo:'of coming in'};
const percent=value=>String(+value.toFixed(value<10?2:1))+'%';
function oddsNote(key,bet){
  const share=Arcade.share(bet),first=firstPick[key];
  if(share===0)return 'Bets over 1,500 cannot win. The house takes this bet'+(first?' on the '+first:'')+'.';
  if(share===1)return 'Full odds at this bet. Wins pay in full.';
  return 'At this bet '+(first?'the '+first+' has '+percent(share*100)+' of its normal chance '+firstPickEnd[key]:'you have '+percent(share*100)+' of the normal chance to win')+'. Wins pay in full.';
}
const oddsClass=bet=>'odds-note'+(Arcade.share(bet)===0?' shut':Arcade.share(bet)<.9?' cut':'');
// The same thing for a game's Table rules.
const sizedRule=key=>' Wins pay in full. The chance to win depends on the bet: full odds at 1 credit, sliding to about 93% of the normal chance at 200 credits; bets over 200 have 60% of the normal chance; bets over 1,500 cannot win.'+(firstPick[key]?' This counts on the '+firstPick[key]+' only; after that the chances are the normal ones.':'')+' The chance for your bet is shown under the bet amount.';
// "Win chance" line that follows the bet: `fair` is the game's normal chance in percent.
const chanceMetric=(fair,label='Win chance')=>metric(label,'<span data-win-chance="'+fair+'"></span>');
function showOdds(amount,error=''){
  const note=body.querySelector('[data-odds-note]');
  if(note){note.textContent=error?'':oddsNote(note.dataset.oddsNote,amount);note.className=error?'odds-note':oddsClass(amount)}
  body.querySelectorAll('[data-win-chance]').forEach(el=>el.textContent=error?'—':percent(Number(el.dataset.winChance)*Arcade.share(amount)));
}
const noMotion = () => ArcadeSound.preferences.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
function game(key) {
  if (!Object.hasOwn(tableGames,key)) return;
  cancelAnimationFrame(animation);
  activeGame = key;
  tableGames[key]();
}
function refillPanel() {
  panel('FREE PLAY',games[activeGame][0],help('Refill your free play balance to start another round.')+primary('refill','Add 1,000 free credits'));
  $('#refill').onclick=()=>{if(refillCredits())game(activeGame)};
}
function wagerPanel(key){
  const p=player(),run={blackjack:p.blackjack,mines:p.mine,hilo:p.streak,tower:p.tower}[key];
  if(run){
    const stake=run.stake??COST;
    return '<div class="placed-wager"><span>Bet placed</span><strong>'+fmt(stake)+' cr</strong></div>'+(sizedGames.has(key)?'<p class="'+oddsClass(stake)+' placed">'+oddsNote(key,stake)+'</p>':'');
  }
  const buttons=[5,10,25,100].map(n=>'<button type="button" data-chip="'+n+'" aria-label="Set bet to '+n+' credits"><i aria-hidden="true"></i>'+n+'</button>').join('');
  return '<div class="wager-pad"><label for="wager">Bet amount</label><div class="wager-value"><input id="wager" autocomplete="off" inputmode="numeric" type="text" maxlength="16" aria-describedby="wager-error" value="'+selectedStake()+'"><span>credits</span></div><div class="chip-rack">'+buttons+'</div><small id="wager-error" aria-live="polite"></small>'+(sizedGames.has(key)?'<p class="odds-note" data-odds-note="'+key+'" aria-live="polite"></p>':'')+'</div>';
}
function bindWager(){
  const input=$('#wager');
  if(!input)return;
  const chips=body.querySelectorAll('[data-chip]');
  function sync(){
    const error=wagerError(input.value,player().credits),amount=Number(input.value);
    $('#wager-error').textContent=error;
    input.setAttribute('aria-invalid',String(Boolean(error)));
    if(!error)player().wager=amount;
    chips.forEach(chip=>chip.setAttribute('aria-pressed',String(!error&&Number(chip.dataset.chip)===amount)));
    body.querySelectorAll('[data-bet-display]').forEach(el=>el.textContent=error?'—':fmt(amount));
    body.querySelectorAll('[data-natural]').forEach(el=>el.textContent=error?'—':'+'+fmt(amount*1.5)+' cr');
    body.querySelectorAll('[data-bet-factor]').forEach(el=>el.textContent=error?'—':fmt(Math.floor(amount*Number(el.dataset.betFactor)))+' cr');
    showOdds(amount,error);
    input.dispatchEvent(new Event('stakechange'));
  }
  input.oninput=sync;
  chips.forEach(chip=>chip.onclick=()=>{input.value=chip.dataset.chip;sync()});
  sync();
}
function room(key, board, controls, rules, message='') {
  panel('DRIFTLOBBY  /  FREE PLAY',games[key][0],
    '<div class="table-layout '+key+'-table"><section class="surface" aria-label="Game table">'+board+'</section><aside class="console"><div class="console-balance"><span>Balance</span><strong>'+shownBalance()+'</strong></div>'+
    wagerPanel(key)+controls+result+'<details><summary>Table rules</summary><p>'+rules+'</p></details></aside></div>');
  bindWager();announce(message);
}
function action(id,label,enabled=true,kind='primary') {
  return '<button class="'+kind+' table-action" id="'+id+'" '+(enabled?'':'disabled')+'>'+label+'</button>';
}
function metric(label,value){return '<div class="metric"><span>'+label+'</span><b>'+value+'</b></div>'}
// Dropdowns: the real <select> stays in the page (hidden) so game code keeps reading
// its value and change events; a styled button and menu sit on top of it.
// Browsers without popover support fall back to the plain <select>.
const styledPicks=typeof HTMLElement!=='undefined'&&'popover' in HTMLElement.prototype;
function selectBox(id,label,values,current,format=String) {
  const chosen=values.includes(current)?current:values[0];
  const options=values.map(v=>'<option value="'+v+'" '+(v===chosen?'selected':'')+'>'+format(v)+'</option>').join('');
  if(!styledPicks)return '<label class="field">'+label+'<select id="'+id+'">'+options+'</select></label>';
  return '<div class="field pick"><span id="'+id+'-label">'+label+'</span><select id="'+id+'" hidden>'+options+'</select>'+
    '<button type="button" class="pick-trigger" id="'+id+'-trigger" popovertarget="'+id+'-menu" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="'+id+'-label '+id+'-trigger"><span>'+format(chosen)+'</span>'+svg('chevron')+'</button>'+
    '<div class="pick-menu'+(values.length>12?' grid':'')+'" id="'+id+'-menu" popover role="listbox" aria-labelledby="'+id+'-label" data-pick="'+id+'">'+
    values.map(v=>'<button type="button" role="option" class="pick-option" data-value="'+v+'" aria-selected="'+(v===chosen)+'">'+format(v)+'</button>').join('')+'</div></div>';
}
const openPicks=()=>document.querySelectorAll('.pick-menu:popover-open');
// Place the menu under its button, or above it when there is more room there.
function placePick(menu){
  const box=document.getElementById(menu.dataset.pick+'-trigger').getBoundingClientRect();
  const below=innerHeight-box.bottom,above=box.top,down=below>=200||below>=above;
  Object.assign(menu.style,{left:box.left+'px',width:box.width+'px',top:down?box.bottom+6+'px':'auto',bottom:down?'auto':innerHeight-box.top+6+'px',maxHeight:Math.max(120,Math.min(264,(down?below:above)-16))+'px'});
}
document.addEventListener('beforetoggle',e=>{
  const menu=e.target;
  if(!menu.classList?.contains('pick-menu'))return;
  document.getElementById(menu.dataset.pick+'-trigger').setAttribute('aria-expanded',String(e.newState==='open'));
  if(e.newState==='open')placePick(menu);
},true);
document.addEventListener('toggle',e=>{
  if(e.target.classList?.contains('pick-menu')&&e.newState==='open')e.target.querySelector('[aria-selected=true]')?.focus();
},true);
document.addEventListener('click',e=>{
  const option=e.target.closest('.pick-option');
  if(!option)return;
  const menu=option.parentNode,id=menu.dataset.pick,select=document.getElementById(id);
  menu.hidePopover();
  if(select.value!==option.dataset.value){
    select.value=option.dataset.value;
    menu.querySelectorAll('.pick-option').forEach(o=>o.setAttribute('aria-selected',String(o===option)));
    document.querySelector('#'+id+'-trigger span').textContent=option.textContent;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  // A change can redraw the table, so look the button up again before focusing it.
  document.getElementById(id+'-trigger')?.focus();
});
document.addEventListener('keydown',e=>{
  const option=e.target.closest?.('.pick-option');
  if(!option)return;
  const all=[...option.parentNode.children],i=all.indexOf(option),step=option.parentNode.classList.contains('grid')?6:1;
  const next={ArrowDown:i+step,ArrowUp:i-step,ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:all.length-1}[e.key];
  if(next===undefined)return;
  e.preventDefault();all[Math.max(0,Math.min(all.length-1,next))].focus();
});
// The menu is pinned to the screen, so move it with its button when the page scrolls or resizes.
document.addEventListener('scroll',e=>{if(!e.target.closest?.('.pick-menu'))openPicks().forEach(placePick)},true);
window.addEventListener('resize',()=>openPicks().forEach(placePick));
function cardFace(c,back=false,animate=false) {
  if(back) return '<span class="face card-back" aria-label="Face-down card"><b>D</b></span>';
  const r=Arcade.rankLabel(Arcade.rank(c)), s=Arcade.suit(c),symbol=suits[s];
  return '<span class="face '+([1,2].includes(s)?'red ':'')+(animate?'deal':'')+'" aria-label="'+r+' of '+suitsText[s]+'"><small>'+r+'<em>'+symbol+'</em></small><strong>'+symbol+'</strong><small>'+r+'</small></span>';
}
const pipMaps = [[],[4],[1,7],[1,4,7],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8],[0,2,3,4,5,6,8]];
function tableCard(card, hidden=false) {
  if(hidden) return '<span class="paper-card reverse" data-card="hole" aria-label="Face-down card"><i>D</i></span>';
  const rank=Arcade.rank(card),suit=Arcade.suit(card),symbol=suits[suit],label=Arcade.rankLabel(rank);
  let center;
  if(rank>=11){
    const court=['♞','♛','♚'][rank-11];
    center='<span class="court"><i>'+court+'</i><i>'+court+'</i></span>';
  }else{
    const coords=rank<=7?pipMaps[rank].map(i=>[17+(i%3)*33,16+Math.floor(i/3)*34]):[[17,10],[83,10],[17,36],[83,36],[17,64],[83,64],[17,90],[83,90],...(rank===9?[[50,50]]:rank===10?[[50,25],[50,75]]:[])];
    center='<span class="pips '+(rank===1?'ace':'')+'">'+coords.map(([x,y])=>'<i style="left:'+x+'%;top:'+y+'%;--twist:'+(y>55?'180deg':'0deg')+'">'+symbol+'</i>').join('')+'</span>';
  }
  const corner='<b>'+label+'<em>'+symbol+'</em></b>';
  return '<span class="paper-card '+([1,2].includes(suit)?'red':'')+'" data-card="'+card+'" aria-label="'+label+' of '+suitsText[suit]+'">'+corner+center+corner+'</span>';
}
function dealMotion(previous, started, finished) {
  const shoe=$('.shoe-origin').getBoundingClientRect(),cards=[...body.querySelectorAll('.paper-card')];
  const previousCards=new Map(previous.map(item=>[item.id,item]));
  if(noMotion()){ArcadeSound.play('card');return}
  const chips=$('.table-chips');
  if(started)chips.animate([{translate:'0 45px',opacity:0},{translate:'0 0',opacity:1}],{duration:340,easing:'ease-out'});
  if(finished && !started)chips.animate([{translate:'0 0',opacity:1},{translate:'-28px 44px',opacity:0}],{delay:480,duration:420,fill:'forwards'});
  let end=0;
  cards.forEach((card,i)=>{
    const id=card.dataset.card,old=previousCards.get(id),rect=card.getBoundingClientRect(),dealer=Boolean(card.closest('.dealer'));
    if(old && !started){
      const dx=old.x-rect.x,dy=old.y-rect.y;
      if(Math.abs(dx)+Math.abs(dy)>3)card.animate([{translate:dx+'px '+dy+'px'},{translate:'0 0'}],{duration:240});
      return;
    }
    const flip=finished&&dealer&&previousCards.has('hole')&&card===body.querySelectorAll('.dealer .paper-card')[1];
    const order=started?[1,3,0,2][i]??i:dealer?Math.max(0,i-1):0;
    const delay=started?order*115:(dealer?order*155:0);
    const frames=flip?[{transform:'perspective(500px) rotateY(90deg)'},{transform:'perspective(500px) rotateY(0deg)'}]:
      [{opacity:0,translate:(shoe.x-rect.x)+'px '+(shoe.y-rect.y)+'px',rotate:'-24deg',scale:'.76'},{opacity:1,translate:'0 0',rotate:'0deg',scale:'1'}];
    ArcadeSound.play(flip?'flip':'card',0,delay/1000);
    card.animate(frames,{duration:340,delay,easing:'cubic-bezier(.19,.74,.28,1)',fill:'backwards'});
    end=Math.max(end,delay+340);
  });
  if(end){
    const controls=[...body.querySelectorAll('.table-action:not(:disabled)')],surface=$('.blackjack-table');
    controls.forEach(b=>b.disabled=true);
    const locked=surface.animate([{opacity:1},{opacity:1}],{duration:end});
    locked.finished.then(()=>{if(surface.isConnected)controls.forEach(b=>b.disabled=false)}).catch(()=>{});
    if(finished)$('.blackjack-table .result')?.animate([{opacity:0},{opacity:1}],{duration:200,delay:end-160,fill:'backwards'});
  }
}

function blackjack(completed=null, message='', animate=false, newHand=false) {
  const previous=[...body.querySelectorAll('.blackjack-table .paper-card')].map(el=>{const r=el.getBoundingClientRect();return {id:el.dataset.card,x:r.x,y:r.y}});
  const started=animate&&(newHand||!previous.length);
  const p=player(), t=p.blackjack||completed, ongoing=Boolean(p.blackjack);
  // While a hand is in play the dealer's second card has not been chosen yet, so a face-down card stands in for it.
  const dealer=t?t.dealer.map((c,i)=>tableCard(c,ongoing&&i===1)).join('')+(ongoing&&t.dealer.length===1?tableCard(0,true):''):'<span class="dealer-spot"></span>';
  const dealerScore=t?(ongoing?Arcade.total([t.dealer[0]])+' showing':Arcade.total(t.dealer)):'';
  const hands=t?t.hands.map((h,i)=>'<div class="hand '+(ongoing&&i===t.index?'current':'')+'"><span class="table-label">'+(t.split?'Hand '+(i+1):'Your hand')+' <b>'+Arcade.total(h.cards)+'</b></span><div class="handcards">'+h.cards.map(c=>tableCard(c)).join('')+'</div><small>'+(h.outcome||(ongoing&&t.split&&i===t.index?'Your turn':''))+'</small></div>').join(''):'<div class="waiting"><span class="bet-ring" data-bet-display></span>Your seat</div>';
  const board='<div class="felt"><span class="shoe-origin" aria-hidden="true"></span><div class="dealer"><span class="table-label">Dealer <b>'+dealerScore+'</b></span><div class="handcards">'+dealer+'</div></div><div class="felt-rule"><strong>Blackjack</strong><span>PAYS 3 TO 2</span></div><div class="hands">'+hands+'</div><div class="table-chips '+(t?'in-play':'')+'" aria-hidden="true"><i></i><i></i><i></i></div></div>';
  const moves=Arcade.options(t,p.credits), totalCost=t?t.hands.reduce((v,h)=>v+h.cost,0):COST;
  const recent=p.history.filter(round=>round.game==='blackjack').slice(0,3);
  const handHistory=recent.length?'<section class="recent-hands"><h3>Last hands</h3><ul>'+recent.map(round=>'<li><span>'+escapeText(round.detail)+'</span><b class="'+(round.net<0?'loss':round.net>0?'gain':'')+'">'+signed(round.net)+' cr</b></li>').join('')+'</ul></section>':'';
  const stake=t?.stake??COST;
  const extra=(verb)=>verb+' · '+fmt(t?.hands[t.index]?.cost??stake)+' cr';
  const naturalPayout='<div class="natural-preview"><span>Natural blackjack</span><b data-natural>+'+fmt(selectedStake()*1.5)+' cr</b></div>';
  const controls=ongoing?
    (totalCost!==stake?metric('Total in play',fmt(totalCost)+' cr'):'')+
    '<div class="paired">'+action('hit','Hit')+action('stand','Stand',true,'secondary')+'</div><div class="paired">'+
    action('double',extra('Double'),moves.includes('double'),'secondary')+action('split',extra('Split'),moves.includes('split'),'secondary')+'</div>':
    naturalPayout+action('deal','<span>'+(completed?'Deal again':'Deal hand')+'</span><small><b data-bet-display></b> cr</small>');
  room('blackjack',board,controls+handHistory,'One freshly shuffled 52-card deck per round. Aces count as 1 or 11. The dealer stands on all 17s. A natural wins 3:2 and a tie returns the hand’s credits. Double on your first two cards or split matching ranks once. Split aces receive one more card each. Split-hand 21 pays as a regular win.',message);
  if(animate)dealMotion(previous,started,Boolean(completed));
  if(!ongoing) {
    $('#deal').onclick=()=>{if(!charge())return;const next=Arcade.blackjack(undefined,selectedStake());p.blackjack=next;advance(next,true)};
    return;
  }
  for(const move of moves) $('#'+move).onclick=()=>{
    const extra=Arcade.play(t,move,p.credits);
    if(extra===null)return;
    if(extra)moveCredits(p,-extra,move,'blackjack');if(move==='stand')ArcadeSound.play('tap');advance(t);
  };
  function advance(next,newHand=false) {
    if(!next.finished){save();blackjack(null,'',true,newHand);return}
    const returned=next.hands.reduce((v,h)=>v+h.returned,0);
    const cost=next.hands.reduce((v,h)=>v+h.cost,0);
    const description=next.hands.map(h=>h.outcome).join(' / ');
    p.blackjack=null;record('blackjack',returned,description,cost);
    blackjack(next,'',true,newHand);
  }
}
function dice() {
  const board='<div class="dice-display"><span class="table-label">Roll result</span><strong id="rolled">– –</strong><div class="number-line"><span id="win-zone"></span><i id="roll-pin" hidden></i></div><div class="axis"><span>0</span><span>50</span><span>100</span></div></div>';
  const controls='<label class="field">Prediction</label><div class="paired">'+action('under','Under',true,'secondary')+action('over','Over',true,'secondary')+'</div><label class="field">Target <output id="target"></output><input id="range" type="range" min="2" max="98" value="'+prefs.target+'"></label>'+metric('Win chance','<span id="chance"></span>')+metric('Winning return','<span id="payout"></span>')+action('roll','Roll');
  room('dice',board,controls,'Roll 0.00–99.99. Choose strictly under or strictly over the target. A roll exactly on the target loses. The winning return includes your bet and is rounded down to whole credits.'+sizedRule('dice'));
  function update(){
    prefs.target=+$('#range').value;
    const odds=Arcade.diceOdds(prefs.direction,prefs.target,selectedStake());
    $('#target').value=prefs.target.toFixed(2);$('#chance').textContent=odds.chance.toFixed(2)+'%';$('#chance').title='Normal chance '+odds.fair.toFixed(2)+'%';$('#payout').textContent=$('#wager').getAttribute('aria-invalid')==='true'?'—':odds.returned+' cr';
    for(const dir of ['under','over']) $('#'+dir).setAttribute('aria-pressed',String(dir===prefs.direction));
    const zone=$('#win-zone');zone.style.left=(prefs.direction==='under'?0:prefs.target)+'%';zone.style.width=(prefs.direction==='under'?prefs.target:100-prefs.target)+'%';
  }
  $('#wager').addEventListener('stakechange',update);
  $('#range').oninput=update;
  for(const dir of ['under','over']) $('#'+dir).onclick=()=>{prefs.direction=dir;update()};
  update();
  $('#roll').onclick=()=>{
    if(!charge())return;
    const dir=prefs.direction,target=prefs.target,v=Arcade.diceRoll(dir,target,selectedStake());
    const win=dir==='under'?v<target:v>target;
    const ret=win?Arcade.diceOdds(dir,target,selectedStake()).returned:0;
    record('dice',ret,v.toFixed(2)+' / '+dir+' '+target);
    const rolled=$('#rolled'),pin=$('#roll-pin'),controls=Array.from(body.querySelectorAll('button,input'));
    controls.forEach(b=>b.disabled=true);announce('Rolling…');
    const start=performance.now();
    function frame(now){
      if(!noMotion()&&now-start<430){rolled.textContent=((now*0.37)%100).toFixed(2);animation=requestAnimationFrame(frame);return}
      rolled.textContent=v.toFixed(2);pin.hidden=false;pin.style.left=v+'%';controls.forEach(b=>b.disabled=false);
      rolled.className=win?'won':'missed';ArcadeSound.settle(ret);announce((win?'Target hit':'Miss')+' · '+ret+' credits returned.');$('.console-balance strong').textContent=shownBalance();
    }
    animation=requestAnimationFrame(frame);
  };
}
const gemArt='<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#3d9bff" d="M13 8 4 19h12z"/><path fill="#8dcbff" d="M13 8h11l-8 11z"/><path fill="#c3e6ff" d="M24 8l8 11H16z"/><path fill="#8dcbff" d="M24 8h11l-3 11z"/><path fill="#3d9bff" d="M35 8l9 11H32z"/><path fill="#1f74dc" d="M4 19h12l8 23z"/><path fill="#3a97f7" d="M16 19h16l-8 23z"/><path fill="#1759b5" d="M32 19h12L24 42z"/></svg>';
const bombArt='<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M33 13q3-8 9-5" fill="none" stroke="#b9925a" stroke-width="2.4" stroke-linecap="round"/><path fill="#ffb53e" d="m42 2.5 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/><rect x="26" y="9" width="10" height="8" rx="2" transform="rotate(38 31 13)" fill="#3a3a44"/><circle cx="21" cy="29" r="15" fill="#15151a" stroke="#000"/><path d="M10.500 26a11 11 0 0 1 8-9" fill="none" stroke="#ffffff66" stroke-width="2.6" stroke-linecap="round"/></svg>';
function mines(message='', finished=null, newest=-1) {
  const p=player(),m=p.mine,board=m||finished,side=board?.side||(!board?prefs.side:5),cells=side*side,count=board?(board.count??board.hazards.length):prefs.mines;
  const opened=board?.open.length||0, mult=Arcade.mineMultiplier(opened,count,cells);
  const returned=pointsFor(mult,board?.stake??COST);
  const tiles=Array.from({length:cells},(_,i)=>{
    const safe=board?.open.includes(i),hazard=finished?.hazards.includes(i);
    // Once a round is over, the gems that were never picked show faintly.
    const unpicked=Boolean(finished)&&!safe&&!hazard;
    const cls=safe?'safe':hazard?'bomb'+(i===newest?' hit':''):unpicked?'ghost':'';
    return '<button class="tile '+cls+(i===newest?' reveal':'')+'" data-cell="'+i+'" aria-label="Tile '+(i+1)+(safe?', gem':hazard?', mine':unpicked?', unpicked gem':'')+'" '+(!m||safe?'disabled':'')+'>'+(safe||unpicked?gemArt:hazard?bombArt:'')+'</button>';
  }).join('');
  const controls=(m?metric('Mines on board',count):selectBox('side','Board size',[5,6,7,8],prefs.side,v=>v+' × '+v)+selectBox('count','Hidden mines',Array.from({length:prefs.side**2-1},(_,i)=>i+1),prefs.mines))+metric('Gems revealed',opened)+metric('Safe next pick',m?((cells-count-opened)/(cells-opened)*100*(opened?1:Arcade.share(m.stake??COST))).toFixed(1)+'%':'—')+(m?action('collect','Collect '+(opened?fmt(returned):0)+' cr',opened>0):action('startMine','Start round'));
  room('mines','<div class="minefield" style="--side:'+side+'">'+tiles+'</div>',controls,'Choose a grid and mine count. Each gem raises the return. Collect after a safe reveal, or uncover every gem to collect automatically. A mine ends the round. Returns reaching 100,000× the bet collect automatically.'+sizedRule('mines'),message);
  if(!m){
    $('#side').onchange=e=>{prefs.side=+e.target.value;prefs.mines=Math.min(prefs.mines,prefs.side**2-1);mines()};
    $('#count').onchange=e=>{prefs.mines=+e.target.value};
    $('#startMine').onclick=()=>{
      if(!charge())return;
      // No mine positions are chosen or saved here: each tile is decided when it is turned over.
      p.mine={stake:selectedStake(),side:prefs.side,count:prefs.mines,open:[]};save();mines();
    };
    return;
  }
  function finish(lost,i=-1){
    // The round is over, so lay out the mines for the reveal: the one just hit plus the rest spread over the unturned tiles.
    if(!m.hazards){
      const closed=Array.from({length:cells},(_,cell)=>cell).filter(cell=>!m.open.includes(cell)&&cell!==i);
      m.hazards=[...(lost?[i]:[]),...uniqueDraw(closed.length,count-(lost?1:0)).map(k=>closed[k])];
    }
    ArcadeSound.play(lost?'thud':'collect');
    const value=lost?0:pointsFor(Arcade.mineMultiplier(m.open.length,count,cells),m.stake??COST);
    p.mine=null;record('mines',value,lost?'Mine revealed':m.open.length+(m.open.length===1?' gem':' gems'),m.stake??COST);
    mines(lost?'Mine revealed · Round over.':fmt(value)+' credits collected.',m,i);
  }
  $('#collect').onclick=()=>finish(false);
  body.querySelectorAll('[data-cell]:not(:disabled)').forEach(button=>button.onclick=()=>{
    const i=+button.dataset.cell;
    // A tile is a mine with the chance mines-left ÷ tiles-left, which is exactly the chance it would have if the
    // mines had been placed at the start. (Rounds saved by an older version still carry their placed mines.)
    if(m.hazards?m.hazards.includes(i):!Arcade.safePick(cells-m.open.length-count,cells-m.open.length,!m.open.length,m.stake??COST))return finish(true,i);
    ArcadeSound.play('gem',m.open.length);m.open.push(i);
    if(m.open.length===cells-count || Arcade.mineMultiplier(m.open.length,count,cells)>=maxFactor)return finish(false,i);
    save();mines((opened+1)+(opened===0?' gem':' gems')+' revealed.',null,i);
  });
}
function hilo(message='', finished=null, flip=false) {
  const p=player(),run=p.streak,view=run||finished;
  const rank=view?Arcade.rank(view.card):null, paid=view?view.factor:1, earned=view?pointsFor(paid,view.stake??COST):0;
  const board='<div class="streak-table"><div class="table-label">Current card</div><div class="largeface">'+(view?cardFace(view.card,false,flip):cardFace(0,true))+'</div><div class="trail">'+(view?.trail||[]).slice(-7).map(v=>'<span>'+Arcade.rankLabel(Arcade.rank(v))+suits[Arcade.suit(v)]+'</span>').join('')+'</div></div>';
  const controls=metric('Correct calls',view?.wins||0)+metric('Multiplier',paid.toFixed(2)+'×')+(run?'<div class="paired">'+action('higher','Higher',rank<13)+action('lower','Lower',rank>1,'secondary')+'</div>'+action('skip','Skip card · '+(10-run.skips)+' left',run.skips<10,'secondary')+action('collect','Collect '+(run.wins?fmt(earned):0)+' cr',run.wins>0):action('startHi','Start streak'));
  room('hilo',board,controls,'One entry covers the entire streak. Aces are low. Equal ranks leave your streak intact. Moving higher from an ace or lower from a king is a free move. Other correct predictions multiply your return. Skip up to 10 cards, or collect after a correct call. A wrong prediction ends the streak. A streak reaching 100,000× the bet collects automatically.'+sizedRule('hilo'),message);
  if(!run){$('#startHi').onclick=()=>{if(!charge())return;p.streak={stake:selectedStake(),card:Arcade.random(52),factor:1,wins:0,skips:0,trail:[]};save();hilo('',null,true)};return}
  function draw(){ArcadeSound.play('card');run.trail=[...run.trail.slice(-6),run.card];run.card=Arcade.random(52);return Arcade.rank(run.card)}
  $('#skip').onclick=()=>{if(run.skips>=10)return;draw();run.skips++;save();hilo('Card skipped.',null,true)};
  $('#collect').onclick=()=>{if(!run.wins)return;p.streak=null;ArcadeSound.play('collect');record('hilo',earned,run.wins+' correct',run.stake??COST);hilo(fmt(earned)+' credits collected.',run)};
  function predict(high) {
    let next=draw();
    if(next===rank){save();hilo('Same rank. Streak held.',null,true);return}
    const missed=value=>high?value<rank:value>rank, paying=(high?13-rank:rank-1)<12;
    // The bet size counts on the first winning call: one the house takes is redrawn from the ranks that miss.
    if(paying&&!run.wins&&!missed(next)&&Arcade.houseTakes(run.stake??COST)){
      do run.card=Arcade.random(52); while(!missed(Arcade.rank(run.card)));
      next=Arcade.rank(run.card);
    }
    if(missed(next)){p.streak=null;ArcadeSound.play('thud');record('hilo',0,'Streak ended after '+run.wins,run.stake??COST);hilo('Miss · Streak ended.',run,true);return}
    const favorable=high?13-rank:rank-1;
    if(favorable===12){save();hilo('Free move · Multiplier and correct calls stay the same.',null,true);return}
    run.wins++;run.factor*=12/favorable;
    if(run.factor>=maxFactor){const maxRoundCredits=pointsFor(run.factor,run.stake??COST);p.streak=null;record('hilo',maxRoundCredits,run.wins+' correct',run.stake??COST);hilo(fmt(maxRoundCredits)+' credits collected.',run,true);return}
    save();hilo('Correct · Continue or collect.',null,true);
  }
  $('#higher').onclick=()=>predict(true);$('#lower').onclick=()=>predict(false);
}
function plinko() {
  const rows=prefs.rows, bins=Arcade.slots(rows,prefs.risk);
  const board='<canvas class="plinko-board" width="1080" height="760" role="img" aria-label="Plinko board with '+rows+' rows"></canvas>';
  const controls=selectBox('rows','Peg rows',[8,12,16],rows)+selectBox('risk','Board risk',['Low','Medium','High'],prefs.risk)+metric('Slot range',Math.min(...bins)+'× – '+Math.max(...bins)+'×')+action('drop','Drop ball');
  room('plinko',board,controls,'Each peg sends the ball left or right with an equal chance. The final slot sets the return. Select a risk level to change the slot values and a row count to change the path. These are DriftLobby’s own points tables.');
  $('#rows').onchange=e=>{prefs.rows=+e.target.value;plinko()};$('#risk').onchange=e=>{prefs.risk=e.target.value;plinko()};
  const ctx=$('canvas').getContext('2d'),step=1000/(rows+1),dy=565/rows;
  const x=(r,c)=>540+(c-r/2)*step, y=r=>68+r*dy;
  const colors=['#ef947c','#f0ae8f','#e7b690','#c7c6ac','#a2c5c8','#8bc5be'];
  function paint(ball,trail=[],hits=new Map(),slot=-1){
    ctx.clearRect(0,0,1080,760);
    for(let r=0;r<rows;r++)for(let j=0;j<=r;j++){
      const lit=hits.has(r+':'+j);
      ctx.beginPath();ctx.arc(x(r,j),y(r),lit?7:5,0,Math.PI*2);
      ctx.fillStyle=lit?'#a3ffda':'#c8c0dd';ctx.shadowColor='#5cf5bb';ctx.shadowBlur=lit?15:0;ctx.fill();
    }
    ctx.shadowBlur=0;
    for(let j=0;j<bins.length;j++){
      const left=x(rows,j)-step/2+2,cy=660,w=step-4;
      ctx.fillStyle=j===slot?'#8cffbb':colors[Math.min(5,Math.floor(Math.min(j,rows-j)*12/rows))];
      ctx.beginPath();ctx.roundRect(left,cy,w,57,7);ctx.fill();
      ctx.fillStyle='#191522';ctx.font='bold '+Math.min(28,Math.round(w*.37))+'px Arial';ctx.textAlign='center';ctx.fillText(bins[j]+'×',x(rows,j),cy+36);
    }
    if(trail.length>1){
      ctx.beginPath();trail.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));
      ctx.strokeStyle='#ff9fc667';ctx.lineWidth=8;ctx.lineCap='round';ctx.stroke();
    }
    ctx.fillStyle='#ffc3d7';ctx.shadowColor='#ff5ba2';ctx.shadowBlur=18;
    ctx.beginPath();ctx.arc(ball[0],ball[1],11,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  }
  paint([540,29]);
  $('#drop').onclick=()=>{
    if(!charge())return;
    const path=[[540,23]],hitList=[];
    let col=0;
    for(let row=0;row<rows;row++){
      path.push([x(row,col),y(row)-14]);hitList.push(row+':'+col);col+=Arcade.random(2);
    }
    path.push([x(rows,col),646]);
    const ret=Math.round(bins[col]*selectedStake()*100)/100;
    record('plinko',ret,bins[col]+'× · '+rows+' rows · '+prefs.risk);
    const controls=[...body.querySelectorAll('button:not(:disabled),select,input')];controls.forEach(el=>el.disabled=true);
    announce('Ball dropping…');
    const start=performance.now(), hits=new Map(), trail=[];
    function frame(now){
      const time=noMotion()?path.length:((now-start)/(rows>12?87:116)),seg=Math.floor(time);
      if(seg>=path.length-1){
        paint(path.at(-1),[],hits,col);ArcadeSound.play('land');
        controls.forEach(el=>el.disabled=false);
        $('.console-balance strong').textContent=shownBalance();
        announce(bins[col]+'× slot · '+ret+' credits returned.');return;
      }
      if(seg>0&&!hits.has(hitList[seg-1])){hits.set(hitList[seg-1],true);ArcadeSound.play('peg',seg)}
      const f=time-seg,a=path[seg],b=path[seg+1];
      const pos=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f*f-6*Math.sin(Math.PI*f)];
      trail.push(pos);if(trail.length>9)trail.shift();paint(pos,trail,hits);
      animation=requestAnimationFrame(frame);
    }
    animation=requestAnimationFrame(frame);
  };
}
