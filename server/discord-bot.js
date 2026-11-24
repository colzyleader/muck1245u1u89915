'use strict';
// DriftLobby's Discord bot: the arcade's games as commands, played with free play credits.
// It has no dependencies. It listens on Discord's gateway with Node's built-in WebSocket (Node 22 or
// newer) and answers through Discord's REST API. Run `node server/discord-bot.js` with
// DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID in server/.env. Only one copy may run at a time.
//
// Commands work as `$coinflip 50 heads` (needs the Message Content intent switched on for the bot in
// the Developer Portal) and as slash commands. The games use the website's own engine
// (dist/engine.js), so the odds are the same in both places, including the bet-size odds, which
// every game message and the how-to-play guide state.
// Balances are kept by the bot in server/bot-data.json. They are separate from the website's
// balances, which live in each player's browser. Credits are free and have no cash value: there is
// no deposit, purchase, withdraw or cash-out here, and none should be added.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCardArt}=require('./card-images.js');

const START=1000, REFILL_UNDER=10;
const IDLE=10*60_000, FLIP_TTL=10*60_000, FLIP_CLEAR=20*60_000, MAX_BET=1_000_000, MAX_FACTOR=100_000;
const COLORS={win:0x5fe08a,loss:0xff6b6b,even:0xb9b3bf,brand:0xb395ff,gold:0xffd27e};
const SUITS=['♠','♥','♦','♣'], THROWS=['🪨 Rock','📄 Paper','✂️ Scissors'];
const MINE_CELLS=20, TOWER_FLOORS=7;
// Gateway intents for `$` commands: server messages, direct messages, and message text.
const MESSAGE_INTENTS=(1<<9)|(1<<12)|(1<<15);
// Roles a server gets from the setup command. Ranks follow the total a player has bet (only the
// highest is kept); the two high-roller roles follow the biggest single bet and are both kept.
// Nothing rewards a bet over 1,500, which cannot win in the bet-sized games.
const RANKS=[
  {key:'bronze',name:'🥉 Bronze',at:1_000,color:0xcd7f32},{key:'silver',name:'🥈 Silver',at:5_000,color:0xc0c7d1},
  {key:'gold',name:'🥇 Gold',at:25_000,color:0xffc83d},{key:'platinum',name:'💠 Platinum',at:100_000,color:0x6fe3d0},
  {key:'diamond',name:'💎 Diamond',at:500_000,color:0x5cc8ff},{key:'legend',name:'👑 Legend',at:2_000_000,color:0xff5fa2}];
const ROLLERS=[{key:'roller',name:'🎩 High Roller',bet:500,color:0xa77bff},{key:'whale',name:'🐋 Whale',bet:1_000,color:0x3fa7ff}];
const ADMIN_USER_ID='1070154044779266118';
const PERMS={admin:8n,manageChannels:16n,manageGuild:32n,view:1024n,send:2048n,embed:16384n,attach:32768n,history:65536n,manageRoles:268435456n};
const BOT_PERMISSIONS=PERMS.manageChannels|PERMS.view|PERMS.send|PERMS.embed|PERMS.attach|PERMS.history|PERMS.manageRoles;
const ALIASES={bj:'blackjack',cf:'coinflip',coin:'coinflip',hl:'hilo',bal:'balance',lb:'leaderboard',top:'leaderboard',
  r:'roulette',w:'wheel',d:'dice',duel:'flip',pf:'flip',stats:'profile',give:'tip',commands:'help',games:'guide',howto:'guide',how:'guide',setup:'server',rank:'ranks',roles:'ranks'};

// The website's engine and tables, read from dist/ so the bot can never drift from the site.
function loadSite(dist=path.join(__dirname,'..','dist')){
  const read=name=>fs.readFileSync(path.join(dist,name),'utf8');
  return vm.runInNewContext(read('engine.js')+read('floor.js')+';({Arcade,wheelSlots,towerModes,reds:[...reds]})',{crypto:globalThis.crypto,tableGames:{}});
}

// Balances, stakes in play, each server's role list and the finished flip messages waiting to be
// cleared away, saved to one JSON file.
function createStore(file){
  let data={players:{},held:{},guilds:{},cleanup:[]},timer=null;
  if(file){
    try{
      const saved=JSON.parse(fs.readFileSync(file,'utf8'));
      if(saved&&typeof saved.players==='object'&&saved.players)data={players:saved.players,held:saved.held||{},guilds:saved.guilds||{},cleanup:Array.isArray(saved.cleanup)?saved.cleanup:[]};
    }catch{}
  }
  const write=()=>{
    timer=null;
    if(!file)return;
    try{fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file)}catch(error){console.error('Could not save balances: '+error.message)}
  };
  return {
    data,
    save(){if(file&&!timer){timer=setTimeout(write,150);timer.unref?.()}},
    flush(){if(timer)clearTimeout(timer);write()}
  };
}

