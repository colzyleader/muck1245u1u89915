import { DatabaseSync } from 'node:sqlite';
import { addresses,networks } from './addresses.js';

export function openStore(file){
 const db=new DatabaseSync(file);
 db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS wallets(user TEXT PRIMARY KEY,addresses TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pool(slot TEXT PRIMARY KEY,wallet TEXT NOT NULL,user TEXT UNIQUE);
 CREATE TABLE IF NOT EXISTS watches(user TEXT,coin TEXT,address TEXT,PRIMARY KEY(user,coin),UNIQUE(coin,address));
 CREATE TABLE IF NOT EXISTS cursors(user TEXT,coin TEXT,tx TEXT,PRIMARY KEY(user,coin));
 CREATE TABLE IF NOT EXISTS events(user TEXT,coin TEXT,tx TEXT,amount TEXT,state TEXT,sent TEXT DEFAULT '',message TEXT,PRIMARY KEY(user,coin,tx));`);
 function transaction(fn){
   db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
 }
 function install(rows){transaction(()=>{
   if(!Array.isArray(rows))throw Error('Invalid public pool');
   for(const keys of rows){
     const wallet=JSON.stringify(addresses(keys));
     const old=db.prepare('SELECT wallet FROM pool WHERE slot=?').get(keys.ETH);
     if(old && old.wallet!==wallet)throw Error('Conflicting pool slot');
     db.prepare('INSERT OR IGNORE INTO pool(slot,wallet) VALUES(?,?)').run(keys.ETH,wallet);
   }
 });}
 function issue(user,coin){
   if(!Object.hasOwn(networks,coin))throw Error('Unknown network');
   return transaction(()=>{
     let row=db.prepare('SELECT addresses FROM wallets WHERE user=?').get(user);
     let managed=!!db.prepare('SELECT slot FROM pool WHERE user=?').get(user);
     if(!row){
       const slot=db.prepare('SELECT slot,wallet FROM pool WHERE user IS NULL ORDER BY rowid LIMIT 1').get();
       if(!slot)throw Error('No deposit addresses available. Ask the operator to refill the pool.');
       db.prepare('UPDATE pool SET user=? WHERE slot=?').run(user,slot.slot);
       db.prepare('INSERT INTO wallets VALUES(?,?)').run(user,slot.wallet);
       row={addresses:slot.wallet};managed=true;
     }
     const address=JSON.parse(row.addresses)[coin];
     const existing=db.prepare('SELECT user FROM watches WHERE coin=? AND address=?').get(coin,address);
     if(existing && existing.user!==user)throw Error('Address assignment conflict');
     db.prepare('INSERT OR IGNORE INTO watches VALUES(?,?,?)').run(user,coin,address);
     return {address,managed};
   });
 }
 function record(w,tx,amount,state){
   if(!['Pending','Confirmed'].includes(state)||BigInt(amount)<=0n)return;
   db.prepare(`INSERT INTO events(user,coin,tx,amount,state) VALUES(?,?,?,?,?)
     ON CONFLICT(user,coin,tx) DO UPDATE SET amount=excluded.amount,state=excluded.state
     WHERE events.state!='Confirmed'`).run(w.user,w.coin,tx,String(amount),state);
 }
 return {db,install,issue,record,
  confirmedDeposits:user=>{
    const totals=new Map();
    const rows=db.prepare("SELECT coin,amount FROM events WHERE user=? AND state='Confirmed' ORDER BY coin");
    for(const {coin,amount} of rows.iterate(user)){
      totals.set(coin,(totals.get(coin)??0n)+BigInt(amount));
    }
    return totals;
  },
  watches:()=>db.prepare('SELECT * FROM watches ORDER BY coin,user').all(),
  cursor:w=>db.prepare("SELECT tx FROM cursors WHERE user=? AND coin=?").get(w.user,w.coin)?.tx,
  checkpoint:(w,tx)=>db.prepare("INSERT OR REPLACE INTO cursors VALUES(?,?,?)").run(w.user,w.coin,tx),
  queue:()=>db.prepare('SELECT * FROM events WHERE sent!=state ORDER BY rowid').all(),
  delivered:(e,id)=>db.prepare('UPDATE events SET sent=?,message=? WHERE user=? AND coin=? AND tx=?').run(e.state,id,e.user,e.coin,e.tx),
  close:()=>db.close()};
}
