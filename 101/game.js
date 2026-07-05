'use strict';

const COLORS = ['red', 'blue', 'black', 'yellow'];
const COLOR_TR = { red: 'Kırmızı', blue: 'Mavi', black: 'Siyah', yellow: 'Sarı' };

let S = null;              // oyun durumu
let selected = new Set();  // seçili taş id'leri
let sortMode = 0;          // 0: renk+sayı, 1: sayı+renk
let botTimer = null;

/* ---------- Kurulum ---------- */

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGame() {
  clearTimeout(botTimer);
  let id = 0;
  const deck = [];
  for (const c of COLORS)
    for (let n = 1; n <= 13; n++)
      for (let k = 0; k < 2; k++) deck.push({ id: id++, color: c, num: n, fake: false });
  deck.push({ id: id++, fake: true }, { id: id++, fake: true });
  shuffle(deck);

  const ii = deck.findIndex(t => !t.fake);
  const indicator = deck.splice(ii, 1)[0];
  const okey = { color: indicator.color, num: indicator.num % 13 + 1 };

  const players = [
    { name: 'Sen', bot: false, hand: [], opened: false },
    { name: 'Ayşe', bot: true, hand: [], opened: false },
    { name: 'Mehmet', bot: true, hand: [], opened: false },
    { name: 'Zeynep', bot: true, hand: [], opened: false },
  ];
  for (let i = 0; i < 15; i++) players[0].hand.push(deck.pop());
  for (let p = 1; p < 4; p++)
    for (let i = 0; i < 14; i++) players[p].hand.push(deck.pop());

  S = {
    deck, indicator, okey, players,
    tableMelds: [], discards: [[], [], [], []],
    turn: 0, phase: 'action', staged: [], over: false,
    status: 'Oyun başladı, ilk el sende! Per hazırlayıp 101 ile açabilir ya da bir taş atabilirsin.',
  };
  selected.clear();
  sortRack();
  render();
}

/* ---------- Taş yardımcıları ---------- */

const isWild = t => !t.fake && t.color === S.okey.color && t.num === S.okey.num;
const reprOf = t => t.fake ? { color: S.okey.color, num: S.okey.num } : { color: t.color, num: t.num };

function tileName(t) {
  if (t.fake) return 'Sahte Okey';
  if (isWild(t)) return 'OKEY';
  return `${COLOR_TR[t.color]} ${t.num}`;
}

/* ---------- Per (meld) doğrulama ----------
   Küt: aynı sayı, farklı renk, 3-4 taş.
   Seri: aynı renk ardışık sayılar, 3+ taş; 1 taşı 13'ten sonra da gelebilir (14 sayılır, 1 puan).
   Okey joker, sahte okey ise okeyin gerçek yüzü olarak oynar. */

function validMeld(ts) {
  if (!ts || ts.length < 3) return null;
  const wilds = ts.filter(isWild);
  const fixed = ts.filter(t => !isWild(t));
  if (fixed.length === 0) return null;
  const reprs = fixed.map(reprOf);

  // Küt (set)
  if (ts.length <= 4) {
    const nums = new Set(reprs.map(r => r.num));
    const cols = new Set(reprs.map(r => r.color));
    if (nums.size === 1 && cols.size === fixed.length) {
      const n = reprs[0].num;
      return { type: 'set', points: n * ts.length, arranged: [...fixed, ...wilds] };
    }
  }

  // Seri (run)
  const colSet = new Set(reprs.map(r => r.color));
  if (colSet.size !== 1) return null;
  const L = ts.length;
  if (L > 14) return null;

  const aceIdx = [];
  reprs.forEach((r, i) => { if (r.num === 1) aceIdx.push(i); });

  let best = null;
  for (let m = 0; m < (1 << aceIdx.length); m++) {
    const nums = reprs.map(r => r.num);
    for (let a = 0; a < aceIdx.length; a++) if ((m >> a) & 1) nums[aceIdx[a]] = 14;
    if (new Set(nums).size !== nums.length) continue;
    const lo = Math.min(...nums), hi = Math.max(...nums);
    if (hi - lo + 1 > L) continue;
    for (let s = Math.max(1, hi - L + 1); s <= Math.min(lo, 15 - L); s++) {
      const e = s + L - 1;
      let pts = 0;
      for (let k = s; k <= e; k++) pts += (k === 14 ? 1 : k);
      if (!best || pts > best.points) {
        const byNum = {};
        fixed.forEach((t, i) => { byNum[nums[i]] = t; });
        const wq = [...wilds];
        const arranged = [];
        for (let k = s; k <= e; k++) arranged.push(byNum[k] !== undefined ? byNum[k] : wq.pop());
        best = { type: 'run', points: pts, arranged };
      }
    }
  }
  return best;
}

