'use strict';
// Profit tracker: a draggable panel inside the page. It is part of this tab,
// so it stays behind when the player switches to another tab or window.

// Draws the running profit as a line: green above zero, fading to red below it.
function liveChartSvg(series,width=268,height=150){
  const pad=12,left=24,right=width-8;
  let low=Math.min(0,...series),high=Math.max(0,...series);
  if(low===high){low=-1;high=1}
  const y=v=>pad+(high-v)/(high-low)*(height-2*pad);
  const x=i=>left+(series.length>1?i/(series.length-1):0)*(right-left);
  const round=n=>Math.round(n*10)/10,zero=round(y(0)),at=(high-0)/(high-low);
  const stop=(offset,colour)=>'<stop offset="'+Math.min(1,Math.max(0,offset)).toFixed(3)+'" stop-color="'+colour+'"/>';
  const points=series.map((v,i)=>round(x(i))+','+round(y(v))).join(' ');
  return '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Profit over '+(series.length-1)+' rounds"><defs><linearGradient id="liveLine" gradientUnits="userSpaceOnUse" x1="0" y1="'+pad+'" x2="0" y2="'+(height-pad)+'">'+
    stop(at,'#5fe08a')+stop(at+.02,'#9bd66a')+stop(at+.4,'#e58a4e')+stop(at+.75,'#f0566f')+'</linearGradient></defs>'+
    '<line x1="'+left+'" x2="'+right+'" y1="'+zero+'" y2="'+zero+'" class="live-zero"/><text x="'+(left-8)+'" y="'+(zero+4)+'" text-anchor="end" class="live-axis">0</text>'+
    (series.length>1?'<polyline points="'+points+'" fill="none" stroke="url(#liveLine)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>':'')+'</svg>';
}

if(typeof document!=='undefined')(()=>{
  const PREF='driftlobby.stats.v1',EDGE=8;
  const pref={open:false,x:null,y:null};
  try{Object.assign(pref,JSON.parse(localStorage.getItem(PREF)))}catch{}
  const remember=()=>{try{localStorage.setItem(PREF,JSON.stringify(pref))}catch{}};

  const el=document.createElement('aside');
  el.id='liveStats';el.className='live-stats';el.hidden=true;
  el.setAttribute('aria-label','Profit tracker');
  // A popover sits above the game window, so the panel stays usable during a round.
  const layered=typeof el.showPopover==='function';
  if(layered)el.setAttribute('popover','manual');
  const stat=(label,id,tone='')=>'<div><span>'+label+'</span><b id="'+id+'" class="'+tone+'"></b></div>';
  el.innerHTML='<header class="live-head"><button type="button" id="liveReset" aria-label="Reset live stats" title="Reset">'+svg('reset')+'</button><h2>Live stats</h2><button type="button" id="liveClose" aria-label="Close profit tracker" title="Close">'+svg('x')+'</button></header>'+
    '<div class="live-body"><div class="live-totals">'+stat('Wagered','liveWagered')+stat('Profit','liveProfit')+'</div><div id="liveChart" class="live-chart"></div><p id="liveHint" class="live-hint"></p><div class="live-record">'+stat('Wins','liveWins','gain')+stat('Losses','liveLosses','loss')+'</div></div>';
  const head=el.querySelector('.live-head'),find=id=>el.querySelector('#'+id);
  const shown=()=>{try{return el.matches(':popover-open')}catch{return !el.hidden}};

  function place(x,y){
    const maxX=Math.max(EDGE,innerWidth-el.offsetWidth-EDGE),maxY=Math.max(EDGE,innerHeight-el.offsetHeight-EDGE);
    pref.x=Math.round(Math.min(maxX,Math.max(EDGE,x??maxX-EDGE)));
    pref.y=Math.round(Math.min(maxY,Math.max(EDGE,y??maxY-EDGE)));
    el.style.left=pref.x+'px';el.style.top=pref.y+'px';
  }
  // While a game window is open the panel has to live inside it to stay clickable.
  function mount(){
    const home=dlg.open?dlg:document.body;
    if(el.parentNode!==home)home.append(el);
    el.hidden=false;
    if(layered&&!shown())el.showPopover();
    place(pref.x,pref.y);
  }
  function render(){
    if(!pref.open)return;
    const p=player(),s=liveStats(p),coin=svg('coin');
    find('liveWagered').innerHTML=fmt(s.wagered)+coin;
    find('liveProfit').innerHTML=signed(s.profit)+coin;
    find('liveProfit').className=s.profit<0?'loss':s.profit>0?'gain':'';
    find('liveWins').textContent=fmt(s.wins);
    find('liveLosses').textContent=fmt(s.losses);
    find('liveChart').innerHTML=liveChartSvg(s.series);
    find('liveHint').textContent=s.series.length>1?(db.players.length>1?p.name:''):'Play a round to start the chart.';
  }
  function open(){pref.open=true;mount();render();remember()}
  function close(){
    pref.open=false;
    if(layered&&shown())el.hidePopover();
    el.hidden=true;remember();
  }

  let grip=null;
  head.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    const box=el.getBoundingClientRect();
    grip={x:e.clientX-box.left,y:e.clientY-box.top};
    head.setPointerCapture(e.pointerId);el.classList.add('dragging');e.preventDefault();
  });
  head.addEventListener('pointermove',e=>{if(grip)place(e.clientX-grip.x,e.clientY-grip.y)});
  for(const type of ['pointerup','pointercancel'])head.addEventListener(type,()=>{
    if(!grip)return;
    grip=null;el.classList.remove('dragging');remember();
  });
  window.addEventListener('resize',()=>{if(pref.open)place(pref.x,pref.y)});

  find('liveClose').onclick=close;
  find('liveReset').onclick=()=>{resetLiveStats(player());save()};
  document.addEventListener('click',e=>{if(e.target.closest('[data-profit]'))pref.open?close():open()});
  new MutationObserver(()=>{if(pref.open)mount()}).observe(dlg,{attributes:true,attributeFilter:['open']});
  liveStatsChanged=render;
  if(pref.open)open();
})();
