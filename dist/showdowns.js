'use strict';
const gameArt = key => 'art/'+key+'.webp?v=6';
const moves = ['Rock','Paper','Scissors'];
function mintTable(){
  const faceButtons=['Heads','Tails'].map((face,i)=>'<button type="button" class="face-pick" id="pick'+face+'" aria-pressed="'+(!i)+'"><img alt="" src="'+gameArt(face.toLowerCase())+'"><span>'+face+'</span></button>').join('');
  const board='<div class="mint-bench"><div class="mint-ring"></div><div class="coin-shadow"></div><div class="coin-flight"><div class="coin-rotor"><img class="mint-heads" src="'+gameArt('heads')+'" alt=""><div class="coin-edge"></div><img class="mint-tails" src="'+gameArt('tails')+'" alt=""></div></div><div class="mint-label" id="faceLabel">Heads</div></div>';
  room('coinflip',board,'<div class="choice-title">Call the flip</div><div class="coin-choices">'+faceButtons+'</div>'+chanceMetric(50)+action('toss','Flip coin'),'Call heads or tails, then flip. A matching call returns 2× your bet. At full odds each face has a 50% chance.'+sizedRule('coinflip'));
  let call='Heads',angle=0;
  const flight=$('.coin-flight'),rotor=$('.coin-rotor'),shadow=$('.coin-shadow'),label=$('#faceLabel');
  function pose(degrees,rise,tilt){
    rotor.style.transform='rotateZ('+tilt+'deg) rotateX('+degrees+'deg)';
    flight.style.transform='translateY('+(-rise)+'px)';
    shadow.style.transform='scale('+(1-rise/210)+')';
    shadow.style.opacity=String(.6-rise/175);
  }
  for(const name of ['Heads','Tails'])$('#pick'+name).onclick=()=>{
    call=name;for(const side of ['Heads','Tails'])$('#pick'+side).setAttribute('aria-pressed',String(name===side));
    angle=call==='Heads'?0:180;pose(angle,0,-5);label.textContent=call;announce('');
  };
  pose(0,0,-5);
  $('#toss').onclick=()=>{
    if(!charge())return;
    const face=Arcade.coinFace(call,selectedStake()),ret=face===call?2*selectedStake():0;
    record('coinflip',ret,call+' / '+face);
    const start=angle,final=face==='Heads'?0:180;
    const travel=1080+((final-start+360)%360);
    label.textContent='Flipping…';announce('');
    // With motion reduced the coin does not fly, so it only gets a short ping.
    ArcadeSound.play(noMotion()?'coin':'cointoss');
    revealRound(1180,p=>{
      const arc=Math.sin(Math.PI*p),ease=1-(1-p)**1.45;
      pose(start+travel*ease,arc*49,-5+13*arc);
    },()=>{
      angle=final;pose(angle,0,-5);label.textContent=face;
      ArcadeSound.play('coinland');announce(face+' · '+(ret?'Correct call':'Miss')+' · '+ret+' credits returned.');
    });
  };
}
function duelTable(){
  const img=(key)=>gameArt(key.toLowerCase());
  const participant=(id,who)=>'<div class="contender '+id+'"><div class="contender-tag">'+who+'</div><div class="hand-window"><img alt="" src="'+img('Rock')+'"></div><span class="move-label">Ready</span></div>';
  const board='<div class="duel-tableau">'+participant('home','You')+'<div class="duel-beat">VS</div>'+participant('away','House')+'</div>';
  const buttons=moves.map((name,i)=>'<button class="throw-pick" id="gesture'+i+'"><img alt="" src="'+img(name)+'"><span>'+name+'</span></button>').join('');
  room('rps',board,'<div class="choice-title">Choose your throw</div><div class="throw-menu">'+buttons+'</div>'+chanceMetric(100/3),'Choose a gesture to start. Both hands reveal on the third beat. Rock beats scissors, paper beats rock, and scissors beats paper. A win returns 2× your bet. A tie returns your bet.'+sizedRule('rps'));
  const field=$('.duel-tableau'),beat=$('.duel-beat');
  function show(side,name,caption){const el=field.querySelector('.'+side);el.querySelector('img').src=img(name);el.querySelector('.move-label').textContent=caption}
  // Preload each full-size reveal while the player chooses.
  moves.forEach(name=>{const image=new Image();image.src=img(name)});
  const reasons=['Rock breaks scissors','Paper covers rock','Scissors cut paper'];
  moves.forEach((name,index)=>$('#gesture'+index).onclick=()=>{
    if(!charge())return;
    const opponent=Arcade.houseThrow(index,selectedStake()),diff=(index-opponent+3)%3,returned=selectedStake()*[1,2,0][diff];
    record('rps',returned,name+' / '+moves[opponent]);
    show('home','Rock','');show('away','Rock','');announce('');field.classList.remove('win','loss','even');
    let last=-1;
    revealRound(1050,p=>{
      const n=Math.min(3,Math.floor(p*3.6));
      if(n!==last){last=n;beat.textContent=n===3?'VS':String(3-n);if(n===3){show('home',name,name);show('away',moves[opponent],moves[opponent])}else if(!noMotion())ArcadeSound.play('tap')}
      const bob=n===3?0:Math.abs(Math.sin(p*3.6*Math.PI));field.style.setProperty('--bounce',(-bob*12)+'px');
    },()=>{
      field.classList.add(['even','win','loss'][diff]);beat.textContent='VS';ArcadeSound.settle(returned);
      const line=diff===0?'Same throw':reasons[diff===1?index:opponent];
      announce(line+' · '+['Tie','You win','House wins'][diff]+' · '+returned+' credits returned.');
    });
  });
}