/* ---------- Aday perler ve en iyi seçim (bot + açma) ---------- */

function candidateMelds(hand) {
  const res = [];
  const wilds = hand.filter(isWild);
  const byColor = {}, byNum = {};
  for (const t of hand) {
    if (isWild(t)) continue;
    const r = reprOf(t);
    (byColor[r.color] = byColor[r.color] || []).push({ t, n: r.num });
    (byNum[r.num] = byNum[r.num] || []).push({ t, c: r.color });
  }

  // Kütler
  for (let n = 1; n <= 13; n++) {
    const perColor = {};
    for (const x of (byNum[n] || [])) if (!perColor[x.c]) perColor[x.c] = x.t;
    const cols = Object.values(perColor);
    if (!cols.length) continue;
    for (let mask = 1; mask < (1 << cols.length); mask++) {
      const pick = [];
      for (let i = 0; i < cols.length; i++) if ((mask >> i) & 1) pick.push(cols[i]);
      for (let w = 0; w <= Math.min(wilds.length, 4 - pick.length); w++) {
        const size = pick.length + w;
        if (size >= 3 && size <= 4) res.push([...pick, ...wilds.slice(0, w)]);
      }
    }
  }

  // Seriler
  for (const color of COLORS) {
    const list = byColor[color] || [];
    if (!list.length) continue;
    const perNum = {};
    for (const x of list) {
      (perNum[x.n] = perNum[x.n] || []).push(x.t);
      if (x.n === 1) (perNum[14] = perNum[14] || []).push(x.t);
    }
    const maxL = Math.min(14, list.length + wilds.length);
    for (let L = 3; L <= maxL; L++) {
      for (let s = 1; s + L - 1 <= 14; s++) {
        const used = new Set();
        const tiles = [];
        let miss = 0;
        for (let k = s; k < s + L; k++) {
          const opts = (perNum[k] || []).filter(t => !used.has(t.id));
          if (opts.length) { used.add(opts[0].id); tiles.push(opts[0]); }
          else miss++;
        }
        if (tiles.length && miss <= wilds.length) {
          const meld = [...tiles, ...wilds.slice(0, miss)];
          if (validMeld(meld)) res.push(meld);
        }
      }
    }
  }
  return res;
}

function bestMeldSelection(hand) {
  const idx = {};
  hand.forEach((t, i) => { idx[t.id] = i; });
  const cands = candidateMelds(hand).map(tiles => {
    const v = validMeld(tiles);
    let mask = 0;
    for (const t of tiles) mask |= 1 << idx[t.id];
    return { tiles, points: v.points, mask };
  });
  const byTile = hand.map(() => []);
  for (const c of cands)
    for (let i = 0; i < hand.length; i++)
      if ((c.mask >> i) & 1) byTile[i].push(c);

  const memo = new Map();
  function dfs(mask, i) {
    while (i < hand.length && ((mask >> i) & 1)) i++;
    if (i >= hand.length) return { points: 0, melds: [] };
    const key = mask * 16 + i;
    if (memo.has(key)) return memo.get(key);
    let best = dfs(mask | (1 << i), i + 1); // bu taşı kullanma
    for (const c of byTile[i]) {
      if (!(c.mask & mask)) {
        const r = dfs(mask | c.mask, i + 1);
        if (c.points + r.points > best.points)
          best = { points: c.points + r.points, melds: [c, ...r.melds] };
      }
    }
    memo.set(key, best);
    return best;
  }
  return dfs(0, 0);
}

