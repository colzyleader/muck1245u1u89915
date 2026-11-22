const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const engine=vm.runInNewContext(fs.readFileSync('dist/engine.js','utf8')+';Arcade');
test('odd custom bets pay exact natural blackjack and tie returns',()=>{
  const natural=engine.blackjack([6,12,7,0],37);
  assert.equal(natural.hands[0].returned,92.5);
  const tied=engine.blackjack([11,12,13,0],37);
  assert.equal(tied.hands[0].returned,37);
});
test('split and doubled hands match the original stake and available balance',()=>{
  const table=engine.blackjack([8,2,3,5,6,19,8,6],23);
  assert.equal(engine.options(table,22).includes('split'),false);
  assert.equal(engine.play(table,'split',23),23);
  assert.equal(table.hands[1].cost,23);
  assert.equal(engine.play(table,'double',23),23);
  assert.equal(table.hands[0].cost,46);
  assert.equal(table.hands[1].cost,23);
});
test('dice returns scale before rounding and pay the full fair amount',()=>{
  assert.equal(engine.diceOdds('under',50,37).returned,74);
  assert.equal(engine.diceOdds('over',50,3).returned,6);
});
test('the nine bet-sized games pay a win in full',()=>{
  const near=(value,label,slack=0.0005)=>assert.ok(Math.abs(value-1)<=slack,label+' pays back '+value);
  // Dice: normal chance of winning times the winning return, at every target.
  for(const direction of ['under','over'])for(let target=2;target<=98;target++){
    const odds=engine.diceOdds(direction,target,1000000);
    near(odds.fair/100*odds.returned/1000000,'dice '+direction+' '+target);
  }
  // Mines: chance of surviving the picks times what they pay.
  for(const [cells,mines] of [[25,1],[25,3],[25,24],[36,5],[64,20]])for(let picks=1;picks<=Math.min(6,cells-mines);picks++){
    let survive=1;
    for(let i=0;i<picks;i++)survive*=(cells-mines-i)/(cells-i);
    near(survive*engine.mineMultiplier(picks,mines,cells),'mines '+cells+'/'+mines+'/'+picks,1e-9);
  }
  assert.equal(engine.mineMultiplier(0,3,25),1);
  // Limbo: count the rolls that reach each target, out of the million possible.
  for(const target of [1.5,2,3,5,10,25,50,100]){
    let reached=0;
    for(let roll=0;roll<1000000;roll++)if(engine.limboResult(roll)>=target)reached++;
    near(reached/1000000*target,'limbo '+target,0.001);
  }
  assert.equal(engine.limboResult(0),1000);
  assert.equal(engine.limboResult(999999),1);
});
test('the share of the normal win chance falls as the bet grows',()=>{
  const close=(bet,want)=>assert.ok(Math.abs(engine.share(bet)-want)<1e-9,'bet '+bet+' keeps '+engine.share(bet));
  close(1,1);close(10,0.97);close(100,0.94);close(200,1-0.03*Math.log10(200));
  // Over 200 the player keeps 60% of the normal chance: an even-money bet wins 30%, the house 70%.
  close(201,0.6);close(1500,0.6);
  // Over 1,500 the bet cannot win.
  close(1501,0);close(1000000,0);
  for(let bet=2;bet<=2000;bet++)assert.ok(engine.share(bet)<=engine.share(bet-1),'share rises at '+bet);
  // The dice table's own figure is the normal chance times that share.
  assert.ok(Math.abs(engine.diceOdds('under',50,500).chance-30)<1e-9);
  assert.equal(engine.diceOdds('under',50,2000).chance,0);
});

