'use strict';
const ArcadeSound = (() => {
  const key='nightshift.preferences.v1';
  let saved={};
  try { saved=JSON.parse(localStorage.getItem(key))||{} } catch {}
  const preferences={
    sound:saved.sound!==false,
    volume:Number.isFinite(saved.volume)?Math.min(100,Math.max(0,saved.volume)):45,
    reducedMotion:saved.reducedMotion===true
  };
  let ctx,master,noise;
  const lastPlayed=new Map();
  function apply(){
    document.documentElement.classList.toggle('less-motion',preferences.reducedMotion);
    if(master)master.gain.setTargetAtTime(preferences.sound?(preferences.volume/100)**1.35*.46:0,ctx.currentTime,.012);
  }
  function set(name,value){preferences[name]=value;apply();try{localStorage.setItem(key,JSON.stringify(preferences))}catch{}}
  function unlock(){
    if(!preferences.sound || !preferences.volume)return;
    try{
      if(!ctx){
        const Audio=window.AudioContext||window.webkitAudioContext;
        if(!Audio)return;
        ctx=new Audio();master=ctx.createGain();master.connect(ctx.destination);apply();
        noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.34),ctx.sampleRate);
        const data=noise.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      }
      if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    }catch{}
  }
  function voice(start,duration,from,to,volume,wave='sine'){
    const source=ctx.createOscillator(),gain=ctx.createGain();
    source.type=wave;source.frequency.setValueAtTime(from,start);
    source.frequency.exponentialRampToValueAtTime(to,start+duration);
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.006);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(gain);gain.connect(master);source.start(start);source.stop(start+duration+.01);
    source.onended=()=>{source.disconnect();gain.disconnect()};
  }
  function rustle(start,duration,freq,peak){
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=noise;filter.type='bandpass';filter.frequency.setValueAtTime(freq,start);
    filter.frequency.exponentialRampToValueAtTime(freq*.52,start+duration);filter.Q.value=.85;
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(peak,start+.009);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(filter);filter.connect(gain);gain.connect(master);source.start(start);source.stop(start+duration);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
  }
  // Struck metal: a handful of clashing high tones that ring and die away, the higher ones first.
  // flutter (beats per second) adds the "wub-wub" a coin makes while it spins in the air.
  function chime(start,duration,partials,volume,flutter=0){
    const out=ctx.createGain(),nodes=[out];
    // Sharp attack, then each tone fades at its own pace below; this only closes the sound cleanly at the end.
    out.gain.setValueAtTime(0,start);out.gain.linearRampToValueAtTime(volume,start+.003);
    out.gain.setValueAtTime(volume,start+duration*.8);out.gain.linearRampToValueAtTime(0,start+duration);
    let into=out;
    if(flutter){
      const wobble=ctx.createGain(),beat=ctx.createOscillator(),depth=ctx.createGain();
      wobble.gain.value=.55;depth.gain.value=.45;
      beat.frequency.setValueAtTime(flutter,start);beat.frequency.exponentialRampToValueAtTime(flutter*.5,start+duration);
      beat.connect(depth);depth.connect(wobble.gain);wobble.connect(out);
      beat.start(start);beat.stop(start+duration+.02);
      into=wobble;nodes.push(wobble,beat,depth);
    }
    partials.forEach(([freq,level],i)=>{
      const tone=ctx.createOscillator(),gain=ctx.createGain();
      tone.frequency.setValueAtTime(freq,start);
      gain.gain.setValueAtTime(level,start);gain.gain.setTargetAtTime(0,start,duration/(2.2+i*.9));
      tone.connect(gain);gain.connect(into);tone.start(start);tone.stop(start+duration+.02);
      nodes.push(tone,gain);
      if(i===0)tone.onended=()=>nodes.forEach(node=>node.disconnect());
    });
    out.connect(master);
  }
  function play(cue,index=0,delay=0) {
    if(!preferences.sound||!preferences.volume||document.hidden)return;
    unlock();if(!ctx||!master||!noise)return;
    const t=ctx.currentTime+delay+.008;
    if(['wheel','peg','gem'].includes(cue)){
      if(t-(lastPlayed.get(cue)??-1)<.043)return;
      lastPlayed.set(cue,t);
    }
    switch(cue){
      case 'card': case 'flip':
        rustle(t,.105,cue==='flip'?3500:2550,.60);voice(t+.054,.065,170,70,.12,'triangle');break;
      case 'wheel': rustle(t,.024,3100,.45);voice(t,.038,750,280,.13,'triangle');break;
      case 'peg': {const f=420*2**((index%8)/12);voice(t,.10,f*1.6,f,.19);break}
      case 'gem': case 'step': {const f=400*2**((index%12)/12);voice(t,.15,f,f,.23);voice(t+.04,.13,f*1.5,f*1.48,.12);break}
      case 'collect': [440,554,660].forEach((f,i)=>voice(t+i*.067,.19,f,f,.23));break;
      case 'land': case 'thud': voice(t,.22,120,48,.42);rustle(t,.072,600,.18);break;
      case 'roll': [0,.054,.115,.202].forEach((d,i)=>rustle(t+d,.034,1750+i*270,.42));break;
      case 'launch': voice(t,.33,125,380,.23,'triangle');break;
      case 'coin': voice(t,.19,1320,1210,.19);voice(t+.065,.20,1800,1650,.09);break;
      case 'mention': voice(t,.12,880,880,.2);voice(t+.09,.17,1175,1175,.16);break;
      // Coin flicked off the thumb: a nail click, a bright ring, then the ring fluttering as the coin spins.
      case 'cointoss':
        rustle(t,.028,5200,.32);
        chime(t,.36,[[4180,.5],[5630,.34],[7120,.22],[9460,.12]],.24);
        chime(t+.03,1.1,[[4180,.5],[4212,.42],[6240,.25],[8350,.14]],.26,24);
        break;
      // A coin still spinning in the air, for flips that stay up longer.
      case 'coinspin': chime(t,1.5,[[4180,.5],[4212,.42],[6240,.25],[8350,.14]],.2,22);break;
      // Coin landing: a clank, then quicker and quieter bounces as it settles flat.
      case 'coinland':
        voice(t,.09,190,90,.2);
        [[0,.34],[.085,.2],[.15,.13],[.2,.08],[.238,.05]].forEach(([wait,level],i)=>{
          chime(t+wait,.11,[[2350+i*90,.6],[3720+i*40,.4],[5480,.25]],level);
          rustle(t+wait,.02,4200,level*.9);
        });
        break;
      default: voice(t,.060,530,260,.15,'triangle');
    }
  }
  function settle(returned,cost=10){
    play(returned>cost?'collect':returned===cost?'land':'thud');
  }
  function entry(game){
    const cues={dice:'roll',limbo:'launch',plinko:'tap',war:'card',baccarat:'card',hilo:'card',keno:'tap'};
    // Blackjack and Coinflip play their own sounds in time with the cards and the coin.
    if(game!=='blackjack'&&game!=='coinflip')play(cues[game]||'tap');
  }
  document.addEventListener('pointerdown',unlock,{capture:true,passive:true});
  document.addEventListener('keydown',unlock,{capture:true});
  apply();
  return {preferences,set,play,entry,settle,available:()=>Boolean(window.AudioContext||window.webkitAudioContext)};
})();