/* ---------- Bot ---------- */

function usefulness(hand, t) {
  if (isWild(t)) return 1000;
  if (t.fake) return 900;
  const r = reprOf(t);
  let s = 0;
  for (const o of hand) {
    if (o.id === t.id || isWild(o)) continue;
    const q = reprOf(o);
    if (q.num === r.num && q.color !== r.color) s += 3;
    if (q.num === r.num && q.color === r.color) s += 2;
    if (q.color === r.color) {
      const d = Math.abs(q.num - r.num);
      if (d === 1) s += 3;
      else if (d === 2) s += 1;
      if ((r.num === 1 && q.num === 13) || (r.num === 13 && q.num === 1)) s += 2;
    }
  }
  return s;
}

function shouldTake(p, tile) {
  if (p.opened) return S.tableMelds.some(m => validMeld([...m.tiles, tile]));
  const h = p.hand;
  for (let i = 0; i < h.length; i++)
    for (let j = i + 1; j < h.length; j++)
      if (!isWild(h[i]) && !isWild(h[j]) && validMeld([h[i], h[j], tile])) return true;
  return false;
}

function layMeld(p, tiles) {
  const v = validMeld(tiles);
  for (const t of tiles) {
    const i = p.hand.findIndex(h => h.id === t.id);
    if (i >= 0) p.hand.splice(i, 1);
  }
  S.tableMelds.push({ tiles: v.arranged });
  return v;
}

function botTurn() {
  if (!S || S.over) return;
  const pi = S.turn, p = S.players[pi];

  // Çekme: bir önceki oyuncunun attığı işe yarıyorsa yerden, yoksa desteden
  const pd = S.discards[(pi + 3) % 4];
  let fromDiscard = false;
  if (pd.length && shouldTake(p, pd[pd.length - 1])) {
    p.hand.push(pd.pop());
    fromDiscard = true;
  } else {
    if (!S.deck.length) { endGame(null); return; }
    p.hand.push(S.deck.pop());
  }

  const acts = [];
  if (!p.opened) {
    const sel = bestMeldSelection(p.hand);
    if (sel.points >= 101) {
      let melds = sel.melds;
      const used = melds.reduce((a, m) => a + m.tiles.length, 0);
      if (used >= p.hand.length) {
        // atacak taş kalmalı: en küçük peri bırakmayı dene
        const sorted = [...melds].sort((a, b) => a.points - b.points);
        if (sel.points - sorted[0].points >= 101) melds = melds.filter(m => m !== sorted[0]);
        else melds = null;
      }
      if (melds) {
        let total = 0;
        for (const m of melds) { layMeld(p, m.tiles); total += m.points; }
        p.opened = true;
        acts.push(`${total} puanla AÇTI!`);
      }
    }
  } else {
    // Yeni per indir
    const sel = bestMeldSelection(p.hand);
    let laid = 0;
    for (const m of [...sel.melds].sort((a, b) => b.points - a.points)) {
      if (p.hand.length - m.tiles.length >= 1) { layMeld(p, m.tiles); laid++; }
    }
    if (laid) acts.push(`${laid} per indirdi.`);
    // İşleme
    let worked = 0, added = true;
    while (added && p.hand.length > 1) {
      added = false;
      outer:
      for (const t of p.hand) {
        for (const m of S.tableMelds) {
          const v = validMeld([...m.tiles, t]);
          if (v) {
            p.hand.splice(p.hand.indexOf(t), 1);
            m.tiles = v.arranged;
            worked++; added = true;
            break outer;
          }
        }
      }
    }
    if (worked) acts.push(`${worked} taş işledi.`);
  }

  // Taş at
  let di = 0, bs = Infinity;
  p.hand.forEach((t, i) => {
    const u = usefulness(p.hand, t);
    if (u < bs) { bs = u; di = i; }
  });
  const disc = p.hand.splice(di, 1)[0];
  S.discards[pi].push(disc);
  S.status = `${p.name} ${fromDiscard ? 'yerden aldı' : 'desteden çekti'}${acts.length ? ', ' + acts.join(' ') : ''} ve ${tileName(disc)} attı.`;

  if (p.hand.length === 0) { render(); endGame(p); return; }
  nextTurn();
}