// Live hands: no deck order and no hidden card are kept while a hand is in play.
const live=vm.runInNewContext(fs.readFileSync('dist/engine.js','utf8')+';Arcade',{crypto:require('node:crypto').webcrypto});
test('a live blackjack hand stores nothing about cards that have not been shown',()=>{
  let inPlay=0,dealerNaturals=0,playerNaturals=0;
  const rounds=30000;
  for(let i=0;i<rounds;i++){
    const table=live.blackjack(undefined,10);
    assert.equal('deck' in table,false);
    const upIsAceOrTen=[1,10,11,12,13].includes(live.rank(table.dealer[0]));
    if(table.finished){
      assert.equal(table.dealer.length>=2,true);
      if(live.total(table.dealer.slice(0,2))===21)dealerNaturals++;
      if(live.total(table.hands[0].cards)===21)playerNaturals++;
    }else{
      inPlay++;
      // Only the face-up card exists; the other 49 cards are an unordered list of what is left.
      assert.equal(table.dealer.length,1);
      assert.equal(table.left.length,49);
      assert.deepEqual(Array.from(table.left),Array.from(table.left).sort((a,b)=>a-b));
      // Play it out and make sure no card appears twice and the hidden card never made a blackjack.
      while(!table.finished)live.play(table,live.total(table.hands[table.index].cards)<15?'hit':'stand',0);
      assert.notEqual(live.total(table.dealer.slice(0,2)),21);
    }
    const seen=[...table.dealer,...table.hands.flatMap(h=>Array.from(h.cards))];
    assert.equal(new Set(seen).size,seen.length);
    assert.equal(new Set([...seen,...table.left]).size,52);
    assert.ok(upIsAceOrTen||live.total(table.dealer.slice(0,2))!==21);
  }
  // Dealer and player blackjacks turn up as often as they do with a shuffled deck (about 4.83% each).
  for(const count of [dealerNaturals,playerNaturals])assert.ok(Math.abs(count/rounds-0.04827)<0.006,String(count/rounds));
  assert.ok(inPlay>rounds*0.85);
});
test('the dealer finishes hands the same way with a live deck',()=>{
  let busts=0,settled=0;
  for(let i=0;i<20000;i++){
    const table=live.blackjack(undefined,10);
    while(!table.finished)live.play(table,'stand',0);
    const dealer=live.total(table.dealer);
    assert.ok(dealer>=17||table.hands[0].outcome==='Blackjack'||table.hands[0].outcome==='Bust');
    if(table.hands[0].outcome!=='Blackjack'){settled++;if(dealer>21)busts++}
  }
  // A dealer standing on 17 busts a little over 28% of the time.
  assert.ok(Math.abs(busts/settled-0.283)<0.02,String(busts/settled));
});

test('each game wins as often as its table says for the size of the bet',()=>{
  const trials=30000, rate=hit=>{let n=0;for(let i=0;i<trials;i++)if(hit())n++;return n/trials};
  const wheel=[0,1,0,2,1,0,3,0,1,0,4,0], high=card=>live.rank(card)===1?14:live.rank(card);
  for(const bet of [1,500,1500,2000]){
    const share=live.share(bet);
    const check=(label,normal,hit)=>{
      const seen=rate(hit);
      if(share===0)assert.equal(seen,0,label+' won at a bet of '+bet);
      else assert.ok(Math.abs(seen-normal*share)<0.015,label+' at '+bet+' won '+seen+', expected '+normal*share);
    };
    check('coinflip',1/2,()=>live.coinFace('Heads',bet)==='Heads');
    check('coinflip tails',1/2,()=>live.coinFace('Tails',bet)==='Tails');
    check('dice under 50',0.5,()=>live.diceRoll('under',50,bet)<50);
    check('dice over 90',0.0999,()=>live.diceRoll('over',90,bet)>90);
    check('limbo 2x',1/2,()=>live.limboRound(2,bet)>=2);
    check('limbo 10x',1/10,()=>live.limboRound(10,bet)>=10);
    check('war',48/51/2,()=>{const [mine,house]=live.warDraw(bet);return high(mine)>high(house)});
    check('rock paper scissors',1/3,()=>(1-live.houseThrow(1,bet)+3)%3===1);
    check('wheel',3/12,()=>wheel[live.wheelStop(wheel,bet)]>1);
    check('first pick',1/3,()=>live.safePick(1,3,true,bet));
    // After the first pick the size of the bet no longer counts.
    assert.ok(Math.abs(rate(()=>live.safePick(1,3,false,bet))-1/3)<0.015);
  }
  // Results stay inside what each table can show, whoever takes the round.
  for(let i=0;i<5000;i++){
    const roll=live.diceRoll(i%2?'under':'over',2+i%97,i%3?2000:500);
    assert.ok(roll>=0&&roll<=99.99&&Math.round(roll*100)===+(roll*100).toFixed(6));
    const [mine,house]=live.warDraw(2000);
    assert.ok(mine!==house&&mine>=0&&mine<52&&house>=0&&house<52);
    assert.ok([0,1,2].includes(live.houseThrow(i%3,2000)));
    const multiple=live.limboRound(1.5,2000);
    assert.ok(multiple>=1&&multiple<1.5);
    assert.equal(live.houseTakes(1),false);
  }
  // A tie still returns the bet at any size: ties are left alone.
  assert.ok(Math.abs(rate(()=>{const [mine,house]=live.warDraw(2000);return high(mine)===high(house)})-3/51)<0.015);
  assert.ok(Math.abs(rate(()=>live.houseThrow(0,2000)===0)-1/3)<0.015);
});
