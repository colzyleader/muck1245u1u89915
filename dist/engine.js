'use strict';
const Arcade = (() => {
  function random(n) {
    const sample = new Uint32Array(1);
    const limit = 2 ** 32 - (2 ** 32 % n);
    do { crypto.getRandomValues(sample); } while (sample[0] >= limit);
    return sample[0] % n;
  }
  const rank = card => card % 13 + 1;
  const suit = card => Math.floor(card / 13);
  const rankLabel = value => ({1:'A', 11:'J', 12:'Q', 13:'K'}[value] || String(value));
  function total(cards) {
    let sum = cards.reduce((value, card) => value + Math.min(rank(card), 10), 0);
    if (sum <= 11 && cards.some(card => rank(card) === 1)) sum += 10;
    return sum;
  }
  function hand(cards,cost) { return {cards, cost, done:false}; }
  // A live round keeps no shuffled deck. `left` is only the set of cards not yet seen; each card is
  // chosen at the moment it is dealt, and the dealer's face-down card is not chosen until it is
  // turned over. Nothing saved during a hand says what is coming next.
  // (A fixed deck can still be passed in for a set-up hand; older saved hands also use one.)
  const completesNatural = (up, card) => total([up, card]) === 21;
  function take(t) {
    if (t.deck) return t.deck.pop();
    let pool = t.left;
    if (t.dealer.length === 1) {
      // The hidden card is known not to complete a blackjack. Setting one such card aside gives the
      // card dealt now exactly the chances it would have with a real card lying face down.
      const hidden = pool.filter(card => !completesNatural(t.dealer[0], card));
      const held = hidden[random(hidden.length)];
      pool = pool.filter(card => card !== held);
    }
    const card = pool[random(pool.length)];
    t.left.splice(t.left.indexOf(card), 1);
    return card;
  }
  function turnHiddenCard(t) {
    if (t.deck || t.dealer.length !== 1) return;
    const hidden = t.left.filter(card => !completesNatural(t.dealer[0], card));
    const card = hidden[random(hidden.length)];
    t.left.splice(t.left.indexOf(card), 1);
    t.dealer.push(card);
  }
  function blackjack(deck, stake=10) {
    if (deck) {
      const player = [deck.pop()], dealer = [deck.pop()];
      player.push(deck.pop()); dealer.push(deck.pop());
      const table = {deck, dealer, stake,hands:[hand(player,stake)], index:0, split:false, finished:false};
      if (total(player) === 21 || total(dealer) === 21) settle(table);
      return table;
    }
    const left = Array.from({length:52}, (_,i) => i);
    const pull = () => left.splice(random(left.length), 1)[0];
    const player = [pull()], dealer = [pull()];
    player.push(pull());
    const table = {left, dealer, stake,hands:[hand(player,stake)], index:0, split:false, finished:false};
    // Only whether the dealer has blackjack is decided now. If so, that card is turned over at once.
    const naturals = left.filter(card => completesNatural(dealer[0], card));
    if (random(left.length) < naturals.length) {
      const card = naturals[random(naturals.length)];
      left.splice(left.indexOf(card), 1);
      dealer.push(card);
    }
    if (total(player) === 21 || dealer.length === 2) settle(table);
    return table;
  }
  function settle(t) {
    turnHiddenCard(t);
    const dealerNatural = t.dealer.length === 2 && total(t.dealer) === 21;
    const natural = h => !t.split && h.cards.length === 2 && total(h.cards) === 21;
    if (t.hands.some(h => total(h.cards) <= 21 && !natural(h))) {
      while (total(t.dealer) < 17) t.dealer.push(take(t));
    }
    const dealer = total(t.dealer);
    for (const h of t.hands) {
      const score = total(h.cards);
      if (natural(h) && !dealerNatural) [h.outcome,h.returned] = ['Blackjack',h.cost*2.5];
      else if (score > 21) [h.outcome,h.returned] = ['Bust',0];
      else if (dealerNatural && !natural(h)) [h.outcome,h.returned] = ['Dealer blackjack',0];
      else if (dealer > 21 || score > dealer) [h.outcome,h.returned] = [dealer > 21 ? 'Dealer bust' : 'You win',h.cost*2];
      else if (score === dealer) [h.outcome,h.returned] = ['Push',h.cost];
      else [h.outcome,h.returned] = ['Dealer wins',0];
    }
    t.finished = true;
  }
  function options(t, balance) {
    if (!t || t.finished) return [];
    const h = t.hands[t.index], choices = ['hit','stand'];
    if (h.cards.length === 2 && balance >= h.cost) {
      choices.push('double');
      if (!t.split && rank(h.cards[0]) === rank(h.cards[1])) choices.push('split');
    }
    return choices;
  }
  function play(t, action, balance) {
    if (!options(t,balance).includes(action)) return null;
    const h = t.hands[t.index];
    const extra = action === 'split' || action === 'double' ? h.cost : 0;
    if (action === 'split') {
      const newHand = hand([h.cards.pop(), take(t)],h.cost);
      h.cards.push(take(t));
      t.hands.push(newHand); t.split = true;
      for (const split of t.hands) split.done = rank(split.cards[0]) === 1 || total(split.cards) === 21;
    } else {
      if (action !== 'stand') h.cards.push(take(t));
      if (action === 'double') h.cost *= 2;
      h.done = action !== 'hit' || total(h.cards) >= 21;
    }
    while (t.index < t.hands.length && t.hands[t.index].done) t.index++;
    if (t.index === t.hands.length) settle(t);
    return extra;
  }
  // House advantage by bet size. A win always pays the full fair amount; what changes with the bet
  // is how often a win happens. share(bet) is the part of a game's normal win chance the player
  // keeps at that bet:
  //   1 to 200 credits   slides from all of it down to about 93% (3 points off for every tenfold);
  //   over 200           60%, so an even-money bet wins 30% of the time and the house 70%;
  //   over 1,500         none: the bet cannot win.
  // Every table shows the resulting chance for the bet entered, and the Fair Play page states it.
  const STEEP_BET = 200, SHUT_BET = 1500;
  function share(bet) {
    if (bet > SHUT_BET) return 0;
    if (bet > STEEP_BET) return 0.6;
    return 1 - 0.03 * Math.log10(Math.max(1, bet));
  }
  // True when the house takes a round the player would otherwise have won.
  function houseTakes(bet) {
    const keep = Math.round(share(bet) * 10000);
    return keep < 10000 && random(10000) >= keep;
  }
  const credit = amount => Math.round(amount * 100) / 100;
  function mineMultiplier(picks, mines, cells) {
    let m = 1;
    for (let i = 0; i < picks; i++) m *= (cells-i)/(cells-mines-i);
    return m;
  }
  // Limbo: turns one roll (0 to 999,999) into a multiplier. A target t is reached by 1 roll in t.
  function limboResult(roll) {
    return Math.max(1, Math.min(1000, Math.floor(100000000 / (1 + roll)) / 100));
  }
  // One Limbo round. A round the house takes is drawn again from the results below the target.
  function limboRound(target, bet) {
    let v = limboResult(random(1000000));
    if (v >= target && target > 1 && houseTakes(bet)) do v = limboResult(random(1000000)); while (v >= target);
    return v;
  }
  function diceOdds(direction, target, stake=10) {
    // Each integer hundredth from 0.00 through 99.99 is one outcome. `fair` is the share of them
    // that win; `chance` is the real chance at this stake.
    const winners = direction === 'under' ? target*100 : 9999-target*100;
    return {fair:winners/100, chance:winners/100*share(stake), returned:Math.floor((10000*stake)/winners)};
  }
  // One Dice roll. A roll the house takes lands in the losing part of the line instead.
  function diceRoll(direction, target, bet) {
    const mark = Math.round(target*100);
    let roll = random(10000);
    if ((direction === 'under' ? roll < mark : roll > mark) && houseTakes(bet))
      roll = direction === 'under' ? mark + random(10000 - mark) : random(mark + 1);
    return roll / 100;
  }
  function coinFace(call, bet) {
    const face = random(2) ? 'Heads' : 'Tails';
    return face === call && houseTakes(bet) ? (call === 'Heads' ? 'Tails' : 'Heads') : face;
  }
  // War: the player's card and the house's. A hand the house takes has the two cards change sides.
  function warDraw(bet) {
    let a = random(52), b = random(51);
    if (b >= a) b++;
    const high = card => rank(card) === 1 ? 14 : rank(card);
    return high(a) > high(b) && houseTakes(bet) ? [b, a] : [a, b];
  }
  // Rock Paper Scissors: the house's throw (0 rock, 1 paper, 2 scissors) against the player's.
  function houseThrow(player, bet) {
    const fair = random(3);
    return (player - fair + 3) % 3 === 1 && houseTakes(bet) ? (player + 1) % 3 : fair;
  }
  // Wheel: the segment that stops under the pointer. A paying spin the house takes stops on a 0× segment.
  function wheelStop(segments, bet) {
    const stop = random(segments.length);
    if (!(segments[stop] > 1 && houseTakes(bet))) return stop;
    const blanks = segments.map((value, index) => value === 0 ? index : -1).filter(index => index >= 0);
    return blanks[random(blanks.length)];
  }
  // Tower doors and Mines tiles: `safe` of `total` are safe. The bet size counts on the first pick of a round only.
  function safePick(safe, total, first, bet) {
    return random(total) < safe && !(first && houseTakes(bet));
  }
  function slots(rows, risk) {
    const halves = {
      8:{Low:[3,1.7,1.1,1,0.7],Medium:[7.1,2.8,1.4,0.8,0.4],High:[19.1,4,1.6,0.5,0.1]},
      12:{Low:[5.6,2.8,1.9,1.3,1.1,0.9,0.7],Medium:[19,7.2,2.7,1.7,1.3,0.7,0.4],High:[75.4,16.6,5.3,2.3,1.1,0.4,0.1]},
      16:{Low:[10.8,5.4,2.7,1.8,1.5,1.2,1.1,0.9,0.6],Medium:[46.2,17.8,7.1,3.6,2.2,1.5,1.1,0.7,0.3],High:[237.9,57.1,18.2,6.3,3.2,1.6,0.9,0.4,0.2]}
    };
    const half = halves[rows][risk];
    return [...half, ...half.slice(0,-1).reverse()];
  }
  return {random,rank,suit,rankLabel,total,blackjack,options,play,mineMultiplier,diceOdds,slots,credit,limboResult,share,houseTakes,limboRound,diceRoll,coinFace,warDraw,houseThrow,wheelStop,safePick};
})();
