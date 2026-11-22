const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const app = fs.readFileSync('dist/app.js','utf8');
const account = fs.readFileSync('dist/account.js','utf8');

function arcade(players){
  const memory=new Map([['nightshift.freeplay.v1',JSON.stringify({players,current:0})]]);
  const element={value:'',classList:{toggle(){}},setAttribute(){},removeAttribute(){},addEventListener(){},close(){}};
  const ctx=vm.createContext({
    document:{querySelector:()=>element,querySelectorAll:()=>[],addEventListener(){}},
    window:{addEventListener(){}},location:{hash:''},
    localStorage:{getItem:key=>memory.get(key),setItem:(key,val)=>memory.set(key,val)}
  });
  vm.runInContext(app+account,ctx);
  return code=>vm.runInContext(code,ctx);
}

test('totals survive history limits, ignore free credits, and stay with the right player',()=>{
  const start={name:'One',credits:1000,history:[],favorites:[]};
  const run=arcade([start,{...start,name:'Two'}]);
  run("for(let i=0;i<60;i++)record('coinflip',20,'Heads');record('blackjack',0,'Split loss',20);record('war',10,'Tie');moveCredits(player(),1000,'refill');save()");
  assert.equal(run('player().profit.net'),580);
  assert.equal(run('player().history.length'),50);
  assert.equal(run('db.players[1].profit.net'),0);
  assert.equal(run('JSON.parse(localStorage.getItem(KEY)).players[0].profit.net'),580);
});
test('legacy totals distinguish complete accounting from truncated history',()=>{
  const fullRounds=Array.from({length:50},()=>({net:-10}));
  const run=arcade([
    {credits:1750,ledger:[{kind:'refill',amount:1000},{kind:'welcome',amount:1000}],history:fullRounds,favorites:[],blackjack:{hands:[{cost:20},{cost:10}]}},
    {credits:1700,ledger:[],history:fullRounds,favorites:[]}
  ]);
  assert.equal(run('db.players[0].profit.net'),-220);
  assert.equal(run('db.players[0].profit.partial'),false);
  assert.equal(run('db.players[1].profit.net'),-500);
  assert.equal(run('db.players[1].profit.partial'),true);
});
test('custom bets post their actual cost and fractional returns to profit and wallet',()=>{
  const run=arcade([{name:'One',credits:1000,history:[],favorites:[]}]);
  run("player().wager=37;moveCredits(player(),-37,'entry','blackjack');record('blackjack',92.5,'Blackjack');moveCredits(player(),-23,'entry','tower');player().wager=5;record('tower',0,'Lost',23)");
  assert.equal(run('player().credits'),1032.5);
  assert.equal(run('player().profit.net'),32.5);
  assert.equal(run('player().history[0].net'),-23);
  assert.equal(run('inPlayCredits({mine:{stake:31},streak:{},tower:{stake:12}})'),53);
  for(const invalid of ['0','-7','1.5','1001','','1e2','Infinity']){
    assert.notEqual(run('wagerError('+JSON.stringify(invalid)+',1000)'), '');
  }
  assert.equal(run("wagerError('997',1000)"),'');
});
test('live stats tally rounds, cap the chart, and reset without touching all-time profit',()=>{
  const run=arcade([{name:'One',credits:1000,history:[],favorites:[]},{name:'Two',credits:1000,history:[],favorites:[]}]);
  run("record('dice',20,'Hit',10);record('dice',0,'Miss',10);record('war',10,'Tie',10);record('blackjack',37.5,'Blackjack',15)");
  assert.deepEqual(JSON.parse(run('JSON.stringify(player().live)')),{wagered:45,profit:22.5,wins:2,losses:1,series:[0,10,0,0,22.5]});
  assert.equal(run('db.players[1].live'),undefined);
  assert.equal(run('JSON.parse(localStorage.getItem(KEY)).players[0].live.wagered'),45);
  run("for(let i=0;i<300;i++)record('dice',0,'Miss',1)");
  assert.equal(run('player().live.series.length'),240);
  assert.equal(run('player().live.series.at(-1)'),-277.5);
  assert.equal(run('player().live.losses'),301);
  run('resetLiveStats(player())');
  assert.deepEqual(JSON.parse(run('JSON.stringify(player().live)')),{wagered:0,profit:0,wins:0,losses:0,series:[0]});
  assert.equal(run('player().profit.net'),-277.5);
});
test('profit chart keeps zero in view and draws one point per round',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync('dist/live-stats.js','utf8'),ctx);
  const chart=series=>vm.runInContext('liveChartSvg('+JSON.stringify(series)+')',ctx);
  assert.ok(!chart([0]).includes('<polyline'));
  assert.match(chart([0]),/class="live-zero"/);
  const drawn=chart([0,10,-30,-25]);
  const points=drawn.match(/points="([^"]+)"/)[1].split(' ').map(pair=>pair.split(',').map(Number));
  assert.equal(points.length,4);
  const zero=Number(drawn.match(/y1="([\d.]+)" y2="\1" class="live-zero"/)[1]);
  assert.equal(points[0][1],zero);
  assert.ok(points[1][1]<zero&&points[2][1]>zero);
  assert.ok(points.every(([x,y])=>x>=0&&x<=268&&y>=0&&y<=150));
  assert.ok(!chart([5,5,5]).includes('NaN'));
});
test('each Discord account gets its own profile and signing out returns to a guest profile',()=>{
  const run=arcade([{name:'Player 1',credits:640,history:[],favorites:['dice']}]);
  // First sign-in keeps the profile that was already being played.
  assert.equal(run("accountProfile('111','Col')"),0);
  assert.equal(run('db.players[0].discordId'),'111');
  assert.equal(run('db.players[0].name'),'Col');
  assert.equal(run('db.players[0].credits'),640);
  // Signing out with no unlinked profile creates a fresh guest.
  assert.equal(run('guestProfile()'),1);
  run('switchPlayer(1)');
  assert.equal(run('player().name'),'Guest');
  assert.equal(run('player().credits'),1000);
  assert.equal(run('guestProfile()'),1);
  // The same account comes back to its own credits; the guest is not taken over.
  assert.equal(run("accountProfile('111','Renamed on Discord')"),0);
  assert.equal(run('db.players[0].name'),'Col');
  run('switchPlayer(0)');
  // A second account while the first is in play gets a new profile.
  assert.equal(run("accountProfile('222','Rv')"),2);
  assert.equal(run('db.players[2].credits'),1000);
  assert.equal(run('db.players[2].discordId'),'222');
  assert.equal(run('db.players[0].credits'),640);
  assert.equal(run('db.players.length'),3);
});

