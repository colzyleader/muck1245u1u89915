'use strict';
// Rebuilds dist/chat-pfps.js from the pictures in dist/art/pfps.
// Run `node server/list-pfps.js` after adding or removing pictures.
const fs=require('node:fs'),path=require('node:path');
const folder=path.join(__dirname,'..','dist','art','pfps');
fs.mkdirSync(folder,{recursive:true});
const pictures=fs.readdirSync(folder).filter(name=>/\.(png|jpe?g|webp|gif|avif)$/i.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
fs.writeFileSync(path.join(__dirname,'..','dist','chat-pfps.js'),
  "'use strict';\n// Profile pictures for the simulated chat characters, one per character.\n// Made by `node server/list-pfps.js` from the files in dist/art/pfps. Do not edit by hand.\nwindow.DRIFT_PFPS="+JSON.stringify(pictures,null,2)+";\n");
// Change the address the page loads the list from, so browsers do not reuse an old copy.
const page=path.join(__dirname,'..','dist','index.html');
fs.writeFileSync(page,fs.readFileSync(page,'utf8').replace(/chat-pfps\.js\?v=[\w-]+/,'chat-pfps.js?v='+Date.now().toString(36)));
console.log(pictures.length+' picture'+(pictures.length===1?'':'s')+' listed in dist/chat-pfps.js');
