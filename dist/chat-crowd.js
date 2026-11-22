'use strict';
// Simulated lobby chatter. These are scripted characters, not real people. The lines are worked
// out in the browser from the clock, so every viewer sees the same ones at the same time and a
// refresh shows the same recent history. Nothing here is sent to the chat server.
// Turn it off with `crowd:false` in chat-config.js.
const CROWD_NAMES=['kyro','mavv','lunaa','dexx7','snowpea','tiltproof','oakley','vexa','juno','rookz','bigmilo','saffi','nori','zeph','pixelgoat','haze','wren','cobalt','tamsin','ozzy','miso','quill','drifty','yuki','bramble','keks','solace','tofu','ember','nyx','gizmo','pogo'];
// Words dropped into lines wherever a {slot} appears.
const CROWD_WORDS={
  game:['limbo','mines','plinko','blackjack','roulette','dice','keno','tower','hi-lo','coinflip','wheel','war','baccarat','rock paper scissors'],
  food:['pizza','ramen','tacos','cereal','a burrito','fries','leftover pasta','instant noodles','a sandwich','ice cream','dumplings','toast'],
  drink:['coffee','an energy drink','iced tea','water','a smoothie','hot chocolate','boba'],
  hour:['1am','2am','3am','4am','midnight'],
  day:['monday','tuesday','friday','sunday','the weekend'],
  thing:['headphones','keyboard','mouse','charger','monitor','chair','wifi','phone']
};
const CROWD_LINES={
  site:[
    'the new chips look clean ngl','mines with the blue gems >>>','profit tracker is humbling me rn','that loading screen tho',
    'limbo count up is so smooth','roulette wheel looks nice','free refill saved me again','this is my 3rd refill dont judge',
    'dark lobby hits different at night','live stats graph going straight down lol','the number grid for roulette is so much better',
    'whoever made the bomb icon cooked','chat on the left is nice','wallet page says im down bad','hi-lo art goes hard',
    'keno balls look like candy','tower is underrated','i keep the profit tracker open just to feel something',
    'dragging the stats panel around is weirdly satisfying','the gold deal button on blackjack is so nice','purple theme goes hard',
    'the win card turning green is a tiny hit of joy','red result card again. cool. cool cool cool','lobby art is actually good',
    'the coin on coinflip has an eagle on it thats sick','blackjack table looks like a real felt','favorites tab is just {game} for me',
    'i hearted every game so favorites is pointless now','settings sliders are smooth','turned sound on and the card slide is crisp',
    'the peg sounds on plinko are asmr','muted the sounds, my roommate was judging me','reset my live stats so i can pretend',
    'history page is a crime scene','the wallet card looks like a real bank card lol','round history says i lost 9 in a row. rude',
    'the dropdowns look way better now','number grid on mines count is nice','blue gems glow is so pretty',
    'that black bomb with the little spark though','the dice bar sliding is satisfying','love that the stats window stays where i put it',
    'first time here, this looks clean','been here an hour, send help','this lobby is cozy','the logo stripes animation is cool',
    'i like that its just credits, no stress','arcade rules say 1000 free credits, i respect it','profit graph looks like a ski slope',
    'my live stats line finally went green','the chips have little stripes, attention to detail','can we get more games',
    'wish there was crash','need a slots game in here','leaderboard when','{game} needs a turbo mode','the art for {game} is my favorite',
    'what does the gear do','just found the profit tracker button','ok the wheel spin sound is great','phone layout works fine btw',
    'playing on my phone in bed','chat moving fast tonight','lobby is busy today','quiet in here today','so many people on rn'],
  game:[
    '{mult}x on limbo lets gooo','limbo {low}x. pain','limbo target 2x and it lands 1.98 every time','{n} gems in a row then bomb. classic',
    '7x7 mines with 20 bombs is not it','first tile was a bomb. FIRST tile','dealer pulling 21 off a 6 is crazy','blackjack natural first hand',
    'split aces and got two tens','doubled on 11 and pulled a 2','plinko went straight down the middle again','plinko edge slot finally!!',
    'keno {n} hits','roulette landed 0. of course','hit single number {roll} on roulette','been on red 6 spins in a row',
    'tower floor {n} and i cashed, scared money','hilo streak of {n}','coinflip {n} heads in a row is rigged (its not)',
    'wheel keeps giving me 0.5x','war tie again lol','rps bot reads my mind fr','baccarat banker streak is real',
    'dice over 50 never hits when i need it','up {amt} on dice','down {amt} on plinko dont talk to me','all in on blackjack wish me luck',
    'who else is on mines','anyone doing limbo 10x targets','collect button is my best friend','cashed out at {n} gems, coward strat works',
    'limbo {big}x and i had target 2. i am sick','limbo 100x target, 0 for 40 so far','limbo 1.00x. one point zero zero','hit 25x limbo twice in a row??',
    'limbo 1.5x is free credits (it is not)','switched to limbo 3x and it stopped hitting','{mult}x and my target was {mult}x','limbo is just watching a number hurt you',
    'mines 3 bombs is the sweet spot','24 mines one gem challenge, got it','8x8 mines takes forever but its fun','clicked the corner tile, bomb. always the corner',
    'mines 1 bomb and i still found it first click','the ghost gems after you lose are so mean','the bomb was right next to my last gem','mines {n} gems cashed, up {amt}',
    'i always click the middle first','diagonal strat on mines never fails (fails constantly)','went for one more gem. you know how it ended','safe next pick said 50 percent. it lied',
    'dealer showing a 6 and still wins','stood on 12 against a 2 and won, dont ask','hit on 16, got a 5. i am a genius','hit on 16, got a 10. i am a clown',
    'blackjack push 3 times in a row','got 20, dealer got 21. standard','soft 17 is the worst hand in the world','double down on 10 vs dealer 9, pray for me',
    'split 8s like the book says and lost both','dealer bust finally','20 hands of blackjack, up exactly {amt}','insurance doesnt exist here and thats correct',
    'five card 21 lets go','natural blackjack pays 3 to 2, love to see it','dealer flipped a 10 under the ace again','my blackjack luck resets every {day}',
    'plinko 16 rows high risk is chaos','plinko low risk is basically a savings account','ball bounced off the edge slot. off it','plinko {mult}x!!!',
    'plinko gave me 0.2x five times straight','watching the ball is half the fun','8 rows medium, steady climbing','the ball KNEW where the 0.4x was',
    'keno 10 picks 0 hits, statistically impressive','keno picked my birthday numbers. nothing','keno 7 of 10 lets gooo','keno auto pick in my head is bad',
    'roulette red black red black, it knows','put it all on even, landed {roll}','single number hit pays so good','0 again. green hates me',
    'roulette odd 5 times in a row then i switch and its odd again','straight up on {roll} every spin until it hits','wheel landed {mult}x finally','wheel gave me 0x three spins running',
    'tower challenge mode is brutal','tower classic is so chill','made it to floor {n} on tower','locked door on floor 2. floor TWO',
    'tower top floor!! screenshot taken','hi-lo king then ace, of course','hi-lo guessed lower on a 3. why did i do that','hi-lo {n} in a row then a tie',
    'cashing hi-lo at 3 every time is boring but it works','coinflip tails never fails (it fails)','heads {n} times straight','lost a coinflip at 50 percent, shocking',
    'war: my king vs their ace','war tie pays?? nice','baccarat tie hit at 9x!!','always banker, never player',
    'player won 6 in a row, banker bros in shambles','rps i threw rock 10 times, 5 wins','paper beats rock but nothing beats my bad luck','scissors only run, lets see',
    'dice under 10 hit for big','dice at 98 percent chance and i still lost once','rolled 50.00 exactly lol','dice target 75 over, {n} wins straight',
    'whats the best game to grind','which game has the best odds','{game} is the most fun one imo','{game} owes me credits',
    'taking a break from {game}, it knows too much','back to {game} after losing on {game}','{game} then bed','{game} speedrun to zero',
    'bet 100 chip by accident, won. new strategy','bet 5 forever, slow and steady','black chip only tonight','who else just clicks the 25 chip',
    'up {amt} tonight','down {amt}, refill time','back to exactly 1000, a full circle','broke even after an hour, time well spent',
    'doubled my credits, quitting while ahead (no im not)','at {amt} credits from 1000, not great','hit a {n} win streak','lost {n} in a row, the comeback starts now',
    'one more then im done','i said one more 10 rounds ago','the comeback is real','the comeback was not real',
    'martingale works until it doesnt','new strat: vibes only','switching games changes my luck, trust','my lucky number is {roll}'],
  random:[
    'gm','gn chat','who up','anyone eating rn','what are yall listening to','its raining here','i should be studying','brb food','back',
    'monday tomorrow smh','one more round then sleep (lie)','hydrate','my cat just walked on my keyboard','wifi lagging','need coffee',
    'its {hour} why am i here','just got home','pizza or burgers','phone at 4%','long day','im so bored','anyone got music recs',
    'new here whats good','hi chat','ok im locked in','gm from the couch','good evening gamers','afternoon chat','hello hello',
    'just woke up','cant sleep','should be asleep','{hour} and wide awake','sleep schedule is gone','nap was 4 hours, oops',
    'eating {food} rn','{food} at {hour} hits different','just made {food}','out of snacks, tragic','ordered {food}, 40 min wait',
    'drinking {drink} and locked in','need {drink} asap','spilled {drink} on my desk','third {drink} today','{food} or {food}, help me pick',
    'my {thing} just died','new {thing} came today','anyone know a good {thing}','my {thing} is older than me','need a new {thing} so bad',
    'homework due tomorrow, not started','exam on {day}, wish me luck','work in 5 hours','day off tomorrow lets go','shift was so long today',
    'its so cold here','so hot today','snowing rn','sun is finally out','thunderstorm outside, cozy','fog so thick i cant see the street',
    'my dog is staring at me','cat knocked my {drink} over','my dog wants a walk but one more round','bird outside wont stop yelling','theres a spider in my room, im moving out',
    'listening to rain sounds','lofi on, lights off','playlist is all sad songs today','same song on repeat for an hour','music too loud cant hear myself think',
    'watching a movie on the other screen','show im watching just ended on a cliffhanger','any good shows lately','rewatching an old show again','video essay about bridges, 3 hours, im in',
    'is it {day} yet','cant believe its already {day}','this week took a year','weekend went too fast','{day} energy',
    'who else is on mobile','typing with one hand, eating with the other','keyboard is so loud my family knows im here','got a new chair, life changing','desk is a mess',
    'brb one sec','afk 5 min','ok im back what did i miss','lagged out for a sec','restarted my router, pray','wifi back',
    'my friend said this would take 5 minutes, its been 2 hours','told myself 10 minutes','lunch break well spent','waiting for a download so im here','on the bus rn',
    'yall ever just stare at the ceiling','brain empty','no thoughts just vibes','having a good day actually','rough day, this helps','feeling lucky today',
    'happy {day} chat','hope everyone is doing good','drink some water chat','stretch your back','unclench your jaw','posture check',
    'whats everyone up to','anyone here from last night','same people every night lol','chat is cozy tonight','so quiet','hello to the lurkers',
    'what time is it for yall','its {hour} here','its already tomorrow here','time zones are weird','nearly morning here',
    'just did the dishes, feel like a new person','laundry day','cleaned my room, found 3 cups','need a haircut','gym later (maybe)','went outside today, wild',
    'my little brother wants a turn','mom is calling me for dinner brb','roommate asked what im doing, i said research','sister stole my charger again',
    'why is {food} so expensive now','craving {food}','never having {food} at {hour} again','who puts pineapple on pizza be honest','cereal is a soup, discuss',
    'ok serious question, is a hotdog a sandwich','cats or dogs','morning person or night owl','rain or snow','what is everyone drinking',
    'my phone autocorrects every word wrong','forgot what i was going to say','nvm','wait what','lol','hmm','ok ok ok','alright chat'],
  reply:[
    'W','L','no way','lmaooo','unlucky {name}','nice one {name}','{name} cooking','real','same','fr','screenshot or it didnt happen',
    'happens every time','cash out next time lol','teach me','gg','thats rough','{name} is him','bro what','true','sheesh','rip','lets gooo',
    'huge','massive','tragic','pain','oof','classic','every time','not again','same thing happened to me','{name} never misses',
    '{name} always says that','i felt that','been there','relatable','too real','thats wild','actually insane','no shot','stoppp',
    'hahaha','lol','lmao','bruh','deserved','undeserved','robbed','you love to see it','you hate to see it','certified moment',
    'big if true','source: trust me','ok {name}','calm down {name}','{name} woke up and chose this','who asked (i did, tell me more)',
    'wait really','how','what game','what bet','how much','show us','run it back','again again','double it','one more',
    'same energy','mood','me too','not me doing the same thing','i was just about to say that','{name} read my mind',
    'good luck {name}','gl','you got this','believe','manifesting it','sending luck','luck is on the way','rooting for you {name}',
    'ggs','wp','nice','clean','smooth','solid','respect','valid','fair','makes sense','cant argue with that',
    'hi {name}','welcome back {name}','{name} is here lets go','there they are']
};

