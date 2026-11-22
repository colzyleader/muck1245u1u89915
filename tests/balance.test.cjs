const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

const source = name => readFileSync(join(__dirname, '..', 'dist', name), 'utf8');
const context = vm.createContext({crypto: require('node:crypto').webcrypto, tableGames:{}});
vm.runInContext(source('engine.js')+source('floor.js'),context);
const {Arcade,wheelSlots} = vm.runInContext('({Arcade,wheelSlots})',context);

test('Wheel segments average 1x at full odds, with three that pay more than the bet', () => {
  assert.equal(wheelSlots.length,12);
  assert.equal(wheelSlots.reduce((sum, multiple) => sum + multiple, 0)/wheelSlots.length,1);
  assert.deepEqual(Array.from(wheelSlots).filter(multiple => multiple>1),[2,3,4]);
});

test('Plinko balances the credit return against the probability of each slot', () => {
  for(const rows of [8,12,16]) for(const risk of ['Low','Medium','High']){
    const bins=Arcade.slots(rows,risk);
    let returned=0;
    for(let path=0;path<2**rows;path++){
      let slot=0;
      for(let r=0;r<rows;r++)slot+=(path>>r)&1;
      returned+=Math.round(10*bins[slot]);
    }
    const mean=returned/2**rows;
    assert.ok(mean>=9.75 && mean<=10,rows+' rows / '+risk+' returned '+mean);
  }
});

test('all choices have an equal chance of being one of the two safe doors', () => {
  for(const doors of [3,4]){
    const clears=Array(doors).fill(0);
    for(let first=0;first<doors;first++)for(let next=0;next<doors-1;next++){
      context.testDraws=[first,next];
      const safe=vm.runInContext('(()=>{const old=Arcade.random;try{Arcade.random=()=>testDraws.shift();return uniqueDraw('+doors+',2)}finally{Arcade.random=old}})()',context);
      assert.equal(new Set(safe).size,2);
      for(const choice of safe)clears[choice]++;
    }
    assert.ok(clears.every(count=>count/(doors*(doors-1))===2/doors));
  }
});

test('every Tower level pays the full fair amount and has a sensible layout', () => {
  const modes = vm.runInContext('towerModes',context);
  assert.deepEqual(Object.keys(modes),['Easy','Classic','Challenge','Expert','Master']);
  for(const [doors,safe] of Object.values(modes)){
    assert.ok(safe>=1&&safe<doors&&doors<=4);
    const chance = safe/doors, factor = 1/chance;
    // Whatever floor you collect on, chance of getting there times what it pays is the stake
    // (less at most a credit of rounding down).
    for(let floors=1;floors<=7;floors++){
      context.testClimb = [1000000,factor,floors];
      const paid = vm.runInContext('towerReturn(testClimb[0],testClimb[1],testClimb[2])',context);
      const back = chance**floors*paid/1000000;
      assert.ok(back<=1+1e-9&&back>0.9999,doors+'/'+safe+' floor '+floors+' returns '+back);
    }
    assert.equal(vm.runInContext('towerReturn(25,3,0)',context),0);
    context.testDoors = [doors,safe];
    for(let i=0;i<50;i++){
      const drawn = vm.runInContext('uniqueDraw(testDoors[0],testDoors[1])',context);
      assert.equal(new Set(drawn).size,safe);
      assert.ok(drawn.every(door => door>=0&&door<doors));
    }
  }
});
