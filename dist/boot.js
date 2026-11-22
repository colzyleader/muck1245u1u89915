'use strict';
// Starts the arcade. The game scripts are read as text and run together inside one private scope,
// so their functions and the saved state are not reachable from the browser console.
// Opened straight from a folder (file://) the browser will not let a page read its own files this
// way, so the scripts are added as ordinary tags instead; that works but leaves them reachable.
// Change VERSION whenever any of the files below changes, so browsers fetch the new copies.
(()=>{
  const VERSION='47';
  const files=['engine.js','audio.js','app.js','tables.js','floor.js','legal.js','account.js','showdowns.js','live-stats.js','chat-crowd.js','chat.js','duels.js'];
  const ready=()=>window.dispatchEvent(new Event('drift:ready'));
  function ordinaryTags(){
    files.reduce((earlier,file)=>earlier.then(()=>new Promise((loaded,failed)=>{
      const tag=document.createElement('script');
      tag.src=file+'?v='+VERSION;tag.onload=loaded;tag.onerror=failed;document.head.append(tag);
    })),Promise.resolve()).then(ready,ready);
  }
  if(location.protocol==='file:'){ordinaryTags();return}
  Promise.all(files.map(file=>fetch(file+'?v='+VERSION).then(reply=>{
    if(!reply.ok)throw new Error('Could not load '+file);
    return reply.text();
  }))).then(sources=>{
    let start;
    try{start=new Function(sources.join('\n;\n')+'\n//# sourceURL=driftlobby.js')}
    catch{ordinaryTags();return}
    try{start()}finally{ready()}
  },ordinaryTags);
})();