// Loads the arcade from whatever text is in storage and hands back both the page and the storage.
function arcadeFrom(text){
  const memory=new Map(text===null?[]:[['nightshift.freeplay.v1',text]]);
  const element={value:'',classList:{toggle(){}},setAttribute(){},removeAttribute(){},addEventListener(){},close(){},showModal(){},textContent:'',innerHTML:''};
  const ctx=vm.createContext({
    document:{querySelector:()=>element,querySelectorAll:()=>[],addEventListener(){}},
    window:{addEventListener(){}},location:{hash:''},
    localStorage:{getItem:key=>memory.get(key)??null,setItem:(key,val)=>memory.set(key,val)}
  });
  vm.runInContext(app+account,ctx);
  return {run:code=>vm.runInContext(code,ctx),stored:()=>memory.get('nightshift.freeplay.v1')};
}
test('a save edited outside the game is caught and reset; untouched and older saves are kept',()=>{
  const first=arcadeFrom(JSON.stringify({current:0,players:[{name:'One',credits:640,history:[],favorites:['dice']}]}));
  // A save from before seals existed loads as it is and gets sealed on the next save.
  assert.equal(first.run('player().credits'),640);
  assert.equal(first.run('saveWasEdited'),false);
  first.run("record('dice',30,'Hit',10)");
  const sealed=first.stored();
  assert.equal(typeof JSON.parse(sealed).seal,'string');

  // Reloading the untouched save keeps everything.
  const again=arcadeFrom(sealed);
  assert.equal(again.run('saveWasEdited'),false);
  assert.equal(again.run('player().credits'),670);
  assert.equal(again.run('player().history.length'),1);

  assert.ok(sealed.includes('"credits":670'));
  // Raising the balance by hand breaks the seal: the profile goes back to a fresh start.
  const cheated=arcadeFrom(sealed.replace('"credits":670','"credits":999999'));
  assert.equal(cheated.run('saveWasEdited'),true);
  assert.equal(cheated.run('player().credits'),1000);
  assert.equal(cheated.run('player().history.length'),0);
  assert.equal(cheated.run('player().name'),'One');
  assert.deepEqual(Array.from(cheated.run('player().favorites')),['dice']);
  // The reset save is sealed again, so the next visit is clean.
  assert.equal(arcadeFrom(cheated.stored()).run('saveWasEdited'),false);

  // Editing history or swapping in a forged seal is caught too.
  assert.equal(arcadeFrom(sealed.replace('"net":20','"net":9000')).run('saveWasEdited'),true);
  const forged=JSON.parse(sealed);forged.players[0].credits=5000;forged.seal='abc.def';
  assert.equal(arcadeFrom(JSON.stringify(forged)).run('saveWasEdited'),true);
});
test('all game scripts can run together in one private scope',()=>{
  const boot=fs.readFileSync('dist/boot.js','utf8');
  const files=JSON.parse(boot.match(/const files=(\[[^\]]+\])/)[1].replace(/'/g,'"'));
  assert.ok(files.length>=11&&files.every(file=>fs.existsSync('dist/'+file)));
  // Building the function checks that no two files declare the same top-level name.
  assert.doesNotThrow(()=>new Function(files.map(file=>fs.readFileSync('dist/'+file,'utf8')).join('\n;\n')));
  // Every script in the dist folder is either loaded by the starter or is plain configuration.
  const scripts=fs.readdirSync('dist').filter(name=>name.endsWith('.js'));
  assert.deepEqual(scripts.filter(name=>!files.includes(name)).sort(),['boot.js','chat-config.js','chat-pfps.js']);
});