function nextTurn() {
  S.turn = (S.turn + 1) % 4;
  if (S.turn === 0) {
    S.phase = 'draw';
    S.status += ' Sıra sende: desteden çek ya da yerden al.';
    render();
  } else {
    render();
    botTimer = setTimeout(botTurn, 900);
  }
}

function endGame(winner) {
  S.over = true;
  clearTimeout(botTimer);
  const msg = winner
    ? (winner.bot ? `${winner.name} eli bitirdi 😔` : '🎉 Tebrikler, eli sen bitirdin!')
    : 'Destede taş kalmadı — el berabere bitti.';
  document.getElementById('modalMsg').textContent = msg;
  document.getElementById('modal').classList.remove('hidden');
  render();
}

/* ---------- Oyuncu eylemleri ---------- */

const me = () => S.players[0];
const myTurn = () => S.turn === 0 && !S.over;

function selectedTiles() {
  return me().hand.filter(t => selected.has(t.id));
}

function drawFromDeck() {
  if (!myTurn()) { S.status = 'Sıra botlarda, birazdan sana gelecek…'; render(); return; }
  if (S.phase !== 'draw') { S.status = 'Bu tur taş çekmiyorsun — per yapabilir ya da tek taş seçip "Taş At" diyebilirsin.'; render(); return; }
  if (!S.deck.length) { endGame(null); return; }
  me().hand.push(S.deck.pop());
  S.phase = 'action';
  S.status = 'Desteden çektin. Per yapabilir, işleyebilir ya da bir taş atabilirsin.';
  render();
}

function takeDiscard() {
  if (!myTurn()) { S.status = 'Sıra botlarda, birazdan sana gelecek…'; render(); return; }
  if (S.phase !== 'draw') { S.status = 'Bu tur taş almıyorsun — per yapabilir ya da tek taş seçip "Taş At" diyebilirsin.'; render(); return; }
  const pd = S.discards[3];
  if (!pd.length) return;
  const t = pd.pop();
  me().hand.push(t);
  S.phase = 'action';
  S.status = `Yerden ${tileName(t)} aldın. Şimdi bir taş atmalısın.`;
  render();
}

function toggleTile(tid) {
  if (selected.has(tid)) selected.delete(tid);
  else selected.add(tid);
  render();
}

function stagedPoints() {
  return S.staged.reduce((a, m) => a + m.points, 0);
}

function doMeld() {
  if (!myTurn() || S.phase !== 'action') return;
  const sel = selectedTiles();
  const v = validMeld(sel);
  if (!v) { S.status = 'Seçili taşlar geçerli bir per değil (küt: aynı sayı farklı renk, seri: aynı renk ardışık).'; render(); return; }
  const p = me();
  if (p.opened) {
    if (p.hand.length - sel.length < 1) { S.status = 'Atacak taşın kalmalı — elindeki son taşı pere koyamazsın.'; render(); return; }
    layMeld(p, sel);
    S.status = `${v.points} puanlık per indirdin.`;
  } else {
    for (const t of sel) p.hand.splice(p.hand.indexOf(t), 1);
    S.staged.push({ tiles: v.arranged, points: v.points });
    S.status = `Per hazırlandı (${v.points} puan). Toplam: ${stagedPoints()} puan${stagedPoints() >= 101 ? ' — açabilirsin!' : ' (açmak için 101 gerekli).'}`;
  }
  selected.clear();
  render();
}

