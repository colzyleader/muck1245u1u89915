// Run only on the operator's backup machine. Only the JSON file goes to the bot.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { publicKeys } from './derive.js';

const count=Number(process.argv[2] || 25);
if(!Number.isInteger(count)||count<1||count>10000||!process.argv[3]) throw Error('Usage: npm run inventory -- 25 NEW_BACKUP_DIRECTORY');
const dir=resolve(process.argv[3]); mkdirSync(dir,{mode:0o700});
const inventory=[];
for(let i=0;i<count;i++){
  const words=generateMnemonic(wordlist,256), keys=publicKeys(words);
  const slot=keys.ETH;
  writeFileSync(join(dir,slot+'.words'),words+'\n',{flag:'wx',mode:0o600});
  inventory.push(keys);
}
writeFileSync(join(dir,'public-pool.json'),JSON.stringify(inventory),{flag:'wx',mode:0o600});
console.log('Back up this directory offline. Copy ONLY public-pool.json to the bot host.');
