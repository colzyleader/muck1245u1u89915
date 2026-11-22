'use strict';
// Pictures of card tables for the Discord bot, made without any image library: the cards are cut
// from one sheet (server/art/cards.png, drawn by `node server/make-cards.js` from art/cards.html)
// and laid on a felt background. PNG reading and writing only needs Node's zlib.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');

const CARD_W=120,CARD_H=168,LABEL_W=240,LABEL_H=48,PAD=22,GAP=10;
const LABELS=['DEALER','YOU','HAND 1','HAND 2','HOUSE','CARD','BEFORE'];
const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);

// Reads an 8-bit RGB or RGBA PNG (what a browser screenshot is) into {width,height,data: RGBA bytes}.
function decodePng(file){
  if(file.length<33||!file.subarray(0,8).equals(SIGNATURE))throw new Error('not a PNG');
  let at=8,width=0,height=0,channels=0;
  const parts=[];
  while(at+8<=file.length){
    const length=file.readUInt32BE(at),type=file.toString('latin1',at+4,at+8),body=file.subarray(at+8,at+8+length);
    if(type==='IHDR'){
      width=body.readUInt32BE(0);height=body.readUInt32BE(4);
      if(body[8]!==8||![2,6].includes(body[9])||body[12]!==0)throw new Error('unsupported PNG type');
      channels=body[9]===6?4:3;
    }else if(type==='IDAT')parts.push(body);
    else if(type==='IEND')break;
    at+=12+length;
  }
  if(!width||!height||width*height>40_000_000)throw new Error('bad PNG size');
  const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*channels;
  if(raw.length<(stride+1)*height)throw new Error('short PNG data');
  const rows=Buffer.alloc(stride*height),data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)],from=y*(stride+1)+1,to=y*stride;
    for(let x=0;x<stride;x++){
      const left=x>=channels?rows[to+x-channels]:0,up=y?rows[to+x-stride]:0,corner=y&&x>=channels?rows[to+x-stride-channels]:0;
      let value=raw[from+x];
      if(filter===1)value+=left;
      else if(filter===2)value+=up;
      else if(filter===3)value+=(left+up)>>1;
      else if(filter===4){const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner);value+=a<=b&&a<=c?left:b<=c?up:corner}
      rows[to+x]=value&255;
    }
  }
  for(let i=0,o=0;i<rows.length;i+=channels,o+=4){data[o]=rows[i];data[o+1]=rows[i+1];data[o+2]=rows[i+2];data[o+3]=channels===4?rows[i+3]:255}
  return {width,height,data};
}
function chunk(type,body){
  const out=Buffer.alloc(12+body.length);
  out.writeUInt32BE(body.length,0);out.write(type,4,'latin1');body.copy(out,8);
  out.writeUInt32BE(zlib.crc32(out.subarray(4,8+body.length))>>>0,8+body.length);
  return out;
}
function encodePng({width,height,data}){
  const header=Buffer.alloc(13),raw=Buffer.alloc((width*4+1)*height);
  header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  for(let y=0;y<height;y++)Buffer.from(data.buffer,data.byteOffset+y*width*4,width*4).copy(raw,y*(width*4+1)+1);
  return Buffer.concat([SIGNATURE,chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
function readSheet(file=path.join(__dirname,'art','cards.png')){
  try{return decodePng(fs.readFileSync(file))}catch{return null}
}

// Copies a piece of the sheet onto the picture, blending by its transparency.
function paste(target,sheet,sx,sy,w,h,dx,dy){
  for(let y=0;y<h;y++){
    const ty=dy+y;
    if(ty<0||ty>=target.height)continue;
    for(let x=0;x<w;x++){
      const tx=dx+x;
      if(tx<0||tx>=target.width)continue;
      const s=((sy+y)*sheet.width+sx+x)*4,t=(ty*target.width+tx)*4,alpha=sheet.data[s+3];
      if(!alpha)continue;
      if(alpha===255||!target.data[t+3]){target.data[t]=sheet.data[s];target.data[t+1]=sheet.data[s+1];target.data[t+2]=sheet.data[s+2];target.data[t+3]=Math.max(alpha,target.data[t+3]);continue}
      const a=alpha/255;
      for(let k=0;k<3;k++)target.data[t+k]=Math.round(sheet.data[s+k]*a+target.data[t+k]*(1-a));
      target.data[t+3]=Math.max(alpha,target.data[t+3]);
    }
  }
}
// A rounded felt table with a lighter rim, smooth at the corners.
function felt(width,height,radius=26){
  const data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dx=Math.max(radius-x-.5,x+.5-(width-radius),0),dy=Math.max(radius-y-.5,y+.5-(height-radius),0);
    const inside=radius-Math.hypot(dx,dy);
    if(inside<=0)continue;
    const shade=y/height,rim=inside<3,o=(y*width+x)*4;
    data[o]=rim?70:Math.round(30-12*shade);data[o+1]=rim?128:Math.round(78-30*shade);data[o+2]=rim?104:Math.round(61-23*shade);
    data[o+3]=Math.round(255*Math.min(1,inside));
  }
  return {width,height,data};
}
const spread=count=>count<=3?CARD_W+6:count<=5?80:58;
const rowWidth=count=>Math.max(LABEL_W,(Math.max(1,count)-1)*spread(count)+CARD_W);

// createCardArt().table(groups, sideBySide) returns a PNG. Each group is {label, cards}; a card is
// 0 to 51 (suit × 13 + rank − 1, suits in the order spades, hearts, diamonds, clubs) or -1 for a
// face-down card. Returns null when the sheet is missing, and the bot falls back to text.
function createCardArt(file){
  const sheet=readSheet(file);
  if(!sheet||sheet.width<13*CARD_W||sheet.height<5*CARD_H)return null;
  function drawGroup(target,group,x,y){
    const label=LABELS.indexOf(group.label);
    if(label>=0)paste(target,sheet,CARD_W+(label%4)*LABEL_W,4*CARD_H+Math.floor(label/4)*LABEL_H,LABEL_W,LABEL_H,x,y);
    const step=spread(group.cards.length);
    group.cards.forEach((card,index)=>paste(target,sheet,card<0?0:(card%13)*CARD_W,card<0?4*CARD_H:Math.floor(card/13)*CARD_H,CARD_W,CARD_H,x+index*step,y+LABEL_H));
  }
  return {
    table(groups,sideBySide=false){
      const widths=groups.map(group=>rowWidth(group.cards.length)),block=LABEL_H+CARD_H;
      const width=2*PAD+(sideBySide?widths.reduce((sum,w)=>sum+w,0)+(groups.length-1)*2*GAP:Math.max(...widths,3*(CARD_W+6)-6));
      const height=2*PAD+(sideBySide?block:groups.length*block+(groups.length-1)*GAP);
      const target=felt(width,height);
      let x=PAD,y=PAD;
      groups.forEach((group,index)=>{
        drawGroup(target,group,x,y);
        if(sideBySide)x+=widths[index]+2*GAP;else y+=block+GAP;
      });
      return encodePng(target);
    }
  };
}

module.exports={createCardArt,readSheet,decodePng,encodePng,LABELS};
