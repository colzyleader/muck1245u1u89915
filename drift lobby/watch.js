export const policy={
 LTC:{base:process.env.LTC_API||'https://litecoinspace.org/api',depth:6,decimals:8},
 BTC:{base:process.env.BTC_API||'https://mempool.space/api',depth:3,decimals:8},
 SOL:{rpc:process.env.SOL_RPC||'https://solana-rpc.publicnode.com',decimals:9},
 ETH:{chain:1,rpc:process.env.ETH_RPC||'https://ethereum-rpc.publicnode.com',depth:12,decimals:18},
 BNB:{chain:56,rpc:process.env.BNB_RPC||'https://bsc-dataseed.bnbchain.org',depth:15,decimals:18},
 AVAX:{chain:43114,rpc:process.env.AVAX_RPC||'https://api.avax.network/ext/bc/C/rpc',depth:3,decimals:18}
};
async function json(url,options){
 const r=await fetch(url,{...options,signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('Provider HTTP '+r.status);
 return r.json();
}
async function rpc(url,method,params=[]){
 const v=await json(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:1,jsonrpc:'2.0',method,params})});
 if(v.error||!Object.hasOwn(v,'result'))throw Error('Unavailable RPC method '+method);
 return v.result;
}
export function utxoAmount(tx,address){
 if(tx.vin.some(i=>i.prevout?.scriptpubkey_address===address))return 0n;
 return tx.vout.reduce((sum,o)=>{
   if(o.scriptpubkey_address!==address)return sum;
   if(!Number.isSafeInteger(o.value)||o.value<0)throw Error('Invalid output amount');
   return sum+BigInt(o.value);
 },0n);
}
async function utxo(w,store,net){
 const endpoint=net.base+'/address/'+encodeURIComponent(w.address)+'/txs';
 const height=await json(net.base+'/blocks/tip/height');
 if(!Number.isSafeInteger(height))throw Error('Invalid tip height');
 const record=tx=>{
   const amount=utxoAmount(tx,w.address);
   if(!amount)return;
   const depth=tx.status.confirmed&&Number.isSafeInteger(tx.status.block_height)?height-tx.status.block_height+1:0;
   store.record(w,tx.txid,amount,depth>=net.depth?'Confirmed':'Pending');
 };
 for(const tx of await json(endpoint+'/mempool'))record(tx);
 let suffix='';
 for(;;){
   const page=await json(endpoint+'/chain'+suffix);
   for(const tx of page){
     if(store.confirmed(w,tx.txid))return;
     record(tx);
   }
   if(page.length<25)return;
   suffix='/'+page.at(-1).txid;
 }
}
export function solAmount(tx,address){
 if(!tx?.meta || tx.meta.err!==null)return 0n;
 const instructions=[...tx.transaction.message.instructions,...(tx.meta.innerInstructions||[]).flatMap(group=>group.instructions)];
 return instructions.reduce((sum,ix)=>{
   const data=ix.parsed?.info;
   if(ix.programId!=='11111111111111111111111111111111'||!['transfer','transferWithSeed'].includes(ix.parsed?.type)||data?.destination!==address||data.source===address)return sum;
   if(!Number.isSafeInteger(data.lamports)||data.lamports<=0)throw Error('Unsupported transfer size');
   return sum+BigInt(data.lamports);
 },0n);
}
async function sol(w,store,net){
 if(await rpc(net.rpc,'getGenesisHash')!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Unexpected Solana network');
 let before;
 for(;;){
   const page=await rpc(net.rpc,'getSignaturesForAddress',[w.address,{commitment:'confirmed',limit:100,before}]);
   for(const item of page){
     if(store.confirmed(w,item.signature))return;
     if(item.err!==null)continue;
     const tx=await rpc(net.rpc,'getTransaction',[item.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}]);
     if(!tx)throw Error('Solana transaction not indexed yet');
     const amount=solAmount(tx,w.address);
     if(amount)store.record(w,item.signature,amount,item.confirmationStatus==='finalized'?'Confirmed':'Pending');
   }
   if(page.length<100)return;
   before=page.at(-1).signature;
 }
}
async function evm(w,store,net){
 const key=process.env.ETHERSCAN_API_KEY;
 if(!key)throw Error('Configure an Etherscan V2 API key');
 const [chain,tip]=await Promise.all([rpc(net.rpc,'eth_chainId'),rpc(net.rpc,'eth_blockNumber')]);
 if(BigInt(chain)!==BigInt(net.chain))throw Error('Unexpected EVM network');
 for(let page=1;;page++){
   const query=new URLSearchParams({chainid:String(net.chain),module:'account',action:'txlist',address:w.address,startblock:'0',endblock:String(BigInt(tip)),page:String(page),offset:'100',sort:'desc',apikey:key});
   const reply=await json('https://api.etherscan.io/v2/api?'+query);
   if(reply.status==='0'&&reply.message==='No transactions found'&&Array.isArray(reply.result)&&!reply.result.length)return;
   if(reply.status!=='1'||!Array.isArray(reply.result))throw Error('Address history unavailable. Check Etherscan plan, key and rate limits.');
   for(const item of reply.result){
     if(store.confirmed(w,item.hash))return;
     if(item.to?.toLowerCase()!==w.address.toLowerCase()||item.isError!=='0'||BigInt(item.value)<=0n)continue;
     const [tx,receipt]=await Promise.all([rpc(net.rpc,'eth_getTransactionByHash',[item.hash]),rpc(net.rpc,'eth_getTransactionReceipt',[item.hash])]);
     if(!tx||!receipt)throw Error('Transaction not indexed by RPC yet');
     if(receipt.status!=='0x1'||tx.blockHash!==receipt.blockHash||tx.hash!==item.hash||tx.to?.toLowerCase()!==w.address.toLowerCase()||tx.from.toLowerCase()===w.address.toLowerCase())continue;
     const canonical=await rpc(net.rpc,'eth_getBlockByNumber',[receipt.blockNumber,false]);
     if(canonical?.hash!==receipt.blockHash)continue;
     const depth=BigInt(tip)-BigInt(receipt.blockNumber)+1n;
     store.record(w,tx.hash,BigInt(tx.value),depth>=BigInt(net.depth)?'Confirmed':'Pending');
   }
   if(reply.result.length<100)return;
 }
}
export async function scan(w,store){
 const net=policy[w.coin];
 const previous=store.cursor(w);
 let newest;
 const batch={
   confirmed:(_,tx)=>tx===previous,
   record:(watch,tx,amount,state)=>{
     if(state==='Confirmed'&&!newest)newest=tx;
     store.record(watch,tx,amount,state);
   }
 };
 if(net.base)await utxo(w,batch,net);
 else if(net.chain)await evm(w,batch,net);
 else await sol(w,batch,net);
 if(newest)store.checkpoint(w,newest);
}
export function displayAmount(raw,coin){
 const d=policy[coin].decimals;
 const s=String(raw).padStart(d+1,'0');
 return s.slice(0,-d)+(('.'+s.slice(-d)).replace(/0+$/,'').replace(/\.$/,''));
}
