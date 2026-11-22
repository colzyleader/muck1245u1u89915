'use strict';
Object.assign(tableGames,{keno,roulette,baccarat,wheel,limbo,tower:()=>tower(),coinflip,war,rps});
function uniqueDraw(pool,count) {
  const bag=Array.from({length:pool},(_,i)=>i);
  const draw=[];
  while(draw.length<count)draw.push(bag.splice(Arcade.random(bag.length),1)[0]);
  return draw;
}
function revealRound(duration,step,done) {
  const start=performance.now(),root=body.firstElementChild;
  const locked=[...body.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled)')];
  locked.forEach(el=>el.disabled=true);
  function frame(now){
    if(!root.isConnected || !dlg.open)return;
    const fraction=noMotion()?1:Math.min(1,Math.max(0,(now-start)/duration));
    step(fraction);
    if(fraction<1){animation=requestAnimationFrame(frame);return}
    locked.forEach(el=>el.disabled=false);
    $('.console-balance strong').textContent=shownBalance();done();
  }
  animation=requestAnimationFrame(frame);
}
const pickNumbers=new Set();
const kenoPay=[
  [],[0,3.8],[0,1,6],[0,.5,2,12],[0,0,1.5,5,25],[0,0,1,3,12,50],
  [0,0,.6,2,6,24,80],[0,0,.4,1.5,4,12,40,120],[0,0,.2,1,3,8,24,65,160],
  [0,0,0,.8,2,5,15,40,100,240],[0,0,0,.6,1.6,4,10,25,65,150,300]
];
function keno() {
  const picked=pickNumbers.size;
  const board='<div class="keno-area"><div class="draw-track" aria-label="Numbers drawn"><span>Draw tray</span></div><div class="keno-grid">'+Array.from({length:40},(_,i)=>'<button data-number="'+i+'" aria-label="Number '+(i+1)+'" aria-pressed="'+pickNumbers.has(i)+'">'+(i+1)+'</button>').join('')+'</div></div>';
  const pay=picked?'<div class="paystrip">'+kenoPay[picked].map((v,i)=>v?'<span>'+i+' hit'+(i===1?'':'s')+' <b>'+v+'×</b></span>':'').join('')+'</div>':'';
  room('keno',board,metric('Your picks',picked+' / 10')+'<div class="paired">'+action('quick','Quick pick',true,'secondary')+action('clear','Clear',picked>0,'secondary')+'</div>'+action('draw','Draw 10',picked>0)+pay,'Pick 1–10 spots from 40. The draw reveals 10 distinct numbers. Each highlighted match counts toward the listed return multipliers. Quick pick chooses five numbers.');
  body.querySelectorAll('[data-number]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.number;
    if(pickNumbers.has(i))pickNumbers.delete(i);
    else if(picked<10)pickNumbers.add(i);
    else{announce('Ten spots selected. Deselect a number to change your ticket.');return}
    keno();body.querySelector('[data-number="'+i+'"]').focus({preventScroll:true});
  });
  $('#quick').onclick=()=>{pickNumbers.clear();uniqueDraw(40,5).forEach(i=>pickNumbers.add(i));keno()};
  $('#clear').onclick=()=>{pickNumbers.clear();keno()};
  $('#draw').onclick=()=>{
    if(!pickNumbers.size||!charge())return;
    const draw=uniqueDraw(40,10),hits=draw.filter(i=>pickNumbers.has(i)).length,ret=Math.round(kenoPay[picked][hits]*selectedStake()*100)/100;
    record('keno',ret,hits+' / '+picked+' matched');$('#draw').textContent='Drawing…';const tray=$('.draw-track');tray.replaceChildren();
    body.querySelectorAll('[data-number]').forEach(b=>b.classList.remove('drawn','matched'));
    let shown=0;
    revealRound(1550,p=>{while(shown<Math.min(10,1+Math.floor(10*p))){const n=draw[shown++],match=pickNumbers.has(n);if(!noMotion())ArcadeSound.play(match?'gem':'peg',shown);body.querySelector('[data-number="'+n+'"]').classList.add(match?'matched':'drawn');const ball=document.createElement('b');ball.className=match?'match':'';ball.textContent=n+1;tray.append(ball)}},()=>{$('#draw').textContent='Draw again';ArcadeSound.settle(ret);announce(hits+' matched · '+ret+' credits returned.')});
  };
}
const choiceControl=(id,label,choices,selected)=>selectBox(id,label,choices,selected);
function presentOutcome(key,choice,ret,detail,outcome,delay=850) {
  record(key,ret,detail);
  const stage=$('.event-stage');
  stage.classList.add('rolling');stage.innerHTML=outcome;
  revealRound(delay,()=>{},()=>{stage.classList.remove('rolling');ArcadeSound.settle(ret);if(key!=='war'||choice!=='You win')announce(choice+' · '+ret+' credits returned.');else announce('')});
}
function coinflip(){mintTable()}
function rps(){duelTable()}
function war(){
  const versus=(a,b)=>'<div class="versus"><div>'+(a==null?cardFace(0,true):cardFace(a,false,true))+'<small>You</small></div><i>vs</i><div>'+(b==null?cardFace(0,true):cardFace(b,false,true))+'<small>House</small></div></div>';
  room('war','<div class="event-stage">'+versus(null,null)+'</div>',chanceMetric(800/17)+action('battle','Draw cards'),'Each side draws a card from a shuffled deck. Aces are high. The higher card returns 2× your bet. Equal ranks return your bet.'+sizedRule('war'));
  $('#battle').onclick=()=>{if(!charge())return;const [a,b]=Arcade.warDraw(selectedStake()),high=c=>Arcade.rank(c)===1?14:Arcade.rank(c),result=high(a)>high(b)?'You win':high(a)===high(b)?'Tie':'House wins',ret=result==='You win'?2*selectedStake():result==='Tie'?selectedStake():0;presentOutcome('war',result,ret,Arcade.rankLabel(Arcade.rank(a))+' vs '+Arcade.rankLabel(Arcade.rank(b)),versus(a,b))};
}
function baccaratRound(deck){
  const a=[deck.pop()],b=[deck.pop()];a.push(deck.pop());b.push(deck.pop());
  const val=c=>Math.min(10,Arcade.rank(c))%10,score=h=>h.reduce((v,c)=>v+val(c),0)%10;
  const start=score(b);
  if(Math.max(score(a),start)<8){
    if(score(a)<=5)a.push(deck.pop());
    const third=a.length===3?val(a[2]):null;
    const take=third===null?start<=5:start<=2||(start===3&&third!==8)||(start===4&&third>=2&&third<=7)||(start===5&&third>=4&&third<=7)||(start===6&&third>=6&&third<=7);
    if(take)b.push(deck.pop());
  }
  return {a,b,left:score(a),right:score(b),winner:score(a)===score(b)?'Tie':score(a)>score(b)?'Player':'Banker'};
}
function baccarat(){
  const row=(who,cards,score)=>'<div class="duel-row"><span class="table-label">'+who+' '+(score??'')+'</span><div class="handcards">'+(cards?cards.map(c=>cardFace(c,false,true)).join(''):cardFace(0,true)+cardFace(0,true))+'</div></div>';
  room('baccarat','<div class="event-stage">'+row('Banker')+row('Player')+'</div>',choiceControl('call','Choose a hand',['Player','Banker','Tie'],'Player')+action('baccDeal','Deal'),'Pick the side closest to 9 or call a tie. Tens and face cards count as zero. Standard third-card rules apply. Player returns 2×, Banker returns 1.9×, and a correct tie returns 9× your bet. A tie pushes side picks.');
  $('#baccDeal').onclick=()=>{if(!charge())return;const round=baccaratRound(uniqueDraw(52,52)),call=$('#call').value,ret=call===round.winner?(call==='Tie'?9*selectedStake():call==='Banker'?19*selectedStake()/10:2*selectedStake()):round.winner==='Tie'?selectedStake():0;presentOutcome('baccarat',round.winner==='Tie'?'Tie':round.winner+' wins',ret,call+' / '+round.winner,row('Banker',round.b,round.right)+row('Player',round.a,round.left),850)};
}
function limbo(){
  // Latest multipliers, newest first, read from this player's saved rounds ("1.62× / 2×").
  const pill=(text,won)=>'<b class="'+(won?'up':'down')+'">'+escapeText(text)+'</b>';
  const trail=player().history.filter(r=>r.game==='limbo').slice(0,8).map(r=>pill(r.detail.split(' / ')[0],r.net>0)).join('');
  room('limbo','<div class="event-stage limbo-read"><div class="limbo-trail" aria-label="Recent multipliers">'+trail+'</div><strong id="factor"><span>1.00</span><i>×</i></strong><small id="limboTarget"></small></div>',selectBox('targetFactor','Target multiplier',[1.5,2,3,5,10,25,50,100],2,v=>v+'×')+chanceMetric(50)+action('launch','Launch'),'Choose a target. If the final multiplier reaches it, collect your bet times the target. The multiplier stops at 1,000×. The normal chance of reaching a target is 100% divided by that target.'+sizedRule('limbo'));
  const read=$('#factor'),digits=read.firstElementChild,goal=$('#limboTarget');
  const showTarget=()=>{const target=+$('#targetFactor').value,field=$('#wager');goal.textContent='Target '+target.toFixed(2)+'×';body.querySelector('[data-win-chance]').dataset.winChance=100/target;showOdds(selectedStake(),field?.getAttribute('aria-invalid')==='true'?'invalid':'')};
  $('#targetFactor').onchange=showTarget;showTarget();
  $('#launch').onclick=()=>{
    if(!charge())return;
    const target=+$('#targetFactor').value,v=Arcade.limboRound(target,selectedStake()),ret=v>=target?selectedStake()*target:0;
    record('limbo',ret,v.toFixed(2)+'× / '+target+'×');
    read.className='';
    // Multipliers grow by ratio, so the count climbs evenly from 1× to 1,000× and eases into the final value.
    revealRound(1100,p=>{
      const now=p<1?Math.min(v,Math.exp(Math.log(v)*(1-(1-p)**3))):v;
      digits.textContent=now.toFixed(2);read.classList.toggle('over',now>=target);
    },()=>{
      read.className=ret?'won':'missed';
      const list=$('.limbo-trail');list.insertAdjacentHTML('afterbegin',pill(v.toFixed(2)+'×',ret>0));
      while(list.children.length>8)list.lastChild.remove();
      ArcadeSound.settle(ret);announce((ret?'Target reached':'Below target')+' · '+ret+' credits returned.');
    });
  };
}
// Twelve segments averaging 1× at full odds. Three of them pay more than the bet.
const wheelSlots=[0,1,0,2,1,0,3,0,1,0,4,0];
const rouletteNumbers=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const reds=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function spinBoard(labels,colors) {
  const step=360/labels.length;
  const background='conic-gradient(from '+(-step/2)+'deg,'+colors.map((c,i)=>c+' '+i*step+'deg '+(i+1)*step+'deg').join(',')+')';
  return '<div class="wheel-wrap"><div class="wheel-marker"></div><div class="spin-disc" style="background:'+background+'">'+labels.map((v,i)=>'<span style="--ang:'+i*step+'deg">'+v+'</span>').join('')+'</div><div class="wheel-hub">D</div></div>';
}
function spin(key,values,ret,detail,index){
  record(key,ret,detail);const disc=$('.spin-disc'),old=Number(disc.dataset.angle||0),aim=(360-index*360/values.length)%360;
  const end=old+3*360+(aim-(old%360)+360)%360;disc.dataset.angle=end;
  let lastSegment=-1;
  revealRound(1750,p=>{const angle=old+(end-old)*(1-(1-p)**3),segment=Math.floor(angle*values.length/360);disc.style.transform='rotate('+angle+'deg)';if(!noMotion()&&segment!==lastSegment)ArcadeSound.play('wheel');lastSegment=segment},()=>{ArcadeSound.settle(ret);announce(detail+' · '+ret+' credits returned.')});
}
function wheel(){
  room('wheel',spinBoard(wheelSlots.map(v=>v+'×'),wheelSlots.map(v=>['#333947','#79896b','#edb57c','#ac80c0','#d47793'][Math.ceil(v)])),metric('Segments',12)+chanceMetric(25,'Chance of 2× or more')+action('spin','Spin wheel'),'The wheel has 12 segments. The segment under the top pointer sets the credit return. At full odds each segment is equally likely; three of them pay 2×, 3×, and 4×. A paying spin the house takes stops on a 0× segment.'+sizedRule('wheel'));
  $('#spin').onclick=()=>{if(!charge())return;const i=Arcade.wheelStop(wheelSlots,selectedStake()),m=wheelSlots[i];spin('wheel',wheelSlots,Arcade.credit(selectedStake()*m),m+'× segment',i)};
}
function roulette(){
  room('roulette',spinBoard(rouletteNumbers,rouletteNumbers.map(n=>n===0?'#427b59':reds.has(n)?'#9e3f44':'#202129')),choiceControl('outside','Pick',['Red','Black','Odd','Even','Single number'],'Red')+'<div id="inside" hidden>'+selectBox('numberBet','Number',Array.from({length:37},(_,i)=>i),0)+'</div>'+action('rouletteSpin','Spin'),'A European wheel has 37 pockets including zero. Red, black, odd, and even return 2× your bet on a match. Zero loses those picks. A single matching number returns 36× your bet.');
  $('#outside').onchange=()=>$('#inside').hidden=$('#outside').value!=='Single number';
  $('#rouletteSpin').onclick=()=>{
    if(!charge())return;const i=Arcade.random(37),n=rouletteNumbers[i],call=$('#outside').value,straight=call==='Single number';
    const win=straight?n===+$('#numberBet').value:n!==0&&({Red:reds.has(n),Black:!reds.has(n),Odd:Boolean(n%2),Even:n%2===0}[call]);
    spin('roulette',rouletteNumbers,win?selectedStake()*(straight?36:2):0,(n===0?'Green':reds.has(n)?'Red':'Black')+' '+n,i);
  };
}
// Tower levels: [doors per floor, safe doors]. Each floor multiplies the payout by 1 / (safe ÷ doors), and the
// harder levels just fail more often. The size of the bet changes the chance on the first floor (Arcade.share).
const towerModes={Easy:[4,3],Classic:[3,2],Challenge:[4,2],Expert:[3,1],Master:[4,1]};
// What a climb pays after `floors` safe picks: the fair multiple for those odds, in whole credits.
const towerReturn=(stake,factor,floors)=>floors?Math.floor(stake*factor**floors+1e-9):0;
function tower(finished=null,message=''){
  const key='tower',p=player(),run=p.tower,view=run||finished,progress=view?.steps.length||0,limit=7;
  // Older saved climbs have no level stored; they used three doors with one locked per floor.
  const mode=view?(view.mode||'Classic'):(prefs.towerLevel||'Expert');
  const [doors,safeCount]=towerModes[mode]||towerModes.Classic;
  const safeChance=safeCount/doors, factor=1/safeChance;
  const entryOptions=!run?selectBox('towerMode','Tower difficulty',Object.keys(towerModes),mode,name=>name+' · '+towerModes[name][1]+' of '+towerModes[name][0]+' safe'):'';
  const towerRules=(safeCount===1?'One':safeCount===2?'Two':'Three')+' of '+doors+' doors '+(safeCount===1?'is':'are')+' safe on each independently shuffled floor. Pick any door on the lit floor. Each floor multiplies the return by '+(Number.isInteger(factor)?factor:factor.toFixed(2))+'×. Collect after a safe pick, or clear all seven floors to collect automatically. Returns include the entry. Cleared floors show which doors were locked.'+sizedRule('tower');
  const board='<div class="tower-grid" style="--doors:'+doors+'">'+Array.from({length:limit},(_,r)=>{
      const level=limit-1-r,done=level<progress,active=Boolean(run)&&level===progress;
      // Floors already played show their layout: the door taken, the other safe doors, and the locked ones.
      const shown=view?.safeDoors&&(done||(finished&&level===progress))?view.safeDoors[level]:null;
      return '<div class="tower-floor '+(active?'reachable':'')+'"><small>F'+(level+1)+'</small>'+Array.from({length:doors},(_,c)=>{
        const lost=finished?.failed===c&&level===progress,taken=done&&view.steps[level]===c;
        const cls=taken?'passed':lost?'fallen':shown?(shown.includes(c)?'spare':'locked'):'';
        return '<button data-door="'+c+'" '+(!active?'disabled':'')+' class="'+cls+'" aria-label="Floor '+(level+1)+' door '+(c+1)+(cls==='locked'?', locked':cls==='spare'?', was safe':'')+'">'+(taken?'◆':lost?'×':cls==='spare'?'◇':cls==='locked'?'×':c+1)+'</button>';
      }).join('')+'</div>';
    }).join('')+'</div>';
  const stake=run?(run.stake??COST):selectedStake();
  // The first floor's chance follows the bet; the floors after it have the normal chance.
  const firstSafe=bet=>(safeChance*Arcade.share(bet)*100).toFixed(1)+'%', fullClimb=bet=>{const all=safeChance**limit*Arcade.share(bet);return (100*all).toFixed(all<.001?3:2)+'%'};
  const climbing=Boolean(run)&&progress>0;
  const chances=(climbing?'':metric('First floor safe chance','<span id="firstSafe">'+firstSafe(stake)+'</span>'))+metric(climbing?'Safe door chance':'Later floors safe chance',(safeChance*100).toFixed(1)+'%')+metric('Full climb chance','<span id="fullClimb">'+fullClimb(stake)+'</span>');
  const options=entryOptions+chances+metric('Floors cleared',progress+' / '+limit)+metric('Next safe return',progress===limit?'—':'<span data-bet-factor="'+factor**(progress+1)+'">'+towerReturn(stake,factor,progress+1)+' cr</span>');
  const collect=action('takePath','Collect '+towerReturn(stake,factor,progress)+' cr',progress>0,'secondary');
  const ctrls=run?'<p class="help">Choose a door on the lit floor.</p>'+collect:action('beginPath','Start climb');
  room(key,board,options+ctrls,towerRules,message);
  if(!run){
    $('#towerMode').onchange=e=>{prefs.towerLevel=e.target.value;tower()};
    $('#wager').addEventListener('stakechange',()=>{$('#firstSafe').textContent=firstSafe(selectedStake());$('#fullClimb').textContent=fullClimb(selectedStake())});
    $('#beginPath').onclick=()=>{
      if(!charge())return;
      prefs.towerLevel=mode;
      // safeDoors starts empty and gains a floor's layout only after that floor has been played.
      p[key]={stake:selectedStake(),steps:[],mode,safeDoors:[]};
      save();tower();
    };
    return;
  }
  function end(lost){const ret=lost?0:towerReturn(stake,factor,run.steps.length);p[key]=null;ArcadeSound.settle(ret);record(key,ret,run.steps.length+' floors',stake);tower(run,lost?'Locked door · Round over.':(ret+' credits collected · +'+(ret-stake)+' net.'))}
  function step(choice){
    let safe;
    if(run.safeDoors?.[progress])safe=run.safeDoors[progress].includes(choice);  // climb saved by an older version
    else if(!run.safeDoors)safe=Arcade.random(3)!==choice;                        // oldest saves
    else{
      // Decide this pick now, then fill in the rest of the floor around it for the reveal.
      safe=Arcade.safePick(safeCount,doors,progress===0,stake);
      const others=Array.from({length:doors},(_,door)=>door).filter(door=>door!==choice);
      run.safeDoors[progress]=[...(safe?[choice]:[]),...uniqueDraw(others.length,safeCount-(safe?1:0)).map(k=>others[k])];
    }
    if(!safe){run.failed=choice;end(true);return}
    ArcadeSound.play('step',progress);run.steps.push(choice);
    if(run.steps.length===limit){end(false);return}
    save();tower(null,'Floor cleared.');
  }
  body.querySelectorAll('[data-door]:not(:disabled)').forEach(b=>b.onclick=()=>step(+b.dataset.door));
  $('#takePath').onclick=()=>end(false);
}
