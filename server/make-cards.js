'use strict';
// Redraws the Discord bot's card sheet: photographs server/art/cards.html with Google Chrome (or
// another Chromium browser) into server/art/cards.png. Run it after changing cards.html.
//   node server/make-cards.js
// Set CHROME to the browser's path if it is not found.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

const browsers=[process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const browser=browsers.find(file=>fs.existsSync(file));
if(!browser){console.error('No Chrome, Chromium, Edge or Brave found. Set CHROME to the browser’s path.');process.exit(1)}

const page=path.join(__dirname,'art','cards.html'),out=path.join(__dirname,'art','cards.png');
// A throwaway profile, so this never touches the browser you have open.
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'drift-cards-'));
const shot=spawnSync(browser,['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1','--window-size=1560,840',
  '--default-background-color=00000000','--user-data-dir='+profile,'--no-first-run','--screenshot='+out,'file://'+page],{stdio:'ignore',timeout:60_000});
fs.rmSync(profile,{recursive:true,force:true});
if(shot.status!==0||!fs.existsSync(out)){console.error('The browser could not take the picture.');process.exit(1)}
const {readSheet}=require('./card-images.js');
const sheet=readSheet(out);
if(!sheet||sheet.width!==1560||sheet.height!==840){console.error('The picture came out the wrong size'+(sheet?' ('+sheet.width+'×'+sheet.height+')':'')+'.');process.exit(1)}
console.log('Card sheet written: '+path.relative(process.cwd(),out)+' ('+Math.round(fs.statSync(out).size/1024)+' KB).');