function doOpen() {
  if (!myTurn() || S.phase !== 'action') return;
  const p = me();
  if (p.opened || !S.staged.length) return;
  const pts = stagedPoints();
  if (pts < 101) { S.status = `Toplam ${pts} puan — açmak için en az 101 gerekiyor.`; render(); return; }
  if (p.hand.length < 1) { S.status = 'Atacak taşın kalmalı — bir peri geri alıp öyle aç.'; render(); return; }
  for (const m of S.staged) S.tableMelds.push({ tiles: m.tiles });
  S.staged = [];
  p.opened = true;
  S.status = `${pts} puanla AÇTIN! Artık işleyebilir ve yeni perler indirebilirsin.`;
  render();
}

function doUnstage() {
  if (!S.staged.length || me().opened) return;
  for (const m of S.staged) me().hand.push(...m.tiles);
  S.staged = [];
  sortRack();
  S.status = 'Hazırlanan perler ıstakaya geri alındı.';
  render();
}

function doDiscard() {
  if (!myTurn() || S.phase !== 'action') return;
  const sel = selectedTiles();
  if (sel.length !== 1) { S.status = 'Atmak için tek bir taş seç.'; render(); return; }
  const p = me();
  const t = sel[0];
  p.hand.splice(p.hand.indexOf(t), 1);
  S.discards[0].push(t);
  selected.clear();
  if (p.hand.length === 0 && S.staged.length === 0) { render(); endGame(p); return; }
  nextTurn();
}

function tryWork(meldIdx) {
  if (!myTurn() || S.phase !== 'action') return;
  const p = me();
  if (!p.opened) { S.status = 'İşleyebilmek için önce 101 ile açman gerekiyor.'; render(); return; }
  const sel = selectedTiles();
  if (sel.length !== 1) { S.status = 'İşlemek için tek bir taş seçip masadaki pere dokun.'; render(); return; }
  if (p.hand.length <= 1) { S.status = 'Atacak taşın kalmalı — son taşını işleyemezsin.'; render(); return; }
  const m = S.tableMelds[meldIdx];
  const v = validMeld([...m.tiles, sel[0]]);
  if (!v) { S.status = `${tileName(sel[0])} bu pere uymuyor.`; render(); return; }
  p.hand.splice(p.hand.indexOf(sel[0]), 1);
  m.tiles = v.arranged;
  selected.clear();
  S.status = 'Taş işlendi.';
  render();
}

function sortRack() {
  const h = me().hand;
  const key = t => {
    const r = reprOf(t);
    const c = COLORS.indexOf(r.color);
    return sortMode === 0 ? c * 100 + r.num : r.num * 10 + c;
  };
  h.sort((a, b) => key(a) - key(b));
}

/* ---------- Arayüz ---------- */

function tileHTML(t, cls = '', attrs = '') {
  const r = reprOf(t);
  const wild = isWild(t);
  const face = t.fake ? '❋' : r.num;
  return `<div class="tile ${r.color} ${wild ? 'okey' : ''} ${cls}" data-id="${t.id}" ${attrs}>
    <span class="num">${face}</span>
    ${wild ? '<span class="badge">OKEY</span>' : ''}
    ${t.fake ? '<span class="badge">SAHTE</span>' : ''}
  </div>`;
}