// Profile pictures are drawn here so they work offline: each character gets one of five
// styles (emoji, little monster, pixel pattern, sunset, or colour swirl) chosen from its name.
const CROWD_PALETTE=['#8f6bff','#2f9d7a','#d0614f','#3d7fd6','#c9912e','#b0518f','#4aa3a8','#e07a3f','#5a67d8','#3fae5a','#d14d72','#7a7f93'];
const CROWD_EMOJI=['🐸','🦊','🐼','🐱','🐶','🦉','🐙','🐧','🦈','🐝','🍕','🍜','🌮','🍩','🎧','🎮','🛹','🌵','🌙','⚡','🔥','🪐','👾','🤖','🎲','🃏','💎','🍀','🦖','🐢'];
function crowdIcon(name,i){
  // Small repeatable random source so a character keeps the same picture on every visit.
  let seed=2166136261;
  for(const letter of name)seed=Math.imul(seed^letter.charCodeAt(0),16777619)>>>0;
  const next=()=>{seed=(seed+0x6D2B79F5)>>>0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296};
  const pick=list=>list[Math.floor(next()*list.length)],a=pick(CROWD_PALETTE);
  let b=pick(CROWD_PALETTE);if(b===a)b='#1b1727';
  const gradient='<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+a+'"/><stop offset="1" stop-color="'+b+'"/></linearGradient></defs><rect width="40" height="40" fill="url(#g)"/>';
  let art;
  switch(i%5){
    case 0:art=gradient+'<text x="20" y="28" text-anchor="middle" font-size="22">'+CROWD_EMOJI[(Math.floor(i/5)*7+2)%CROWD_EMOJI.length]+'</text>';break;
    case 1:{
      const eye=next()<.5?3.4:2.6,horns=next()<.5,smile=next()<.6;
      art='<rect width="40" height="40" fill="#1b1727"/><circle cx="20" cy="42" r="26" fill="'+a+'" opacity=".25"/>'+(horns?'<path d="M11 13l2-8 5 6zM29 13l-2-8-5 6z" fill="'+b+'"/>':'<path d="M20 9v-5" stroke="'+b+'" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="3.500" r="2" fill="'+b+'"/>')+
        '<rect x="7" y="9" width="26" height="26" rx="11" fill="'+a+'"/><circle cx="14.500" cy="20" r="'+eye+'" fill="#fff"/><circle cx="25.500" cy="20" r="'+eye+'" fill="#fff"/><circle cx="15" cy="20.500" r="1.400" fill="#17131f"/><circle cx="26" cy="20.500" r="1.400" fill="#17131f"/>'+
        (smile?'<path d="M15 27q5 4 10 0" fill="none" stroke="#17131f" stroke-width="1.800" stroke-linecap="round"/>':'<rect x="16" y="26.500" width="8" height="2.400" rx="1.200" fill="#17131f"/>');
      break;
    }
    case 2:{
      let cells='';
      for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(next()<.55)for(const x of new Set([col,4-col]))cells+='<rect x="'+(5+x*6)+'" y="'+(5+row*6)+'" width="6" height="6"/>';
      art='<rect width="40" height="40" fill="#17131f"/><g fill="'+a+'">'+(cells||'<rect x="17" y="17" width="6" height="6"/>')+'</g>';
      break;
    }
    case 3:{
      const sun=12+Math.floor(next()*16);
      art=gradient+'<circle cx="'+sun+'" cy="17" r="7" fill="#ffe6a3" opacity=".95"/><path d="M0 30q10-12 20-3t20-6v19H0z" fill="#17131f" opacity=".55"/><path d="M0 35q12-8 22-2t18-3v10H0z" fill="#17131f" opacity=".9"/>';
      break;
    }
    default:art='<rect width="40" height="40" fill="#17131f"/><circle cx="'+(8+Math.floor(next()*10))+'" cy="'+(10+Math.floor(next()*10))+'" r="17" fill="'+a+'" opacity=".9"/><circle cx="'+(24+Math.floor(next()*10))+'" cy="'+(22+Math.floor(next()*10))+'" r="15" fill="'+b+'" opacity=".8"/><circle cx="20" cy="20" r="6" fill="#fff" opacity=".2"/>';
  }
  return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'+art+'</svg>');
}

// Short throwaway messages people drop into a busy chat, often over the top of someone else's conversation.
const CROWD_FILLER=['lol','?','fr','💀','gg','ez','nah','bruh','hm','W','L','yo','anyone here','hello??','...','lmao','real','ok','true','what','wait','😭','brb','back','ngl same','mood','oof','sheesh','yep','nope','idk','hmm','lets go','pain','rip','same','facts','no way','yooo','chat is moving','im dead','help','why','huh','bet','say less','aight','k','mhm','welp','ayo','bro','damn','nice','nahh','yikes','lolol','haha','one sec','lag','who','wsg','💯','👀'];
// The name someone is @mentioned by: their name without spaces or symbols.
const crowdHandle=name=>String(name).replace(/[^\w.]+/g,'');
// Each character types in its own way: capitals or not, a pet word, favourite emoji, the odd typo.
function crowdVoice(name){
  const random=crowdRandom(crowdSeed('voice-'+name)),pick=list=>list[Math.floor(random()*list.length)];
  const style=random(),emoji=['💀','😭','🔥','😂','🙏','👀','😅','🤝','💯','😤'];
  return {
    caps:style<.68?'lower':style<.9?'sentence':'loud',
    tail:random()<.32?pick(['lol','ngl','tbh','fr','bro','lmao','haha']):'',
    emoji:random()<.38?[pick(emoji),pick(emoji)]:null,
    sloppy:random()<.3
  };
}
// What the characters say back to the player, by what the player's message was about.
const CROWD_ANSWERS={
  hush:['ok ok 🤐','no','make us {user}','{user} woke up grumpy','rude','we were here first','sorry {user}','chat is for chatting {user}','wow ok','someone lost a round','{user} is tilted','fine. 10 seconds of silence','😶','ok going quiet','{user} needs a snack','noted {user}'],
  real:['beep boop','define real','last time i checked','im as real as these credits','🤖','no comment','are YOU real {user}','thats exactly what a bot would ask','i have a pulse i think','{name} is the bot, not me','blink twice if you are real {user}'],
  bye:['gn {user}','cya {user}','later {user}','sleep well {user}','dont go {user}','see you tomorrow {user}','gn gn','take care {user}','one more round {user}, come on','bye {user}!!'],
  hello:['yo {user}','sup {user}','hey {user}','{user} whats good','welcome {user}','gm {user}','hi {user}','{user}!!','ayy {user}','look who it is, {user}','hello {user}','{user} is here','wsg {user}','good to see you {user}','{user} pull up a chair','hey hey {user}'],
  howru:['chilling, you {user}?','losing credits, the usual','good wbu {user}','on the {game} grind','vibing','tired but here','hungry','better now that {user} is here','down {amt} so... great','cant complain','just got here','waiting on a comeback'],
  thanks:['np {user}','anytime {user}','you got it','no worries','always','thats what chat is for'],
  pick:['{game} easy','mines','limbo if you like pain','blackjack, trust','{game} is hot right now','start with {game} {user}','plinko, just watch the ball','not {game}, it took everything from me','{game} then {game2}','whatever {name} is playing, do the opposite'],
  winning:['not me','{name} is up big','down {amt} lol','breaking even somehow','{name} keeps hitting','i was until 5 minutes ago','ask me tomorrow','up {amt}, dont jinx it {user}','nobody. the house is winning'],
  brag:['W {user}','huge {user}','lets gooo {user}','{user} cooking','no way','screenshot or it didnt happen','save some luck for us {user}','teach me {user}','what game','how much {user}','{user} on a heater','ok {user} we see you','sheesh','carry me {user}'],
  sad:['unlucky {user}','pain','rip {user}','it happens {user}','been there','refill and go again {user}','the comeback starts now','L but we move','same thing happened to me','thats rough {user}','switch games {user}','{game} did that to me too','💀'],
  laugh:['lmao','fr','💀','haha','lol','😭','im crying','real','{user} gets it'],
  called:['yes?','{user} whats up','im here','hm?','you called','what did i do','thats me','yo {user}','{user} i was just thinking about you'],
  game:['{game} is so good','{game} owes me credits','i was just on {game}','gl on {game} {user}','{game} gang','{game} is rigged against me personally','best game on here {user}','{game} took my last refill','im heading to {game} too','{user} what bet on {game}'],
  food:['now im hungry {user}','save me some','elite choice','with what sauce','that sounds so good rn','bring enough for chat {user}','i just ate and i want that','mid choice tbh','{user} share'],
  answer:['idk tbh','probably','yes','nah','depends','50/50','good question {user}','no clue','i think so','definitely','maybe','try it and see {user}','ask {name}','only one way to find out','honestly yeah','hard to say','{name} would know','i wondered the same thing'],
  chat:['real','fr {user}','lol','{user} gets it','true','say more {user}','go on','{user} has a point','same tbh','W message','noted {user}','facts','haha {user}','based','heard','so true','agreed','i see you {user}','ok {user}','mood']
};
// More kinds of answer, added to the table above.
Object.assign(CROWD_ANSWERS,{
  // Someone asked what a word means and the characters know it. {term} and {meaning} are filled in.
  explain:['{term} = {meaning}','it means {meaning}','{meaning}','{term} is like {meaning}','{user} it means {meaning} lol','{meaning}, basically'],
  explainMore:['how do you not know that 💀','now you know','{user} been living under a rock','yeah what they said','we all had to google it once','learn something new every day'],
  // ...and when they do not.
  unknown:['no clue what {term} means','never heard of {term}','what even is {term}','{user} you made that up','google it lol','idk ask {name}','thats a new one','{term}?? idk','not a clue tbh','ive seen it but no idea'],
  roast:['ok and','cry about it','who hurt you {user}','says the one down bad','💀','{user} lost a round and chose violence','we love you too {user}','rude','bold words from {user}','skill issue','ok {user}','someone get {user} a refill','thats crazy, anyway'],
  praise:['W {user}','we love you too','{user} is the goat','finally some respect','real one','appreciate you {user}','🙏','chat loves {user}','thats what im saying'],
  bored:['play {game}','same honestly','try {game}, it wakes you up','bored at {hour} is a mood','go all in on something, that fixes it','race me on {game}','touch grass (after this round)','{user} tower master mode, go'],
  invite:['im down','what game','after this round','{name} will, they lose every time','bet, what are we playing','{game}?','first to 2000 credits?','sure why not','give me 5 min'],
  salty:['skill issue','it took my credits too','its random bro','you say that every time you lose','refill and run it back','the game owes us all','switch to {game}','been there {user}','it evens out (it does not feel like it)','take a breath {user}'],
  tired:['gn {user}','go to sleep {user}','sleep is for the weak','one more round first','same, i should sleep','bed is right there','set an alarm and commit'],
  beg:['cant send credits lol','refill is free when youre under 10','we are all broke here','ask the dealer','{user} just refill','nobody can tip, its not that kind of site','best i can do is good luck'],
  personal:['earth','somewhere cold','classified','why {user} you writing a book','its late here thats all i know','from the couch','not telling lol','same place as yesterday','nice try {user}'],
  why:['because the dealer hates you','no reason, just luck','thats just how it is','nobody knows','because its {day}','the universe decided','good question, no answer'],
  how:['practice','luck mostly','just click and pray','settings, top right','trial and a lot of error','{name} showed me','you just kinda do it','read the table rules at the bottom'],
  when:['soon','never lol','after this round','about 5 minutes ago','when you least expect it','tomorrow probably'],
  where:['bottom left','top right i think','in the wallet page','settings probably','check the lobby','right in front of you {user}'],
  should:['yes do it','dont','do it and report back','absolutely not','only one way to find out','sleep on it','send it {user}','i wouldnt but im a coward'],
  yesno:['yes','no','yeah','nah','probably','doubt it','100 percent','not a chance','maybe','depends who is asking']
});
CROWD_ANSWERS.chat=['lol','fr','real','true','💀','haha','same','mood','lmao','facts','nah fr','wild','fair','{user} gets it','hmm','ok {user}','valid','lmaoo','thats tough','say that again'];
// Words the characters can explain when asked. Chat slang first, then game terms.
const CROWD_GLOSSARY={
  sybau:'shut up, basically',stfu:'shut up',ts:'"this" or "this stuff"',pmo:'"pisses me off"',icl:'"i cant lie"',ngl:'"not gonna lie"',
  fr:'"for real"',frfr:'"for real for real"',wsg:'"whats good", like hi',wsp:'"whats up"',hbu:'"how about you"',wbu:'"what about you"',wyd:'"what are you doing"',
  idk:'"i dont know"',idc:'"i dont care"',tuff:'cool or hard, like "thats tuff"',gng:'"gang", like bro',fym:'"what do you mean" but angry',wdym:'"what do you mean"',
  ong:'"on god", like i swear',istg:'"i swear to god"',smh:'"shaking my head"',nvm:'"never mind"',brb:'"be right back"',afk:'away from keyboard',
  gg:'"good game"',ggs:'"good games"',ez:'easy',rn:'"right now"',imo:'"in my opinion"',tbh:'"to be honest"',gl:'"good luck"',hf:'"have fun"',
  mid:'average, not good not bad',cap:'a lie. no cap = no lie',rizz:'charm, basically',sus:'suspicious',bet:'"ok" or "deal"',goat:'greatest of all time',
  opp:'an enemy or rival',lowkey:'kind of, quietly',highkey:'very, openly',w:'a win',l:'a loss',ratio:'when the reply gets more likes than the post',
  cooked:'done for, finished',cooking:'doing really well',tilted:'mad from losing',heater:'a hot streak',copium:'pretending a loss is fine',
  push:'a tie, you get your bet back',bust:'going over 21 in blackjack',natural:'21 on your first two cards',split:'turning a pair into two hands',
  'double down':'doubling your bet for exactly one more card',double:'doubling your bet for exactly one more card',multiplier:'what your bet gets multiplied by if you win',
  refill:'free credits when you drop under 10',credits:'the play money here, no real value',banker:'one of the two sides in baccarat',
  'house edge':'how much the game keeps on average',rtp:'return to player, how much a game pays back on average','cash out':'collecting before you lose it',collect:'taking your winnings and ending the round'
};
// Scripted conversations. Each turn is "speaker: line"; a, b, c and d are different characters,
// and a {slot} keeps the same value for the whole conversation so follow-ups make sense.
const CROWD_THREADS=[
  ['a: {mult}x on limbo lets gooo','b: no way {a}','c: what was your target','a: 2x 😭 i always pick 2x','c: pain'],
  ['a: first tile on mines was a bomb','b: FIRST tile??','a: first. tile.','c: i did that twice in a row yesterday','b: {c} how','c: talent'],
  ['a: dealer just pulled 21 off a 6','b: every single time','a: i had 20 btw','b: thats criminal','c: blackjack dealer has plot armor'],
  ['a: anyone want to race to 2000 credits','b: im in','c: starting from what','a: fresh refill, 1000','b: {game} only?','a: any game','c: ok go'],
  ['a: what game is everyone on','b: {game}','c: mines, always mines','d: plinko gang','a: ok going {game} then'],
  ['a: plinko 16 rows high risk, one ball, wish me luck','b: gl','c: middle slot incoming','a: 0.2x','c: called it','b: 💀'],
  ['a: is {game} or {game2} better for grinding','b: {game} easy','c: wrong, {game2}','b: {c} you lose on {game2} every night','c: and i have fun doing it'],
  ['a: just hit single number {roll} on roulette','b: SCREENSHOT','c: no shot','a: +{amt}','b: ok {a} is rich now','a: play credits rich 😎'],
  ['a: tower floor {n}, do i cash or keep going','b: keep going','c: cash','b: scared money dont make money','a: going','a: locked door 😭','c: told you'],
  ['a: whats the highest limbo anyone has seen','b: {big}x once','c: i got 1000x with target 1.5','a: thats the saddest thing ive ever read','c: i think about it daily'],
  ['a: mines 24 bombs 1 gem, who has done it','b: took me like 60 tries','c: not worth','b: the screenshot was worth','a: trying now'],
  ['a: hi-lo streak at {n}, next card is a 7','b: lower','c: higher','d: cash out lol','a: went higher... it was a 7. tie','b: hi-lo is evil'],
  ['a: keno {n} of 10!!','b: what numbers','a: just random ones','c: random is the only strat','b: my birthday numbers never hit'],
  ['a: down {amt} on {game}','b: switch games','a: to what','b: literally anything else','c: {game2} never lets me down','a: ok trying {game2}'],
  ['a: coinflip heads 7 times in a row','b: bet tails','a: 8 times','b: bet tails again','a: 9. im scared','c: the coin is broken'],
  ['a: who else just presses the 25 chip every time','b: 10 chip here','c: 100 or nothing','a: {c} how many refills today','c: no comment'],
  ['a: baccarat tie just hit 9x','b: nobody bets tie','a: i bet tie','b: respect','c: i have never seen a tie in my life'],
  ['a: war is the most underrated game here','b: its just high card','a: exactly, pure','c: {a} likes it because there are no decisions','a: correct'],
  ['a: wheel landed 0x three times','b: wheel hates you specifically','a: feels personal','c: spin again it owes you','a: 0.5x. thanks wheel'],
  ['a: doubled on 11 and pulled an ace 💀','b: 12 lol','a: dealer had 19','c: thats a painful one','b: the book says double tho','a: the book lied'],
  ['a: {low}x on limbo three times in a row','b: thats actually impressive','a: target was 1.5','c: 1.5 is supposed to be free','a: nothing is free {c}','b: wise words'],
  ['a: up {amt} tonight','b: cash out and go to bed','a: its play credits {b}','b: then double it','c: this is how it starts','a: all in on {game}','a: well','c: called it'],
  ['a: split 8s against a 10','b: correct play','a: lost both','b: still correct','c: the book has never paid my bills','a: 😭'],
  ['a: dice at 98 percent and i lost','b: thats a 1 in 50','a: it found me','c: you should buy a lottery ticket','b: no the luck is clearly negative'],
  ['a: rps bot threw rock 5 times','b: so throw paper','a: i did. it threw scissors','c: it knows','b: its in your walls {a}'],
  ['a: plinko {mult}x!!!','b: what rows','a: 16 high','c: the only way to play','b: i got 0.2x on that 10 times in a row','a: thats the price'],
  ['a: wait you can drag the profit tracker around??','b: yeah grab the top','a: just put it right over the table lol','c: i keep mine in the corner','a: this changes everything'],
  ['a: the blue gems on mines look so good','b: the bombs too','c: have you seen the red glow when you hit one','a: seen it way too many times','b: 💀'],
  ['a: how do i get more credits','b: refill is free when youre under 10','a: oh nice','c: wallet page has the button','a: found it ty'],
  ['a: that loading animation is clean','b: the stripes thing?','a: yeah','c: i reloaded twice just to watch it','b: it only plays once per tab tho','c: i opened new tabs'],
  ['a: live stats graph is just a line going down for me','b: mine too','c: mine went up once','a: {c} show us','c: i reset it right after so it stays perfect'],
  ['a: is there a leaderboard','b: dont think so','c: there should be','a: i would be last','b: someone has to be'],
  ['a: sound on or off for you guys','b: on, card sounds are nice','c: off, im in class','a: {c} 💀','b: priorities'],
  ['a: new here, what should i play first','b: welcome! mines','c: blackjack if you like thinking','d: limbo if you dont','a: limbo it is'],
  ['a: anyone on phone','b: yeah works fine','c: chat is a little button on mobile','a: oh thats where it went','b: bottom left'],
  ['a: which game art is the best','b: hi-lo','c: the blackjack table','a: plinko board for me','d: nobody said keno, justice for keno'],
  ['a: the chips look like real ones now','b: the black 100 chip is the best one','c: red 5 chip supremacy','b: {c} bets 5 and calls it a strategy','c: slow and steady'],
  ['a: where do i change my name','b: gear icon top right','a: got it','c: or sign in with discord and it uses that','a: oh even better'],
  ['a: what does the green number on the result mean','b: thats what you won that round','a: and red','b: what you lost','c: {a} sees a lot of red','a: i really do'],
  ['a: what is everyone eating','b: {food}','c: nothing im starving','d: {food2} and its amazing','c: stop'],
  ['a: its {hour} here why am i awake','b: same time here','c: its afternoon for me lol','a: time zones are fake','b: go to sleep {a}','a: one more round'],
  ['a: music recs?','b: what genre','a: anything chill','c: lofi playlists never miss','b: rain sounds honestly','a: rain sounds it is'],
  ['a: cats or dogs','b: dogs','c: cats','d: both','b: {d} thats cheating','d: i have both so its allowed'],
  ['a: my {thing} just broke','b: rip','a: mid round too','c: thats the worst timing','b: use that as an excuse for the loss'],
  ['a: who is up this late','b: me','c: here','d: always','a: we need sleep','c: after this round'],
  ['a: homework due in 3 hours','b: and youre here','a: i work better under pressure','c: no you dont','a: no i dont'],
  ['a: is cereal a soup','b: no','c: yes','b: absolutely not','c: liquid plus solid in a bowl','a: i regret asking'],
  ['a: brb getting {drink}','b: get me one','c: same','a: back. no i did not get you one','b: unreal'],
  ['a: its raining so hard here','b: cozy','a: power might go out','c: play fast then','a: good point'],
  ['a: i told myself 10 minutes','b: how long has it been','a: 2 hours','c: rookie numbers','b: {c} how long for you','c: i dont look at clocks anymore'],
  ['a: what are yall doing after this','b: sleep','c: more of this','d: {food}','a: valid answers all around'],
  ['a: {day} tomorrow','b: dont remind me','c: its already {day} here','a: how is it','c: bad'],
  ['a: phone at 3%','b: charger?','a: across the room','c: so its over','a: its over','b: gn {a}'],
  ['a: gm chat','b: gm {a}','c: gm','d: its night here but gm','a: gm to all time zones'],
  ['a: just got back what did i miss','b: {c} lost everything','c: i did not','b: {c} refilled twice','c: ok once','a: lol'],
  ['a: pineapple on pizza, yes or no','b: yes','c: no','d: yes and im tired of pretending its not good','c: wrong','b: {d} gets it'],
  ['a: my dog is begging for a walk','b: go walk the dog','a: one more round','c: the dog has been waiting {a}','a: ok ok going. brb'],
  ['a: need a new {thing}, any recs','b: what budget','a: cheap','c: the cheap ones break, ask me how i know','a: how do you know','c: mine broke'],
  ['a: who else is supposed to be doing something else rn','b: studying','c: working','d: sleeping','a: glad were all here together'],
  ['a: made {food} and burnt it','b: how do you burn {food}','a: i was mid round','c: priorities','b: at least you won?','a: no'],
  ['a: is a hotdog a sandwich','b: yes','c: its a taco','d: its a hotdog','a: {c} explain','c: bread on three sides. taco'],
  ['a: gn chat','b: gn {a}','c: night','a: ok one more round actually','b: knew it'],
  ['a: anyone else have {day} off','b: i wish','c: i have work','a: unlucky','c: thanks {a} very helpful'],
  ['a: my wifi keeps cutting out','b: restart the router','a: did that','c: stand closer to it','a: im sitting on it','b: 💀']
];
// Reactions picked to fit what the previous line was about.
const CROWD_REACT={
  win:['W','huge','lets gooo','nice one {name}','{name} cooking','{name} is him','sheesh','save some luck for us','teach me','massive','clean','gg {name}','ok {name} we see you','what bet','how much did you have on it','screenshot or it didnt happen','carry me {name}','im switching to that game rn','no way','actual W','{name} on a heater','finally someone wins'],
  loss:['L','pain','unlucky {name}','rip','thats rough','happens every time','i felt that','been there','oof','tragic','same thing happened to me','cash out next time lol','refill time','it be like that','{name} down bad','the comeback starts now','robbed','💀','not again','classic','F'],
  question:['idk tbh','probably','yes','nah','depends','50/50','good question','no clue','i think so','definitely','maybe','try it and see','{name} i think so','no idea honestly','yeah','nope','same question','depends on the day','only one way to find out','me'],
  greet:['yo {name}','gm {name}','hey {name}','sup','welcome','hi hi','{name}!!','wsg {name}','gm','hello {name}','ayy {name}','there they are'],
  food:['now im hungry','save me some','elite choice','mid choice tbh','with what sauce','that sounds so good rn','i just ate and i want that','bring enough for chat','{name} share','great now i need a snack','at this hour??','respect'],
  sleep:['go to sleep {name}','sleep is for the weak','same, wide awake','one more round first','sleep schedule gang','we are all nocturnal here','{name} never sleeps','set an alarm and commit','bed is right there {name}'],
  site:['fr','agreed','same','right??','first thing i noticed','it really is','whoever did that cooked','took me a while to notice','wait where is that','{name} gets it','best part of the site','so true','i was about to say that','underrated detail'],
  generic:['real','fr','same','true','lol','lmao','mood','valid','relatable','{name} always says that','haha','bruh','ok {name}','wait really','no shot','thats wild','i felt that','same energy','me too','not me doing the same thing','calm down {name}','big if true']
};
// What the first speaker says back after someone reacts to them.
const CROWD_COMEBACK={
  win:['thanks {name}','i cant believe it either','small bet tho','luck finally','it took 40 tries','dont jinx it {name}','next one is going to be a loss watch'],
  loss:['dont laugh {name}','im fine. totally fine','refilling as we speak','never again (see you in 5 min)','it hurts {name}','i dont want to talk about it','the game owes me now'],
  question:['ok thanks','good to know','hmm ok','ill try it','that didnt help {name}','fair','thanks {name}'],
  greet:['how is everyone','what are we playing','{name} how is the luck today','good to be back'],
  food:['no sharing','come get some','its already gone','{name} make your own'],
  sleep:['after this round','{name} you are also awake','sleep is a tomorrow problem','fine. 10 more minutes'],
  site:['right??','exactly','glad someone agrees','{name} knows'],
  generic:['fr','lol','exactly','{name} gets it','anyway','thats what i said']
};
// Sorts a line into the kind of reaction it should get.
function crowdMood(text,topic){
  const t=text.toLowerCase();
  if(/\?\s*$|^(who|what|which|anyone|is |why |how )/.test(t))return 'question';
  if(/^(gm|gn|hi\b|hello|hey|yo\b|who up|new here|good (evening|morning)|afternoon)/.test(t))return 'greet';
  if(/pain|down \d|lost|bomb|\brip\b|of course|never|again|rigged|hates me|\b0x|0\.\dx|not great|refill|clown|sick|brutal|rude|crime|tragic|locked door|nothing|shambles|comeback was not|lied|sad/.test(t))return 'loss';
  if(/lets go|!!|finally|\bup \d|\bhit |natural|streak of|cashed|doubled my|went green|top floor|win streak|\bwon\b|genius|quitting while ahead|comeback is real/.test(t))return 'win';
  if(/eat|snack|hungry|pizza|cereal|coffee|dinner|lunch|drinking|ramen|tacos|burrito|fries|pasta|noodles|sandwich|ice cream|dumplings|toast|boba|smoothie/.test(t))return 'food';
  if(/sleep|awake|\bnap\b|\bbed\b|[1-4]am|midnight/.test(t))return 'sleep';
  return topic==='site'?'site':'generic';
}

// pictures are file names in dist/art/pfps (listed in chat-pfps.js). When there are some,
// each character gets one and the cast shrinks to match, so no picture is used twice.
// With none, or for a cast smaller than eight, the drawn pictures fill in.
function createCrowd(random=Math.random,pictures=globalThis.DRIFT_PFPS||[]){
  const cast=pictures.length?CROWD_NAMES.slice(0,Math.max(8,pictures.length)):CROWD_NAMES;
  const members=cast.map((name,i)=>({id:'crowd-'+i,name,voice:crowdVoice(name),icon:i<pictures.length?'art/pfps/'+encodeURIComponent(pictures[i]):crowdIcon(name,i)}));
  const pick=list=>list[Math.floor(random()*list.length)],whole=(low,high)=>low+Math.floor(random()*(high-low+1));
  // root is the line being reacted to: who said it, its mood, and how many reactions it has had.
  // since is when the conversation a line belongs to began.
  let last=null,root=null,thread=null,next='new',serial=0,since=0,recent=[],recentThreads=[];
  const someone=(...not)=>{let who,tries=0;do{who=pick(members)}while(not.includes(who)&&++tries<40);return who};
  // Avoids repeating any of the last 90 lines.
  function fresh(list){
    let line;
    for(let tries=0;tries<12;tries++){line=pick(list);if(!recent.includes(line))break}
    recent.push(line);if(recent.length>90)recent.shift();
    return line;
  }
  // memo keeps a slot's value fixed across the turns of one conversation.
  function fill(line,extra={},memo=null){
    const numbers={mult:()=>(whole(3,60)+whole(0,99)/100).toFixed(2),big:()=>whole(100,900),low:()=>(1+whole(0,40)/100).toFixed(2),n:()=>whole(3,9),roll:()=>whole(1,36),amt:()=>whole(2,60)*10};
    return line.replace(/\{(\w+)\}/g,(match,key)=>{
      // People are sometimes addressed with an @mention, the player more often than the characters.
      if(key in extra)return /^(a|b|c|d|name|user)$/.test(key)&&random()<(key==='user'?.5:.25)?'@'+crowdHandle(extra[key]):String(extra[key]);
      if(memo&&key in memo)return memo[key];
      const words=CROWD_WORDS[key.replace(/\d$/,'')];
      let value=words?pick(words):numbers[key]?String(numbers[key]()):'';
      // "{game2}" must differ from "{game}".
      if(words&&memo)for(let tries=0;tries<8&&Object.values(memo).includes(value);tries++)value=pick(words);
      if(memo)memo[key]=value;
      return value;
    });
  }
  // Rewrites a line the way this character types. Words after an @ and other people's names are left alone.
  function styled(user,text,typos){
    const voice=user.voice;
    let out=text;
    if(voice.tail&&out.length>8&&!/[?!.]$/.test(out)&&random()<.2)out+=' '+voice.tail;
    if(voice.emoji&&random()<.18)out+=' '+pick(voice.emoji);
    if(typos&&voice.sloppy&&random()<.2){
      const words=out.split(' '),spots=words.map((word,i)=>/^[a-z]{5,}$/.test(word)&&!cast.includes(word)?i:-1).filter(i=>i>=0);
      if(spots.length){
        const i=pick(spots),word=words[i],at=whole(1,word.length-3);
        words[i]=word.slice(0,at)+word[at+1]+word[at]+word.slice(at+2);out=words.join(' ');
      }
    }
    if(voice.caps==='sentence')out=out[0].toUpperCase()+out.slice(1)+(/[a-z]$/.test(out)&&random()<.4?'.':'');
    else if(voice.caps==='loud'&&out.length<26&&random()<.3)out=out.toUpperCase();
    return out;
  }
  function post(user,text,at,typos=true){
    last=user;
    return {id:'crowd-'+at+'-'+(serial++),user,text:styled(user,text,typos),at,since,crowd:true};
  }
  // Decides what the following line will be, so the caller knows whether it is a quick follow-up.
  function plan(){
    if(thread){next='thread';return}
    const chance=root?[.4,.22,0][Math.min(2,root.reactions)]:0;
    if(random()<chance)next=root.reactions===1&&random()<.4?'comeback':'react';
    else next='new';
  }
  function startThread(at){
    let turns;
    for(let tries=0;tries<10;tries++){turns=pick(CROWD_THREADS);if(!recentThreads.includes(turns))break}
    recentThreads.push(turns);if(recentThreads.length>24)recentThreads.shift();
    const people={};
    for(const key of 'abcd')people[key]=someone(...Object.values(people));
    // Some conversations trail off a turn or two before the end.
    thread={turns,at:0,end:random()<.3?Math.max(3,turns.length-whole(1,2)):turns.length,people,memo:{},names:Object.fromEntries(Object.entries(people).map(([key,user])=>[key,user.name]))};
    root=null;
    return continueThread(at);
  }
  function continueThread(at){
    const turn=thread.turns[thread.at++],user=thread.people[turn[0]];
    const line=post(user,fill(turn.slice(3),thread.names,thread.memo),at);
    if(thread.at>=thread.end)thread=null;
    return line;
  }
  function say(at=Date.now()){
    let line;
    if(next==='thread'&&thread){
      // Other people talk over a conversation now and then.
      if(random()<.2)line=post(someone(last,...Object.values(thread.people)),fill(fresh(CROWD_FILLER)),at);
      else line=continueThread(at);
    }
    else if(next==='react'&&root){
      root.reactions++;root.replier=someone(root.user,last);
      line=post(root.replier,fill(fresh(CROWD_REACT[root.mood]),{name:root.user.name}),at);
    }else if(next==='comeback'&&root){
      root.reactions=2;
      line=post(root.user,fill(fresh(CROWD_COMEBACK[root.mood]),{name:root.replier.name}),at);
    }else if(random()<.2){since=at;line=startThread(at)}
    else if(random()<.14){since=at;root=null;line=post(someone(last),fill(fresh(CROWD_FILLER)),at)}
    else{
      since=at;
      const roll=random(),topic=roll<.45?'game':roll<.68?'site':'random',text=fill(fresh(CROWD_LINES[topic]));
      line=post(someone(last),text,at);
      root={user:line.user,mood:crowdMood(text,topic),reactions:0,replier:null};
    }
    plan();
    return line;
  }
  return {
    members,say,
    // True when the next line answers the one just said, so it should arrive quickly.
    pending:()=>next!=='new',
    // What the characters say back to the player: one to three of them answer what was actually said.
    // It also ends any conversation in progress so the answers follow the player's message.
    answer(user,text,at=Date.now()){
      thread=null;root=null;next='new';since=at;
      const t=' '+text.toLowerCase().replace(/[’']/g,'').replace(/[^\w\s@?.!💀😂😭-]/gu,' ').replace(/\s+/g,' ').trim()+' ';
      const called=members.find(m=>t.includes(' '+m.name+' ')||t.includes('@'+m.name));
      const game=CROWD_WORDS.game.find(name=>t.includes(name))||(/hi ?lo/.test(t)?'hi-lo':/\brps\b/.test(t)?'rock paper scissors':/\bbj\b/.test(t)?'blackjack':null);
      // "explain X", "what does X mean", "whats X", "wdym by X": pull out X.
      const asked=/\b(?:explain|define)\s+(?:what\s+)?(?:is\s+|a\s+|an\s+|the\s+)?([\w ]{1,24}?)(?:\s+(?:means?|is|to me|pls|please))?\s*[?.!]*\s*$/.exec(t)||
        /\bwhat(?:s| is| does| do)\s+(?:a\s+|an\s+|the\s+)?([\w ]{1,24}?)(?:\s+(?:mean|means|stand for))?\s*[?.!]*\s*$/.exec(t)||
        /\bwdym\s+(?:by\s+)?([\w ]{1,24}?)\s*[?.!]*\s*$/.exec(t)||/\b([\w]{1,16})\s+(?:means?|meaning)\s*[?.!]*\s*$/.exec(t);
      const term=asked?asked[1].trim().replace(/^(?:what|a|an|the)\s+/,''):'';
      const meaning=term?(CROWD_GLOSSARY[term]||CROWD_GLOSSARY[term.split(' ').pop()]||''):'';
      const aboutThem=/\b(you|yall|u|chat|guys|these|everyone|bots?|ais?)\b/.test(t);
      const kind=
        /\b(shut ?up|stfu|sybau|be quiet|stop talking|hush|too loud|zip it|silence)\b/.test(t)&&!term?'hush':
        term&&meaning?'explain':
        term&&/\b(explain|mean|means|meaning|define|stand for|wdym)\b/.test(t)?'unknown':
        aboutThem&&/\b(dumb|stupid|trash|cringe|weird|lame|annoying|bad|slow|boring|ugly|ass|dogwater|useless|braindead)\b/.test(t)?'roast':
        /\b(bots?|ais?|npcs?|fake|scripted|humans?|real (people|person)|are (you|yall|u) (guys )?real)\b/.test(t)?'real':
        /\b(gn|bye|cya|gtg|goodnight|good night|im out|leaving|heading out|logging off)\b/.test(t)?'bye':
        /\b(how are (you|yall|u)|hru|wyd|what are (you|yall|u) (doing|up to)|whats up|wassup|how is everyone|hows everyone)\b/.test(t)?'howru':
        /^ ?(yo|hi|hey|sup|gm|hello|wsg|wsp|heyy+|hii+)\b/.test(t)?'hello':
        /\b(thanks|thank you|ty|thx|appreciate)\b/.test(t)?'thanks':
        aboutThem&&/\b(love|goat|goated|best|fire|tuff|cool|nice|funny|great|w)\b/.test(t)?'praise':
        /\b(give|gift|send|tip|donate|spare|lend)\b.*\b(credits?|me|some)\b/.test(t)?'beg':
        /\b(who wants|anyone (wanna|want|down|up for)|1v1|race me|play with me|lets play)\b/.test(t)?'invite':
        /(what|which).*(play|game)|best game|recommend/.test(t)?'pick':
        /(who|anyone|anybody).*(win|winning|profit|up)\b/.test(t)?'winning':
        /\b(i (just )?(won|hit|got)|im up|lets go+|jackpot|big win|\d+(\.\d+)?x)\b/.test(t)?'brag':
        /\b(rigged|scam|trash|sucks|unfair|hate this|worst|never win|cant win)\b/.test(t)?'salty':
        /\b(i (just )?lost|im down|broke|refill|bomb|rip|pain|unlucky|lost)\b/.test(t)?'sad':
        /\b(bored|boring|nothing to do)\b/.test(t)?'bored':
        /\b(tired|sleepy|exhausted|going to (bed|sleep)|need sleep)\b/.test(t)?'tired':
        /\b(where (are|r) (you|u|yall) from|how old|what(s| is) (your|ur) name|who are (you|u))\b/.test(t)?'personal':
        /\b(lol|lmao|lmfao|haha+|rofl)\b|💀|😂|😭/.test(t)?'laugh':
        called?'called':
        /\b(eat|eating|food|hungry|pizza|snack|dinner|lunch|breakfast)\b/.test(t)?'food':
        /^ ?why\b/.test(t)?'why':/^ ?how\b/.test(t)?'how':/^ ?when\b/.test(t)?'when':/^ ?where\b/.test(t)?'where':
        /^ ?(should|shall)\b/.test(t)?'should':
        /^ ?(is|are|am|do|does|did|can|could|will|would|was|were|has|have)\b/.test(t)?'yesno':
        game?'game':
        /\?\s*$/.test(t)||/^ ?(who|what|which|anyone|some1|someone)\b/.test(t)?'answer':'chat';
      // One person usually answers; a second or third sometimes joins in.
      const count=kind==='hush'?whole(2,3):/^(thanks|laugh|chat|yesno|when|where)$/.test(kind)?1:random()<.12?3:random()<.42?2:1;
      const lines=[],used=[],speakers=[];
      for(let i=0;i<count;i++){
        const speaker=i===0&&called?called:someone(...speakers);
        // After the first person explains a word, the others react to that instead of explaining it again.
        // (and nobody asks "what game" when the game was just named)
        const pool=CROWD_ANSWERS[kind==='explain'&&i>0?'explainMore':kind].filter(option=>!(game&&/^(what game|\{game\}\?)$/.test(option)));
        let line;
        for(let tries=0;tries<10;tries++){line=pick(pool);if(!used.includes(line))break}
        used.push(line);speakers.push(speaker);
        lines.push(post(speaker,fill(line,{user,term,meaning,name:someone(speaker).name,...(game?{game}:{})},{}),at+i,false));
      }
      // Told to be quiet, they hold off for a while; otherwise normal chatter resumes shortly.
      return {kind,lines,quiet:kind==='hush'?whole(25,40)*1000:whole(4,8)*1000};
    }
  };
}

// Everything below turns the clock into chatter, so it is the same for every viewer.
function crowdSeed(text){
  let seed=2166136261;
  for(const letter of String(text))seed=Math.imul(seed^letter.charCodeAt(0),16777619)>>>0;
  return seed;
}
function crowdRandom(seed){
  return ()=>{seed=(seed+0x6D2B79F5)>>>0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296};
}
// The chatter is written ten minutes at a time. A block's lines depend only on its number.
const CROWD_BLOCK=600000;
function crowdBlock(index,pictures){
  const random=crowdRandom(crowdSeed('block-'+index)),crowd=createCrowd(random,pictures),end=(index+1)*CROWD_BLOCK,lines=[];
  let at=index*CROWD_BLOCK+Math.floor(random()*6000);
  while(at<end){
    lines.push(crowd.say(at));
    // Answers come quickly (sometimes on top of each other), a new topic waits longer, and now and then the chat goes quiet.
    at+=Math.floor(crowd.pending()?(random()<.1?900+random()*900:2500+random()*6500):(random()<.1?20000+random()*22000:4000+random()*11000));
  }
  return lines;
}
// The characters' answer to a real person's message, worked out from the message itself so
// every viewer gets the same one.
function crowdReply(message,pictures){
  const random=crowdRandom(crowdSeed('reply-'+message.id)),crowd=createCrowd(random,pictures);
  const name=String(message.user?.global_name||message.user?.name||message.user?.username||'you').slice(0,32);
  const reply=crowd.answer(name,String(message.text),message.at);
  // Small talk between real people is left alone about half the time.
  const lines=reply.kind==='chat'&&random()<.45?[]:reply.lines;
  // People need time to read and type: the first answer takes a few seconds, later ones trickle in.
  let at=message.at;
  lines.forEach((line,i)=>{at+=i?2500+random()*5500:3500+random()*5500+line.text.length*45;line.at=Math.round(at);line.id='crowd-re-'+message.id+'-'+i});
  // Ordinary chatter carries on until just before the first answer (from) and resumes at until.
  return {kind:reply.kind,lines,from:lines.length?lines[0].at-1200:message.at,until:lines.length?Math.round(at)+reply.quiet:message.at};
}
// Simulated head count: slow waves plus a small flicker, the same for everyone at a given moment.
function crowdHeadcount(now){
  const flicker=crowdRandom(crowdSeed('heads-'+Math.floor(now/15000)))();
  return Math.round(44+13*Math.sin(now/2820000*2*Math.PI)+6*Math.sin(now/660000*2*Math.PI)+flicker*4-2);
}

