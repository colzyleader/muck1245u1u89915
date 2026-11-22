const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('retired Chicken Cross refunds an unfinished entry once across reloads', () => {
  const players = [
    {credits:90, favorites:['chicken','dice'], chicken:{steps:[0]}, history:[]},
    {credits:100, favorites:['chicken'], history:[{game:'chicken',net:3}]}
  ];
  const source = fs.readFileSync('dist/account.js','utf8');
  for(let load=0;load<2;load++){
    const context = {db:{players}, $:()=>({}), localStorage:{getItem:()=>true},
      KEY:'test', COST:10, save(){},renderCards(){},navigate(){}};
    vm.runInNewContext(source,context);
  }
  assert.equal(players[0].credits,100);
  assert.deepEqual(players[0].favorites,['dice']);
  assert.equal(players[0].ledger.filter(e=>e.kind==='retired').length,1);
  assert.equal(players[1].credits,100);
  assert.equal(players[1].history[0].game,'chicken');
  assert.ok(!('chicken' in players[0]));
});