function render() {
  if (!S) return;
  const p = me();

  document.getElementById('okeyInfo').innerHTML =
    `Okey: <b>${COLOR_TR[S.okey.color]} ${S.okey.num}</b> · Sahte okey (❋) onun yerine geçer`;

  // Rakipler
  document.getElementById('opponents').innerHTML = S.players.slice(1).map((o, i) => `
    <div class="opp ${S.turn === i + 1 && !S.over ? 'active' : ''}">
      <div class="oname">${o.name}</div>
      <div class="ocount">${o.hand.length} taş</div>
      ${o.opened ? '<div class="obadge">AÇTI</div>' : ''}
    </div>`).join('');

  // Masa
  const canWork = myTurn() && S.phase === 'action' && p.opened && selectedTiles().length === 1;
  document.getElementById('tableMelds').innerHTML = S.tableMelds.length
    ? S.tableMelds.map((m, i) => {
        const fits = canWork && p.hand.length > 1 && validMeld([...m.tiles, selectedTiles()[0]]);
        return `<div class="meld ${fits ? 'targetable' : ''}" data-meld="${i}">
          ${m.tiles.map(t => tileHTML(t, 'small')).join('')}
        </div>`;
      }).join('')
    : '<div class="emptyTable">Masa boş — ilk açan sen ol! (perler 101 puanı geçmeli)</div>';

  // Orta alan
  document.getElementById('deckCount').textContent = S.deck.length;
  document.getElementById('deck').classList.toggle('takeable', myTurn() && S.phase === 'draw');
  const ind = S.indicator;
  document.getElementById('indicatorWrap').innerHTML =
    `<div class="tile ${ind.color}"><span class="num">${ind.num}</span></div>`;
  const pd = S.discards[3];
  const takeable = myTurn() && S.phase === 'draw' && pd.length;
  document.getElementById('prevDiscard').innerHTML = pd.length
    ? tileHTML(pd[pd.length - 1], takeable ? 'takeable' : '', 'data-take="1"')
    : '<div class="emptySlot"></div>';

  // Durum
  document.getElementById('status').textContent = S.status;

  // Hazırlanan perler
  const sw = document.getElementById('stagedWrap');
  sw.classList.toggle('show', S.staged.length > 0);
  document.getElementById('stagedPoints').textContent = stagedPoints();
  document.getElementById('staged').innerHTML = S.staged.map(m =>
    `<div class="meld">${m.tiles.map(t => tileHTML(t, 'small')).join('')}</div>`).join('');

  // Istaka
  document.getElementById('rack').innerHTML =
    p.hand.map(t => tileHTML(t, selected.has(t.id) ? 'selected' : '')).join('');

  // Butonlar
  const act = myTurn() && S.phase === 'action';
  const selCount = selected.size;
  document.getElementById('btnMeld').disabled = !(act && selCount >= 3);
  document.getElementById('btnOpen').disabled = !(act && !p.opened && stagedPoints() >= 101 && p.hand.length >= 1);
  document.getElementById('btnOpen').textContent = p.opened ? 'Açıldı ✓' : `Aç (${stagedPoints()}/101)`;
  document.getElementById('btnDiscard').disabled = !(act && selCount === 1);
}

/* ---------- Olaylar ---------- */

document.getElementById('deck').addEventListener('click', drawFromDeck);

document.getElementById('prevDiscard').addEventListener('click', e => {
  if (e.target.closest('[data-take]')) takeDiscard();
});

document.getElementById('rack').addEventListener('click', e => {
  const el = e.target.closest('.tile');
  if (el) toggleTile(Number(el.dataset.id));
});

document.getElementById('tableMelds').addEventListener('click', e => {
  const el = e.target.closest('.meld');
  if (el && el.dataset.meld !== undefined) tryWork(Number(el.dataset.meld));
});

document.getElementById('btnMeld').addEventListener('click', doMeld);
document.getElementById('btnOpen').addEventListener('click', doOpen);
document.getElementById('btnDiscard').addEventListener('click', doDiscard);
document.getElementById('btnUnstage').addEventListener('click', doUnstage);

document.getElementById('btnSort').addEventListener('click', () => {
  sortMode = 1 - sortMode;
  sortRack();
  render();
});

document.getElementById('btnNew').addEventListener('click', () => {
  if (S && !S.over && !confirm('Oyunu yeniden başlatmak istiyor musun?')) return;
  document.getElementById('modal').classList.add('hidden');
  newGame();
});

document.getElementById('btnRestart').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
  newGame();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

newGame();