const fmt=n=>n.toLocaleString('en-US',Number.isInteger(n)?undefined:{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=value=>String(+value.toFixed(value<10?2:1))+'%';
const who=user=>user.global_name||user.username||'Player';
const row=(...buttons)=>({type:1,components:buttons});
const button=(id,label,style=2,disabled=false,emoji=null)=>({type:2,style,custom_id:id,disabled,...(label?{label}:{}),...(emoji?{emoji:{name:emoji}}:{})});
function attach(reply,files){
  reply.data.attachments=files.map((file,index)=>({id:index,filename:file.name}));
  if(files.length)reply.files=files;
  return reply;
}
const say=(embed,components=[],files=[])=>attach({type:4,data:{embeds:[embed],components,allowed_mentions:{parse:[]}}},files);
const update=(embed,components=[],files=[])=>attach({type:7,data:{embeds:[embed],components,allowed_mentions:{parse:[]}}},files);
const whisper=text=>({type:4,data:{content:text,flags:64,allowed_mentions:{parse:[]}}});
const betOption={type:4,name:'bet',description:'Credits to bet',required:true,min_value:1,max_value:MAX_BET};
const choices=list=>list.map(item=>Array.isArray(item)?{name:item[0],value:item[1]}:{name:String(item),value:item});
const rankIndex=wagered=>{let index=-1;RANKS.forEach((rank,i)=>{if(wagered>=rank.at)index=i});return index};

function createBot({token='',appId='',api='https://discord.com/api/v10',gateway='wss://gateway.discord.gg',guildId='',siteUrl='',prefix='$',
  storeFile='',fetchImpl=globalThis.fetch,WebSocketImpl=globalThis.WebSocket,log=console,flipDelay=3000,now=Date.now,pictures=true,lock:useLock=true,arcadeEnabled=true}={}){
  const {Arcade,wheelSlots,towerModes,reds}=loadSite();
  const credit=Arcade.credit,redSet=new Set(reds);
  const store=createStore(storeFile),data=store.data;
  // A stake that was still in play when the bot last stopped goes back to its player.
  for(const [key,held] of Object.entries(data.held)){
    const owner=data.players[held.id];
    if(owner)owner.credits=credit(owner.credits+held.amount);
    delete data.held[key];
  }
  store.save();

  const rounds=new Map(),flips=new Map(),pending=new Map();
  let flipCount=0,botId=appId;

  function player(user){
    const p=data.players[user.id]??={credits:START,wagered:0,returned:0,rounds:0,wins:0,best:0,topBet:0};
    p.name=who(user);
    return p;
  }
  // Records a finished round. The stake has already left the balance by now.
  function tally(p,cost,returned){
    p.credits=credit(p.credits+returned);p.wagered=credit(p.wagered+cost);p.returned=credit(p.returned+returned);p.rounds++;
    p.topBet=Math.max(p.topBet||0,cost);
    if(returned>cost){p.wins++;p.best=Math.max(p.best,credit(returned-cost))}
    store.save();
  }
  const coins=n=>'**'+fmt(n)+'** 🪙';
  const tone=(cost,returned)=>returned>cost?COLORS.win:returned===cost?COLORS.even:COLORS.loss;
  function resultLine(p,cost,returned){
    const net=credit(returned-cost);
    return (net>0?'🟢 Won **+'+fmt(net)+'**':net===0?'⚪ Bet returned':returned>0?'🟠 **'+fmt(returned)+'** back ('+fmt(net)+')':'🔴 Lost **'+fmt(cost)+'**')+' · Balance '+coins(p.credits);
  }
  const card=(user,title,color,lines,footer)=>({author:{name:who(user)},title,color,description:lines.filter(line=>line!=null).join('\n'),...(footer?{footer:{text:footer}}:{})});
  // What the size of the bet does to the chance, for the games where it counts. `normal` is the
  // game's chance in percent before the bet is taken into account.
  function sizedFooter(bet,normal){
    const share=Arcade.share(bet);
    if(share===0)return 'Bets over 1,500 cannot win';
    return 'Win chance at this bet: '+pct(normal*share)+(share<1?' ('+pct(share*100)+' of normal)':'')+' · Wins pay in full';
  }
  function pickFooter(bet,first){
    const share=Arcade.share(bet);
    if(share===0)return 'Bets over 1,500 cannot win: the house takes the '+first;
    return (share<1?'At this bet the '+first+' has '+pct(share*100)+' of its normal chance':'Full odds at this bet')+' · Wins pay in full';
  }
  const flatFooter='Same odds at any bet';
  const faces=list=>list.map(c=>'`'+Arcade.rankLabel(Arcade.rank(c))+SUITS[Arcade.suit(c)]+'`').join(' ');
  const sample=(list,count)=>{const pool=[...list],out=[];while(out.length<count&&pool.length)out.push(pool.splice(Arcade.random(pool.length),1)[0]);return out};

  // ---------- Pictures ----------
  // Card tables are drawn from the bot's own card sheet; other games show the website's artwork.
  const cardArt=pictures?createCardArt():null,artFiles=new Map();
  function gameArt(name){
    if(!pictures)return null;
    if(!artFiles.has(name)){
      let file=null;
      try{file={name:name+'.webp',data:fs.readFileSync(path.join(__dirname,'..','dist','art',name+'.webp')),type:'image/webp'}}catch{}
      artFiles.set(name,file);
    }
    return artFiles.get(name);
  }
  function thumb(embed,files,name){
    const file=gameArt(name);
    if(file){embed.thumbnail={url:'attachment://'+file.name};files.push(file)}
  }
  // Adds a picture of the cards to the message. Returns false when there is no card sheet, and the
  // caller writes the cards as text instead.
  function tablePicture(embed,files,groups,sideBySide=false){
    if(!cardArt)return false;
    files.push({name:'table.png',data:cardArt.table(groups,sideBySide),type:'image/png'});
    embed.image={url:'attachment://table.png'};
    return true;
  }
  // "Play again" under a finished game: the same command with the same options, for the same player.
  function againRow(ctx){
    const query=new URLSearchParams(Object.entries(ctx.opts).filter(([key])=>key!=='_sub').map(([key,value])=>[key,String(value)])).toString();
    const id='a:'+ctx.id+':'+ctx.name+':'+query;
    return id.length<=100?[row(button(id,'Play again · '+fmt(ctx.opts.bet),2,false,'🔁'))]:[];
  }

  // ---------- Games that finish in one message ----------
  function instant(ctx,title,returned,lines,footer,art={}){
    const {p,user}=ctx,stake=ctx.opts.bet;
    if(!arcadeEnabled){
      const outcome=['wheel','plinko'].includes(ctx.name)?'':returned===0?'You lost.':
        returned===stake&&['war','rps'].includes(ctx.name)?'Draw.':'You won!';
      const embed=card(user,title,tone(stake,returned),[...lines,outcome].filter(Boolean)),files=[];
      if(art.thumb)thumb(embed,files,art.thumb);
      if(art.groups&&!tablePicture(embed,files,art.groups,true))embed.description=art.text+'\n'+embed.description;
      return say(embed,[],files);
    }
    p.credits=credit(p.credits-stake);tally(p,stake,returned);
    const embed=card(user,title,tone(stake,returned),[...lines,'',resultLine(p,stake,returned)],footer),files=[];
    if(art.thumb)thumb(embed,files,art.thumb);
    if(art.groups&&!tablePicture(embed,files,art.groups,true))embed.description=art.text+'\n'+embed.description;
    return say(embed,againRow(ctx),files);
  }
  const commands={};
  commands.coinflip={sized:true,description:'Call heads or tails for 2×. Bigger bets win less often: see /guide.',
    options:[betOption,{type:3,name:'side',description:'Your call',required:true,choices:choices(['Heads','Tails'])}],
    run(ctx){
      const {bet,side}=ctx.opts,face=Arcade.coinFace(side,bet);
      return instant(ctx,'🪙 Coinflip',face===side?2*bet:0,['The coin shows **'+face+'**. You called '+side+'.'],sizedFooter(bet,50),{thumb:face.toLowerCase()});
    }};
  commands.dice={sized:true,description:'Roll 0–100 under or over a target. Bigger bets win less often: see /guide.',
    options:[betOption,{type:3,name:'direction',description:'Win when the roll is under or over the target',required:true,choices:choices([['Under','under'],['Over','over']])},
      {type:4,name:'target',description:'Target from 2 to 98 (50 if left out)',min_value:2,max_value:98}],
    run(ctx){
      const {bet,direction}=ctx.opts,target=ctx.opts.target??50,odds=Arcade.diceOdds(direction,target,bet),roll=Arcade.diceRoll(direction,target,bet);
      const won=direction==='under'?roll<target:roll>target;
      // A strip from 0 to 100 with the winning side lit and a marker where the roll landed.
      const at=Math.min(19,Math.floor(roll/5)),bar=Array.from({length:20},(_,cell)=>cell===at?'🔘':(direction==='under'?cell*5<target:cell*5>=target)?'🟩':'⬛').join('');
      return instant(ctx,'🎲 Dice',won?odds.returned:0,['Rolled **'+roll.toFixed(2)+'** · you needed '+direction+' '+target+'.',bar,arcadeEnabled?'A win here returns '+fmt(odds.returned)+'.':null],sizedFooter(bet,odds.fair),{thumb:'dice'});
    }};
  commands.limbo={sized:true,description:'Pick a target multiplier and hope the rocket reaches it. Bigger bets win less often: /guide.',
    options:[betOption,{type:10,name:'target',description:'Target multiplier (2× if left out)',choices:[1.5,2,3,5,10,25,50,100].map(v=>({name:v+'×',value:v}))}],
    run(ctx){
      const bet=ctx.opts.bet,target=ctx.opts.target??2,reached=Arcade.limboRound(target,bet);
      return instant(ctx,'🚀 Limbo',reached>=target?credit(bet*target):0,['Reached **'+reached.toFixed(2)+'×** · your target was '+target+'×.'],sizedFooter(bet,100/target),{thumb:'limbo'});
    }};
  commands.wheel={sized:true,description:'Spin a 12-segment wheel for up to 4×. Bigger bets win less often: see /guide.',options:[betOption],
    run(ctx){
      const bet=ctx.opts.bet,stop=Arcade.wheelStop(wheelSlots,bet),multiple=wheelSlots[stop];
      const strip=Array.from(wheelSlots,(value,index)=>index===stop?'**['+value+'×]**':value+'×').join(' ');
      return instant(ctx,'🎡 Wheel',credit(bet*multiple),['Stopped on **'+multiple+'×**',strip],sizedFooter(bet,25).replace('Win chance','Chance of 2× or more'),{thumb:'wheel'});
    }};
  commands.war={sized:true,description:'High card wins 2×, a tie returns your bet. Bigger bets win less often: see /guide.',options:[betOption],
    run(ctx){
      const bet=ctx.opts.bet,[mine,house]=Arcade.warDraw(bet),high=c=>Arcade.rank(c)===1?14:Arcade.rank(c);
      const returned=high(mine)>high(house)?2*bet:high(mine)===high(house)?bet:0;
      return instant(ctx,'⚔️ War',returned,[high(mine)>high(house)?'Your card is higher.':high(mine)===high(house)?'Equal ranks: a tie.':'The house card is higher.'],sizedFooter(bet,800/17),
        {groups:[{label:'YOU',cards:[mine]},{label:'HOUSE',cards:[house]}],text:'You '+faces([mine])+'  vs  '+faces([house])+' House'});
    }};
  commands.rps={sized:true,description:'Rock, paper, scissors against the house for 2×. Bigger bets win less often: see /guide.',
    options:[betOption,{type:4,name:'throw',description:'Your throw',required:true,choices:choices([['Rock',0],['Paper',1],['Scissors',2]])}],
    run(ctx){
      const bet=ctx.opts.bet,mine=ctx.opts.throw,house=Arcade.houseThrow(mine,bet),result=(mine-house+3)%3;
      return instant(ctx,'✊ Rock Paper Scissors',bet*[1,2,0][result],['You '+THROWS[mine]+'  vs  '+THROWS[house]+' House',['A tie.','You win the throw.','The house wins the throw.'][result]],sizedFooter(bet,100/3),{thumb:['rock','paper','scissors'][house]});
    }};
  commands.roulette={description:'Single-zero roulette: red, black, odd, even (2×) or one number (36×).',
    options:[betOption,{type:3,name:'pick',description:'What to bet on',required:true,choices:choices(['Red','Black','Odd','Even','Number'])},
      {type:4,name:'number',description:'The number, when you pick Number (0 to 36)',min_value:0,max_value:36}],
    run(ctx){
      const {bet,pick}=ctx.opts,straight=pick==='Number';
      if(straight&&ctx.opts.number==null)return whisper('Add the number (0 to 36) when you pick Number, for example `'+prefix+'roulette '+(arcadeEnabled?'50 ':'')+'number 17`.');
      const n=Arcade.random(37),red=redSet.has(n);
      const won=straight?n===ctx.opts.number:n!==0&&{Red:red,Black:!red,Odd:n%2===1,Even:n%2===0}[pick];
      return instant(ctx,'🎰 Roulette',won?bet*(straight?36:2):0,['The ball lands on '+(n===0?'🟢':red?'🔴':'⚫')+' **'+n+'**',(arcadeEnabled?'You bet on ':'You picked ')+(straight?'number '+ctx.opts.number:pick)+'.'],flatFooter,{thumb:'roulette'});
    }};
  commands.plinko={description:'Drop a ball through the pegs. The slot it lands in sets the return.',
    options:[betOption,{type:4,name:'rows',description:'Peg rows (12 if left out)',choices:choices([8,12,16])},{type:3,name:'risk',description:'Board risk (Medium if left out)',choices:choices(['Low','Medium','High'])}],
    run(ctx){
      const bet=ctx.opts.bet,rows=ctx.opts.rows??12,risk=ctx.opts.risk??'Medium',bins=Arcade.slots(rows,risk);
      let slot=0,trail='';
      for(let peg=0;peg<rows;peg++){const right=Arcade.random(2);slot+=right;trail+=right?'↘':'↙'}
      return instant(ctx,'📍 Plinko',credit(bet*bins[slot]),[trail,'Slot '+(slot+1)+' of '+bins.length+' · **'+bins[slot]+'×**'],rows+' rows · '+risk+' risk · '+flatFooter,{thumb:'plinko'});
    }};

  // ---------- Games played with buttons ----------
  // One round at a time per player. The stake is noted in `held` so a restart gives it back.
  function openRound(ctx,game,state){
    const {p,id}=ctx,stake=ctx.opts.bet;
    p.credits=credit(p.credits-stake);data.held['round:'+id]={id,amount:stake};
    const round={game,stake,state,id,at:now(),nonce:(now()%2176782336).toString(36)+Arcade.random(1296).toString(36),again:againRow(ctx)};
    rounds.set(id,round);store.save();
    return round;
  }
  function closeRound(round,p,returned,cost=round.stake){rounds.delete(round.id);delete data.held['round:'+round.id];tally(p,cost,returned)}
  const rid=(round,action,arg='')=>'r:'+round.id+':'+round.nonce+':'+action+(arg===''?'':':'+arg);
  const tables={};

  tables.blackjack={
    title:'🃏 Blackjack',
    act(round,action,arg,p){
      const extra=Arcade.play(round.state,action,p.credits);
      if(extra==null)return 'That move is not available now.';
      p.credits=credit(p.credits-extra);data.held['round:'+round.id].amount+=extra;
    },
    stop(round){while(!round.state.finished)Arcade.play(round.state,'stand',0)},
    played:()=>true,
    show(round,user,p){
      const t=round.state,done=t.finished,split=t.hands.length>1,files=[];
      const groups=[{label:'DEALER',cards:t.dealer.length===1?[t.dealer[0],-1]:t.dealer},...t.hands.map((hand,index)=>({label:split?'HAND '+(index+1):'YOU',cards:hand.cards}))];
      const embed=card(user,this.title,COLORS.brand,[]),drawn=tablePicture(embed,files,groups);
      const text=list=>drawn?'':faces(list)+' · ';
      const lines=['**Dealer** · '+text(t.dealer)+(done?Arcade.total(t.dealer):'showing '+Arcade.total([t.dealer[0]])+(drawn?'':' `??`'))];
      t.hands.forEach((hand,index)=>lines.push((split?(!done&&index===t.index?'▶ ':'')+'**Hand '+(index+1)+'** · ':'**You** · ')+text(hand.cards)+Arcade.total(hand.cards)+(hand.outcome?' · **'+hand.outcome+'**':'')+(split||hand.cost!==round.stake?' · bet '+fmt(hand.cost):'')));
      if(!done){
        const moves=Arcade.options(t,p.credits),look={hit:['Hit',3,'🃏'],stand:['Stand',4,'✋'],double:['Double',1,'💰'],split:['Split',2,'✂️']};
        embed.description=[...lines,'','Bet '+coins(round.stake)].join('\n');
        embed.footer={text:'A natural pays 3 to 2 · dealer stands on 17 · '+flatFooter};
        return [embed,[row(...moves.map(move=>button(rid(round,move),look[move][0],look[move][1],false,look[move][2])))],files];
      }
      const cost=t.hands.reduce((sum,hand)=>sum+hand.cost,0),returned=t.hands.reduce((sum,hand)=>sum+hand.returned,0);
      if(rounds.get(round.id)===round)closeRound(round,p,returned,cost);
      embed.color=tone(cost,returned);embed.description=[...lines,'',resultLine(p,cost,returned)].join('\n');embed.footer={text:flatFooter};
      return [embed,round.again,files];
    }};

  const minesValue=round=>Math.floor(round.stake*Math.min(MAX_FACTOR,Arcade.mineMultiplier(round.state.open.length,round.state.count,MINE_CELLS))+1e-8);
  tables.mines={
    title:'💎 Mines',
    end(round){
      const m=round.state;m.done=true;
      // The round is over, so lay out the mines for the reveal: the one just hit plus the rest over the unturned tiles.
      const rest=Array.from({length:MINE_CELLS},(_,cell)=>cell).filter(cell=>!m.open.includes(cell)&&cell!==m.hit);
      m.hazards=[...(m.lost?[m.hit]:[]),...sample(rest,m.count-(m.lost?1:0))];
    },
    act(round,action,arg){
      const m=round.state;
      if(action==='collect'){if(!m.open.length)return 'Turn over a tile first.';this.end(round);return}
      const cell=Number(arg);
      if(!Number.isInteger(cell)||cell<0||cell>=MINE_CELLS||m.open.includes(cell))return 'Pick a tile that is still face down.';
      // Each tile is decided when it is turned over; nothing about the board is stored before that.
      const closed=MINE_CELLS-m.open.length;
      if(!Arcade.safePick(closed-m.count,closed,!m.open.length,round.stake)){m.lost=true;m.hit=cell;this.end(round);return}
      m.open.push(cell);
      if(m.open.length===MINE_CELLS-m.count||Arcade.mineMultiplier(m.open.length,m.count,MINE_CELLS)>=MAX_FACTOR)this.end(round);
    },
    stop(round){this.end(round)},
    played:round=>round.state.open.length>0,
    show(round,user,p){
      const m=round.state,value=m.open.length?minesValue(round):0,closed=MINE_CELLS-m.open.length,files=[];
      const grid=[0,1,2,3].map(line=>row(...[0,1,2,3,4].map(col=>{
        const cell=line*5+col,id=rid(round,'pick',cell);
        if(m.open.includes(cell))return button(id,'',3,true,'💎');
        if(m.done)return m.hit===cell?button(id,'',4,true,'💥'):m.hazards.includes(cell)?button(id,'',2,true,'💣'):button(id,'',2,true,'🔹');
        return button(id,'',1,false,'❔');
      })));
      const head='Mines **'+m.count+'** · Gems found **'+m.open.length+'** · Multiplier **'+Arcade.mineMultiplier(m.open.length,m.count,MINE_CELLS).toFixed(2)+'×**';
      const footer=pickFooter(round.stake,'first tile');
      if(!m.done){
        const safe=(closed-m.count)/closed*100*(m.open.length?1:Arcade.share(round.stake));
        const embed=card(user,this.title,COLORS.brand,[head,'Next tile safe: **'+pct(safe)+'** · Bet '+coins(round.stake)],footer);
        thumb(embed,files,'mines');
        return [embed,[...grid,row(button(rid(round,'collect'),'Cash out '+fmt(value),3,!m.open.length,'💰'))],files];
      }
      const returned=m.lost?0:value;
      if(rounds.get(round.id)===round)closeRound(round,p,returned);
      const embed=card(user,this.title,tone(round.stake,returned),[head,m.lost?'💥 You hit a mine.':'Cashed out.','',resultLine(p,round.stake,returned)],footer);
      thumb(embed,files,'mines');
      return [embed,[...grid,...round.again],files];
    }};

  const towerValue=(round,floors=round.state.steps.length)=>{const [doors,safe]=towerModes[round.state.mode];return floors?Math.floor(round.stake*(doors/safe)**floors+1e-9):0};
  tables.tower={
    title:'🗼 Tower',
    act(round,action,arg){
      const t=round.state,[doors,safeCount]=towerModes[t.mode];
      if(action==='collect'){if(!t.steps.length)return 'Clear a floor first.';t.done=true;return}
      const choice=Number(arg),floor=t.steps.length;
      if(!Number.isInteger(choice)||choice<0||choice>=doors)return 'Pick one of the doors.';
      // Decide this pick now, then fill in the rest of the floor around it for the reveal.
      const safe=Arcade.safePick(safeCount,doors,floor===0,round.stake);
      const others=Array.from({length:doors},(_,door)=>door).filter(door=>door!==choice);
      t.layout[floor]=[...(safe?[choice]:[]),...sample(others,safeCount-(safe?1:0))];
      if(!safe){t.failed=choice;t.lost=true;t.done=true;return}
      t.steps.push(choice);
      if(t.steps.length===TOWER_FLOORS)t.done=true;
    },
    stop(round){round.state.done=true},
    played:round=>round.state.steps.length>0,
    show(round,user,p){
      const t=round.state,[doors,safeCount]=towerModes[t.mode],floor=t.steps.length,list=Array.from({length:doors},(_,door)=>door),files=[];
      const picture=Array.from({length:TOWER_FLOORS},(_,line)=>{
        const level=TOWER_FLOORS-1-line,shown=t.layout[level];
        const cells=level<floor?list.map(door=>door===t.steps[level]?'🟩':shown.includes(door)?'⬜':'🟥'):
          level===floor&&t.lost?list.map(door=>door===t.failed?'💥':shown.includes(door)?'⬜':'🟥'):
          level===floor&&!t.done?list.map(()=>'🚪'):list.map(()=>'⬛');
        return '`F'+(level+1)+'` '+cells.join('')+(level===floor&&!t.done?' ◀':'')+(level<floor?'  ×'+(+((doors/safeCount)**(level+1)).toFixed(2)):'');
      });
      const chance=safeCount/doors*100*(floor?1:Arcade.share(round.stake)),footer=pickFooter(round.stake,'first floor');
      const head=t.mode+' · '+safeCount+' of '+doors+' doors safe · each floor ×'+(+(doors/safeCount).toFixed(2));
      if(!t.done){
        const embed=card(user,this.title,COLORS.brand,[head,'',...picture,'','Safe door chance: **'+pct(chance)+'** · Next floor pays '+coins(towerValue(round,floor+1))],footer);
        thumb(embed,files,'tower');
        return [embed,[row(...list.map(door=>button(rid(round,'door',door),'Door '+(door+1),1,false,'🚪'))),row(button(rid(round,'collect'),'Collect '+fmt(towerValue(round)),3,!floor,'💰'))],files];
      }
      const returned=t.lost?0:towerValue(round);
      if(rounds.get(round.id)===round)closeRound(round,p,returned);
      const embed=card(user,this.title,tone(round.stake,returned),[head,'',...picture,'',t.lost?'💥 Locked door.':floor===TOWER_FLOORS?'Top of the tower!':'Collected after '+floor+(floor===1?' floor.':' floors.'),resultLine(p,round.stake,returned)],footer);
      thumb(embed,files,'tower');
      return [embed,round.again,files];
    }};

  const hiloValue=round=>Math.floor(round.stake*Math.min(MAX_FACTOR,round.state.factor)+1e-8);
  tables.hilo={
    title:'🔼 Hi-Lo',
    act(round,action){
      const h=round.state,rank=Arcade.rank(h.card);
      const draw=()=>{h.trail=[...h.trail.slice(-6),h.card];h.card=Arcade.random(52);return Arcade.rank(h.card)};
      if(action==='collect'){if(!h.wins)return 'Make a correct call first.';h.done=true;return}
      if(action==='skip'){if(h.skips>=10)return 'No skips left.';draw();h.skips++;h.note='Card skipped.';return}
      const high=action==='higher';
      if(!high&&action!=='lower')return 'Pick higher or lower.';
      if(high?rank===13:rank===1)return 'Nothing is '+(high?'higher than a king.':'lower than an ace.');
      let next=draw();
      if(next===rank){h.note='Same rank. Streak held.';return}
      const missed=value=>high?value<rank:value>rank,favorable=high?13-rank:rank-1;
      // The bet size counts on the first paying call: one the house takes is redrawn from the ranks that miss.
      if(favorable<12&&!h.wins&&!missed(next)&&Arcade.houseTakes(round.stake)){
        do h.card=Arcade.random(52); while(!missed(Arcade.rank(h.card)));
        next=Arcade.rank(h.card);
      }
      if(missed(next)){h.lost=true;h.done=true;return}
      if(favorable===12){h.note='Free move: the multiplier stays the same.';return}
      h.wins++;h.factor*=12/favorable;h.note='Correct.';
      if(h.factor>=MAX_FACTOR)h.done=true;
    },
    stop(round){round.state.done=true},
    played:round=>round.state.wins>0,
    show(round,user,p){
      const h=round.state,rank=Arcade.rank(h.card),footer=pickFooter(round.stake,'first paying call'),files=[];
      const embed=card(user,this.title,COLORS.brand,[],footer);
      const drawn=tablePicture(embed,files,[{label:'CARD',cards:[h.card]},...(h.trail.length?[{label:'BEFORE',cards:h.trail.slice(-5)}]:[])],true);
      const lines=[drawn?null:'Card '+faces([h.card])+(h.trail.length?' · before it '+faces(h.trail):''),'Correct calls **'+h.wins+'** · Multiplier **'+h.factor.toFixed(2)+'×**'];
      if(!h.done){
        embed.description=[...lines,h.note||'Aces are low. Will the next card be higher or lower?','Bet '+coins(round.stake)].filter(line=>line!=null).join('\n');
        return [embed,[row(button(rid(round,'higher'),'Higher',3,rank===13,'🔼'),button(rid(round,'lower'),'Lower',4,rank===1,'🔽'),button(rid(round,'skip'),'Skip ('+(10-h.skips)+')',2,h.skips>=10,'⏭️')),
          row(button(rid(round,'collect'),'Collect '+fmt(h.wins?hiloValue(round):0),1,!h.wins,'💰'))],files];
      }
      const returned=h.lost?0:hiloValue(round);
      if(rounds.get(round.id)===round)closeRound(round,p,returned);
      embed.color=tone(round.stake,returned);
      embed.description=[...lines,h.lost?'Miss. The streak ends.':'Collected.','',resultLine(p,round.stake,returned)].filter(line=>line!=null).join('\n');
      return [embed,round.again,files];
    }};

  const startRound=(game,makeState)=>ctx=>{const round=openRound(ctx,game,makeState(ctx));return say(...tables[game].show(round,ctx.user,ctx.p))};
  commands.blackjack={round:true,description:'Play a hand against the dealer. A natural pays 3 to 2.',options:[betOption],
    run:startRound('blackjack',ctx=>Arcade.blackjack(null,ctx.opts.bet))};
  commands.mines={round:true,sized:true,description:'Turn over tiles, dodge the mines, cash out any time. Bigger bets win less often: /guide.',
    options:[betOption,{type:4,name:'mines',description:'Mines hidden among the 20 tiles (3 if left out)',min_value:1,max_value:MINE_CELLS-1}],
    run:startRound('mines',ctx=>({count:ctx.opts.mines??3,open:[],hazards:null,lost:false,done:false}))};
  commands.tower={round:true,sized:true,description:'Climb seven floors by picking safe doors. Bigger bets win less often: see /guide.',
    options:[betOption,{type:3,name:'level',description:'Difficulty (Expert if left out)',choices:Object.entries(towerModes).map(([name,[doors,safe]])=>({name:name+' · '+safe+' of '+doors+' safe',value:name}))}],
    run:startRound('tower',ctx=>({mode:Object.hasOwn(towerModes,ctx.opts.level??'')?ctx.opts.level:'Expert',steps:[],layout:[],failed:null,lost:false,done:false}))};
  commands.hilo={round:true,sized:true,description:'Guess higher or lower and build a streak. Bigger bets win less often: see /guide.',options:[betOption],
    run:startRound('hilo',()=>({card:Arcade.random(52),factor:1,wins:0,skips:0,trail:[],lost:false,done:false,note:''}))};

  // ---------- Player against player ----------
  function flipEmbed(flip,lines,color=COLORS.gold){return {title:'🪙 Player flip · '+fmt(flip.bet)+' credits each',color,description:lines.join('\n'),footer:{text:'A fair 50/50 at any stake · the winner takes both stakes · no fee'}}}
  commands.flip={bets:true,description:'Stake credits on a fair coin flip against another player. Winner takes both stakes.',
    options:[betOption,{type:3,name:'side',description:'Your side',required:true,choices:choices(['Heads','Tails'])}],
    run(ctx){
      const {p,id}=ctx,{bet,side}=ctx.opts;
      if([...flips.values()].some(flip=>flip.creator===id))return whisper('You already have a flip waiting. Cancel it or wait for someone to join.');
      const fid=(++flipCount).toString(36)+(now()%2176782336).toString(36);
      p.credits=credit(p.credits-bet);data.held['flip:'+fid]={id,amount:bet};store.save();
      const flip={id:fid,creator:id,side,bet,at:now(),token:ctx.token,message:null};
      flips.set(fid,flip);
      const other=side==='Heads'?'Tails':'Heads',files=[];
      const embed=flipEmbed(flip,['<@'+id+'> is on **'+side+'** and is waiting for an opponent.','Join to take **'+other+'** for '+coins(bet)+'.']);
      thumb(embed,files,side.toLowerCase());
      const reply=say(embed,[row(button('f:'+fid+':join','Join as '+other,3,false,'🪙'),button('f:'+fid+':cancel','Cancel',2,false,'✖️'))],files);
      // A flip made with a `$` command has no interaction to edit later, so remember its message.
      reply.onSent=message=>{if(message?.id)flip.message={channel:message.channel_id,id:message.id}};
      return reply;
    }};
  // A flip that is over (played, cancelled, or run out with nobody joining) has its message deleted
  // twenty minutes later, so the channel does not fill up with old flips.
  function clearLater(flip,interaction){
    const message=interaction?.message?.id&&interaction.channel_id?{channel:interaction.channel_id,id:interaction.message.id}:flip.message;
    if(message){data.cleanup.push({channel:message.channel,id:message.id,at:now()});store.save()}
  }
  function flipPress(interaction,user,fid,action){
    const flip=flips.get(fid);
    if(!flip)return whisper('That flip is over.');
    if(action==='cancel'){
      if(user.id!==flip.creator)return whisper('Only the player who made this flip can cancel it.');
      flips.delete(fid);delete data.held['flip:'+fid];
      const owner=data.players[flip.creator];owner.credits=credit(owner.credits+flip.bet);store.save();
      clearLater(flip,interaction);
      return update(flipEmbed(flip,['Cancelled. '+coins(flip.bet)+' went back to <@'+flip.creator+'>.'],COLORS.even));
    }
    if(action!=='join')return whisper('That button no longer works.');
    if(user.id===flip.creator)return whisper('You cannot join your own flip.');
    const joiner=player(user),owner=data.players[flip.creator];
    if(joiner.credits<flip.bet)return whisper('You need '+fmt(flip.bet)+' credits to join. You have '+fmt(joiner.credits)+'.');
    flips.delete(fid);delete data.held['flip:'+fid];
    joiner.credits=credit(joiner.credits-flip.bet);
    // One fair toss, made only now that both stakes are in.
    const face=Arcade.random(2)?'Heads':'Tails',ownerWon=face===flip.side;
    tally(owner,flip.bet,ownerWon?2*flip.bet:0);tally(joiner,flip.bet,ownerWon?0:2*flip.bet);
    clearLater(flip,interaction);
    const winner=ownerWon?flip.creator:user.id,other=flip.side==='Heads'?'Tails':'Heads';
    const sides='<@'+flip.creator+'> **'+flip.side+'**  vs  **'+other+'** <@'+user.id+'>';
    const files=[],result=flipEmbed(flip,[sides,'','The coin shows **'+face+'**.','🏆 <@'+winner+'> wins '+coins(2*flip.bet)+'.'],COLORS.win);
    thumb(result,files,face.toLowerCase());
    if(flipDelay<=0)return update(result,[],files);
    const timer=setTimeout(()=>edit(interaction.token,update(result,[],files)).catch(error=>log.error('Flip result: '+error.message)),flipDelay);
    timer.unref?.();
    return update(flipEmbed(flip,[sides,'','🪙 The coin is in the air…']));
  }

  // ---------- Credits, stats and help ----------
  commands.balance={description:'See your play credits, or someone else’s.',options:[{type:6,name:'player',description:'Whose balance to show'}],
    run(ctx){
      const other=ctx.opts.player&&ctx.opts.player!==ctx.id?data.players[ctx.opts.player]:null;
      if(ctx.opts.player&&ctx.opts.player!==ctx.id)return say({color:COLORS.gold,description:other?'<@'+ctx.opts.player+'> has '+coins(other.credits)+'.':'<@'+ctx.opts.player+'> has not played yet.'});
      const round=rounds.get(ctx.id);
      return say({color:COLORS.gold,author:{name:who(ctx.user)},description:'Balance '+coins(ctx.p.credits)+(round?'\n'+fmt(data.held['round:'+ctx.id].amount)+' more is in your '+round.game+' round.':'')+(ctx.p.credits<REFILL_UNDER&&!round?'\nRunning low: use '+prefix+'refill for a free top-up.':'')});
    }};
  commands.refill={description:'Out of credits? Top back up to '+fmt(START)+' for free when you drop below '+REFILL_UNDER+'.',
    run(ctx){
      const {p,id}=ctx;
      if(rounds.has(id)||[...flips.values()].some(flip=>flip.creator===id))return whisper('Finish the round or flip you have open first.');
      if(p.credits>=REFILL_UNDER)return whisper('Refills are for when you drop below '+REFILL_UNDER+' credits. You have '+fmt(p.credits)+'.');
      p.credits=START;store.save();
      return say({color:COLORS.win,author:{name:who(ctx.user)},description:'Topped up for free. Balance '+coins(p.credits)});
    }};
  commands.tip={description:'Send some of your play credits to another player.',
    options:[{type:6,name:'player',description:'Who gets the credits',required:true},{type:4,name:'amount',description:'Credits to send',required:true,min_value:1,max_value:MAX_BET}],
    run(ctx){
      const {p,id}=ctx,{amount}=ctx.opts,target=ctx.opts.player,them=ctx.resolved?.users?.[target];
      if(!Number.isInteger(amount)||amount<1)return whisper('Send a whole number of credits.');
      if(!them||!/^\d{5,25}$/.test(String(target)))return whisper('Pick a player in this server.');
      if(target===id)return whisper('You cannot tip yourself.');
      if(them.bot)return whisper('Bots do not play.');
      if(p.credits<amount)return whisper('You have '+fmt(p.credits)+' credits.');
      const receiver=player({...them,id:target});
      p.credits=credit(p.credits-amount);receiver.credits=credit(receiver.credits+amount);store.save();
      return {type:4,data:{embeds:[{color:COLORS.gold,description:'🎁 <@'+id+'> tipped <@'+target+'> '+coins(amount)+'.',footer:{text:'Play credits only. A tip cannot be undone.'}}],allowed_mentions:{users:[target]}}};
    }};
  commands.profile={description:'Your record: rank, rounds, wins, total bet, profit and best win.',options:[{type:6,name:'player',description:'Whose record to show'}],
    run(ctx){
      const target=ctx.opts.player||ctx.id,p=data.players[target];
      if(!p)return say({color:COLORS.even,description:'<@'+target+'> has not played yet.'});
      const profit=credit(p.returned-p.wagered),rank=rankIndex(p.wagered),next=RANKS[rank+1];
      return say({color:rank>=0?RANKS[rank].color:COLORS.brand,title:'📊 '+p.name,description:(rank>=0?'Rank **'+RANKS[rank].name+'**':'No rank yet')+(next?' · '+fmt(credit(next.at-p.wagered))+' more bet to reach '+next.name:' · top rank'),fields:[
        {name:'Balance',value:fmt(p.credits)+' 🪙',inline:true},{name:'Rounds',value:fmt(p.rounds),inline:true},{name:'Wins',value:fmt(p.wins)+(p.rounds?' ('+pct(100*p.wins/p.rounds)+')':''),inline:true},
        {name:'Total bet',value:fmt(p.wagered),inline:true},{name:'Profit',value:(profit>0?'+':'')+fmt(profit),inline:true},{name:'Best win',value:'+'+fmt(p.best),inline:true},
        {name:'Biggest bet',value:fmt(p.topBet||0),inline:true}]});
    }};
  commands.leaderboard={description:'The ten biggest balances.',
    run(){
      const top=Object.entries(data.players).sort((a,b)=>b[1].credits-a[1].credits).slice(0,10);
      return say({color:COLORS.gold,title:'🏆 Leaderboard',description:top.length?top.map(([id,p],place)=>(['🥇','🥈','🥉'][place]||'`'+(place+1)+'.`')+' <@'+id+'> · '+coins(p.credits)).join('\n'):'Nobody has played yet.'});
    }};
  const ranksEmbed=()=>({color:COLORS.gold,title:'🎖 Ranks and roles',description:[
    '**Ranks** follow the total you have bet. You hold the highest one you have reached.',
    ...RANKS.map(rank=>rank.name+' · '+fmt(rank.at)+' credits bet in total'),
    '',
    '**High roller roles** follow your biggest single bet.',
    ...ROLLERS.map(tier=>tier.name+' · one bet of '+fmt(tier.bet)+' or more'),
    '',
    'Bigger bets win less often, and a bet over 1,500 cannot win in most games, so no role rewards one. `'+prefix+'guide` has the details.',
    'Roles are handed out in servers where xyzwrl has run '+prefix+'server setup.'].join('\n')});
  commands.ranks={description:'The ranks and high roller roles, and what it takes to earn each.',run:()=>say(ranksEmbed())};
  const helpEmbed=()=>({color:COLORS.brand,title:'🎮 DriftLobby',description:[
    'A play-credit arcade. Everyone starts with '+fmt(START)+' free credits. Commands work with `'+prefix+'` or as slash commands.',
    '',
    '**Games**',
    '`'+prefix+'coinflip 50 heads` · `'+prefix+'dice 50 under 60` · `'+prefix+'limbo 50 3` · `'+prefix+'wheel 50`',
    '`'+prefix+'war 50` · `'+prefix+'rps 50 rock` · `'+prefix+'roulette 50 red` · `'+prefix+'plinko 50 16 high`',
    '`'+prefix+'blackjack 50` · `'+prefix+'mines 50 5` · `'+prefix+'tower 50 easy` · `'+prefix+'hilo 50` — played with buttons',
    '`'+prefix+'flip 100 heads` — a coin flip against another player',
    'Bets also take `all`, `half` and `1.5k`. Short names: `'+prefix+'bj` `'+prefix+'cf` `'+prefix+'hl` `'+prefix+'bal` `'+prefix+'lb`',
    '',
    '**Credits**',
    '`'+prefix+'refill` a free top-up whenever you drop below '+REFILL_UNDER,
    '`'+prefix+'tip @friend 100` · `'+prefix+'balance` · `'+prefix+'profile` · `'+prefix+'leaderboard`',
    '',
    '**Guide and ranks**',
    '`'+prefix+'guide` how every game works, and how bigger bets win less often · `'+prefix+'ranks` roles for how much you bet',
    '`'+prefix+'server setup` (xyzwrl only) builds the channels and roles',
    '',
    'Credits are free. There is nothing to deposit or buy, and credits cannot be withdrawn or cashed out.'+(siteUrl?'\nPlay in the browser too: '+siteUrl:'')].join('\n')});
  commands.help={description:'Every command, and how to get credits.',run:()=>say(helpEmbed())};
  // The how-to-play guide: one page each for the basics, the quick games, the button games and the
  // full command list. The command lines are built from the commands themselves, so they cannot go stale.
  const guideEmbeds=()=>{
    const game=(icon,title,name,how)=>'**'+icon+' '+title+'** · '+usage(name)+'\n'+how;
    const short=name=>Object.entries(ALIASES).filter(([,full])=>full===name).map(([alias])=>'`'+prefix+alias+'`');
    const line=(name,what)=>usage(name)+' · '+what+(short(name).length?' · also '+short(name).join(' '):'');
    return [
      {color:COLORS.brand,title:'📖 How to play',description:[
        '• Everyone starts with **'+fmt(START)+' free credits**. Type a command in an arcade channel and the bot answers with the result.',
        '• Every command works typed with `'+prefix+'` or as a slash command: `'+prefix+'blackjack 50` or `/blackjack`.',
        '• A bet is a whole number of credits. `all`, `half` and `1.5k` work too: `'+prefix+'coinflip all heads`.',
        '• The words after a command can go in any order, and `<this>` is needed while `[this]` can be left out.',
        '• Press **Play again** under a finished game to repeat it with the same bet.',
        '• Out of credits? `'+prefix+'refill` tops you up for free whenever you drop below '+REFILL_UNDER+', and friends can `'+prefix+'tip` you.',
        '',
        '**Bigger bets win less often** in Coinflip, Dice, Limbo, Wheel, War, Rock Paper Scissors, Mines, Tower and Hi-Lo. A win still pays in full; what changes is how often you win.',
        '• Up to 200 credits you keep nearly the full chance: 97% of it at 10 credits, 94% at 100.',
        '• Over 200 you keep 60% of it. A coin flip wins 30% of the time and the house 70%.',
        '• A bet over 1,500 cannot win. The bot asks you to confirm before taking one.',
        '• In Mines, Tower and Hi-Lo this counts on the first pick only. Every result shows the chance you had.',
        '• Blackjack, Roulette, Plinko and player flips have the same odds at any bet.',
        '',
        'Credits are free play money. They have no cash value and cannot be bought, deposited, withdrawn or cashed out.'].join('\n')},
      {color:COLORS.gold,title:'⚡ Quick games',description:[
        game('🪙','Coinflip','coinflip','Call heads or tails. A right call pays 2×.'),
        game('🎲','Dice','dice','A roll from 0 to 100. You win if it lands under (or over) your target, 50 if you leave it out. Safer targets pay less: under 50 pays 2×, under 25 pays 4×, under 10 pays 10×.'),
        game('🚀','Limbo','limbo','Pick a target from 1.5× to 100× (2× if you leave it out). If the rocket reaches it, you win your bet times the target.'),
        game('🎡','Wheel','wheel','Twelve segments: six pay nothing, three return your bet, and one each pays 2×, 3× and 4×.'),
        game('⚔️','War','war','You and the house each draw a card. The higher card wins 2× (aces are high) and equal cards return your bet.'),
        game('✊','Rock Paper Scissors','rps','Beat the house’s throw for 2×. A tie returns your bet.'),
        game('🎰','Roulette','roulette','Red, black, odd or even pay 2×. One number pays 36×: `'+prefix+'roulette 50 number 17`. Zero beats red, black, odd and even.'),
        game('📍','Plinko','plinko','A ball drops through 8, 12 or 16 rows of pegs and the slot it lands in sets the payout. The edges pay most; higher risk makes the edges bigger and the middle smaller.')].join('\n\n')},
      {color:COLORS.win,title:'🎮 Button games',description:[
        game('🃏','Blackjack','blackjack','Get closer to 21 than the dealer without going over. **Hit** takes a card, **Stand** stops, **Double** doubles your bet for one last card, **Split** turns a pair into two hands. A win pays 2×, a two-card 21 pays 3 to 2, a tie returns your bet. The dealer stands on 17.'),
        game('💎','Mines','mines','Twenty tiles hide the mines (3 unless you choose). Each gem you turn over raises the payout, and you can **Cash out** whenever you like. Hit a mine and the bet is gone. More mines means bigger payouts.'),
        game('🗼','Tower','tower','Seven floors of doors. Each safe door multiplies the payout: **Collect** after any floor, or lose it all behind a locked door. '+Object.entries(towerModes).map(([name,[doors,safe]])=>name+' ×'+(+(doors/safe).toFixed(2))+' a floor ('+safe+' of '+doors+' safe)').join(', ')+'. Expert if you leave it out.'),
        game('🔼','Hi-Lo','hilo','Guess whether the next card is higher or lower (aces are low). Each right call multiplies the payout, more for the unlikely ones. The same rank keeps your streak, you can skip up to 10 cards, and you **Collect** after any right call.'),
        game('🪙','Player flip','flip','Put up a stake and pick a side; another player presses **Join** to take the other side for the same stake. One fair coin decides and the winner takes both stakes. A finished flip is cleared away after 20 minutes.'),
        'Only one button game can be open at a time. One left alone for ten minutes is finished for you.'].join('\n\n')},
      {color:COLORS.brand,title:'🧾 Every command',description:[
        '**Games**',
        ...['coinflip','dice','limbo','wheel','war','rps','roulette','plinko','blackjack','mines','tower','hilo','flip'].map(name=>usage(name)+(short(name).length?' · also '+short(name).join(' '):'')),
        '',
        '**Credits**',
        line('refill','a free top-up when you are below '+REFILL_UNDER),
        line('tip','send credits to a friend'),line('balance','your credits, or someone else’s'),
        '',
        '**Records**',
        line('profile','rank, rounds, wins, profit and best win'),line('leaderboard','the ten biggest balances'),line('ranks','the rank and high roller roles'),
        '',
        '**Help**',
        line('guide','this guide'),line('help','the short list'),
        line('server','builds the channels and roles (server managers only)')].join('\n')}];
  };
  commands.guide={description:'How to play: every game and every command.',run:()=>({type:4,data:{embeds:guideEmbeds(),components:[],allowed_mentions:{parse:[]}}})};

  // ---------- Server setup ----------
  const inviteLink=()=>'https://discord.com/oauth2/authorize?client_id='+appId+'&scope=bot+applications.commands&permissions='+BOT_PERMISSIONS;
  const welcomeEmbed=()=>({color:COLORS.brand,title:'👋 Welcome to DriftLobby',description:[
    'A private arcade of casino-style games played with **free play credits**.',
    '',
    '• You start with '+fmt(START)+' credits, and `'+prefix+'refill` tops you up for free whenever you drop below '+REFILL_UNDER+'.',
    '• Play in the arcade channels: try `'+prefix+'blackjack 50`, `'+prefix+'mines 50` or `'+prefix+'coinflip 50 heads`. `'+prefix+'guide` explains every game.',
    '• The more you bet, the higher your rank role. `'+prefix+'ranks` shows them all.',
    '',
    'Credits have no cash value. They cannot be bought, deposited, withdrawn or cashed out.'+(siteUrl?'\nPlay in the browser too: '+siteUrl:'')].join('\n')});
  const rulesEmbed=()=>({color:COLORS.brand,title:'📜 Rules',description:[
    '**Be decent.** No harassment, threats, hate or sexual content. No sharing anyone’s personal information. No spam.',
    '**Keep money out of it.** No buying, selling or trading credits. No real-money bets, loans or giveaways. No links to gambling sites or scams.',
    '**Play fair.** Use the games as they are offered. No exploiting faults and no extra accounts for more free credits.',
    '**It is a game.** Credits are free play money and a big balance means nothing outside this server. Take breaks, and stop when it stops being fun.',
    '',
    'The server’s admins can remove messages or access for anyone who breaks these rules.'].join('\n')});
  const arcadeLayout=[
    {name:'📌 INFO',lock:'read',channels:[
      {name:'👋・welcome',topic:'What DriftLobby is and how to start.',post:welcomeEmbed},{name:'📜・rules',topic:'The house rules.',post:rulesEmbed},{name:'📖・how-to-play',topic:'Every game and every command.',post:guideEmbeds},
      {name:'🎖・roles',topic:'Ranks and high roller roles.',post:ranksEmbed}]},
    {name:'🎰 ARCADE',channels:[
      {name:'🎲・table-1',topic:'Play any game here. '+prefix+'help lists them.'},{name:'🎲・table-2',topic:'Play any game here. '+prefix+'help lists them.'},
      {name:'🃏・blackjack',topic:prefix+'blackjack 50'},{name:'🪙・player-flips',topic:'Coin flips against each other: '+prefix+'flip 100 heads'}]},
    {name:'💬 LOUNGE',channels:[{name:'💬・general',topic:'Talk about anything.'},{name:'🎁・free-credits',was:['🎁・daily-claims'],topic:prefix+'refill tops you up for free below '+REFILL_UNDER+'. '+prefix+'tip sends credits to a friend.'}]},
    {name:'🎩 HIGH ROLLERS',lock:'rollers',channels:[
      {name:'🎩・high-roller-lounge',topic:'For High Rollers and Whales.'},{name:'🐋・whale-table',topic:'Whales only.',only:'whale'}]}];
  const walletHelp=()=>({color:COLORS.brand,title:'DriftLobby',description:
    'Free games: `$coinflip heads`, `$dice under 50`, `$roulette red`, `$rps rock`, `$war`, `$wheel`, `$limbo 2`, `$plinko`. Use `$depo LTC` and `$b` with the deposit bot.'});
  const walletPage=(title,description)=>()=>({color:COLORS.brand,title,description});
  const walletLayout=[
    {name:'📌 INFO',lock:'read',channels:[
      {name:'👋・welcome',topic:'Welcome to DriftLobby.',post:walletPage('👋 Welcome to DriftLobby',walletHelp().description)},
      {name:'📜・rules',topic:'Server rules.',post:walletPage('📜 Rules','Respect other members. No harassment, spam, sharing private information, scams, or wagering.')},
      {name:'📖・how-to-play',topic:'Discord command help.',post:()=>[
        ...['📖 How to play','⚡ Quick games','🎮 Button games'].map(title=>({color:COLORS.brand,title,description:walletHelp().description})),
        {color:COLORS.brand,title:'🧾 Every command',description:walletHelp().description}
      ]},
      {name:'🎖・roles',topic:'Server roles.',post:walletPage('🎖 Ranks and roles','Contact a server moderator with questions about roles.')}
    ]},
    {name:'💬 LOUNGE',channels:[{name:'💬・general',topic:'Talk about anything.'}]},
    {name:'🔊 VOICE',channels:[{name:'Hangout',type:2},{name:'Chill Room',type:2}]},
    {name:'🔒 ADMIN',lock:'admin',channels:[
      {name:'admin-room',topic:'Private admin coordination.'},
      {name:'admin-stats',topic:'Use /server stats for a private report from the saved arcade records.',
        post:walletPage('Admin stats','Use `/server stats` for the current historical arcade totals, or select a player to view their saved balance privately.')}
    ]}
  ];
  // Puts a channel's info pages in place: a page the bot has already posted is edited if its text
  // has changed, and a missing one is posted. Pages are matched by their title.
  async function postPages(channel,embeds){
    let mine=[],changed=0;
    try{
      const recent=await rest('GET','/channels/'+channel+'/messages?limit=50');
      mine=(Array.isArray(recent)?recent:[]).filter(message=>message.author?.id===botId&&message.embeds?.length===1);
    }catch{}
    for(const embed of embeds){
      const posted=mine.find(message=>message.embeds[0].title===embed.title);
      if(!posted)await rest('POST','/channels/'+channel+'/messages',{embeds:[embed],allowed_mentions:{parse:[]}});
      else if(posted.embeds[0].description!==embed.description)await rest('PATCH','/channels/'+channel+'/messages/'+posted.id,{embeds:[embed],allowed_mentions:{parse:[]}});
      else continue;
      changed++;
    }
    return changed;
  }
  // Builds the roles and channels in one server. Anything already there with the same name is kept
  // and reused, so running it twice adds nothing; the only things it edits are a channel it made
  // under an earlier name (renamed) and its own info pages (brought up to date). It deletes nothing.
  async function prepareVerificationRoom(guild) {
    const saved=data.guilds[guild]??={roles:{},channels:{}};
    const roles=await rest('GET','/guilds/'+guild+'/roles');
    let role=roles.find(r=>r.id===saved.roles.siteVerified);
    if(!role){
      role=await rest('POST','/guilds/'+guild+'/roles',{name:'Verified',permissions:'0',mentionable:false});
      saved.roles.siteVerified=role.id;
      store.save();
    }
    const channels=await rest('GET','/guilds/'+guild+'/channels');
    let channel=channels.find(c=>c.type===0 && (c.id===saved.channels.verify || c.name==='verify'));
    if(!channel){
      channel=await rest('POST','/guilds/'+guild+'/channels',{name:'verify',type:0,
        topic:'DriftLobby account verification',
        permission_overwrites:[{id:guild,type:0,allow:'1024',deny:'2048'},{id:botId,type:1,allow:String(PERMS.view|PERMS.send|PERMS.embed|PERMS.history)}]});
    }
    saved.channels.verify=channel.id;
    store.save();
    await postPages(channel.id,[{color:COLORS.brand,title:'Verify for DriftLobby',
      description:'Complete the verification process provided by the server team here. After approval, sign in to DriftLobby with the same Discord account. Never post ID documents in this channel.'}]);
    log.log('Verification room ready: guild='+guild+' channel='+channel.id+' role='+role.id);
  }
  async function setupServer(guild,actor,trusted){
    const info=await rest('GET','/guilds/'+guild);
    const existingRoles=info.roles||await rest('GET','/guilds/'+guild+'/roles');
    if(!trusted&&info.owner_id!==actor.id){
      // A `$` command does not say what the member may do, so work it out from their roles.
      const held=new Set([guild,...(actor.roles||[])]);
      const allowed=existingRoles.filter(role=>held.has(role.id)).reduce((bits,role)=>bits|BigInt(role.permissions),0n);
      if(!(allowed&(PERMS.admin|PERMS.manageGuild)))return {color:COLORS.loss,description:'Only someone who can manage this server can run the setup.'};
    }
    const saved=data.guilds[guild]??={roles:{},channels:{}},made={roles:0,channels:0,kept:0,renamed:0,pages:0};
    // Created top to bottom: each new role is added just above @everyone, pushing earlier ones up.
    for(const tier of arcadeEnabled?[...ROLLERS].reverse().concat([...RANKS].reverse()):[]){
      let role=existingRoles.find(found=>found.name===tier.name);
      if(role)made.kept++;
      else{role=await rest('POST','/guilds/'+guild+'/roles',{name:tier.name,color:tier.color,hoist:true,mentionable:false,permissions:'0'});made.roles++}
      saved.roles[tier.key]=role.id;
    }
    store.save();
    const everyone={id:guild,type:0},bot={id:botId,type:1,allow:String(PERMS.view|PERMS.send|PERMS.embed|PERMS.attach|PERMS.history)};
    const overwrites=(lock,only)=>lock==='read'?[{...everyone,deny:String(PERMS.send)},bot]:
      lock==='admin'?[{...everyone,deny:String(PERMS.view)}, {id:ADMIN_USER_ID,type:1,allow:String(PERMS.view|PERMS.send|PERMS.history)},bot]:
      lock==='rollers'?[{...everyone,deny:String(PERMS.view)},...ROLLERS.filter(tier=>!only||tier.key===only).map(tier=>({id:saved.roles[tier.key],type:0,allow:String(PERMS.view)})),bot]:undefined;
    const existing=await rest('GET','/guilds/'+guild+'/channels');
    for(const group of arcadeEnabled?arcadeLayout:walletLayout){
      let category=existing.find(channel=>channel.type===4&&channel.name===group.name);
      if(category)made.kept++;
      else{category=await rest('POST','/guilds/'+guild+'/channels',{name:group.name,type:4,permission_overwrites:overwrites(group.lock)});made.channels++}
      for(const want of group.channels){
        const type=want.type??0;
        let channel=existing.find(found=>found.type===type&&found.name===want.name);
        const former=!channel&&existing.find(found=>found.type===0&&(want.was||[]).includes(found.name));
        if(former){channel=await rest('PATCH','/channels/'+former.id,{name:want.name,topic:want.topic});made.renamed++}
        if(channel){
          if(group.lock==='admin')channel=await rest('PATCH','/channels/'+channel.id,{parent_id:category.id,permission_overwrites:overwrites(group.lock)});
          made.kept++;
        }
        else{
          channel=await rest('POST','/guilds/'+guild+'/channels',{name:want.name,type,topic:want.topic,parent_id:category.id,permission_overwrites:overwrites(group.lock,want.only)});
          made.channels++;
        }
        saved.channels[want.name]=channel.id;
        // A page that is several embeds long is one message per embed.
        if(want.post)made.pages+=await postPages(channel.id,[].concat(want.post()));
      }
    }
    store.save();
    return {color:COLORS.win,title:'✅ Server ready',description:[
      'Made **'+made.roles+'** roles and **'+made.channels+'** channels'+(made.kept?' ('+made.kept+' were already here and were kept)':'')+'.'+(made.renamed?' Renamed '+made.renamed+' of my channels.':'')+(made.pages?' Posted or updated '+made.pages+' info pages.':''),
      '',
      ...(arcadeEnabled?[
      '• Rank roles are handed out as people play: '+RANKS.map(rank=>rank.name).join(', ')+'.',
      '• '+ROLLERS.map(tier=>tier.name).join(' and ')+' open the high roller channels.',
      '• Keep my own role above those roles in Server Settings → Roles, or I cannot hand them out.']:[]),
      '• Nothing of yours was deleted or changed. You can rename, move or remove anything I made.'].join('\n')};
  }
  commands.server={adminOnly:true,guildOnly:true,memberPermissions:String(PERMS.manageGuild),description:'Server tools for xyzwrl.',
    options:[{type:1,name:'setup',description:'Create the DriftLobby channels and roles in this server (nothing is deleted).'},
      ...(!arcadeEnabled?[{type:1,name:'stats',description:'View saved arcade totals privately.',options:[
        {type:6,name:'player',description:'Optional player whose saved arcade balance you want to see'}
      ]}]:[])],
    run(ctx){
      if(ctx.opts._sub==='stats'&&!arcadeEnabled){
        if(!ctx.token)return whisper('Use the /server stats slash command for a private reply.');
        const players=Object.values(data.players);
        const houseNet=players.reduce((total,p)=>total+(p.wagered??0)-(p.returned??0),0);
        const lines=['**Historical arcade results**','All-time house net: **'+fmt(houseNet)+' play credits**.'];
        if(ctx.opts.player){
          const saved=data.players[ctx.opts.player];
          lines.push(saved?'Saved balance for <@'+ctx.opts.player+'>: **'+fmt(saved.credits)+' play credits**.':'No saved arcade record for this player.');
        }
        return whisper(lines.join('\n'));
      }
      if(ctx.opts._sub!=='setup')return whisper('Use `'+prefix+'server setup`.');
      const trusted=ctx.permissions!=null&&Boolean(BigInt(ctx.permissions)&(PERMS.admin|PERMS.manageGuild));
      if(ctx.permissions!=null&&!trusted)return whisper('Only someone who can manage this server can run the setup.');
      const reply=say({color:COLORS.brand,description:'⏳ Setting up the server: roles first, then channels. This takes a few seconds…'});
      reply.task=()=>setupServer(ctx.guild,{id:ctx.id,roles:ctx.roles},trusted).catch(error=>{
        log.error('Server setup: '+error.message);
        return {color:COLORS.loss,title:'Setup could not finish',description:/ 403 /.test(error.message)?
          'I am not allowed to manage roles and channels here. Add me again with this link, which asks for those permissions, then run the setup again:\n'+inviteLink():
          'Discord refused part of it ('+error.message.slice(0,120)+'). Whatever was made so far is kept; run the setup again to finish.'};
      });
      return reply;
    }};

  if(!arcadeEnabled){
    const freeGames={
      coinflip:'Call heads or tails.',dice:'Roll under or over your target.',roulette:'Pick a color, parity, or number.',
      war:'Draw a card against the dealer.',rps:'Play rock, paper, scissors.',wheel:'Spin the wheel.',
      limbo:'Pick a target multiplier.',plinko:'Drop a ball through the board.'
    };
    for(const name of Object.keys(commands)){
      if(name==='help'||name==='server')continue;
      if(!Object.hasOwn(freeGames,name)){delete commands[name];continue;}
      const game=commands[name];
      commands[name]={description:freeGames[name],options:game.options.filter(option=>option.name!=='bet'),
        run:ctx=>game.run({...ctx,opts:{...ctx.opts,bet:1}})};
    }
    commands.help={description:'Show DriftLobby’s Discord commands.',run:()=>say(walletHelp())};
  }

  // ---------- Roles for playing ----------
  const standing=id=>{const p=data.players[id];return {rank:rankIndex(p?.wagered||0),top:p?.topBet||0}};
  // After a command: give the member the rank and high-roller roles they have earned in this
  // server, take away a rank they have moved past, and announce a step up.
  async function syncRoles({guild,user,roles,before,announce}){
    if(!arcadeEnabled)return;
    const p=data.players[user.id],setup=guild&&data.guilds[guild];
    if(!p||!setup?.roles)return;
    const rank=rankIndex(p.wagered),want=new Set();
    if(rank>=0&&setup.roles[RANKS[rank].key])want.add(setup.roles[RANKS[rank].key]);
    for(const tier of ROLLERS)if((p.topBet||0)>=tier.bet&&setup.roles[tier.key])want.add(setup.roles[tier.key]);
    const have=new Set(roles||[]),rankRoles=new Set(RANKS.map(tier=>setup.roles[tier.key]).filter(Boolean));
    try{
      for(const id of want)if(!have.has(id))await rest('PUT','/guilds/'+guild+'/members/'+user.id+'/roles/'+id);
      for(const id of rankRoles)if(have.has(id)&&!want.has(id))await rest('DELETE','/guilds/'+guild+'/members/'+user.id+'/roles/'+id);
    }catch(error){log.error('Roles: '+error.message);return}
    const news=[];
    if(rank>before.rank)news.push('reached **'+RANKS[rank].name+'** with '+fmt(p.wagered)+' credits bet in total');
    for(const tier of ROLLERS)if(before.top<tier.bet&&(p.topBet||0)>=tier.bet)news.push('is now a **'+tier.name+'**');
    if(news.length)await announce({embeds:[{color:rank>=0?RANKS[rank].color:COLORS.gold,description:'🎉 <@'+user.id+'> '+news.join(' and ')+'.'}],allowed_mentions:{parse:[]}}).catch(()=>{});
  }

  // ---------- Routing ----------
  function confirmShut(ctx,name){
    pending.set(ctx.id,{name,ctx,at:now()});
    return {type:4,data:{flags:64,embeds:[{color:COLORS.loss,title:'This bet cannot win',description:'In '+prefix+name+' a bet over 1,500 credits cannot win: the house takes it every time (see '+prefix+'guide).\nBet 1,500 or less to have a chance.'}],
      components:[row(button('shut:'+ctx.id+':yes','Play it anyway',4),button('shut:'+ctx.id+':no','Cancel',2))]}};
  }
  function startCommand(name,ctx){
    const cmd=commands[name],bet=ctx.opts.bet;
    if(cmd.adminOnly&&ctx.id!==ADMIN_USER_ID)return whisper('Only xyzwrl can use this admin command.');
    if(cmd.guildOnly&&!ctx.guild)return whisper('Use this inside a server.');
    if(cmd.sized||cmd.round||cmd.bets||'bet' in ctx.opts){
      if(!Number.isInteger(bet)||bet<1||bet>MAX_BET)return whisper('Bet a whole number of credits, at least 1.');
      if(cmd.round&&rounds.has(ctx.id))return whisper('Finish your '+rounds.get(ctx.id).game+' round first.');
      if(ctx.p.credits<bet)return whisper('You have '+fmt(ctx.p.credits)+' credits.'+(ctx.p.credits<REFILL_UNDER?' Use '+prefix+'refill for a free top-up.':' '+prefix+'refill is free once you drop below '+REFILL_UNDER+'.'));
    }
    return cmd.run(ctx);
  }
  // Runs a command, stopping first to warn about a bet that cannot win. Such a bet is only taken
  // after the player has been told and has said yes.
  function launch(name,ctx){
    ctx.name=name;
    const cmd=commands[name],bet=ctx.opts.bet;
    if(cmd.sized&&Number.isInteger(bet)&&bet<=MAX_BET&&Arcade.share(bet)===0&&ctx.p.credits>=bet&&!(cmd.round&&rounds.has(ctx.id)))return confirmShut(ctx,name);
    return startCommand(name,ctx);
  }
  // Turns "bet=50&side=Heads" from a Play again button back into typed options.
  function againOptions(name,query){
    const opts={};
    for(const [key,value] of new URLSearchParams(query)){
      const option=(commands[name].options||[]).find(found=>found.name===key);
      if(option)opts[key]=option.type===4||option.type===10?Number(value):value;
    }
    return opts;
  }
  function press(interaction,user){
    const [kind,a,b,c,d]=String(interaction.data?.custom_id||'').split(':');
    const place={guild:interaction.guild_id,roles:interaction.member?.roles,permissions:interaction.member?.permissions,token:interaction.token};
    if(kind==='shut'){
      if(a!==user.id)return whisper('That question is for someone else.');
      const waiting=pending.get(user.id);
      pending.delete(user.id);
      if(b!=='yes'||!waiting)return {type:7,data:{content:b==='yes'?'That bet has expired. Run the command again.':'Cancelled. Nothing was bet.',embeds:[],components:[]}};
      return startCommand(waiting.name,{...waiting.ctx,...place,p:player(user)});
    }
    if(kind==='a'){
      if(a!==user.id)return whisper('That button is for the player who played. Start your own game with a command.');
      if(!Object.hasOwn(commands,b))return whisper('That button no longer works.');
      return launch(b,{user,id:user.id,opts:againOptions(b,String(interaction.data.custom_id).split(':').slice(3).join(':')),p:player(user),...place});
    }
    if(kind==='f')return flipPress(interaction,user,a,b);
    if(kind!=='r')return whisper('That button no longer works.');
    if(a!==user.id)return whisper('That is someone else’s round. Start your own with a game command.');
    const round=rounds.get(user.id);
    if(!round||round.nonce!==b)return whisper('That round has ended.');
    const p=player(user),table=tables[round.game],problem=table.act(round,c,d??'',p);
    if(problem)return whisper(problem);
    round.at=now();store.save();
    return update(...table.show(round,user,p));
  }
  // Answers one interaction (a slash command or a button) with the reply to send back.
  function handle(interaction){
    const user=interaction.member?.user||interaction.user;
    if(!user||!/^\d{5,25}$/.test(String(user.id)))return whisper('Could not tell who you are.');
    if(user.bot)return whisper('Bots do not play.');
    if(interaction.type===3)return arcadeEnabled?press(interaction,user):whisper('Arcade buttons are retired.');
    if(interaction.type!==2)return whisper('That is not something this bot handles.');
    const name=interaction.data?.name;
    if(!Object.hasOwn(commands,name))return whisper('Unknown command. Try '+prefix+'help.');
    const opts={};
    for(const option of interaction.data.options||[]){
      if(typeof option.name!=='string'||['__proto__','constructor'].includes(option.name))continue;
      if(option.type===1){
        opts._sub=option.name;
        if(name==='server'&&option.name==='stats'){
          const target=option.options?.find(value=>value.type===6&&value.name==='player');
          if(target&&/^\d{5,25}$/.test(String(target.value)))opts.player=String(target.value);
        }
      }else opts[option.name]=option.value;
    }
    if(!arcadeEnabled)delete opts.bet;
    return launch(name,{user,id:user.id,opts,p:arcadeEnabled?player(user):null,resolved:interaction.data.resolved,token:interaction.token,
      guild:interaction.guild_id,roles:interaction.member?.roles,permissions:interaction.member?.permissions??(interaction.guild_id?'0':null)});
  }

  // ---------- `$` commands ----------
  // Reads one typed word as a value for one option; undefined when it does not fit.
  function readWord(option,word,p){
    const lower=word.toLowerCase(),plain=lower.replace(/[×x]$/,'');
    if(option.choices){
      const hit=option.choices.find(choice=>String(choice.value).toLowerCase()===lower||choice.name.toLowerCase()===lower)||
        option.choices.find(choice=>typeof choice.value==='number'&&/^\d+(\.\d+)?$/.test(plain)&&Number(plain)===choice.value)||
        (/^[a-z]/.test(lower)?option.choices.find(choice=>choice.name.toLowerCase().startsWith(lower)):null);
      return hit?hit.value:undefined;
    }
    if(option.type===6){const found=/^<@!?(\d{5,25})>$/.exec(word)||/^(\d{15,25})$/.exec(word);return found?found[1]:undefined}
    let value;
    if(option.type===4){
      const money=['bet','amount'].includes(option.name);
      if(money&&['all','max','half'].includes(lower))value=Math.max(1,Math.floor(lower==='half'?p.credits/2:p.credits));
      else{
        const found=/^(\d+)(?:\.(\d+))?([km]?)$/.exec(lower.replace(/,/g,''));
        if(!found||(found[2]&&!found[3])||(found[3]&&!money))return undefined;
        value=Math.floor(Number(found[1]+'.'+(found[2]||'0'))*({k:1e3,m:1e6}[found[3]]||1));
      }
    }else if(option.type===10){
      if(!/^\d+(\.\d+)?$/.test(plain))return undefined;
      value=Number(plain);
    }else return option.type===3?word:undefined;
    if(option.min_value!=null&&value<option.min_value)return undefined;
    if(option.max_value!=null&&value>option.max_value)return undefined;
    return value;
  }
  function usage(name){
    const cmd=commands[name];
    return '`'+prefix+name+(cmd.options||[]).map(option=>' '+(option.type===1?option.name:(option.required?'<':'[')+
      (option.choices&&option.choices.length<=5?option.choices.map(choice=>choice.name.split(' ')[0].toLowerCase()).join('|'):option.type===6?'@'+option.name:option.name)+(option.required?'>':']'))).join('')+'`';
  }
  // Answers a typed message such as "$coinflip 50 heads", or returns null when it is not a command.
  // Words are matched to the command's options in whatever order they are typed.
  function handleMessage(message){
    const user=message.author;
    if(!prefix||!user||user.bot||typeof message.content!=='string'||!message.content.startsWith(prefix)||!/^\d{5,25}$/.test(String(user.id)))return null;
    // The command name comes straight after the prefix: "$ coinflip" and "$50" are ordinary messages.
    const words=message.content.slice(prefix.length).split(/\s+/).filter(Boolean);
    if(!words.length||!/^[a-z]/i.test(message.content.slice(prefix.length))||!/^[a-z]+$/i.test(words[0]))return null;
    let name=words.shift().toLowerCase();
    if(name==='setup')words.unshift('setup');
    name=ALIASES[name]||name;
    if(!Object.hasOwn(commands,name))return null;
    const p=arcadeEnabled?player(user):null,opts={},options=commands[name].options||[];
    for(const word of words.slice(0,12)){
      const sub=options.find(option=>option.type===1&&option.name===word.toLowerCase());
      if(sub){opts._sub=sub.name;continue}
      const fits=options.find(option=>option.type!==1&&!(option.name in opts)&&readWord(option,word,p)!==undefined);
      if(!fits)return whisper('I could not read “'+word.slice(0,40).replace(/[`@]/g,'')+'”. Use '+usage(name)+'.');
      opts[fits.name]=readWord(fits,word,p);
    }
    const missing=options.find(option=>option.required&&!(option.name in opts));
    if(missing)return whisper('Add the '+missing.name+'. Use '+usage(name)+'.');
    const users={};
    for(const mentioned of message.mentions||[])if(mentioned?.id)users[mentioned.id]=mentioned;
    return launch(name,{user,id:user.id,opts,p,resolved:{users},token:null,guild:message.guild_id,roles:message.member?.roles,permissions:null});
  }

  // Rounds left idle are finished for the player (collected if there is something to collect, the
  // stake returned if nothing was played); unjoined flips are refunded; old flip messages are deleted.
  function sweep(at=now()){
    for(const round of [...rounds.values()]){
      if(at-round.at<IDLE)continue;
      const p=data.players[round.id],table=tables[round.game];
      if(table.played(round)){table.stop(round);table.show(round,{id:round.id,username:p.name},p)}
      else{rounds.delete(round.id);delete data.held['round:'+round.id];p.credits=credit(p.credits+round.stake);store.save()}
    }
    for(const flip of [...flips.values()]){
      if(at-flip.at<FLIP_TTL)continue;
      flips.delete(flip.id);delete data.held['flip:'+flip.id];
      const owner=data.players[flip.creator];owner.credits=credit(owner.credits+flip.bet);store.save();
      const expired={embeds:[flipEmbed(flip,['Nobody joined. '+coins(flip.bet)+' went back to <@'+flip.creator+'>.'],COLORS.even)],components:[],attachments:[],allowed_mentions:{parse:[]}};
      if(flip.token)edit(flip.token,{data:expired}).catch(()=>{});
      else if(flip.message)rest('PATCH','/channels/'+flip.message.channel+'/messages/'+flip.message.id,expired).catch(()=>{});
      clearLater(flip,null);
    }
    // Flip messages that finished twenty minutes ago are deleted. One already gone is not an error.
    const due=data.cleanup.filter(item=>at-item.at>=FLIP_CLEAR);
    if(due.length){
      data.cleanup=data.cleanup.filter(item=>at-item.at<FLIP_CLEAR);store.save();
      for(const item of due)rest('DELETE','/channels/'+item.channel+'/messages/'+item.id).catch(()=>{});
    }
    for(const [id,waiting] of pending)if(at-waiting.at>=IDLE)pending.delete(id);
  }

  // ---------- Discord ----------
  const definitions=()=>Object.entries(commands).map(([name,cmd])=>({name,type:1,description:cmd.description,options:cmd.options||[],...(cmd.memberPermissions?{default_member_permissions:cmd.memberPermissions}:{})}));
  // Sends one request. Files go up as a multipart form beside the JSON.
  async function rest(method,route,body,files,attempt=0){
    let response;
    try{
      const headers={authorization:'Bot '+token,'user-agent':'DiscordBot (driftlobby-arcade, 1.0)'};
      let payload;
      if(files?.length){
        payload=new FormData();
        payload.set('payload_json',JSON.stringify(body));
        files.forEach((file,index)=>payload.set('files['+index+']',new Blob([file.data],{type:file.type}),file.name));
      }else if(body!==undefined){headers['content-type']='application/json';payload=JSON.stringify(body)}
      response=await fetchImpl(api+route,{method,headers,body:payload});
    }catch(error){
      // No answer at all (offline, DNS, blocked): try again a couple of times before giving up.
      if(attempt<2){await new Promise(done=>setTimeout(done,1500*(attempt+1)));return rest(method,route,body,files,attempt+1)}
      throw new Error('Could not reach Discord ('+(error?.cause?.code||error?.cause?.message||error?.message||'network error')+').');
    }
    if(response.status===429&&attempt<4){
      const wait=Number((await response.json().catch(()=>({}))).retry_after)||1;
      await new Promise(done=>setTimeout(done,Math.min(15,wait)*1000+50));
      return rest(method,route,body,files,attempt+1);
    }
    if(!response.ok)throw new Error(method+' '+route.replace(/\/interactions\/.*|\/webhooks\/.*/,'/…')+' failed: '+response.status+' '+(await response.text().catch(()=>'')).slice(0,200));
    return response.status===204?null:response.json().catch(()=>null);
  }
  // Changes the message an interaction answered. `reply` is a reply object or {data}.
  const edit=(interactionToken,reply)=>rest('PATCH','/webhooks/'+appId+'/'+interactionToken+'/messages/@original',reply.data,reply.files);
  async function onInteraction(interaction){
    const user=interaction.member?.user||interaction.user,before=standing(user?.id);
    let reply;
    try{reply=handle(interaction)}catch(error){log.error('Command failed: '+(error?.stack||error));reply=whisper('Something went wrong with that one. Check your balance before trying again.')}
    try{
      await rest('POST','/interactions/'+interaction.id+'/'+interaction.token+'/callback',{type:reply.type,data:reply.data},reply.files);
      // Some replies need to know which message they became (a flip, so it can be cleared away later).
      if(reply.onSent)reply.onSent(await rest('GET','/webhooks/'+appId+'/'+interaction.token+'/messages/@original'));
      if(reply.task)await edit(interaction.token,{data:{embeds:[await reply.task()],allowed_mentions:{parse:[]}}});
      if(user)await syncRoles({guild:interaction.guild_id,user,roles:interaction.member?.roles,before,announce:message=>rest('POST','/webhooks/'+appId+'/'+interaction.token,message)});
    }catch(error){log.error(error.message)}
  }
  async function onMessage(message){
    const before=standing(message.author?.id);
    let reply;
    try{reply=handleMessage(message)}catch(error){log.error('Command failed: '+(error?.stack||error));reply=whisper('Something went wrong with that one. Check your balance before trying again.')}
    if(!reply)return;
    try{
      // A typed command is answered with an ordinary reply, which cannot be private.
      const {flags,...body}=reply.data;
      const sent=await rest('POST','/channels/'+message.channel_id+'/messages',{...body,message_reference:{message_id:message.id,fail_if_not_exists:false},allowed_mentions:{...(body.allowed_mentions||{parse:[]}),replied_user:false}},reply.files);
      reply.onSent?.(sent);
      if(reply.task&&sent?.id)await rest('PATCH','/channels/'+message.channel_id+'/messages/'+sent.id,{embeds:[await reply.task()],allowed_mentions:{parse:[]}});
      await syncRoles({guild:message.guild_id,user:message.author,roles:message.member?.roles,before,announce:note=>rest('POST','/channels/'+message.channel_id+'/messages',note)});
    }catch(error){log.error(error.message)}
  }

  let socket=null,sequence=null,session=null,resumeAt=null,beat=null,acked=true,stopped=false,tries=0,sweeper=null,retry=null,readsMessages=Boolean(prefix),lock=null;
  function connect(resume=false){
    if(stopped)return;
    const base=resume&&resumeAt?resumeAt:gateway;
    const ws=socket=new WebSocketImpl(base.replace(/\/+$/,'')+'/?v=10&encoding=json');
    const send=payload=>{try{ws.send(JSON.stringify(payload))}catch{}};
    ws.onmessage=event=>{
      let message;
      try{message=JSON.parse(typeof event.data==='string'?event.data:String(event.data))}catch{return}
      if(message.s!=null)sequence=message.s;
      if(message.op===10){
        clearInterval(beat);acked=true;
        // A missed acknowledgement means the connection is dead: drop it and resume.
        beat=setInterval(()=>{if(!acked){ws.close(4000);return}acked=false;send({op:1,d:sequence})},message.d.heartbeat_interval);
        beat.unref?.();
        send(resume&&session?{op:6,d:{token,session_id:session,seq:sequence}}:{op:2,d:{token,intents:readsMessages?MESSAGE_INTENTS:0,properties:{os:process.platform,browser:'driftlobby',device:'driftlobby'}}});
      }else if(message.op===11)acked=true;
      else if(message.op===1)send({op:1,d:sequence});
      else if(message.op===7)ws.close(4000);
      else if(message.op===9){if(!message.d){session=null;sequence=null}ws.close(4000)}
      else if(message.op===0){
        if(message.t==='READY'){
          session=message.d.session_id;resumeAt=message.d.resume_gateway_url||null;tries=0;botId=message.d.user?.id||botId;
          const servers=message.d.guilds?.length??0;
          if(message.d.guilds?.some(g=>g.id==='1574108087013474314'))prepareVerificationRoom('1574108087013474314').catch(err=>log.error('Verification setup: '+err.message));
          log.log('DriftLobby bot is online as '+(message.d.user?.username||'the bot')+' in '+servers+(servers===1?' server.':' servers.')+(servers?'':' Invite it to a server to use the commands.')+
            (readsMessages?' Commands: '+prefix+'help or /help.':' Commands: /help ('+(prefix||'typed')+' commands are off).'));
        }else if(message.t==='RESUMED')tries=0;
        else if(message.t==='INTERACTION_CREATE')onInteraction(message.d);
        else if(message.t==='MESSAGE_CREATE')onMessage(message.d);
      }
    };
    ws.onerror=()=>{};
    ws.onclose=event=>{
      clearInterval(beat);
      if(stopped||socket!==ws)return;
      if(event.code===4014&&readsMessages){
        // Discord refuses the message-reading intents until they are switched on for the bot.
        readsMessages=false;session=null;sequence=null;
        log.error(prefix+' commands are off: switch on “Message Content Intent” for the bot in the Discord Developer Portal (Bot page), then restart. Slash commands still work.');
        retry=setTimeout(()=>connect(false),1000);
        return;
      }
      if([4004,4010,4011,4012,4013,4014].includes(event.code)){log.error(event.code===4004?'Discord rejected the bot token. Check DISCORD_BOT_TOKEN in server/.env.':'Discord closed the connection for good (code '+event.code+').');return}
      if([4007,4009].includes(event.code)){session=null;sequence=null}
      retry=setTimeout(()=>connect(Boolean(session)),Math.min(30_000,1000*2**tries++));
    };
  }
  // Two copies of the bot would each answer every command and keep separate rounds, so a second
  // copy refuses to start while the first is alive.
  function takeLock(){
    if(!storeFile||!useLock)return;
    const file=storeFile+'.lock';
    let other=0;
    try{other=Number(fs.readFileSync(file,'utf8'))}catch{}
    if(other&&other!==process.pid){
      let alive=true;
      try{process.kill(other,0)}catch(error){alive=error.code==='EPERM'}
      if(alive)throw new Error('The bot is already running (process '+other+'). Stop that one first, or it and this one would both answer every command.');
    }
    fs.writeFileSync(file,String(process.pid));lock=file;
  }
  async function start(){
    if(!token||!appId)throw new Error('Set DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID in server/.env first.');
    if(typeof WebSocketImpl!=='function')throw new Error('This needs Node 22 or newer (for its built-in WebSocket).');
    takeLock();
    // With a server ID the commands appear in that server at once; without one they are global.
    const registered=await rest('PUT','/applications/'+appId+(guildId?'/guilds/'+guildId:'')+'/commands',definitions());
    log.log((registered?.length??definitions().length)+' commands registered'+(guildId?' for server '+guildId:' globally')+'.');
    sweeper=setInterval(sweep,60_000);sweeper.unref?.();
    connect();
  }
  function close(){
    stopped=true;clearInterval(beat);clearInterval(sweeper);clearTimeout(retry);
    try{socket?.close(1000)}catch{}
    store.flush();
    if(lock){try{fs.unlinkSync(lock)}catch{}lock=null}
  }
  return {start,close,handle,handleMessage,sweep,definitions,setupServer,syncRoles,inviteLink,store,rounds,flips};
}

// The bot's settings, read from the environment: server/.env on your own machine, the host's own
// settings when it is hosted. DATA_DIR is the folder balances are kept in; on a host that wipes its
// storage on every restart, point it at a persistent disk. BOT_LOCK=off skips the one-copy lock,
// for a host that already runs exactly one copy (a leftover lock file there could block a restart).
function settingsFromEnv(env=process.env){
  return {token:env.DISCORD_BOT_TOKEN||'',appId:env.DISCORD_CLIENT_ID||'',guildId:env.DISCORD_GUILD_ID||'',siteUrl:env.SITE_URL||'',prefix:env.BOT_PREFIX??'$',
    storeFile:path.join(env.DATA_DIR||__dirname,'bot-data.json'),lock:env.BOT_LOCK!=='off'};
}

module.exports={createBot,loadSite,settingsFromEnv,RANKS,ROLLERS};

if(require.main===module){
  try{process.loadEnvFile(path.join(__dirname,'.env'))}catch{}
  const settings=settingsFromEnv();
  try{fs.mkdirSync(path.dirname(settings.storeFile),{recursive:true})}catch{}
  const bot=createBot({...settings,arcadeEnabled:false});
  bot.start().catch(error=>{console.error(error.message);process.exit(1)});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{bot.close();process.exit(0)});
}
