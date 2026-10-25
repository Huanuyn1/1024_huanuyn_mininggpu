/* =========================================================
   大肥鱼的狂野矿卡  —  1024 程序员节参赛作品
   纯原生 Canvas 2D，零依赖，双击 index.html 即可运行
   ========================================================= */
(() => {
  'use strict';

  // ---------------- 基础工具 ----------------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
  const rndInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  const FONT_MONO = 'Consolas,"Courier New",monospace';

  // ---------------- 场地 ----------------
  const ARENA = { w: 2600, h: 1800 };

  // ---------------- 画布与缩放 ----------------
  const W = 1280, H = 720;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let scale = 1, offX = 0, offY = 0, dpr = 1;

  function resize() {
    const cw = window.innerWidth, ch = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    scale = Math.min(cw / W, ch / H);
    offX = (cw - W * scale) / 2;
    offY = (ch - H * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------- 音效（WebAudio 程序化合成，零素材） ----------------
  const AC = { ctx: null, master: null, muted: false, lastShot: 0 };

  function initAudio() {
    applyBgm(); // 首次点击/触摸时开始播放背景音乐（绕过自动播放限制）
    if (AC.ctx) { if (AC.ctx.state === 'suspended') AC.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    AC.ctx = new Ctx();
    AC.master = AC.ctx.createGain();
    AC.master.gain.value = 0.20;
    AC.master.connect(AC.ctx.destination);
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!AC.ctx || AC.muted) return;
    const t = AC.ctx.currentTime;
    const o = AC.ctx.createOscillator();
    const g = AC.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(vol === undefined ? 0.25 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(AC.master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!AC.ctx || AC.muted) return;
    const t = AC.ctx.currentTime;
    const len = Math.max(1, Math.floor(AC.ctx.sampleRate * dur));
    const buf = AC.ctx.createBuffer(1, len, AC.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = AC.ctx.createBufferSource();
    src.buffer = buf;
    const f = AC.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1400;
    const g = AC.ctx.createGain();
    g.gain.value = vol === undefined ? 0.18 : vol;
    src.connect(f); f.connect(g); g.connect(AC.master);
    src.start(t);
  }

  // ---------------- 背景音乐（设置单独存，不放进游戏存档） ----------------
  const AUDIO_KEY = 'kuangku.audio.v1';
  const BGM = { el: null, enabled: true, volume: 0.5 };
  const audioSlider = { x: 0, y: 0, w: 0, h: 0 };
  let audioDragging = false;

  function loadAudioSettings() {
    try {
      const raw = window.localStorage.getItem(AUDIO_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      if (typeof o.enabled === 'boolean') BGM.enabled = o.enabled;
      if (typeof o.volume === 'number') BGM.volume = clamp(o.volume, 0, 1);
    } catch (e) { /* 隐私模式忽略 */ }
  }

  function saveAudioSettings() {
    try {
      window.localStorage.setItem(AUDIO_KEY, JSON.stringify({ enabled: BGM.enabled, volume: BGM.volume }));
    } catch (e) { /* 同上 */ }
  }

  function initBgm() {
    if (BGM.el) return BGM.el;
    try {
      const a = new Audio('assets/bgm.mp3');
      a.loop = true;
      a.preload = 'auto';
      a.volume = BGM.volume;
      BGM.el = a;
    } catch (e) { BGM.el = null; }
    return BGM.el;
  }

  function applyBgm() {
    const a = initBgm();
    if (!a) return;
    a.volume = BGM.volume;
    if (!BGM.enabled) { a.pause(); return; }
    if (a.paused) {
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  function toggleMusic() {
    BGM.enabled = !BGM.enabled;
    saveAudioSettings();
    applyBgm();
    blip(BGM.enabled ? 880 : 520, 0.06, 'sine', 0.07, BGM.enabled ? 1200 : 360);
  }

  function setMusicVolume(v, persist) {
    BGM.volume = clamp(v, 0, 1);
    if (BGM.el) BGM.el.volume = BGM.volume;
    if (persist) saveAudioSettings();
  }

  // 主界面和暂停界面共用的音乐开关 + 音量条
  function drawAudioControls(x, y) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = 'rgba(190,215,245,0.9)';
    ctx.fillText('音乐', x, y);

    const sw = 44, sh = 20, sx = x + 42, sy = y - sh / 2;
    ctx.fillStyle = BGM.enabled ? 'rgba(80,220,255,0.9)' : 'rgba(70,90,120,0.75)';
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, sh / 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(sx + (BGM.enabled ? sw - sh / 2 : sh / 2), y, sh / 2 - 3, 0, TAU); ctx.fill();
    G.uiButtons.push({ x: sx - 6, y: sy - 6, w: sw + 12, h: sh + 12, action: toggleMusic });

    const tx = x + 104, tw = 132;
    ctx.fillStyle = 'rgba(60,80,110,0.85)';
    ctx.beginPath(); ctx.roundRect(tx, y - 3, tw, 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(142,242,255,0.9)';
    ctx.beginPath(); ctx.roundRect(tx, y - 3, tw * BGM.volume, 6, 3); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(tx + tw * BGM.volume, y, 6, 0, TAU); ctx.fill();
    ctx.font = 'bold 11px ' + FONT;
    ctx.fillStyle = 'rgba(150,190,240,0.75)';
    ctx.fillText(Math.round(BGM.volume * 100) + '%', tx + tw + 8, y);

    audioSlider.x = tx;
    audioSlider.y = y - 10;
    audioSlider.w = tw;
    audioSlider.h = 20;
  }

  // ---------------- 输入 ----------------
  const keys = Object.create(null);
  const mouse = { x: W / 2, y: H / 2, down: false };
  // 上上下下左右左右：调试面板
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
  let konamiIdx = 0;

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    initAudio(); // 键盘也算一次交互，顺便放背景音乐
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (G.debugPanel) {
      if (e.code === 'Escape') G.debugPanel = false;
      return;
    }
    if (G.state === 'achievements') {
      if (e.code === 'Escape' || e.code === 'KeyP') closeAchievements();
      else if (e.code === 'ArrowLeft') applyAchievementPage(-1);
      else if (e.code === 'ArrowRight') applyAchievementPage(1);
      return;
    }
    if ((G.state === 'dead' || G.state === 'win') && e.code === 'Escape') {
      G.state = 'menu';
      G.uiButtons.length = 0;
      return;
    }
    if (G.state === 'stats') {
      if (e.code === 'Escape' || e.code === 'KeyP') backToMenu();
      return;
    }
    // 柯南码：任意模式中 ↑↑↓↓←→←→
    if (!e.repeat && G.state === 'playing') {
      if (e.code === KONAMI[konamiIdx]) {
        konamiIdx++;
        if (konamiIdx === KONAMI.length) {
          konamiIdx = 0;
          if (G.debugMode) G.debugPanel = true;
          else activateDebugPanel();
          return;
        }
      } else if (e.code.indexOf('Arrow') === 0) {
        konamiIdx = e.code === KONAMI[0] ? 1 : 0;
      }
    }
    if (e.code === 'KeyR') game.restart();
    if (e.code === 'KeyM') { AC.muted = !AC.muted; SaveData.muted = AC.muted; persistSave(); }
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); }
    if (e.code === 'KeyT') { cycleSpeed(); }
    // 只有战斗中才响应软件快捷键，避免在商店/结算/暂停界面白烧冷却
    if (G.state === 'playing' && !G.paused) {
      if (e.code === 'Space') { useSoftware(0); }
      if (e.code === 'Digit1') { useSoftware(0); }
      if (e.code === 'Digit2') { useSoftware(1); }
      if (e.code === 'Digit3') { useSoftware(2); }
      if (e.code === 'Digit4') { useSoftware(3); }
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  // 切到后台自动暂停，回来不至于已经被怪围死
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'playing' && !G.paused) togglePause();
  });

  function toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - offX) / scale,
      y: (clientY - r.top - offY) / scale,
    };
  }
  canvas.addEventListener('mousemove', (e) => {
    const p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
    if (audioDragging && audioSlider.w > 0) setMusicVolume((p.x - audioSlider.x) / audioSlider.w, false);
  });
  canvas.addEventListener('mousedown', (e) => {
    mouse.down = true;
    const p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
    game.click(p.x, p.y);
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
    if (audioDragging) { audioDragging = false; saveAudioSettings(); }
  });

  // ---------------- 触控（移动端） ----------------
  const touch = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 };

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    initAudio();
    const t = e.changedTouches[0];
    const p = toLogical(t.clientX, t.clientY);
    if (audioSlider.w > 0 && p.x >= audioSlider.x - 6 && p.x <= audioSlider.x + audioSlider.w + 6 &&
        p.y >= audioSlider.y && p.y <= audioSlider.y + audioSlider.h) {
      setMusicVolume((p.x - audioSlider.x) / audioSlider.w, true);
      audioDragging = true;
      return;
    }
    if (G.state !== 'playing') {
      game.click(p.x, p.y);
      return;
    }
    for (const b of G.uiButtons) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        if (b.action) b.action();
        return;
      }
    }
    touch.active = true;
    touch.id = t.identifier;
    touch.ox = p.x; touch.oy = p.y;
    touch.x = p.x; touch.y = p.y;
    touch.dx = 0; touch.dy = 0; touch.mag = 0;
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (audioDragging && audioSlider.w > 0) {
      const t0 = e.changedTouches[0];
      if (t0) setMusicVolume((toLogical(t0.clientX, t0.clientY).x - audioSlider.x) / audioSlider.w, false);
      return;
    }
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.id) continue;
      const p = toLogical(t.clientX, t.clientY);
      touch.x = p.x; touch.y = p.y;
      const dx = p.x - touch.ox, dy = p.y - touch.oy;
      const len = Math.hypot(dx, dy);
      const dead = 12;
      if (len <= dead) { touch.dx = 0; touch.dy = 0; touch.mag = 0; }
      else {
        touch.mag = Math.min(1, (len - dead) / 64);
        touch.dx = dx / len;
        touch.dy = dy / len;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (audioDragging) { audioDragging = false; saveAudioSettings(); }
    for (const t of e.changedTouches) {
      if (t.identifier === touch.id) {
        touch.active = false; touch.dx = 0; touch.dy = 0; touch.mag = 0;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchcancel', () => {
    if (audioDragging) { audioDragging = false; saveAudioSettings(); }
    touch.active = false; touch.dx = 0; touch.dy = 0; touch.mag = 0;
  }, { passive: false });

  // ---------------- 数据表 ----------------
  // CPU：决定普攻的射速、伤害、弹道数
  const CPUS = [
    { name: '赛扬 G5905',       tag: '亮机专用',       dmg: 12, interval: 0.34,  count: 1, pierce: 0, spread: 0,    cost: 0 },
    { name: '奔腾 G6400',       tag: '办公够用',       dmg: 15, interval: 0.30,  count: 1, pierce: 0, spread: 0,    cost: 55 },
    { name: '酷睿 i3-12100',    tag: '四核起步',       dmg: 18, interval: 0.27,  count: 1, pierce: 1, spread: 0,    cost: 120 },
    { name: '酷睿 i5-12400',    tag: '平民六核',       dmg: 22, interval: 0.24,  count: 1, pierce: 1, spread: 0,    cost: 220 },
    { name: '酷睿 i7-13700K',   tag: '能上高频',       dmg: 27, interval: 0.20,  count: 1, pierce: 1, spread: 0,    cost: 380 },
    { name: '酷睿 i9-14900K',   tag: '电压拉满',       dmg: 24, interval: 0.185, count: 2, pierce: 1, spread: 0.10, cost: 600 },
    { name: '线程撕裂者 7995WX', tag: '核心数就是正义', dmg: 27, interval: 0.15,  count: 3, pierce: 2, spread: 0.14, cost: 900 },
    { name: '至强 Platinum 8380', tag: '服务器退役',    dmg: 30, interval: 0.125, count: 4, pierce: 2, spread: 0.16, cost: 1400 },
  ];

  // 显卡：决定技能
  const GPUS = [
    { name: '核显 UHD 630', tag: '能亮就算赢',         skill: null,      mana: 0,   cd: 0,    cost: 0,    color: '#6b7a90' },
    { name: 'RX 580 8G',    tag: '无敌矿渣，战未来',   skill: 'storm',   mana: 30,  cd: 5.0,  cost: 90,   color: '#ff5a5a' },
    { name: 'GTX 1080 Ti',  tag: '一代神卡，死不退休', skill: 'laser',   mana: 35,  cd: 4.5,  cost: 190,  color: '#7dff9b' },
    { name: 'RTX 3060 12G', tag: '平民之光，显存管够', skill: 'storm',   mana: 36,  cd: 4.6,  cost: 320,  color: '#9fe0ff' },
    { name: 'RTX 3080',     tag: '传奇矿场老将',       skill: 'boost',   mana: 40,  cd: 6.0,  cost: 480,  color: '#ffd166' },
    { name: 'RTX 4070',     tag: '能效比刺客',         skill: 'precise', mana: 42,  cd: 5.2,  cost: 680,  color: '#a5ffb0' },
    { name: 'RTX 4090',     tag: '别叫它显卡，叫灭火器', skill: 'flame',  mana: 60,  cd: 8.0,  cost: 950,  color: '#ff8a3d' },
    { name: 'RTX 5050',     tag: '老黄刀法精准',       skill: 'laser',   mana: 50,  cd: 3.8,  cost: 1300, color: '#9b8cff' },
    { name: 'GTX 690',      tag: '战术核显卡',         skill: 'nuke',    mana: 100, cd: 20.0, cost: 2000, color: '#ff3df0' },
  ];

  // 内存：蓝上限与回蓝
  const RAMS = [
    { name: 'DDR4 8G 2666',   maxMana: 100, regen: 7,  cost: 0 },
    { name: 'DDR4 16G 3200',  maxMana: 145, regen: 10, cost: 65 },
    { name: 'DDR4 32G 3600',  maxMana: 175, regen: 12, cost: 140 },
    { name: 'DDR5 32G 6000',  maxMana: 210, regen: 15, cost: 250 },
    { name: 'DDR5 64G 7200',  maxMana: 270, regen: 19, cost: 420 },
    { name: 'DDR5 128G ECC',  maxMana: 340, regen: 24, cost: 650 },
    { name: 'DDR5 256G ECC',  maxMana: 430, regen: 30, cost: 950 },
  ];

  // 软件：主动技能，占 SSD 槽位；desc 是商店里给人看的实际效果
  const SOFTWARES = [
    { id: 'antivirus',  name: '杀毒软件',   tag: '全盘扫描，格杀勿论',   desc: '半径 470 内清场，伤害 240+34×波次', cd: 11, cost: 260, color: '#7dffd4', effect: 'aoe' },
    { id: 'taskmgr',    name: '任务管理器', tag: '结束掉这些进程',       desc: '全场敌人减速到 45%，持续 4 秒', cd: 14, cost: 240, color: '#8ef2ff', effect: 'slow' },
    { id: 'afterburner', name: '超频工具',  tag: '功耗墙？不存在的',     desc: '攻击间隔缩短到 55%，持续 5 秒', cd: 16, cost: 300, color: '#ff8a3d', effect: 'overclock' },
    { id: 'driver',     name: '驱动更新',   tag: '重启解决 99% 的问题',  desc: '重置显卡冷却，回复 45 蓝', cd: 18, cost: 220, color: '#9b8cff', effect: 'reset' },
    { id: 'restore',    name: '系统还原',   tag: '回到昨天',             desc: '回复 35% 最大生命（42 点）', cd: 22, cost: 280, color: '#7dff9b', effect: 'heal' },
    { id: 'donut',      name: '甜甜圈烤机', tag: '先烤自己，再烤别人',   desc: '全屏伤害 320+42×波次，自损 12%', cd: 20, cost: 340, color: '#ffd166', effect: 'burn' },
    { id: 'miner',      name: '挖矿脚本',   tag: '算力就是钱',           desc: '立刻 +80 矿币，6 秒拾取翻倍', cd: 15, cost: 260, color: '#ffe066', effect: 'gold' },
    { id: 'firewall',   name: '防火墙',     tag: '已拦截全部伤害',       desc: '3.2 秒内完全免疫伤害', cd: 19, cost: 320, color: '#5ad1ff', effect: 'shield' },
  ];

  // SSD：软件槽位上限
  const SSDS = [
    { name: 'SATA 128G',    slots: 1, cost: 0 },
    { name: 'SATA 512G',    slots: 2, cost: 180 },
    { name: 'NVMe 1T',      slots: 3, cost: 420 },
    { name: 'NVMe 2T Gen5', slots: 4, cost: 780 },
  ];

  const SKILL_NAMES = {
    storm: '矿渣风暴', laser: '神卡激光', boost: '风扇全开',
    flame: '灭火器', precise: '精准刀法', nuke: '双芯核弹',
  };

  const ENEMY_TYPES = {
    worm:   { hp: 13, speed: 108, dmg: 10, r: 17, color: '#6fe3ff', gold: 2,  score: 1 },
    trojan: { hp: 10, speed: 172, dmg: 8,  r: 16, color: '#ff7bd5', gold: 3,  score: 1 },
    leak:   { hp: 40, speed: 68,  dmg: 18, r: 24, color: '#a98cff', gold: 5, score: 2 },
    boss:   { hp: 9000, speed: 108, dmg: 26, r: 58, color: '#ff3b3b', gold: 300, score: 50 },
  };

  // ---------------- 难度 ----------------
  // 只改怪物伤害；简单 = 原来的数值；突然死亡只给 1 点血
  const DIFFS = {
    easy:   { name: '简单', dmg: 1.0, color: '#7dffd4' },
    normal: { name: '普通', dmg: 1.5, color: '#8ef2ff' },
    hard:   { name: '困难', dmg: 2.0, color: '#ff8ad8' },
    sudden: { name: '突然死亡', dmg: 1.0, color: '#ff5a5a', sudden: true },
  };
  const DIFF_KEYS = ['easy', 'normal', 'hard', 'sudden'];
  function diffOf(key) { return DIFFS[key] || DIFFS.easy; }
  function diffDamageMul() { return diffOf(G.difficulty).dmg; }
  // 通关过困难才解锁
  function suddenUnlocked() {
    const h = SaveData.stats ? SaveData.stats.hard : null;
    return !!(h && h.bestClear > 0);
  }

  // ---------------- 本地存档（localStorage + 哈希校验） ----------------
  // 设置 + 分难度统计 + 每波开始时的进度存档；导出/导入带 FNV-1a 校验
  const SAVE_KEY = 'kuangku.save.v1';
  const SAVE_VERSION = 1;

  function emptyStats() {
    return { bestWave: 0, bestKills: 0, bestTime: 0, bestClear: 0, runs: 0, totalKills: 0, totalTime: 0 };
  }

  function emptyStatsMap() {
    return { easy: emptyStats(), normal: emptyStats(), hard: emptyStats(), sudden: emptyStats() };
  }

  function emptyDetail() {
    return {
      wins: 0, deaths: 0,
      kills: { worm: 0, trojan: 0, leak: 0, boss: 0 },
      goldEarned: 0, goldSpent: 0,
      damage: 0, skills: 0, softwareUses: 0,
      buys: { cpu: {}, gpu: {}, ram: {}, ssd: {}, software: {} },
    };
  }

  const SaveData = {
    showHitbox: true,
    muted: false,
    difficulty: 'easy',
    bestWave: 0,
    bestKills: 0,
    bestTime: 0,
    runs: 0,
    totalKills: 0,
    totalTime: 0,
    stats: emptyStatsMap(),
    detail: emptyDetail(),
    achievements: {},
    run: null,
  };

  let menuNotice = '';
  let menuNoticeUntil = 0;
  function notifyMenu(msg, ms) {
    menuNotice = msg;
    menuNoticeUntil = performance.now() + (ms || 4000);
  }

  // FNV-1a 32 位：做完整性校验，防止手改/传坏文件（不是加密）
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function resetSaveData() {
    SaveData.showHitbox = true;
    SaveData.muted = false;
    SaveData.difficulty = 'easy';
    SaveData.bestWave = 0;
    SaveData.bestKills = 0;
    SaveData.bestTime = 0;
    SaveData.runs = 0;
    SaveData.totalKills = 0;
    SaveData.totalTime = 0;
    SaveData.stats = emptyStatsMap();
    SaveData.detail = emptyDetail();
    SaveData.achievements = {};
    SaveData.run = null;
  }

  function adoptDetail(src) {
    if (!src || typeof src !== 'object') return;
    const d = SaveData.detail;
    const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.round(v)) : 0);
    d.wins += num(src.wins);
    d.deaths += num(src.deaths);
    if (src.kills && typeof src.kills === 'object') {
      for (const k of ['worm', 'trojan', 'leak', 'boss']) d.kills[k] += num(src.kills[k]);
    }
    d.goldEarned += num(src.goldEarned);
    d.goldSpent += num(src.goldSpent);
    d.damage += num(src.damage);
    d.skills += num(src.skills);
    d.softwareUses += num(src.softwareUses);
    if (src.buys && typeof src.buys === 'object') {
      for (const kind of Object.keys(d.buys)) {
        const b = src.buys[kind];
        if (!b || typeof b !== 'object') continue;
        for (const key of Object.keys(b)) {
          const n = num(b[key]);
          if (n) d.buys[kind][key] = (d.buys[kind][key] || 0) + n;
        }
      }
    }
  }

  function adoptStats(dst, src) {
    if (!src || typeof src !== 'object') return;
    if (typeof src.bestWave === 'number') dst.bestWave = clamp(Math.round(src.bestWave), 0, G.TOTAL_WAVES);
    if (typeof src.bestKills === 'number') dst.bestKills = Math.max(0, Math.round(src.bestKills));
    if (typeof src.bestTime === 'number') dst.bestTime = Math.max(0, src.bestTime);
    if (typeof src.bestClear === 'number') dst.bestClear = Math.max(0, src.bestClear);
    if (typeof src.runs === 'number') dst.runs = Math.max(0, Math.round(src.runs));
    if (typeof src.totalKills === 'number') dst.totalKills = Math.max(0, Math.round(src.totalKills));
    if (typeof src.totalTime === 'number') dst.totalTime = Math.max(0, src.totalTime);
  }

  function adoptSaveData(data, replace) {
    if (!data || typeof data !== 'object') return;
    if (replace) resetSaveData();
    if (typeof data.showHitbox === 'boolean') SaveData.showHitbox = data.showHitbox;
    if (typeof data.muted === 'boolean') SaveData.muted = data.muted;
    if (typeof data.bestWave === 'number') SaveData.bestWave = clamp(Math.round(data.bestWave), 0, G.TOTAL_WAVES);
    if (typeof data.bestKills === 'number') SaveData.bestKills = Math.max(0, Math.round(data.bestKills));
    if (typeof data.bestTime === 'number') SaveData.bestTime = Math.max(0, data.bestTime);
    if (typeof data.runs === 'number') SaveData.runs = Math.max(0, Math.round(data.runs));
    if (typeof data.totalKills === 'number') SaveData.totalKills = Math.max(0, Math.round(data.totalKills));
    if (typeof data.totalTime === 'number') SaveData.totalTime = Math.max(0, data.totalTime);
    if (typeof data.difficulty === 'string' && DIFFS[data.difficulty]) SaveData.difficulty = data.difficulty;
    if (data.stats && typeof data.stats === 'object') {
      for (const k of DIFF_KEYS) {
        if (data.stats[k]) adoptStats(SaveData.stats[k], data.stats[k]);
      }
    } else if (SaveData.bestWave > 0 || SaveData.runs > 0) {
      // 旧存档没有分难度统计：当时的难度就是简单
      SaveData.stats.easy = {
        bestWave: SaveData.bestWave, bestKills: SaveData.bestKills, bestTime: SaveData.bestTime, bestClear: 0,
        runs: SaveData.runs, totalKills: SaveData.totalKills, totalTime: SaveData.totalTime,
      };
    }
    adoptDetail(data.detail);
    // 成就是后加的字段：旧存档没有时保持空表，导入时只认当前定义过的成就
    if (data.achievements && typeof data.achievements === 'object') {
      for (const a of ACHIEVEMENTS) {
        const at = data.achievements[a.id];
        if (typeof at === 'number' && isFinite(at) && at > 0) SaveData.achievements[a.id] = at;
      }
    }
    // 突然死亡没解锁时不能直接用（比如导入了别人的存档）
    if (SaveData.difficulty === 'sudden' && !suddenUnlocked()) SaveData.difficulty = 'easy';
    if (data.run && typeof data.run === 'object' && data.run.wave) SaveData.run = data.run;
  }

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const outer = JSON.parse(raw);
      if (!outer || typeof outer !== 'object') return;
      if (outer.v === SAVE_VERSION && outer.data) {
        if (outer.hash !== hashStr(JSON.stringify(outer.data))) {
          notifyMenu('本地存档校验失败，已忽略', 6000);
          return;
        }
        adoptSaveData(outer.data, true);
      } else if (outer.run || typeof outer.bestWave === 'number') {
        // 兼容 v0.9 没有哈希的旧存档，读一次后改写成新格式
        adoptSaveData(outer, true);
        persistSave();
      }
    } catch (e) { /* 隐私模式或存储被禁用时静默跳过 */ }
  }

  function persistSave() {
    try {
      const data = JSON.stringify(SaveData);
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, data: SaveData, hash: hashStr(data) }));
    } catch (e) { /* 同上 */ }
  }

  // 每波开始（以及商店买完继续）时写一次进度存档
  function saveCheckpoint() {
    if (G.debugMode) return; // 调试局不写进度
    if (G.state !== 'playing' || !G.player) return;
    SaveData.run = {
      wave: G.wave,
      difficulty: G.difficulty,
      gold: G.gold,
      hp: Math.max(1, Math.round(G.player.hp)),
      mana: Math.round(G.player.mana),
      cpuIdx: G.cpuIdx,
      gpuIdx: G.gpuIdx,
      ramIdx: G.ramIdx,
      ssdIdx: G.ssdIdx,
      softwares: G.softwares.map((s) => s.id),
      kills: G.kills,
      playTime: Math.round(G.playTime),
      killCounts: Object.assign({}, G.killCounts),
      goldEarned: G.goldEarned,
      goldSpent: G.goldSpent,
      softwareUses: G.softwareUses,
      skillCasts: G.skillCasts,
      damageDealt: G.damageDealt,
      buys: JSON.parse(JSON.stringify(G.buys)),
    };
    persistSave();
  }

  // 一局结束：总计和当前难度各记一笔，并清掉进度存档
  function bumpStats(s) {
    s.runs = (s.runs || 0) + 1;
    s.totalKills = (s.totalKills || 0) + G.kills;
    s.totalTime = (s.totalTime || 0) + G.playTime;
    if (G.wave > (s.bestWave || 0)) s.bestWave = G.wave;
    if (G.kills > (s.bestKills || 0)) s.bestKills = G.kills;
    if (G.playTime > (s.bestTime || 0)) s.bestTime = G.playTime;
  }

  function recordRun(won) {
    if (G.debugMode) return; // 调试局不计入统计、也不清进度
    const bucket = SaveData.stats[G.difficulty] || SaveData.stats.easy;
    bumpStats(SaveData);
    bumpStats(bucket);
    const d = SaveData.detail;
    if (won) {
      d.wins++;
      if (!bucket.bestClear || G.playTime < bucket.bestClear) bucket.bestClear = G.playTime;
    } else {
      d.deaths++;
    }
    // 本局的细项都并进存档累计
    for (const k of ['worm', 'trojan', 'leak', 'boss']) d.kills[k] += G.killCounts[k] || 0;
    d.goldEarned += G.goldEarned;
    d.goldSpent += G.goldSpent;
    d.damage += G.damageDealt;
    d.skills += G.skillCasts;
    d.softwareUses += G.softwareUses;
    for (const kind of Object.keys(d.buys)) {
      const src = G.buys[kind] || {};
      for (const key of Object.keys(src)) {
        if (src[key]) d.buys[kind][key] = (d.buys[kind][key] || 0) + src[key];
      }
    }
    SaveData.run = null;
    evaluateAchievements(won);
    persistSave();
  }

  // ---------------- 存档导出 / 导入 ----------------
  function exportSaveText() {
    const data = JSON.stringify(SaveData);
    return JSON.stringify({ v: SAVE_VERSION, data: SaveData, hash: hashStr(data) }, null, 2);
  }

  function exportSave() {
    try {
      const blob = new Blob([exportSaveText()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kuangku-save-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      notifyMenu('存档已导出', 3500);
    } catch (e) {
      notifyMenu('导出失败：' + e.message, 6000);
    }
  }

  function importSaveText(text) {
    try {
      const outer = JSON.parse(text);
      if (!outer || outer.v !== SAVE_VERSION || !outer.data || typeof outer.hash !== 'string') {
        throw new Error('不是本游戏的存档文件');
      }
      if (outer.hash !== hashStr(JSON.stringify(outer.data))) {
        throw new Error('哈希校验失败，文件可能被改动');
      }
      adoptSaveData(outer.data, true);
      const gained = backfillAchievements(false);
      persistSave();
      AC.muted = SaveData.muted;
      notifyMenu(gained ? '存档导入成功，补发 ' + gained + ' 个成就' : '存档导入成功', 5000);
      return true;
    } catch (e) {
      notifyMenu('导入失败：' + e.message, 6000);
      return false;
    }
  }

  function importSaveFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) { input.remove(); return; }
      const reader = new FileReader();
      reader.onload = () => { importSaveText(String(reader.result)); input.remove(); };
      reader.onerror = () => { notifyMenu('读取文件失败', 5000); input.remove(); };
      reader.readAsText(file);
    });
    input.click();
  }

  // ---------------- 贴图资源 ----------------
  const ASSETS = {};
  function loadAsset(key, src) {
    const img = new Image();
    img.src = src;
    ASSETS[key] = img;
  }
  loadAsset('fish', 'assets/fish_idle.png');
  loadAsset('fishA', 'assets/fish_walkA.png');
  loadAsset('fishB', 'assets/fish_walkB.png');
  loadAsset('fishCast', 'assets/fish_cast.png');
  loadAsset('fishAtk', 'assets/fish_attack.png');
  loadAsset('fishHurt', 'assets/fish_hurt.png');
  loadAsset('worm', 'assets/mob_worm.png');
  loadAsset('trojan', 'assets/mob_trojan.png');
  loadAsset('leak', 'assets/mob_leak.png');
  loadAsset('boss', 'assets/mob_boss.png');
  loadAsset('floor', 'assets/tex_floor.png');
  loadAsset('coin', 'assets/item_coin.png');
  loadAsset('gpu_1', 'assets/gpu_rx580.png');
  loadAsset('gpu_2', 'assets/gpu_1080ti.png');
  loadAsset('gpu_3', 'assets/gpu_3060.png');
  loadAsset('gpu_4', 'assets/gpu_3080.png');
  loadAsset('gpu_5', 'assets/gpu_4070.png');
  loadAsset('gpu_6', 'assets/gpu_4090.png');
  loadAsset('gpu_7', 'assets/gpu_5050.png');
  loadAsset('gpu_8', 'assets/gpu_690.png');
  loadAsset('bgMenu', 'assets/bg_menu.png');

  // ---------------- 游戏状态 ----------------
  const G = {
    state: 'menu',          // menu | stats | achievements | playing | shop | dead | win
    paused: false,
    speedMul: 1,            // 1 / 2 / 4 倍速
    difficulty: 'easy',     // easy | normal | hard | sudden
    justUnlocked: false,    // 本局刚通关困难、解锁突然死亡
    debugMode: false,       // 柯南码开的调试局：整局不计入存档/统计
    debugPanel: false,      // 面板开着时冻结游戏
    dbgRateMul: 1,          // 调试：刷怪频率倍率
    dbgCap: 0,              // 调试：同屏上限（0 表示用默认曲线）
    entryRun: null,         // 本局开始前的存档快照，调试局结束后还原
    t: 0,
    fps: 60,

    player: null,
    enemies: [],
    bullets: [],
    ebullets: [],
    pickups: [],
    particles: [],
    texts: [],
    fx: [],

    cam: { x: 0, y: 0 },
    shake: 0,
    flash: 0,
    hitstop: 0,

    wave: 0,
    waveTime: 0,
    WAVE_LEN: 25,
    TOTAL_WAVES: 14,
    spawnAcc: 0,
    bossSpawned: false,

    gold: 0,
    kills: 0,
    skillCasts: 0,
    combo: 0,
    comboTimer: 0,
    damageDealt: 0,
    playTime: 0,

    // 本局细项，结算时并进存档
    killCounts: { worm: 0, trojan: 0, leak: 0, boss: 0 },
    goldEarned: 0,
    goldSpent: 0,
    softwareUses: 0,
    buys: { cpu: {}, gpu: {}, ram: {}, ssd: {}, software: {} },

    cpuIdx: 0,
    gpuIdx: 0,
    ramIdx: 0,
    ssdIdx: 0,
    softwares: [],
    softCds: [],
    softFlash: [],
    slowTimer: 0,
    overclockTimer: 0,
    goldBoostTimer: 0,
    shieldTimer: 0,

    weaponCd: 0,
    skillCd: 0,
    buffs: { rate: 1, speed: 1, timer: 0 },

    uiButtons: [],
    shopCards: [],
    shopChosen: false,
    shopHint: '',
    shopHintT: 0,

    newAchievements: [],
    achvReturn: 'menu',
    achvPage: 0,

    bestWave: 1,
  };

  // ---------------- 成就 ----------------
  // 稀有度从低到高：普通、稀有、超稀有、史诗、神话、传奇
  const RARITIES = {
    common:    { name: '普通',   color: '#E8F2FF', rank: 0 },
    rare:      { name: '稀有',   color: '#7DFF9B', rank: 1 },
    superrare: { name: '超稀有', color: '#5AD1FF', rank: 2 },
    epic:      { name: '史诗',   color: '#B388FF', rank: 3 },
    mythic:    { name: '神话',   color: '#FF5A5A', rank: 4 },
    legendary: { name: '传奇',   color: '#FFD166', rank: 5 },
  };

  function buyTotal(kind) {
    const src = SaveData.detail.buys[kind] || {};
    let n = 0;
    for (const key of Object.keys(src)) n += Math.max(0, Math.round(src[key] || 0));
    return n;
  }

  const ACHIEVEMENTS = [
    {
      id: 'easy_clear', name: '初入装机世界', rarity: 'common', badge: '01',
      condition: '通关一次简单模式', desc: '玩家的一小步，装机的一大步。',
      test: (c) => (c.won && c.difficulty === 'easy') || c.stats.easy.bestClear > 0,
    },
    {
      id: 'first_cpu', name: '第一块CPU', rarity: 'common', badge: 'CPU',
      condition: '第一次购买一块任意的CPU', desc: '小方块，大魔力。',
      test: (c) => c.buys.cpu > 0,
    },
    {
      id: 'first_gpu', name: '第一张显卡', rarity: 'common', badge: 'GPU',
      condition: '第一次购买任意一张显卡', desc: '这是什么，鲜咔！',
      test: (c) => c.buys.gpu > 0,
    },
    {
      id: 'first_ram', name: '第一根内存条', rarity: 'common', badge: 'RAM',
      condition: '第一次购买任意一根内存条', desc: '或许它比金条还要贵呢。',
      test: (c) => c.buys.ram > 0,
    },
    {
      id: 'first_ssd', name: '第一块SSD', rarity: 'common', badge: 'SSD',
      condition: '第一次购买任意一块SSD', desc: '小盒子，装下大世界。',
      test: (c) => c.buys.ssd > 0,
    },
    {
      id: 'first_software', name: '第一款软件', rarity: 'common', badge: 'APP',
      condition: '第一次购买任意一款软件', desc: '硬件与软件的结合才是完美装机！',
      test: (c) => c.buys.software > 0,
    },
    {
      id: 'normal_clear', name: '探索装机世界', rarity: 'rare', badge: '02',
      condition: '第一次通关普通模式', desc: '硬件与软件的碰撞，成就狂野的大肥鱼！',
      test: (c) => (c.won && c.difficulty === 'normal') || c.stats.normal.bestClear > 0,
    },
    {
      id: 'hard_clear', name: '深入装机世界', rarity: 'epic', badge: '03',
      condition: '第一次通关困难模式', desc: '我来这里就办三件事，装机，装机，还是装机！',
      test: (c) => (c.won && c.difficulty === 'hard') || c.stats.hard.bestClear > 0,
    },
  ];

  // 按稀有度从低到高展示；同稀有度保持配置顺序
  ACHIEVEMENTS.sort((a, b) => (RARITIES[a.rarity] || RARITIES.common).rank - (RARITIES[b.rarity] || RARITIES.common).rank);

  const ACHIEVEMENT_MAP = {};
  for (const a of ACHIEVEMENTS) ACHIEVEMENT_MAP[a.id] = a;

  function achievementById(id) {
    return ACHIEVEMENT_MAP[id] || null;
  }

  function achievementUnlocked(a) {
    return !!(a && SaveData.achievements[a.id]);
  }

  function unlockedAchievementCount() {
    let n = 0;
    for (const a of ACHIEVEMENTS) if (achievementUnlocked(a)) n++;
    return n;
  }

  function achievementContext(won) {
    return {
      won: !!won,
      difficulty: G.difficulty,
      stats: SaveData.stats,
      buys: {
        cpu: buyTotal('cpu'),
        gpu: buyTotal('gpu'),
        ram: buyTotal('ram'),
        ssd: buyTotal('ssd'),
        software: buyTotal('software'),
      },
    };
  }

  // 结算时统一判定；silent 用于读档时按历史记录补发
  function evaluateAchievements(won, silent) {
    if (G.debugMode) return [];
    const ctx = achievementContext(won);
    const now = Date.now();
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (SaveData.achievements[a.id]) continue;
      let ok = false;
      try { ok = !!a.test(ctx); } catch (e) { ok = false; }
      if (ok) {
        SaveData.achievements[a.id] = now;
        newly.push(a);
      }
    }
    if (!silent) {
      G.newAchievements = newly.map((a) => a.id);
      if (newly.length) blip(980, 0.22, 'sine', 0.12, 1480);
    }
    return newly;
  }

  function backfillAchievements(notify) {
    const before = unlockedAchievementCount();
    evaluateAchievements(false, true);
    const gained = unlockedAchievementCount() - before;
    if (gained) {
      persistSave();
      if (notify) notifyMenu('已根据历史记录补发 ' + gained + ' 个成就', 5000);
    }
    return gained;
  }

  function applyAchievementPage(delta) {
    const pages = Math.max(1, Math.ceil(ACHIEVEMENTS.length / 8));
    G.achvPage = clamp((G.achvPage || 0) + delta, 0, pages - 1);
    G.uiButtons.length = 0;
    blip(delta > 0 ? 760 : 560, 0.06, 'sine', 0.06, delta > 0 ? 980 : 420);
  }

  function openAchievements(from) {
    if (G.state !== 'menu' && G.state !== 'dead' && G.state !== 'win') return;
    G.achvReturn = from || G.state;
    G.achvPage = 0;
    G.state = 'achievements';
    G.uiButtons.length = 0;
  }

  function closeAchievements() {
    if (G.state !== 'achievements') return;
    G.state = G.achvReturn || 'menu';
    G.uiButtons.length = 0;
  }

  function resetGame() {
    G.uiButtons.length = 0;
    G.state = 'playing';
    G.paused = false;
    G.speedMul = 1;
    G.justUnlocked = false;
    G.debugMode = false;
    G.debugPanel = false;
    G.dbgRateMul = 1;
    G.dbgCap = 0;
    G.entryRun = null;
    G.difficulty = DIFFS[SaveData.difficulty] ? SaveData.difficulty : 'easy';
    if (G.difficulty === 'sudden' && !suddenUnlocked()) G.difficulty = 'easy';
    G.t = 0;
    G.killCounts = { worm: 0, trojan: 0, leak: 0, boss: 0 };
    G.goldEarned = 0;
    G.goldSpent = 0;
    G.softwareUses = 0;
    G.buys = { cpu: {}, gpu: {}, ram: {}, ssd: {}, software: {} };
    const maxHp = G.difficulty === 'sudden' ? 1 : 120;
    G.player = {
      x: 0, y: 0, vx: 0, vy: 0,
      hp: maxHp, maxHp: maxHp,
      mana: 100, maxMana: 100,
      speed: 235,
      facing: 1,
      walk: 0,
      castTimer: 0,
      atkTimer: 0,
      hurtTimer: 0,
      invuln: 0,
      hitFlash: 0,
    };
    G.enemies.length = 0;
    G.bullets.length = 0;
    G.ebullets.length = 0;
    G.pickups.length = 0;
    G.particles.length = 0;
    G.texts.length = 0;
    G.fx.length = 0;
    G.cam.x = 0; G.cam.y = 0;
    G.shake = 0; G.flash = 0; G.hitstop = 0;
    G.wave = 0; G.waveTime = 0; G.spawnAcc = 0; G.bossSpawned = false;
    G.gold = 0; G.kills = 0; G.combo = 0; G.comboTimer = 0; G.damageDealt = 0; G.playTime = 0; G.skillCasts = 0;
    G.cpuIdx = 0; G.gpuIdx = 0; G.ramIdx = 0;
    G.ssdIdx = 0;
    G.softwares.length = 0;
    G.softCds.length = 0;
    G.softFlash.length = 0;
    G.slowTimer = 0; G.overclockTimer = 0; G.goldBoostTimer = 0; G.shieldTimer = 0;
    G.weaponCd = 0; G.skillCd = 0;
    G.buffs.rate = 1; G.buffs.speed = 1; G.buffs.timer = 0;
    G.player.maxMana = RAMS[0].maxMana;
    G.player.mana = RAMS[0].maxMana;
    G.shopCards = [];
    G.shopChosen = false;
    G.newAchievements = [];
    G.achvReturn = 'menu';
    G.achvPage = 0;
  }

  // ---------------- 实体工厂 ----------------
  function spawnEnemy(type, x, y, hpMul, dmgMul) {
    const d = ENEMY_TYPES[type];
    G.enemies.push({
      type, x, y,
      hp: d.hp * hpMul, maxHp: d.hp * hpMul,
      speed: d.speed * rnd(1.16, 0.86),
      dmg: d.dmg * dmgMul * diffDamageMul(),
      r: d.r,
      color: d.color,
      gold: d.gold,
      t: rnd(TAU, 0),
      hit: 0,
      isBoss: type === 'boss',
      fireCd: 2.4,
      phase: rnd(TAU, 0),
    });
  }

  function spawnEnemyAround(type) {
    const p = G.player;
    const bx = ARENA.w / 2 - 40, by = ARENA.h / 2 - 40;
    for (let tries = 0; tries < 10; tries++) {
      const a = rnd(TAU, 0);
      const r = 480 + rnd(320, 0);
      let x = p.x + Math.cos(a) * r;
      let y = p.y + Math.sin(a) * r;
      x = clamp(x, -bx, bx);
      y = clamp(y, -by, by);
      if (dist(x, y, p.x, p.y) < 280) continue;
      spawnEnemy(type, x, y, 1 + G.wave * 0.26, 1 + G.wave * 0.10);
      return;
    }
    spawnEnemy(type, clamp(p.x + 520, -bx, bx), clamp(p.y, -by, by), 1 + G.wave * 0.26, 1 + G.wave * 0.10);
  }

  function addParticles(x, y, color, n, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU, 0), s = rnd(speed, speed * 0.25);
      G.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * rnd(1.2, 0.6), maxLife: life, color, r: rnd(3.4, 1.2),
      });
    }
    if (G.particles.length > 420) G.particles.splice(0, G.particles.length - 420);
  }

  function addText(x, y, str, color, size) {
    G.texts.push({ x, y, str, color, size: size || 16, life: 0.75, vy: -46 });
    if (G.texts.length > 70) G.texts.shift();
  }

  function addShake(amt) { G.shake = Math.min(G.shake + amt, 26); }

  // ---------------- 战斗逻辑 ----------------
  function cpu() { return CPUS[G.cpuIdx]; }
  function gpu() { return GPUS[G.gpuIdx]; }
  function ram() { return RAMS[G.ramIdx]; }

  function nearestEnemy(x, y, maxD, exclude) {
    let best = null, bd = maxD * maxD;
    for (const e of G.enemies) {
      if (exclude && exclude.has(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function fireBullet(x, y, angle, speed, dmg, pierce, color, r, target, splash) {
    G.bullets.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      dmg, pierce, color: color || '#8ef2ff', r: r || 4, life: 1.1,
      hitSet: null, target: target || null, homing: target ? 7.5 : 0,
      splash: splash === undefined ? 62 : splash,
    });
  }

  function autoAttack(dt) {
    const p = G.player;
    G.weaponCd -= dt;
    if (G.weaponCd > 0) return;
    const c = cpu();
    const target = nearestEnemy(p.x, p.y, 900);
    if (!target) return;
    const baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
    let interval = c.interval * (G.buffs.timer > 0 ? 0.6 : 1);
    if (G.overclockTimer > 0) interval *= 0.55;
    G.weaponCd = interval;
    p.atkTimer = 0.17;
    for (let i = 0; i < c.count; i++) {
      const off = (i - (c.count - 1) / 2) * c.spread;
      fireBullet(p.x, p.y - 8, baseAngle + off, 760, c.dmg, c.pierce, '#8ef2ff', 4.2, target);
    }
    // 音效
    const nowT = performance.now();
    if (nowT - AC.lastShot > 45) {
      AC.lastShot = nowT;
      blip(920, 0.045, 'square', 0.055, 420);
    }
    // 后坐反馈
    p.vx -= Math.cos(baseAngle) * 26;
    p.vy -= Math.sin(baseAngle) * 26;
  }

  function castSkill() {
    const g = gpu();
    if (!g.skill) return;
    const p = G.player;
    if (G.skillCd > 0 || p.mana < g.mana) return;
    p.mana -= g.mana;
    G.skillCd = g.cd * (1 - G.ramIdx * 0.055);
    G.skillCasts++;
    p.castTimer = 0.6;
    if (g.skill === 'nuke') { blip(60, 0.7, 'sawtooth', 0.3, 25); noiseBurst(0.6, 0.3, 600); }
    else if (g.skill === 'laser') { blip(1600, 0.22, 'sawtooth', 0.14, 300); }
    else if (g.skill === 'storm') { blip(420, 0.25, 'square', 0.13, 900); }
    else { blip(700, 0.18, 'triangle', 0.13, 1200); }
    const c = cpu();

    if (g.skill === 'storm') {
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU;
        fireBullet(p.x, p.y, a, 430, c.dmg * 1.3, 1, g.color, 5);
      }
      addShake(5);
      addParticles(p.x, p.y, g.color, 18, 260, 0.5);
    } else if (g.skill === 'laser') {
      const tgt = nearestEnemy(p.x, p.y, 1400);
      const a = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : 0;
      G.fx.push({ type: 'laser', x: p.x, y: p.y, a, len: 1500, t: 0, life: 0.28, dmg: c.dmg * 1.8, tick: 0, color: g.color });
      addShake(6);
    } else if (g.skill === 'boost') {
      G.buffs.rate = 1; G.buffs.speed = 1.45; G.buffs.timer = 5;
      addText(p.x, p.y - 54, '风扇全开！', g.color, 22);
      addParticles(p.x, p.y, g.color, 24, 300, 0.6);
    } else if (g.skill === 'flame') {
      const a = Math.atan2(mouse.y + G.cam.y - p.y, mouse.x + G.cam.x - p.x);
      G.fx.push({ type: 'flame', x: p.x + Math.cos(a) * 170, y: p.y + Math.sin(a) * 170, r: 0, maxR: 165, t: 0, life: 1.5, dmg: c.dmg * 1.1, tick: 0, color: g.color });
      addShake(8);
    } else if (g.skill === 'precise') {
      const used = new Set();
      for (let i = 0; i < 3; i++) {
        const tgt = nearestEnemy(p.x, p.y, 1600, used);
        if (!tgt) break;
        used.add(tgt);
        const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        fireBullet(p.x, p.y, a, 1500, c.dmg * 2.6, 3, g.color, 5);
      }
      addShake(4);
    } else if (g.skill === 'nuke') {
      G.flash = 0.55;
      addShake(24);
      for (const e of G.enemies) {
        damageEnemy(e, 320 + G.wave * 40, p.x, p.y, true);
      }
      addParticles(p.x, p.y, g.color, 60, 520, 1.0);
      for (let i = 0; i < 200; i++) {
        addParticles(rnd(1400, -1400) + p.x, rnd(1400, -1400) + p.y, g.color, 1, 200, 0.8);
      }
    }
  }

  function equipSoftware(sw) {
    const slots = SSDS[G.ssdIdx].slots;
    if (G.softwares.length >= slots) {
      G.softwares.shift();
      G.softCds.shift();
      G.softFlash.shift();
    }
    G.softwares.push(sw);
    G.softCds.push(0);
    G.softFlash.push(0);
  }

  function useSoftware(i) {
    if (G.state !== 'playing' || G.paused) return false;
    const sw = G.softwares[i];
    if (!sw) return false;
    if (G.softCds[i] > 0) return false;
    const p = G.player;
    G.softCds[i] = sw.cd;
    G.softFlash[i] = 0.45;
    G.softwareUses++;

    if (sw.effect === 'aoe') {
      const R = 470;
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (dist(e.x, e.y, p.x, p.y) < R) damageEnemy(e, 240 + G.wave * 34, e.x, e.y, true);
      }
      G.fx.push({ type: 'ring', x: p.x, y: p.y, r: 0, maxR: R, t: 0, life: 0.55, color: sw.color });
      addShake(10);
      addParticles(p.x, p.y, sw.color, 40, 430, 0.7);
      blip(1200, 0.2, 'sawtooth', 0.14, 200);
    } else if (sw.effect === 'slow') {
      G.slowTimer = 4;
      addText(p.x, p.y - 76, '进程结束', sw.color, 24);
      blip(300, 0.3, 'square', 0.12, 120);
    } else if (sw.effect === 'overclock') {
      G.overclockTimer = 5;
      addText(p.x, p.y - 76, '超频！', sw.color, 24);
      blip(700, 0.25, 'sawtooth', 0.14, 1500);
    } else if (sw.effect === 'reset') {
      G.skillCd = 0;
      p.mana = Math.min(p.maxMana, p.mana + 45);
      addText(p.x, p.y - 76, '驱动已更新', sw.color, 24);
      blip(900, 0.2, 'sine', 0.12, 1600);
    } else if (sw.effect === 'heal') {
      const heal = Math.round(p.maxHp * 0.35);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      addText(p.x, p.y - 76, '+' + heal + ' HP', sw.color, 24);
      blip(600, 0.3, 'sine', 0.12, 900);
    } else if (sw.effect === 'burn') {
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (dist(e.x, e.y, p.x, p.y) < 950) damageEnemy(e, 320 + G.wave * 42, e.x, e.y, true);
      }
      G.flash = 0.4; addShake(16);
      p.hp -= p.maxHp * 0.12;
      p.invuln = 0.6;
      addText(p.x, p.y - 76, '烤机！', sw.color, 26);
      blip(80, 0.5, 'sawtooth', 0.2, 30);
    } else if (sw.effect === 'gold') {
      G.goldBoostTimer = 6;
      G.gold += 80;
      G.goldEarned += 80;
      addText(p.x, p.y - 76, '算力上线', sw.color, 24);
      blip(1000, 0.15, 'square', 0.12, 1500);
    } else if (sw.effect === 'shield') {
      G.shieldTimer = 3.2;
      addText(p.x, p.y - 76, '防火墙已开启', sw.color, 24);
      blip(520, 0.35, 'sine', 0.14, 780);
    }
    return true;
  }

  function damageEnemy(e, dmg, hx, hy, silent) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hit = 0.12;
    G.damageDealt += dmg;
    if (!silent) {
      const crit = dmg > cpu().dmg * 2.2;
      addText(e.x + rnd(14, -14), e.y - e.r - 4, Math.round(dmg), crit ? '#ffe066' : '#ffffff', crit ? 22 : 15);
    }
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    G.kills++;
    const kc = e.isBoss ? 'boss' : e.type;
    G.killCounts[kc] = (G.killCounts[kc] || 0) + 1;
    G.combo++;
    G.comboTimer = 2.4;
    const n = e.isBoss ? 80 : 16;
    addParticles(e.x, e.y, e.color, n, e.isBoss ? 520 : 360, e.isBoss ? 1.2 : 0.6);
    if (e.isBoss) { blip(70, 0.9, 'sawtooth', 0.3, 30); noiseBurst(0.8, 0.25, 700); }
    else { blip(rnd(260, 200), 0.09, 'triangle', 0.10, 120); }
    if (e.isBoss) {
      addShake(26); G.flash = 0.4;
      for (let i = 0; i < 12; i++) {
        G.pickups.push({ x: e.x + rnd(90, -90), y: e.y + rnd(90, -90), vx: 0, vy: 0, v: rnd(12, 6), r: 6, life: 12 });
      }
      setTimeout(() => {
        if (G.state !== 'playing') return;
        const wasLocked = !suddenUnlocked();
        G.state = 'win';
        recordRun(true);
        if (!G.debugMode && G.difficulty === 'hard' && wasLocked) G.justUnlocked = true;
      }, 900);
    } else {
      G.pickups.push({ x: e.x, y: e.y, vx: 0, vy: 0, v: e.gold, r: 5, life: 10 });
      if (Math.random() < 0.045) {
        G.pickups.push({ x: e.x + rnd(18, -18), y: e.y + rnd(18, -18), vx: 0, vy: 0, v: 0, r: 7, life: 14, heal: 8 });
      }
    }
    if (G.combo > 0 && G.combo % 25 === 0) {
      addText(G.player.x, G.player.y - 104, '连杀 x' + G.combo, '#ffd166', 24);
    }
  }

  // ---------------- 更新 ----------------
  function update(dt) {
    if (G.state !== 'playing') {
      if (G.state === 'shop') { /* 商店暂停世界 */ }
      return;
    }
    if (G.paused || G.debugPanel) return;
    G.t += dt;
    G.playTime += dt;

    // 命中停顿
    if (G.hitstop > 0) {
      G.hitstop -= dt;
      dt *= 0.18;
    }

    const p = G.player;

    // ----- 移动 -----
    let ix = 0, iy = 0;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyW || keys.ArrowUp) iy -= 1;
    if (keys.KeyS || keys.ArrowDown) iy += 1;
    let mag = 1;
    if (ix === 0 && iy === 0 && touch.active) {
      ix = touch.dx; iy = touch.dy; mag = touch.mag;
    }
    const len = Math.hypot(ix, iy) || 1;
    const spd = p.speed * G.buffs.speed;
    p.vx += (ix / len) * spd * mag * 14 * dt;
    p.vy += (iy / len) * spd * mag * 14 * dt;
    p.vx *= Math.pow(0.0004, dt);
    p.vy *= Math.pow(0.0004, dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const bx = ARENA.w / 2 - 26, by = ARENA.h / 2 - 26;
    if (p.x < -bx) { p.x = -bx; p.vx = Math.abs(p.vx) * 0.3; }
    if (p.x > bx) { p.x = bx; p.vx = -Math.abs(p.vx) * 0.3; }
    if (p.y < -by) { p.y = -by; p.vy = Math.abs(p.vy) * 0.3; }
    if (p.y > by) { p.y = by; p.vy = -Math.abs(p.vy) * 0.3; }
    if (ix !== 0) p.facing = ix > 0 ? 1 : -1;
    const moving = Math.hypot(p.vx, p.vy) > 20;
    if (moving) p.walk += dt * 11;

    // ----- 相机 -----
    const camX = lerp(G.cam.x, p.x, 1 - Math.pow(0.0015, dt));
    const camY = lerp(G.cam.y, p.y, 1 - Math.pow(0.0015, dt));
    const cxMax = Math.max(0, ARENA.w / 2 - W / 2 + 170);
    const cyMax = Math.max(0, ARENA.h / 2 - H / 2 + 170);
    G.cam.x = clamp(camX, -cxMax, cxMax);
    G.cam.y = clamp(camY, -cyMax, cyMax);

    // ----- 蓝条 -----
    p.mana = Math.min(p.maxMana, p.mana + ram().regen * dt);

    // ----- 技能 CD -----
    if (G.skillCd > 0) G.skillCd -= dt;
    if (p.castTimer > 0) p.castTimer -= dt;
    if (p.atkTimer > 0) p.atkTimer -= dt;
    if (p.hurtTimer > 0) p.hurtTimer -= dt;
    if (G.slowTimer > 0) G.slowTimer -= dt;
    if (G.overclockTimer > 0) G.overclockTimer -= dt;
    if (G.goldBoostTimer > 0) G.goldBoostTimer -= dt;
    if (G.shieldTimer > 0) G.shieldTimer -= dt;
    for (let i = 0; i < G.softCds.length; i++) {
      if (G.softCds[i] > 0) G.softCds[i] -= dt;
      if (G.softFlash[i] > 0) G.softFlash[i] -= dt;
    }
    if (G.buffs.timer > 0) { G.buffs.timer -= dt; if (G.buffs.timer <= 0) G.buffs.speed = 1; }

    // ----- 攻击 -----
    autoAttack(dt);
    castSkill();

    // ----- 波次 -----
    G.waveTime += dt;
    if (G.wave === 0) { nextWave(); saveCheckpoint(); }
    if (G.waveTime >= G.WAVE_LEN) {
      G.waveTime = 0;
      if (G.wave < G.TOTAL_WAVES) {
        nextWave();
        openShop();
      } else if (!G.bossSpawned) {
        G.bossSpawned = true;
        const p2 = G.player;
        // Boss 登场清场：小怪当场爆成粒子，专心打 Boss
        let burst = 0;
        for (const e of G.enemies) {
          if (e.isBoss) continue;
          if (burst < 90) addParticles(e.x, e.y, e.color, 5, 240, 0.45);
          burst++;
        }
        G.enemies.length = 0;
        G.gold += 60;
        G.goldEarned += 60;
        const bbx = ARENA.w / 2 - 90, bby = ARENA.h / 2 - 90;
        spawnEnemy('boss', clamp(p2.x + 600, -bbx, bbx), clamp(p2.y - 300, -bby, bby), 1, 1);
        addText(p2.x, p2.y - 90, 'Boss 出现：GTX 690 双芯核弹', '#ff3df0', 30);
        addText(p2.x, p2.y - 56, '清场 +60 矿币', '#ffd166', 18);
        addShake(20);
      }
    }

    // ----- 生成敌人 -----
    if (!G.bossSpawned) {
      // 怪量随波数加速上涨：第 1 波约 2.9 只/秒，第 14 波约 18 只/秒
      const w = G.wave;
      const rate = (2.10 + w * 0.80 + w * w * 0.025) * (G.debugMode ? G.dbgRateMul : 1);
      const cap = G.debugMode && G.dbgCap > 0 ? G.dbgCap : Math.min(480, 380 + w * 8);
      G.spawnAcc += rate * dt;
      while (G.spawnAcc >= 1) {
        G.spawnAcc -= 1;
        if (G.enemies.length >= cap) break;
        const roll = Math.random();
        let type = 'worm';
        if (G.wave >= 2 && roll < 0.34) type = 'trojan';
        if (G.wave >= 4 && roll > 0.88) type = 'leak';
        spawnEnemyAround(type);
      }
    }

    updateEnemies(dt);
    updateBullets(dt);
    updateEBullets(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateFx(dt);

    // ----- 玩家受伤 + 敌人软推离（保证主角永远看得见） -----
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const minD = e.r + 36;
      if (d < minD) {
        hitPlayer(e.dmg * 0.26);
        const k = (minD - d) * Math.min(1, dt * 10);
        e.x += (dx / d) * k;
        e.y += (dy / d) * k;
      }
    }

    // ----- 衰减 -----
    G.shake = Math.max(0, G.shake - dt * 42);
    G.flash = Math.max(0, G.flash - dt * 1.6);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }

    // ----- 死亡 -----
    if (p.hp <= 0) {
      G.state = 'dead';
      recordRun(false);
      addParticles(p.x, p.y, '#8ef2ff', 40, 380, 1.0);
      addShake(20);
    }
  }

  function nextWave() {
    G.wave++;
    G.waveTime = 0;
    addText(G.cam.x, G.cam.y - 250, '第 ' + G.wave + ' 波', '#8ef2ff', 34);
  }

  function hitPlayer(dmg) {
    const p = G.player;
    if (G.shieldTimer > 0) return;
    if (p.invuln > 0) return;
    p.hp -= dmg;
    p.invuln = 0.52;
    p.hitFlash = 0.22;
    p.hurtTimer = 0.34;
    noiseBurst(0.16, 0.16, 900);
    blip(150, 0.16, 'sawtooth', 0.13, 70);
    addShake(4);
    addText(p.x, p.y - 46, '-' + Math.round(dmg * 10) / 10, '#ff5a5a', 18);
  }

  function updateEnemies(dt) {
    const p = G.player;
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.dead) { G.enemies.splice(i, 1); continue; }
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const spdMul = G.slowTimer > 0 ? 0.45 : 1;
      e.x += (dx / d) * e.speed * spdMul * dt;
      e.y += (dy / d) * e.speed * spdMul * dt;
      const ebx = ARENA.w / 2 - e.r - 6, eby = ARENA.h / 2 - e.r - 6;
      if (e.x < -ebx) e.x = -ebx;
      if (e.x > ebx) e.x = ebx;
      if (e.y < -eby) e.y = -eby;
      if (e.y > eby) e.y = eby;
      e.t += dt * (e.isBoss ? 1.4 : 3.2);
      if (e.hit > 0) e.hit -= dt;
      if (e.isBoss) {
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = 2.2;
          for (let k = 0; k < 14; k++) {
            const a = (k / 14) * TAU + e.phase;
            G.ebullets.push({
              x: e.x, y: e.y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250,
              r: 9, dmg: 9 * diffDamageMul(), life: 5, color: '#ff3b3b',
            });
          }
          e.phase += 0.4;
        }
      }
    }

    // 敌人之间做轻量分离，避免完全叠成一坨
    const arr = G.enemies;
    const n = arr.length;
    const px0 = p.x, py0 = p.y, lim = 620 * 620;
    for (let i = 0; i < n; i++) {
      const a = arr[i];
      if (a.dead) continue;
      const adx = a.x - px0, ady = a.y - py0;
      if (adx * adx + ady * ady > lim) continue;
      for (let j = i + 1; j < n; j++) {
        const b = arr[j];
        if (b.dead) continue;
        const bdx = b.x - px0, bdy = b.y - py0;
        if (bdx * bdx + bdy * bdy > lim) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = (a.r + b.r) * 0.92;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.34;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  function updateBullets(dt) {
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      if (b.homing > 0 && b.target && !b.target.dead) {
        const ca = Math.atan2(b.vy, b.vx);
        let da = Math.atan2(b.target.y - b.y, b.target.x - b.x) - ca;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const turn = Math.min(Math.abs(da), b.homing * dt) * Math.sign(da);
        const na = ca + turn;
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) {
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (b.hitSet && b.hitSet.has(e)) continue;
          if (dist(b.x, b.y, e.x, e.y) < e.r + b.r) {
            damageEnemy(e, b.dmg, b.x, b.y);
            addParticles(b.x, b.y, b.color, 4, 180, 0.3);
            // 溅射：一枪扫一片
            if (b.splash > 0) {
              const s2 = b.splash * b.splash;
              for (const o of G.enemies) {
                if (o === e || o.dead) continue;
                const ddx = o.x - b.x, ddy = o.y - b.y;
                if (ddx * ddx + ddy * ddy < s2) {
                  damageEnemy(o, b.dmg * 0.65, o.x, o.y, true);
                  addParticles(o.x, o.y, b.color, 2, 120, 0.22);
                }
              }
            }
            if (b.pierce > 0) {
              b.pierce--;
              if (!b.hitSet) b.hitSet = new Set();
              b.hitSet.add(e);
            } else { dead = true; break; }
          }
        }
      }
      if (dead) G.bullets.splice(i, 1);
    }
  }

  function updateEBullets(dt) {
    const p = G.player;
    for (let i = G.ebullets.length - 1; i >= 0; i--) {
      const b = G.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (dist(b.x, b.y, p.x, p.y) < 14 + b.r) {
        hitPlayer(b.dmg);
        G.ebullets.splice(i, 1);
        continue;
      }
      if (b.life <= 0) G.ebullets.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const p = G.player;
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const c = G.pickups[i];
      c.life -= dt;
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < 300) {
        const a = Math.atan2(p.y - c.y, p.x - c.x);
        const pull = 720;
        c.x += Math.cos(a) * pull * dt;
        c.y += Math.sin(a) * pull * dt;
      }
      if (d < 20) {
        if (c.heal) {
          p.hp = Math.min(p.maxHp, p.hp + c.heal);
          blip(760, 0.09, 'sine', 0.09, 1250);
          addText(p.x, p.y - 34, '+' + c.heal + ' HP', '#7dff9b', 15);
        } else {
          const gain = G.goldBoostTimer > 0 ? c.v * 2 : c.v;
          G.gold += gain;
          G.goldEarned += gain;
          blip(1280, 0.05, 'sine', 0.07, 1900);
          addText(p.x, p.y - 34, '+' + c.v, '#ffd166', 14);
        }
        G.pickups.splice(i, 1);
        continue;
      }
      if (c.life <= 0) G.pickups.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const q = G.particles[i];
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= Math.pow(0.08, dt);
      q.vy *= Math.pow(0.08, dt);
      q.life -= dt;
      if (q.life <= 0) G.particles.splice(i, 1);
    }
  }

  function updateFx(dt) {
    const p = G.player;
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i];
      f.t += dt;
      if (f.type === 'laser') {
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.05;
          const ex = f.x + Math.cos(f.a) * f.len;
          const ey = f.y + Math.sin(f.a) * f.len;
          for (const e of G.enemies) {
            if (e.dead) continue;
            const d = pointSegDist(e.x, e.y, f.x, f.y, ex, ey);
            if (d < e.r + 10) damageEnemy(e, f.dmg, e.x, e.y);
          }
        }
      } else if (f.type === 'flame') {
        f.r = lerp(f.r, f.maxR, 1 - Math.pow(0.0005, dt));
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.16;
          for (const e of G.enemies) {
            if (e.dead) continue;
            if (dist(e.x, e.y, f.x, f.y) < f.r + e.r) damageEnemy(e, f.dmg, e.x, e.y);
          }
          addParticles(f.x + rnd(f.r, -f.r), f.y + rnd(f.r, -f.r), f.color, 2, 120, 0.4);
        }
      }
      if (f.t >= f.life) G.fx.splice(i, 1);
    }
  }

  function pointSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  // ---------------- 商店 ----------------
  function makeCard(kind) {
    if (kind === 'cpu' && G.cpuIdx < CPUS.length - 1) {
      const n = CPUS[G.cpuIdx + 1];
      return { kind, idx: G.cpuIdx + 1, cost: n.cost, title: 'CPU 升级', name: n.name, tag: n.tag };
    }
    if (kind === 'gpu' && G.gpuIdx < GPUS.length - 1) {
      const n = GPUS[G.gpuIdx + 1];
      return { kind, idx: G.gpuIdx + 1, cost: n.cost, title: '显卡换装', name: n.name, tag: n.tag };
    }
    if (kind === 'ram' && G.ramIdx < RAMS.length - 1) {
      const n = RAMS[G.ramIdx + 1];
      return { kind, idx: G.ramIdx + 1, cost: n.cost, title: '内存升级', name: n.name,
        tag: '+' + (n.maxMana - ram().maxMana) + ' 蓝上限' };
    }
    if (kind === 'software') {
      const owned = new Set(G.softwares.map((x) => x.id));
      const pool = SOFTWARES.filter((x) => !owned.has(x.id));
      if (!pool.length) return null;
      const sw = pool[(Math.random() * pool.length) | 0];
      return { kind, sw, cost: sw.cost, title: '安装软件', name: sw.name, tag: sw.tag };
    }
    if (kind === 'ssd' && G.ssdIdx < SSDS.length - 1) {
      const n = SSDS[G.ssdIdx + 1];
      return { kind, idx: G.ssdIdx + 1, cost: n.cost, title: '固态扩容', name: n.name,
        tag: '软件位 ' + SSDS[G.ssdIdx].slots + ' → ' + n.slots };
    }
    return null;
  }

  function openShop() {
    const cards = [makeCard('cpu'), makeCard('gpu'), makeCard('ram'), makeCard('software'), makeCard('ssd')].filter(Boolean);
    if (!cards.length) { G.state = 'playing'; return; }
    G.state = 'shop';
    G.shopChosen = false;
    cards.sort(() => Math.random() - 0.5);
    G.shopCards = cards.slice(0, 5);
  }

  // 买完一件后只替换那一张，不重排整排
  function refreshShopSlot(kind) {
    const i = G.shopCards.findIndex((c) => c.kind === kind);
    if (i < 0) return;
    const next = makeCard(kind);
    if (next) G.shopCards[i] = next;
    else G.shopCards.splice(i, 1);
  }

  function buyCard(card) {
    if (G.gold < card.cost) {
      addShake(3);
      G.shopHint = '金币不够，再去割一会儿';
      G.shopHintT = 1.2;
      return;
    }
    G.gold -= card.cost;
    G.goldSpent += card.cost;
    const buyKey = card.kind === 'software' ? card.sw.id : card.idx;
    if (G.buys[card.kind]) G.buys[card.kind][buyKey] = (G.buys[card.kind][buyKey] || 0) + 1;
    if (card.kind === 'cpu') G.cpuIdx = card.idx;
    if (card.kind === 'gpu') { G.gpuIdx = card.idx; G.skillCd = 0; }
    if (card.kind === 'ram') {
      G.ramIdx = card.idx;
      const old = G.player.maxMana;
      G.player.maxMana = ram().maxMana;
      G.player.mana += Math.max(0, G.player.maxMana - old) * 0.6;
    }
    if (card.kind === 'software') equipSoftware(card.sw);
    if (card.kind === 'ssd') G.ssdIdx = card.idx;
    G.shopChosen = true;
    blip(520, 0.1, 'square', 0.14, 900);
    blip(780, 0.16, 'sine', 0.1, 1200);
    addText(G.player.x, G.player.y - 60, '装上了！', '#7dff9b', 22);
    addParticles(G.player.x, G.player.y, '#7dff9b', 20, 260, 0.6);
    refreshShopSlot(card.kind);
  }

  function continueWave() {
    G.state = 'playing';
    G.waveTime = 0;
    G.uiButtons.length = 0; // 清掉商店留下的按钮，避免恢复战斗后误触购买
    saveCheckpoint();       // 买完的配置才是这一波的真实起点
  }

  function togglePause() {
    if (G.state !== 'playing') return;
    G.paused = !G.paused;
    G.uiButtons.length = 0; // 切换瞬间清掉旧按钮，避免恢复时误点
    if (G.paused) blip(560, 0.09, 'sine', 0.09, 360);
    else blip(760, 0.09, 'sine', 0.09, 1100);
  }

  function toggleHitbox() {
    SaveData.showHitbox = !SaveData.showHitbox;
    persistSave();
    blip(SaveData.showHitbox ? 980 : 620, 0.06, 'sine', 0.07, SaveData.showHitbox ? 1300 : 420);
  }

  // 1× -> 2× -> 4× -> 1×
  function cycleSpeed() {
    if (G.state !== 'playing') return;
    G.speedMul = G.speedMul === 1 ? 2 : G.speedMul === 2 ? 4 : 1;
    const f = G.speedMul === 1 ? 520 : G.speedMul === 2 ? 660 : 880;
    blip(f, 0.06, 'sine', 0.07, f * 1.4);
  }

  function startNewGame() {
    SaveData.run = null;
    persistSave();
    resetGame();
  }

  function setDifficulty(key) {
    if (G.state !== 'menu' || !DIFFS[key] || SaveData.difficulty === key) return;
    if (key === 'sudden' && !suddenUnlocked()) {
      notifyMenu('通关一次困难模式后解锁「突然死亡」', 4000);
      return;
    }
    SaveData.difficulty = key;
    persistSave();
    const f = key === 'sudden' ? 300 : key === 'hard' ? 880 : key === 'normal' ? 660 : 520;
    blip(f, 0.06, 'sine', 0.07, f * 1.3);
  }

  // ---------------- 调试面板（上上下下左右左右） ----------------
  function activateDebugPanel() {
    if (G.state !== 'playing') return;
    if (!G.debugMode) {
      G.debugMode = true;
      // 本局进度作废：回到本局开始前的存档快照
      SaveData.run = G.entryRun ? JSON.parse(JSON.stringify(G.entryRun)) : null;
      persistSave();
      G.dbgRateMul = 1;
      G.dbgCap = Math.min(480, 380 + G.wave * 8);
    }
    G.paused = false;
    G.debugPanel = true;
    G.uiButtons.length = 0;
  }

  function adjustDebug(kind, delta) {
    if (!G.debugMode) return;
    if (kind === 'rate') {
      G.dbgRateMul = clamp(Math.round((G.dbgRateMul + delta) * 4) / 4, 0.25, 4);
    } else {
      G.dbgCap = clamp(Math.round((G.dbgCap + delta) / 50) * 50, 50, 1000);
    }
  }

  function resetDebugSpawn() {
    G.dbgRateMul = 1;
    G.dbgCap = Math.min(480, 380 + G.wave * 8);
  }

  function drawDebugPanel() {
    G.uiButtons.length = 0; // 面板开着时只响应面板按钮
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    const px = W / 2 - 300, py = 170, pw = 600, ph = 380;
    ctx.save();
    ctx.shadowBlur = 30;
    ctx.shadowColor = 'rgba(255,90,90,0.45)';
    ctx.fillStyle = 'rgba(8,12,22,0.98)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 16); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,90,90,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 16); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 28px ' + FONT;
    ctx.fillStyle = '#ff8a8a';
    ctx.fillText('调试面板', W / 2, py + 46);
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = 'rgba(255,170,170,0.9)';
    ctx.fillText('本局任何数据都不会计入存档和统计', W / 2, py + 74);

    const rowY = [py + 130, py + 185];
    const labels = ['刷怪频率', '同屏上限'];
    const values = ['×' + G.dbgRateMul.toFixed(2), String(G.dbgCap)];
    for (let i = 0; i < 2; i++) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillStyle = 'rgba(210,228,250,0.95)';
      ctx.fillText(labels[i], px + 40, rowY[i]);
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillStyle = '#ffd166';
      ctx.fillText(values[i], px + 190, rowY[i]);
      drawSmallButton('-', px + 340, rowY[i] - 20, 44, 34, () => adjustDebug(i === 0 ? 'rate' : 'cap', i === 0 ? -0.25 : -50));
      drawSmallButton('+', px + 394, rowY[i] - 20, 44, 34, () => adjustDebug(i === 0 ? 'rate' : 'cap', i === 0 ? 0.25 : 50));
    }

    const baseRate = 2.10 + G.wave * 0.80 + G.wave * G.wave * 0.025;
    const effRate = baseRate * G.dbgRateMul;
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = 'rgba(160,195,235,0.85)';
    ctx.fillText('第 ' + G.wave + ' 波：约 ' + effRate.toFixed(1) + ' 只/秒 · 同屏上限 ' + G.dbgCap, W / 2, py + 232);

    drawSmallButton('恢复默认', px + 100, py + 270, 140, 40, resetDebugSpawn);
    drawSmallButton('继续游戏', px + 300, py + 270, 160, 40, () => { G.debugPanel = false; });

    ctx.font = '12px ' + FONT;
    ctx.fillStyle = 'rgba(150,175,210,0.65)';
    ctx.fillText('Esc 关闭面板 · 本局仍不计入存档', W / 2, py + 340);
    ctx.restore();
  }

  // 暂停/统计里返回主界面：保留「每波开始」的进度存档，不额外覆盖
  function backToMenu() {
    if (G.state !== 'playing' && G.state !== 'stats') return;
    G.paused = false;
    G.state = 'menu';
    G.uiButtons.length = 0;
  }

  // 从「每波开始」的存档继续
  function resumeSavedRun() {
    const r = SaveData.run;
    if (!r) { startNewGame(); return; }
    const entry = JSON.parse(JSON.stringify(r));
    resetGame();
    G.entryRun = entry; // 本局开始前的存档快照
    G.difficulty = DIFFS[r.difficulty] ? r.difficulty : SaveData.difficulty;
    if (G.difficulty === 'sudden' && !suddenUnlocked()) G.difficulty = 'easy';
    G.wave = clamp(Math.round(r.wave) || 1, 1, G.TOTAL_WAVES);
    G.waveTime = 0;
    G.gold = Math.max(0, Math.round(r.gold) || 0);
    G.cpuIdx = clamp(Math.round(r.cpuIdx) || 0, 0, CPUS.length - 1);
    G.gpuIdx = clamp(Math.round(r.gpuIdx) || 0, 0, GPUS.length - 1);
    G.ramIdx = clamp(Math.round(r.ramIdx) || 0, 0, RAMS.length - 1);
    G.ssdIdx = clamp(Math.round(r.ssdIdx) || 0, 0, SSDS.length - 1);
    G.player.maxMana = ram().maxMana;
    if (G.difficulty === 'sudden') {
      G.player.maxHp = 1;
      G.player.hp = 1;
    } else {
      G.player.hp = clamp(Math.round(r.hp) || G.player.maxHp, 1, G.player.maxHp);
    }
    G.player.mana = clamp(r.mana === undefined ? G.player.maxMana : Math.round(r.mana), 0, G.player.maxMana);
    G.softwares = (r.softwares || [])
      .map((id) => SOFTWARES.find((s) => s.id === id))
      .filter(Boolean)
      .slice(0, SSDS[G.ssdIdx].slots);
    G.softCds = G.softwares.map(() => 0);
    G.softFlash = G.softwares.map(() => 0);
    G.kills = Math.max(0, Math.round(r.kills) || 0);
    G.playTime = Math.max(0, Math.round(r.playTime) || 0);
    G.killCounts = Object.assign({ worm: 0, trojan: 0, leak: 0, boss: 0 }, r.killCounts || {});
    G.goldEarned = Math.max(0, Math.round(r.goldEarned) || 0);
    G.goldSpent = Math.max(0, Math.round(r.goldSpent) || 0);
    G.softwareUses = Math.max(0, Math.round(r.softwareUses) || 0);
    G.skillCasts = Math.max(0, Math.round(r.skillCasts) || 0);
    G.damageDealt = Math.max(0, r.damageDealt || 0);
    if (r.buys && typeof r.buys === 'object') G.buys = JSON.parse(JSON.stringify(r.buys));
    G.state = 'playing';
    G.paused = false;
    addText(G.cam.x, G.cam.y - 250, '第 ' + G.wave + ' 波', '#8ef2ff', 34);
    saveCheckpoint();
  }

  // ---------------- 点击 ----------------
  function click(x, y) {
    initAudio();
    // 音量条不是普通按钮：点一下定音量，按住还能拖
    if (audioSlider.w > 0 && x >= audioSlider.x - 6 && x <= audioSlider.x + audioSlider.w + 6 &&
        y >= audioSlider.y && y <= audioSlider.y + audioSlider.h) {
      setMusicVolume((x - audioSlider.x) / audioSlider.w, true);
      audioDragging = true;
      return;
    }
    // 按钮优先：菜单、商店、暂停、HUD 都靠 G.uiButtons 命中
    for (const b of G.uiButtons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        G.uiButtons.length = 0; // 防止同一帧里二次命中/误触
        if (b.action) b.action();
        return;
      }
    }
  }

  // ---------------- 绘制 ----------------
  function draw(dt) {
    const s = scale * dpr;
    ctx.setTransform(s, 0, 0, s, offX * dpr, offY * dpr);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, W, H);
    audioSlider.w = 0; // 只有画了音乐控件的界面才可拖音量

    // 相机震动
    let sx = 0, sy = 0;
    if (G.shake > 0.2) {
      sx = rnd(G.shake, -G.shake) * 0.6;
      sy = rnd(G.shake, -G.shake) * 0.6;
    }

    drawBackground(sx, sy);

    ctx.save();
    ctx.translate(-G.cam.x + W / 2 + sx, -G.cam.y + H / 2 + sy);

    drawPickups();
    drawEnemies();
    if (G.state !== 'dead') {
      drawPlayer();
      if (SaveData.showHitbox) drawHitbox();
    }
    drawBullets();
    drawEBullets();
    drawFx(dt);
    drawParticles();
    drawTexts(dt);

    ctx.restore();

    drawVignette();
    if (G.state === 'playing') drawHUD();
    if (G.state === 'playing' && G.paused) drawPause();
    if (G.state === 'playing' && G.debugPanel) drawDebugPanel();
    if (G.state === 'menu') drawMenu();
    if (G.state === 'stats') drawStats();
    if (G.state === 'achievements') drawAchievements();
    if (G.state === 'shop') drawShop();
    if (G.state === 'dead') drawGameOver();
    if (G.state === 'win') drawWin();

    if (G.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(G.flash, 0, 0.7) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // 竖屏提示
    if (window.innerHeight > window.innerWidth * 1.15) {
      ctx.fillStyle = 'rgba(3,5,12,0.92)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8ef2ff';
      ctx.font = 'bold 44px ' + FONT;
      ctx.fillText('横过来玩', W / 2, H / 2 - 20);
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillStyle = 'rgba(190,215,255,0.8)';
      ctx.fillText('触屏：按住屏幕拖动，角色跟着走', W / 2, H / 2 + 40);
    }
  }

  function drawBackground(sx, sy) {
    // 场外
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const ax = -ARENA.w / 2 - G.cam.x + W / 2 + sx;
    const ay = -ARENA.h / 2 - G.cam.y + H / 2 + sy;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ax, ay, ARENA.w, ARENA.h);
    ctx.clip();

    const g = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 820);
    g.addColorStop(0, '#0b1226');
    g.addColorStop(1, '#04050a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const floorImg = ASSETS.floor;
    if (floorImg && floorImg.complete && floorImg.naturalWidth) {
      const size = 480;
      const ox = ((-G.cam.x * 0.55 + sx) % size + size) % size;
      const oy = ((-G.cam.y * 0.55 + sy) % size + size) % size;
      ctx.save();
      ctx.globalAlpha = 0.95;
      for (let x = ox - size; x < W + size; x += size) {
        for (let y = oy - size; y < H + size; y += size) {
          ctx.drawImage(floorImg, x, y, size, size);
        }
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(4,6,16,0.38)';
      ctx.fillRect(0, 0, W, H);
    }

    const step = 90;
    const ox = ((-G.cam.x + sx) % step + step) % step;
    const oy = ((-G.cam.y + sy) % step + step) % step;
    ctx.strokeStyle = 'rgba(70,140,220,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = oy; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    const big = step * 4;
    const ox2 = ((-G.cam.x + sx) % big + big) % big;
    const oy2 = ((-G.cam.y + sy) % big + big) % big;
    ctx.strokeStyle = 'rgba(90,180,255,0.16)';
    ctx.beginPath();
    for (let x = ox2; x < W; x += big) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = oy2; y < H; y += big) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    ctx.restore();

    // 围栏内侧的渐变光带
    const fade = 96;
    let lg;
    lg = ctx.createLinearGradient(ax, 0, ax + fade, 0);
    lg.addColorStop(0, 'rgba(110,225,255,0.30)'); lg.addColorStop(1, 'rgba(110,225,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(ax, ay, fade, ARENA.h);
    lg = ctx.createLinearGradient(ax + ARENA.w, 0, ax + ARENA.w - fade, 0);
    lg.addColorStop(0, 'rgba(110,225,255,0.30)'); lg.addColorStop(1, 'rgba(110,225,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(ax + ARENA.w - fade, ay, fade, ARENA.h);
    lg = ctx.createLinearGradient(0, ay, 0, ay + fade);
    lg.addColorStop(0, 'rgba(110,225,255,0.30)'); lg.addColorStop(1, 'rgba(110,225,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(ax, ay, ARENA.w, fade);
    lg = ctx.createLinearGradient(0, ay + ARENA.h, 0, ay + ARENA.h - fade);
    lg.addColorStop(0, 'rgba(110,225,255,0.30)'); lg.addColorStop(1, 'rgba(110,225,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(ax, ay + ARENA.h - fade, ARENA.w, fade);

    // 围栏主线条
    ctx.save();
    ctx.strokeStyle = 'rgba(140,240,255,0.9)';
    ctx.lineWidth = 6;
    ctx.shadowBlur = 32;
    ctx.shadowColor = 'rgba(110,220,255,1)';
    ctx.strokeRect(ax, ay, ARENA.w, ARENA.h);
    ctx.restore();

    // 四角加粗
    ctx.save();
    ctx.strokeStyle = 'rgba(190,250,255,0.95)';
    ctx.shadowBlur = 18;
    ctx.shadowColor = 'rgba(140,240,255,0.9)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    const L = 70;
    const corners = [
      [ax, ay, 1, 1], [ax + ARENA.w, ay, -1, 1],
      [ax, ay + ARENA.h, 1, -1], [ax + ARENA.w, ay + ARENA.h, -1, -1],
    ];
    for (const c of corners) {
      const cx = c[0], cy = c[1], dxs = c[2], dys = c[3];
      ctx.beginPath();
      ctx.moveTo(cx + dxs * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dys * L);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ----- 玩家：大肥鱼 Q 版 -----
  function drawPlayer() {
    const p = G.player;
    let img = ASSETS.fish;
    const spdNow = Math.hypot(p.vx, p.vy);
    if (p.castTimer > 0 && ASSETS.fishCast && ASSETS.fishCast.complete) {
      img = ASSETS.fishCast;
    } else if (p.hurtTimer > 0 && ASSETS.fishHurt && ASSETS.fishHurt.complete) {
      img = ASSETS.fishHurt;
    } else if (p.atkTimer > 0 && ASSETS.fishAtk && ASSETS.fishAtk.complete) {
      img = ASSETS.fishAtk;
    } else if (spdNow > 40) {
      const alt = Math.floor(p.walk / 1.15) % 2 === 0 ? ASSETS.fishA : ASSETS.fishB;
      if (alt && alt.complete && alt.naturalWidth) img = alt;
    }
    if (!(img && img.complete && img.naturalWidth)) { drawPlayerProcedural(); return; }

    ctx.save();
    ctx.translate(p.x, p.y);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 26, 23, 7, 0, 0, TAU);
    ctx.fill();

    // 主角光环
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 52);
    halo.addColorStop(0, 'rgba(120,235,255,0.28)');
    halo.addColorStop(1, 'rgba(120,235,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.fill();

    const bob = Math.sin(p.walk) * 1.2;
    const hh = 124;
    const ww = img.width / img.height * hh;

    ctx.save();
    ctx.translate(0, bob);
    if (spdNow > 40) ctx.rotate(Math.sin(p.walk) * 0.04);
    if (p.invuln > 0.02 && Math.floor(p.invuln * 26) % 2 === 0) ctx.globalAlpha = 0.45;
    if (p.hitFlash > 0) ctx.filter = 'brightness(1.8) saturate(0.4)';
    ctx.scale(p.facing, 1);
    ctx.shadowColor = 'rgba(90,200,255,0.45)';
    ctx.shadowBlur = 16;
    ctx.drawImage(img, -ww / 2, 30 - hh, ww, hh);
    ctx.restore();

    // 无敌帧护盾
    if (p.invuln > 0.02) {
      ctx.strokeStyle = 'rgba(140,220,255,' + clamp(p.invuln * 1.6, 0, 1) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -22, 40, 0, TAU); ctx.stroke();
    }
    // 技能就绪提示
    if (gpu().skill && G.skillCd <= 0 && p.mana >= gpu().mana) {
      ctx.strokeStyle = 'rgba(255,220,120,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, -22, 44 + Math.sin(G.t * 6) * 2, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // ----- 判定点：角色实际吃伤害的圆（半径 36，与 update 里的碰撞一致） -----
  function drawHitbox() {
    const p = G.player;
    if (!p) return;
    const R = 36;
    ctx.save();
    ctx.translate(p.x, p.y);

    ctx.globalAlpha = 0.09;
    ctx.fillStyle = '#8ef2ff';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();

    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = '#8ef2ff';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    // 正中心的判定点
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#8ef2ff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.fill();

    ctx.restore();
  }

  function drawPlayerProcedural() {
    const p = G.player;
    ctx.save();
    ctx.translate(p.x, p.y);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 20, 7, 0, 0, TAU);
    ctx.fill();

    const bob = Math.sin(p.walk) * 1.6;

    // 主角光环，保证在怪堆里也能一眼看见
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 50);
    halo.addColorStop(0, 'rgba(120,235,255,0.30)');
    halo.addColorStop(1, 'rgba(120,235,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.fill();

    ctx.translate(0, bob);
    ctx.scale(1.18, 1.18);

    // 受击闪白
    if (p.hitFlash > 0 && Math.floor(p.hitFlash * 30) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    ctx.save();
    ctx.scale(p.facing, 1);

    // 腿
    const swing = Math.sin(p.walk) * 5;
    ctx.fillStyle = '#22305c';
    ctx.beginPath(); ctx.roundRect(-9 + swing, 10, 7, 14, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(2 - swing, 10, 7, 14, 3); ctx.fill();
    // 鞋
    ctx.fillStyle = '#e9eefc';
    ctx.beginPath(); ctx.roundRect(-10 + swing, 20, 9, 5, 2.5); ctx.fill();
    ctx.beginPath(); ctx.roundRect(1 - swing, 20, 9, 5, 2.5); ctx.fill();

    // 裙子
    ctx.fillStyle = '#1b2a55';
    ctx.beginPath();
    ctx.moveTo(-14, -2); ctx.lineTo(14, -2); ctx.lineTo(19, 14); ctx.lineTo(-19, 14);
    ctx.closePath(); ctx.fill();
    // 裙子褶
    ctx.strokeStyle = 'rgba(140,180,255,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(-11, 13);
    ctx.moveTo(0, 0); ctx.lineTo(0, 13);
    ctx.moveTo(8, 0); ctx.lineTo(11, 13);
    ctx.stroke();

    // 围裙
    ctx.fillStyle = '#f4f7ff';
    ctx.beginPath();
    ctx.moveTo(-9, 1); ctx.lineTo(9, 1); ctx.lineTo(11, 13); ctx.lineTo(-11, 13);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,190,240,0.5)';
    ctx.stroke();

    // 上衣
    ctx.fillStyle = '#25346a';
    ctx.beginPath(); ctx.roundRect(-11, -14, 22, 15, 5); ctx.fill();
    // 领结
    ctx.fillStyle = '#3b6fd8';
    ctx.beginPath();
    ctx.moveTo(0, -13); ctx.lineTo(-7, -17); ctx.lineTo(-7, -9); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -13); ctx.lineTo(7, -17); ctx.lineTo(7, -9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7fb4ff';
    ctx.beginPath(); ctx.arc(0, -13, 2.6, 0, TAU); ctx.fill();

    // 头发（后层）
    ctx.fillStyle = '#2f5fc4';
    ctx.beginPath();
    ctx.moveTo(-16, -30); ctx.quadraticCurveTo(-26, 4, -19, 20);
    ctx.quadraticCurveTo(-13, 8, -12, -6); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, -30); ctx.quadraticCurveTo(26, 4, 19, 20);
    ctx.quadraticCurveTo(13, 8, 12, -6); ctx.closePath(); ctx.fill();
    // 双马尾
    ctx.fillStyle = '#3a6fd8';
    ctx.beginPath(); ctx.ellipse(-19, 8, 7, 13, 0.25, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(19, 8, 7, 13, -0.25, 0, TAU); ctx.fill();

    // 头
    ctx.fillStyle = '#ffe6d8';
    ctx.beginPath(); ctx.arc(0, -26, 15, 0, TAU); ctx.fill();

    // 刘海
    ctx.fillStyle = '#3f74e0';
    ctx.beginPath();
    ctx.arc(0, -29, 15.2, Math.PI * 1.03, Math.PI * 1.97);
    ctx.lineTo(13, -24);
    ctx.quadraticCurveTo(8, -33, 0, -31);
    ctx.quadraticCurveTo(-8, -33, -13, -24);
    ctx.closePath(); ctx.fill();
    // 呆毛
    ctx.beginPath();
    ctx.moveTo(-2, -43); ctx.quadraticCurveTo(3, -52, 7, -44);
    ctx.quadraticCurveTo(3, -47, -2, -43);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#22355f';
    ctx.beginPath(); ctx.ellipse(-5.5, -24, 2.6, 3.6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5.5, -24, 2.6, 3.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9fd0ff';
    ctx.beginPath(); ctx.arc(-4.6, -25.4, 1.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6.4, -25.4, 1.1, 0, TAU); ctx.fill();
    // 腮红
    ctx.fillStyle = 'rgba(255,150,160,0.35)';
    ctx.beginPath(); ctx.ellipse(-9.5, -20, 3, 1.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9.5, -20, 3, 1.8, 0, 0, TAU); ctx.fill();

    // 头顶的锅
    ctx.fillStyle = '#98a3b3';
    ctx.beginPath();
    ctx.ellipse(0, -44, 17, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#b6c0cd';
    ctx.beginPath();
    ctx.moveTo(-16, -44);
    ctx.quadraticCurveTo(-16, -58, 0, -58);
    ctx.quadraticCurveTo(16, -58, 16, -44);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,72,92,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-16, -44);
    ctx.quadraticCurveTo(-16, -58, 0, -58);
    ctx.quadraticCurveTo(16, -58, 16, -44);
    ctx.stroke();
    // 锅盖把手位置的小高光
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-6, -53, 4, 1.8, -0.4, 0, TAU); ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;

    // 无敌帧护盾
    if (G.player.invuln > 0.02) {
      ctx.strokeStyle = 'rgba(140,220,255,' + (G.player.invuln * 1.6) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -10, 30, 0, TAU); ctx.stroke();
    }

    // 技能就绪提示
    if (gpu().skill && G.skillCd <= 0 && G.player.mana >= gpu().mana) {
      ctx.strokeStyle = 'rgba(255,220,120,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, -10, 34 + Math.sin(G.t * 6) * 2, 0, TAU); ctx.stroke();
    }

    ctx.restore();
  }

  // ----- 敌人 -----
  function drawEnemies() {
    for (const e of G.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const wob = Math.sin(e.t) * (e.isBoss ? 3 : 2);

      // 影子
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, e.r * 0.8, e.r * 0.9, e.r * 0.32, 0, 0, TAU); ctx.fill();

      const flash = e.hit > 0;
      const col = flash ? '#ffffff' : e.color;

      // 有贴图就用贴图
      const artKey = e.isBoss ? 'boss' : e.type;
      const art = ASSETS[artKey];
      if (art && art.complete && art.naturalWidth) {
        const hh = e.r * (e.isBoss ? 3.3 : 2.6);
        const ww = art.width / art.height * hh;
        ctx.save();
        ctx.rotate(Math.sin(e.t * 0.9) * 0.05);
        if (flash) ctx.filter = 'brightness(2.4) saturate(0.2)';
        ctx.drawImage(art, -ww / 2, -hh * 0.5, ww, hh);
        ctx.restore();
        ctx.restore();
        continue;
      }

      if (e.isBoss) {
        // Boss：双芯核弹造型
        ctx.fillStyle = 'rgba(255,60,60,0.16)';
        ctx.beginPath(); ctx.arc(0, 0, e.r + 16 + wob, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1030';
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
        // 两个核心
        for (let i = 0; i < 2; i++) {
          const a = e.phase + i * Math.PI;
          ctx.fillStyle = i ? '#ff3b3b' : '#ff8a3d';
          ctx.beginPath(); ctx.arc(Math.cos(a) * 20, Math.sin(a) * 20, 14, 0, TAU); ctx.fill();
        }
        // 眼睛
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-18, -12, 5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(18, -12, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-17, -12, 2.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(19, -12, 2.4, 0, TAU); ctx.fill();
        // 血条
        const w = 110;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-w / 2, -e.r - 24, w, 8);
        ctx.fillStyle = '#ff3b3b';
        ctx.fillRect(-w / 2, -e.r - 24, w * (e.hp / e.maxHp), 8);
      } else if (e.type === 'worm') {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, e.r, e.r * 0.82 + wob * 0.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(-5, -2, 3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(5, -2, 3, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(4, 6); ctx.stroke();
      } else if (e.type === 'trojan') {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      } else {
        // 内存泄漏：一团不规则
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          const rr = e.r * (0.82 + Math.sin(e.t * 2 + i) * 0.18);
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(-6, -3, 3.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(6, -3, 3.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of G.bullets) {
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = b.color;
      // 拖尾
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = b.r * 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.024, b.y - b.vy * 0.024);
      ctx.stroke();
      // 弹头
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.45, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.72, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawEBullets() {
    for (const b of G.ebullets) {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = b.color;
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawPickups() {
    const coinImg = ASSETS.coin;
    for (const c of G.pickups) {
      const pulse = 0.85 + Math.sin(G.t * 8 + c.x) * 0.15;
      ctx.save();
      ctx.globalAlpha = c.life < 2 ? 0.4 + Math.sin(G.t * 14) * 0.3 : 1;
      if (c.heal) {
        // 血包：绿色十字
        ctx.translate(c.x, c.y);
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#7dff9b';
        ctx.fillStyle = '#7dff9b';
        ctx.beginPath(); ctx.roundRect(-3.5, -10, 7, 20, 2); ctx.fill();
        ctx.beginPath(); ctx.roundRect(-10, -3.5, 20, 7, 2); ctx.fill();
        ctx.restore();
        continue;
      }
      if (coinImg && coinImg.complete && coinImg.naturalWidth) {
        const hh = 26 * pulse;
        const ww = coinImg.width / coinImg.height * hh;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ffcf4d';
        ctx.drawImage(coinImg, c.x - ww / 2, c.y - hh / 2, ww, hh);
      } else {
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#ffd166';
        ctx.fillStyle = '#ffd166';
        ctx.translate(c.x, c.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-c.r * pulse, -c.r * pulse, c.r * 2 * pulse, c.r * 2 * pulse);
      }
      ctx.restore();
    }
  }

  function drawFx(dt) {
    for (const f of G.fx) {
      if (f.type === 'laser') {
        const k = 1 - f.t / f.life;
        const ex = f.x + Math.cos(f.a) * f.len;
        const ey = f.y + Math.sin(f.a) * f.len;
        ctx.save();
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.color;
        ctx.shadowBlur = 24;
        ctx.shadowColor = f.color;
        ctx.lineWidth = 16 * k;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * k;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.restore();
      } else if (f.type === 'ring') {
        const kr = 1 - f.t / f.life;
        f.r = lerp(f.r, f.maxR, 1 - Math.pow(0.0008, dt));
        ctx.save();
        ctx.globalAlpha = kr * 0.9;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 7 * kr + 1;
        ctx.shadowBlur = 18;
        ctx.shadowColor = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke();
        ctx.restore();
      } else if (f.type === 'flame') {
        const k = 1 - f.t / f.life;
        ctx.save();
        ctx.globalAlpha = 0.35 * k;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.8 * k;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawParticles() {
    for (const q of G.particles) {
      const a = clamp(q.life / q.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * a, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts(dt) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of G.texts) {
      const a = clamp(t.life / 0.75, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'bold ' + t.size + 'px ' + FONT;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(t.str, t.x + 2, t.y + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      t.y += t.vy * dt;
      t.life -= dt;
    }
    ctx.globalAlpha = 1;
  }

  // ----- HUD -----
  function drawHUD() {
    const p = G.player;
    G.uiButtons.length = 0;

    // 左下：血条 + 蓝条
    const bx = 30, by = H - 92, bw = 300, bh = 16;
    // 血
    ctx.fillStyle = 'rgba(10,16,30,0.85)';
    ctx.beginPath(); ctx.roundRect(bx - 4, by - 4, bw + 8, bh + 8, 8); ctx.fill();
    ctx.fillStyle = '#3a1020';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
    const hpK = clamp(p.hp / p.maxHp, 0, 1);
    const hpG = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hpG.addColorStop(0, '#ff4d6d'); hpG.addColorStop(1, '#ff8a5c');
    ctx.fillStyle = hpG;
    ctx.beginPath(); ctx.roundRect(bx, by, bw * hpK, bh, 6); ctx.fill();
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.max(0, Math.ceil(p.hp)) + ' / ' + p.maxHp, bx + bw + 14, by + bh / 2);

    // 蓝
    const my = by + 26;
    ctx.fillStyle = 'rgba(10,16,30,0.85)';
    ctx.beginPath(); ctx.roundRect(bx - 4, my - 4, bw + 8, 16 + 8, 8); ctx.fill();
    ctx.fillStyle = '#0d2440';
    ctx.beginPath(); ctx.roundRect(bx, my, bw, 16, 6); ctx.fill();
    const mk = clamp(p.mana / p.maxMana, 0, 1);
    const mG = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    mG.addColorStop(0, '#2ec5ff'); mG.addColorStop(1, '#7dffd4');
    ctx.fillStyle = mG;
    ctx.beginPath(); ctx.roundRect(bx, my, bw * mk, 16, 6); ctx.fill();
    ctx.fillStyle = '#9fdcff';
    ctx.fillText(Math.floor(p.mana) + ' / ' + p.maxMana, bx + bw + 14, my + 8);

    // 左上：波次 / 金币
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillStyle = '#8ef2ff';
    const waveTxt = 'WAVE ' + G.wave + ' / ' + G.TOTAL_WAVES;
    ctx.fillText(waveTxt, 34, 46);
    const curDiff = diffOf(G.difficulty);
    const waveW = ctx.measureText(waveTxt).width;
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = curDiff.color;
    ctx.fillText(curDiff.name, 34 + waveW + 10, 48);
    if (G.debugMode) {
      const diffW = ctx.measureText(curDiff.name).width;
      ctx.fillStyle = '#ff5a5a';
      ctx.fillText('调试', 34 + waveW + 10 + diffW + 8, 48);
    }
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('◈ ' + G.gold, 34, 76);

    // 波次进度条
    const pwid = 200;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(34, 90, pwid, 6, 3); ctx.fill();
    ctx.fillStyle = '#8ef2ff';
    ctx.beginPath(); ctx.roundRect(34, 90, pwid * clamp(G.waveTime / G.WAVE_LEN, 0, 1), 6, 3); ctx.fill();

    // 局内计时（毫秒级，方便凹时间）
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = 'rgba(150,190,240,0.8)';
    ctx.fillText('TIME', 34, 119);
    ctx.font = 'bold 19px ' + FONT_MONO;
    ctx.fillStyle = '#cfe3ff';
    ctx.fillText(fmtRunTime(G.playTime), 74, 121);

    // 右上：装备名称 + 属性
    const rx = W - 30;
    ctx.textAlign = 'right';

    ctx.font = 'bold 15px ' + FONT;
    ctx.fillStyle = '#cfe3ff';
    ctx.fillText('CPU  ' + cpu().name, rx, 38);
    const c0 = cpu();
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = 'rgba(165,190,225,0.85)';
    ctx.fillText('射速 ' + (1 / c0.interval).toFixed(1) + '/s · 伤害 ' + c0.dmg + ' · 弹道 ' + c0.count + (c0.pierce ? ' · 穿透 ' + c0.pierce : ''), rx, 56);

    ctx.font = 'bold 15px ' + FONT;
    ctx.fillStyle = gpu().color;
    ctx.fillText('GPU  ' + gpu().name, rx, 78);
    const g0 = gpu();
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = 'rgba(165,190,225,0.85)';
    ctx.fillText(g0.skill ? (SKILL_NAMES[g0.skill] + ' · 蓝耗 ' + g0.mana + ' · 冷却 ' + g0.cd.toFixed(1) + 's') : '无技能（纯亮机）', rx, 96);

    ctx.font = 'bold 15px ' + FONT;
    ctx.fillStyle = '#cfe3ff';
    ctx.fillText('RAM  ' + ram().name, rx, 118);
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = 'rgba(165,190,225,0.85)';
    ctx.fillText('蓝上限 ' + ram().maxMana + ' · 回蓝 ' + ram().regen + '/s', rx, 136);

    // 技能就绪状态
    if (gpu().skill) {
      const ready = G.skillCd <= 0 && p.mana >= gpu().mana;
      ctx.textAlign = 'right';
      ctx.fillStyle = ready ? '#ffd166' : 'rgba(160,180,210,0.55)';
      ctx.font = 'bold 13px ' + FONT;
      const cdTxt = G.skillCd > 0 ? '冷却 ' + G.skillCd.toFixed(1) + 's' : (p.mana < gpu().mana ? '蓝不够' : '技能就绪');
      ctx.fillText('技能 ' + cdTxt, rx, 158);
    }

    // Boss 血条（屏幕空间）
    const boss = G.enemies.find((e) => e.isBoss);
    if (boss) {
      const bw = 560, bx = W / 2 - bw / 2, byy = 76;
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px ' + FONT;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText('GTX 690 双芯核弹', W / 2, byy - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath(); ctx.roundRect(bx - 3, byy - 3, bw + 6, 20, 6); ctx.fill();
      ctx.fillStyle = '#2a0a12';
      ctx.beginPath(); ctx.roundRect(bx, byy, bw, 14, 5); ctx.fill();
      const g2 = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g2.addColorStop(0, '#ff3b3b'); g2.addColorStop(1, '#ff9a3d');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.roundRect(bx, byy, bw * clamp(boss.hp / boss.maxHp, 0, 1), 14, 5); ctx.fill();
    }

    drawSoftwareBar();

    // 触控摇杆
    if (touch.active) {
      ctx.save();
      ctx.strokeStyle = 'rgba(142,242,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(touch.ox, touch.oy, 54, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(142,242,255,0.12)';
      ctx.beginPath(); ctx.arc(touch.ox, touch.oy, 54, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(142,242,255,0.65)';
      ctx.beginPath();
      ctx.arc(touch.ox + touch.dx * touch.mag * 44, touch.oy + touch.dy * touch.mag * 44, 22, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 连杀
    if (G.combo >= 3) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px ' + FONT;
      ctx.fillStyle = 'rgba(255,209,102,' + clamp(G.comboTimer, 0, 1) + ')';
      ctx.fillText('x' + G.combo, W / 2, 70);
    }

    // 右上角暂停按钮（手机只有触屏，得能点得到）
    const pbSize = 46;
    const pbx = W - 30 - pbSize, pby = 176;
    const pbHover = mouse.x > pbx && mouse.x < pbx + pbSize && mouse.y > pby && mouse.y < pby + pbSize;
    ctx.fillStyle = pbHover ? 'rgba(32,58,88,0.95)' : 'rgba(14,24,44,0.82)';
    ctx.strokeStyle = 'rgba(142,242,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(pbx, pby, pbSize, pbSize, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(200,230,255,0.9)';
    ctx.fillRect(pbx + 15, pby + 13, 5, 20);
    ctx.fillRect(pbx + 26, pby + 13, 5, 20);
    ctx.font = 'bold 10px ' + FONT;
    ctx.fillStyle = 'rgba(150,190,240,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText('P', pbx + pbSize / 2, pby + pbSize - 7);
    G.uiButtons.push({ x: pbx, y: pby, w: pbSize, h: pbSize, action: togglePause });

    // 暂停下面的倍速按钮：1× → 2× → 4×
    const spy = pby + pbSize + 10;
    const spHover = mouse.x > pbx && mouse.x < pbx + pbSize && mouse.y > spy && mouse.y < spy + pbSize;
    const fast = G.speedMul > 1;
    ctx.fillStyle = fast ? (spHover ? 'rgba(84,62,18,0.95)' : 'rgba(48,36,12,0.85)') : (spHover ? 'rgba(32,58,88,0.95)' : 'rgba(14,24,44,0.82)');
    ctx.strokeStyle = fast ? 'rgba(255,209,102,0.8)' : 'rgba(142,242,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(pbx, spy, pbSize, pbSize, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = fast ? '#ffd166' : '#cfe3ff';
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillText(G.speedMul + '×', pbx + pbSize / 2, spy + pbSize / 2 - 3);
    ctx.font = 'bold 10px ' + FONT;
    ctx.fillStyle = 'rgba(150,190,240,0.65)';
    ctx.fillText('T', pbx + pbSize / 2, spy + pbSize - 7);
    G.uiButtons.push({ x: pbx, y: spy, w: pbSize, h: pbSize, action: cycleSpeed });
  }

  function drawSoftwareBar() {
    const slots = SSDS[G.ssdIdx].slots;
    const size = 62, gap = 12;
    const totalW = slots * size + Math.max(0, slots - 1) * gap;
    const x0 = W - 34 - totalW;
    const y0 = H - 34 - size;

    ctx.save();
    ctx.textAlign = 'center';
    for (let i = 0; i < slots; i++) {
      const x = x0 + i * (size + gap);
      const sw = G.softwares[i];
      const cd = G.softCds[i] || 0;

      ctx.fillStyle = sw ? 'rgba(14,24,44,0.92)' : 'rgba(10,16,30,0.65)';
      ctx.strokeStyle = sw ? sw.color : 'rgba(90,110,140,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x, y0, size, size, 10); ctx.fill(); ctx.stroke();

      if (sw) {
        if (G.softFlash[i] > 0) {
          ctx.save();
          ctx.globalAlpha = G.softFlash[i] * 1.6;
          ctx.fillStyle = sw.color;
          ctx.beginPath(); ctx.roundRect(x, y0, size, size, 10); ctx.fill();
          ctx.restore();
        }
        if (cd > 0) {
          const k = clamp(cd / sw.cd, 0, 1);
          ctx.fillStyle = 'rgba(2,4,10,0.55)';
          ctx.beginPath(); ctx.roundRect(x, y0, size, size, 10); ctx.fill();
          // 底部进度条显示冷却
          ctx.fillStyle = 'rgba(142,242,255,0.85)';
          ctx.fillRect(x + 6, y0 + size - 8, (size - 12) * (1 - k), 4);
        }
        const half = Math.ceil(sw.name.length / 2);
        ctx.fillStyle = cd > 0 ? 'rgba(210,225,245,0.85)' : '#eaf3ff';
        ctx.font = 'bold 15px ' + FONT;
        ctx.fillText(sw.name.slice(0, half), x + size / 2, y0 + size / 2 - 5);
        ctx.font = '12px ' + FONT;
        ctx.fillStyle = sw.color;
        ctx.fillText(sw.name.slice(half), x + size / 2, y0 + size / 2 + 13);

        if (cd > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.font = 'bold 15px ' + FONT;
          ctx.fillText(Math.ceil(cd) + 's', x + size / 2, y0 + size - 15);
        }
        ctx.fillStyle = 'rgba(150,190,240,0.55)';
        ctx.font = 'bold 10px ' + FONT;
        ctx.fillText(String(i + 1), x + 9, y0 + 12);
      } else {
        ctx.fillStyle = 'rgba(140,170,210,0.35)';
        ctx.font = 'bold 24px ' + FONT;
        ctx.fillText('+', x + size / 2, y0 + size / 2 + 2);
      }
      G.uiButtons.push({ x, y: y0, w: size, h: size, action: () => useSoftware(i) });
    }
    ctx.restore();
  }

  // ----- 暂停 -----
  function drawPause() {
    ctx.save();
    ctx.fillStyle = 'rgba(3,6,14,0.66)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 56px ' + FONT;
    ctx.fillStyle = '#8ef2ff';
    ctx.shadowBlur = 24;
    ctx.shadowColor = 'rgba(110,220,255,0.7)';
    ctx.fillText('已暂停', W / 2, H / 2 - 78);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 17px ' + FONT;
    ctx.fillStyle = 'rgba(190,215,255,0.82)';
    ctx.fillText('难度 ' + diffOf(G.difficulty).name + ' · 第 ' + G.wave + ' 波 · 击杀 ' + G.kills + ' · ◈ ' + G.gold + ' · 用时 ' + fmtRunTime(G.playTime), W / 2, H / 2 - 22);

    const bw = 220, bh = 52, bx = W / 2 - bw / 2, by = H / 2 + 24;
    const hov = mouse.x > bx && mouse.x < bx + bw && mouse.y > by && mouse.y < by + bh;
    ctx.fillStyle = hov ? 'rgba(50,92,130,0.95)' : 'rgba(26,44,68,0.95)';
    ctx.strokeStyle = 'rgba(142,242,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eaf3ff';
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText('继续游戏', W / 2, by + bh / 2 + 1);
    G.uiButtons.push({ x: bx, y: by, w: bw, h: bh, action: togglePause });

    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = 'rgba(150,175,210,0.75)';
    ctx.fillText('P / Esc 也可以继续', W / 2, by + bh + 18);

    // 返回主界面（不覆盖存档，主菜单还能继续这一波）
    const mbw = 200, mbh = 42, mbx = W / 2 - mbw / 2, mby = by + bh + 34;
    const mhov = mouse.x > mbx && mouse.x < mbx + mbw && mouse.y > mby && mouse.y < mby + mbh;
    ctx.fillStyle = mhov ? 'rgba(58,34,42,0.95)' : 'rgba(30,22,30,0.9)';
    ctx.strokeStyle = 'rgba(255,150,150,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(mbx, mby, mbw, mbh, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffdede';
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillText('返回主界面', W / 2, mby + mbh / 2 + 1);
    G.uiButtons.push({ x: mbx, y: mby, w: mbw, h: mbh, action: backToMenu });

    // 判定点开关
    const tw = 260, th = 44, tx = W / 2 - tw / 2, ty = mby + mbh + 18;
    const thov = mouse.x > tx && mouse.x < tx + tw && mouse.y > ty && mouse.y < ty + th;
    ctx.fillStyle = thov ? 'rgba(24,42,66,0.95)' : 'rgba(16,28,48,0.92)';
    ctx.strokeStyle = 'rgba(120,150,190,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 10); ctx.fill(); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillStyle = '#cfe3ff';
    ctx.fillText('角色判定点', tx + 18, ty + th / 2);

    const sw = 52, sh = 22, sx = tx + tw - sw - 18, sy = ty + (th - sh) / 2;
    const on = SaveData.showHitbox;
    ctx.fillStyle = on ? 'rgba(80,220,255,0.9)' : 'rgba(70,90,120,0.75)';
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, sh / 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(sx + (on ? sw - sh / 2 : sh / 2), sy + sh / 2, sh / 2 - 3, 0, TAU); ctx.fill();

    G.uiButtons.push({ x: tx, y: ty, w: tw, h: th, action: toggleHitbox });

    // 背景音乐
    drawAudioControls(W / 2 - 134, ty + th + 30);

    ctx.textAlign = 'center';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = 'rgba(150,175,210,0.7)';
    ctx.fillText('每波开始自动存档 · 设置会记住', W / 2, ty + th + 66);
    ctx.restore();
  }

  // ----- 菜单 -----
  function drawMenu() {
    G.uiButtons.length = 0;
    const bg = ASSETS.bgMenu;
    if (bg && bg.complete && bg.naturalWidth) {
      const sc = Math.max(W / bg.width, H / bg.height);
      const bw = bg.width * sc, bh = bg.height * sc;
      ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
      const gg = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 720);
      gg.addColorStop(0, 'rgba(4,6,16,0.62)');
      gg.addColorStop(1, 'rgba(4,6,16,0.42)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = 'rgba(4,5,10,0.86)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.textAlign = 'center';
    ctx.shadowBlur = 26;
    ctx.shadowColor = 'rgba(120,230,255,0.55)';

    ctx.font = 'bold 62px ' + FONT;
    const g = ctx.createLinearGradient(W / 2 - 260, 0, W / 2 + 260, 0);
    g.addColorStop(0, '#7dffd4'); g.addColorStop(0.5, '#8ef2ff'); g.addColorStop(1, '#ff8ad8');
    ctx.fillStyle = g;
    ctx.fillText('大肥鱼的狂野矿卡', W / 2, H / 2 - 130);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = 'rgba(190,215,255,0.75)';
    ctx.fillText('1024 程序员节 · 用一张显卡的命，换一整晚的帧数', W / 2, H / 2 - 80);

    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = 'rgba(185,205,235,0.9)';
    ctx.fillText('WASD / 方向键 移动   自动攻击   显卡技能自动释放', W / 2, H / 2 - 20);
    ctx.fillStyle = 'rgba(165,190,225,0.85)';
    ctx.fillText('每波结束可以升级 CPU / 显卡 / 内存 · P 暂停', W / 2, H / 2 + 4);

    // 难度选择（只影响怪物伤害）
    drawDifficultyButtons(H / 2 + 18);

    // 分难度统计 + 最快通关 + 总计
    drawMenuStats(H / 2 + 70);

    const hasRun = !!(SaveData.run && SaveData.run.wave);
    const btnY = H / 2 + 196;
    if (hasRun) {
      const rd = diffOf(SaveData.run.difficulty);
      const rdTag = rd.sudden ? '1 滴血' : '伤害 ×' + rd.dmg.toFixed(1);
      ctx.font = 'bold 12px ' + FONT;
      ctx.fillStyle = 'rgba(170,195,230,0.75)';
      ctx.fillText('存档：第 ' + SaveData.run.wave + ' 波 · ' + rd.name + '（' + rdTag + '）', W / 2, btnY - 18);
      drawMenuButton('继续第 ' + SaveData.run.wave + ' 波', W / 2 - 198, btnY, 190, 50, '#8ef2ff', resumeSavedRun);
      drawMenuButton('新开一局', W / 2 + 8, btnY, 190, 50, 'rgba(190,215,255,0.75)', startNewGame);
    } else {
      drawMenuButton('开始游戏', W / 2 - 150, btnY, 300, 50, '#8ef2ff', startNewGame);
    }

    // 统计 / 导出 / 导入
    const sw = 140, sh = 34, sy = H - 92;
    const sgap = 10;
    const sx0 = W / 2 - (sw * 4 + sgap * 3) / 2;
    drawSmallButton('统计数据', sx0, sy, sw, sh, showStats);
    drawSmallButton('成就 ' + unlockedAchievementCount() + '/' + ACHIEVEMENTS.length, sx0 + sw + sgap, sy, sw, sh, () => openAchievements('menu'));
    drawSmallButton('导出存档', sx0 + (sw + sgap) * 2, sy, sw, sh, exportSave);
    drawSmallButton('导入存档', sx0 + (sw + sgap) * 3, sy, sw, sh, importSaveFile);

    // 背景音乐（设置单独存，不跟游戏存档走）
    drawAudioControls(34, H - 56);
    ctx.textAlign = 'center';

    if (menuNotice && performance.now() < menuNoticeUntil) {
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillStyle = menuNotice.indexOf('失败') >= 0 ? 'rgba(255,120,120,0.95)' : 'rgba(125,255,212,0.95)';
      ctx.fillText(menuNotice, W / 2, H - 48);
    }

    ctx.font = '14px ' + FONT;
    ctx.fillStyle = 'rgba(120,140,170,0.7)';
    ctx.fillText('v0.9.5 · 1024 程序员节', W / 2, H - 30);
  }

  function drawDifficultyButtons(y) {
    const bw = 116, gap = 10;
    const total = bw * DIFF_KEYS.length + gap * (DIFF_KEYS.length - 1);
    let x = W / 2 - total / 2;
    for (const key of DIFF_KEYS) {
      const d = DIFFS[key];
      const locked = key === 'sudden' && !suddenUnlocked();
      const sel = SaveData.difficulty === key && !locked;
      const hov = mouse.x > x && mouse.x < x + bw && mouse.y > y && mouse.y < y + 40;
      ctx.fillStyle = locked ? 'rgba(16,20,28,0.85)' : (sel ? d.color : (hov ? 'rgba(24,42,66,0.95)' : 'rgba(14,26,44,0.85)'));
      ctx.strokeStyle = locked ? 'rgba(90,100,120,0.45)' : (sel ? d.color : 'rgba(120,150,190,0.5)');
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.beginPath(); ctx.roundRect(x, y, bw, 40, 9); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillStyle = locked ? 'rgba(120,135,160,0.55)' : (sel ? '#04121a' : d.color);
      ctx.fillText(d.name, x + bw / 2, y + 15);
      ctx.font = 'bold 11px ' + FONT;
      ctx.fillStyle = locked ? 'rgba(110,125,150,0.5)' : (sel ? 'rgba(4,18,26,0.75)' : 'rgba(180,205,235,0.65)');
      ctx.fillText(locked ? '未解锁' : (d.sudden ? '1 滴血' : '伤害 ×' + d.dmg.toFixed(1)), x + bw / 2, y + 31);
      G.uiButtons.push({
        x, y, w: bw, h: 40,
        action: locked ? () => notifyMenu('通关一次困难模式后解锁「突然死亡」', 4000) : () => setDifficulty(key),
      });
      x += bw + gap;
    }
  }

  function drawMenuStats(y) {
    ctx.textAlign = 'center';
    for (let i = 0; i < DIFF_KEYS.length; i++) {
      const key = DIFF_KEYS[i];
      const d = DIFFS[key];
      const s = SaveData.stats[key] || emptyStats();
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillStyle = s.runs > 0 ? d.color : 'rgba(140,160,190,0.55)';
      const txt = s.runs > 0
        ? d.name + '  第 ' + s.bestWave + ' 波 · ' + s.bestKills + ' 杀 · ' + fmtClock(s.bestTime)
        : d.name + '  还没打过';
      ctx.fillText(txt, W / 2, y + i * 18);
    }

    // 最快通关纪录（各难度，毫秒级）
    const fastest = [];
    for (const key of DIFF_KEYS) {
      const s = SaveData.stats[key] || emptyStats();
      fastest.push(diffOf(key).name + ' ' + (s.bestClear > 0 ? fmtRunTime(s.bestClear) : '—'));
    }
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = 'rgba(142,242,255,0.9)';
    ctx.fillText('最快通关  ' + fastest.join(' · '), W / 2, y + DIFF_KEYS.length * 18);

    ctx.fillStyle = 'rgba(255,209,102,0.85)';
    ctx.fillText('总计  ' + SaveData.runs + ' 局 · ' + SaveData.totalKills + ' 杀 · ' + fmtClock(SaveData.totalTime), W / 2, y + (DIFF_KEYS.length + 1) * 18);
  }

  function showStats() {
    if (G.state !== 'menu') return;
    G.state = 'stats';
    G.uiButtons.length = 0;
  }

  function fmtNum(n) {
    return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function buyListParts(kind) {
    const src = SaveData.detail.buys[kind] || {};
    const parts = [];
    for (const key of Object.keys(src)) {
      const n = src[key];
      if (!n) continue;
      let name = key;
      if (kind === 'cpu') name = (CPUS[+key] || {}).name || ('CPU ' + key);
      else if (kind === 'gpu') name = (GPUS[+key] || {}).name || ('GPU ' + key);
      else if (kind === 'ram') name = (RAMS[+key] || {}).name || ('RAM ' + key);
      else if (kind === 'ssd') name = (SSDS[+key] || {}).name || ('SSD ' + key);
      else if (kind === 'software') {
        const sw = SOFTWARES.find((s) => s.id === key);
        name = sw ? sw.name : key;
      }
      parts.push(name + ' ×' + n);
    }
    return parts.length ? parts : ['还没买过'];
  }

  // 按「整件物品」换行，避免把型号从中间劈开
  function drawItemsLeft(items, x, y, maxW, lh) {
    let line = '', yy = y, lines = 0;
    for (const item of items) {
      const candidate = line ? line + '、' + item : item;
      if (line && ctx.measureText(candidate).width > maxW) {
        ctx.fillText(line, x, yy); lines++; yy += lh; line = item;
      } else line = candidate;
    }
    if (line) { ctx.fillText(line, x, yy); lines++; }
    return lines;
  }

  // ----- 统计数据 -----
  function drawStats() {
    G.uiButtons.length = 0;
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.font = 'bold 36px ' + FONT;
    ctx.fillStyle = '#8ef2ff';
    ctx.fillText('统计数据', W / 2, 58);
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = 'rgba(170,195,230,0.8)';
    ctx.fillText('当前存档从第一次游玩到现在的累计', W / 2, 88);

    ctx.fillStyle = 'rgba(8,14,26,0.9)';
    ctx.strokeStyle = 'rgba(90,130,180,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(52, 112, 588, 512, 14); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(660, 112, 568, 512, 14); ctx.fill(); ctx.stroke();

    const d = SaveData.detail;
    const k = d.kills;
    const totalKills = k.worm + k.trojan + k.leak + k.boss;

    ctx.textAlign = 'left';
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('总体', 76, 148);

    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = 'rgba(205,228,255,0.9)';
    const lx = 76;
    ctx.fillText('总局数 ' + SaveData.runs + '  ·  通关 ' + d.wins + '  ·  阵亡 ' + d.deaths, lx, 178);
    ctx.fillText('总时长 ' + fmtClock(SaveData.totalTime) + '  ·  总伤害 ' + fmtNum(d.damage), lx, 204);
    ctx.fillText('获得矿币 ' + fmtNum(d.goldEarned) + '  ·  花费矿币 ' + fmtNum(d.goldSpent), lx, 230);
    ctx.fillText('显卡技能 ' + fmtNum(d.skills) + ' 次  ·  软件释放 ' + fmtNum(d.softwareUses) + ' 次', lx, 256);

    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('击杀', lx, 296);
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = 'rgba(205,228,255,0.9)';
    ctx.fillText('病毒 ' + fmtNum(k.worm) + '  ·  木马 ' + fmtNum(k.trojan) + '  ·  内存泄漏 ' + fmtNum(k.leak) + '  ·  Boss ' + fmtNum(k.boss), lx, 326);
    ctx.fillStyle = 'rgba(160,190,225,0.75)';
    ctx.fillText('合计 ' + fmtNum(totalKills) + ' 只', lx, 352);

    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('分难度', lx, 396);

    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = 'rgba(150,180,215,0.75)';
    const cols = [76, 168, 252, 336, 452, 552];
    const head = ['难度', '局数', '最高波', '击杀', '最长存活', '最快通关'];
    for (let i = 0; i < head.length; i++) ctx.fillText(head[i], cols[i], 422);

    for (let i = 0; i < DIFF_KEYS.length; i++) {
      const key = DIFF_KEYS[i];
      const s = SaveData.stats[key] || emptyStats();
      const dd = diffOf(key);
      const yy = 448 + i * 24;
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillStyle = s.runs > 0 ? dd.color : 'rgba(140,160,190,0.5)';
      ctx.fillText(dd.name, cols[0], yy);
      ctx.fillStyle = 'rgba(205,228,255,0.88)';
      ctx.fillText(String(s.runs), cols[1], yy);
      ctx.fillText(String(s.bestWave), cols[2], yy);
      ctx.fillText(fmtNum(s.bestKills), cols[3], yy);
      ctx.fillText(s.bestTime > 0 ? fmtClock(s.bestTime) : '—', cols[4], yy);
      ctx.fillText(s.bestClear > 0 ? fmtRunTime(s.bestClear) : '—', cols[5], yy);
    }
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = 'rgba(150,175,210,0.65)';
    ctx.fillText(suddenUnlocked() ? '突然死亡：只有 1 滴血，碰一下就死' : '突然死亡：通关一次困难模式后解锁（只有 1 滴血）', lx, 556);

    // 购买记录
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'left';
    ctx.fillText('购买记录', 684, 148);

    const kinds = [
      ['cpu', 'CPU 升级'],
      ['gpu', '显卡'],
      ['ram', '内存'],
      ['ssd', 'SSD'],
      ['software', '软件'],
    ];
    let by = 184;
    for (const [kind, label] of kinds) {
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = 'rgba(190,215,245,0.95)';
      ctx.fillText(label, 684, by);
      ctx.font = '13px ' + FONT;
      ctx.fillStyle = 'rgba(205,228,255,0.85)';
      const lines = drawItemsLeft(buyListParts(kind), 684, by + 22, 510, 18);
      by += 22 + lines * 18 + 14;
    }

    drawSmallButton('返回主菜单', W / 2 - 90, H - 62, 180, 38, backToMenu);
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h > 0 ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  // 局内计时：mm:ss.cc，专门给凹时间的玩家看
  function fmtRunTime(sec) {
    sec = Math.max(0, sec || 0);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.floor((sec * 100) % 100);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + (cs < 10 ? '0' : '') + cs;
  }

  function drawSmallButton(label, x, y, w, h, action) {
    const hov = mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + h;
    ctx.save();
    ctx.fillStyle = hov ? 'rgba(30,52,80,0.95)' : 'rgba(14,26,44,0.85)';
    ctx.strokeStyle = hov ? 'rgba(142,242,255,0.7)' : 'rgba(130,160,200,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 9); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(205,225,248,0.9)';
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    G.uiButtons.push({ x, y, w, h, action });
  }

  function drawMenuButton(label, x, y, w, h, accent, action) {
    const hov = mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + h;
    ctx.save();
    ctx.shadowBlur = hov ? 22 : 10;
    ctx.shadowColor = accent;
    ctx.fillStyle = hov ? 'rgba(24,48,74,0.96)' : 'rgba(12,24,42,0.9)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = hov ? 2.4 : 1.8;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf3ff';
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    G.uiButtons.push({ x, y, w, h, action });
  }

  // ----- 商店 -----
  function drawShop() {
    ctx.fillStyle = 'rgba(3,6,14,0.94)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px ' + FONT;
    ctx.fillStyle = '#8ef2ff';
    ctx.fillText('第 ' + Math.max(1, G.wave - 1) + ' 波结束 · 装机时间', W / 2, 92);
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('◈ 金币 ' + G.gold + '   ·   钱够就能连买，买完点下面继续', W / 2, 128);

    G.uiButtons.length = 0;
    const cards = G.shopCards;
    const gap = 24;
    const cw = Math.min(300, (W - 120 - gap * Math.max(0, cards.length - 1)) / Math.max(1, cards.length));
    const chh = 392;
    const sc = cw / 300;
    const totalW = cards.length * cw + Math.max(0, cards.length - 1) * gap;
    let x0 = W / 2 - totalW / 2;

    for (const c of cards) {
      const y0 = 168;
      const hover = mouse.x > x0 && mouse.x < x0 + cw && mouse.y > y0 && mouse.y < y0 + chh;
      const afford = G.gold >= c.cost;
      const col = c.kind === 'cpu' ? '#7dffd4' : c.kind === 'gpu' ? '#ff8ad8' : '#ffd166';

      ctx.save();
      ctx.shadowBlur = hover ? 30 : 12;
      ctx.shadowColor = col;
      ctx.fillStyle = hover ? 'rgba(18,30,54,0.98)' : 'rgba(12,20,38,0.96)';
      ctx.beginPath(); ctx.roundRect(x0, y0, cw, chh, 16); ctx.fill();
      ctx.strokeStyle = afford ? col : 'rgba(120,135,160,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x0, y0, cw, chh, 16); ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillStyle = col;
      ctx.fillText(c.title, x0 + cw / 2, y0 + 34);

      drawShopIcon(c, x0 + cw / 2, y0 + 112, Math.min(120, cw * 0.56));

      ctx.font = 'bold ' + Math.round(21 * Math.max(0.72, sc)) + 'px ' + FONT;
      ctx.fillStyle = '#eaf3ff';
      wrapText(c.name, x0 + cw / 2, y0 + 202, cw - 26, 24);

      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = 'rgba(180,205,235,0.85)';
      wrapText(c.tag, x0 + cw / 2, y0 + 230, cw - 44, 20);

      // 这件配件到底改了什么属性
      const info = [];
      if (c.kind === 'cpu') {
        const cur = CPUS[G.cpuIdx], nxt = CPUS[c.idx];
        info.push('射速 ' + (1 / cur.interval).toFixed(1) + ' → ' + (1 / nxt.interval).toFixed(1) + ' 发/秒');
        info.push('伤害 ' + cur.dmg + ' → ' + nxt.dmg + ' · 弹道 ' + cur.count + ' → ' + nxt.count);
        if (nxt.pierce !== cur.pierce) info.push('穿透 ' + cur.pierce + ' → ' + nxt.pierce);
      } else if (c.kind === 'gpu') {
        info.push('技能：' + (SKILL_NAMES[GPUS[c.idx].skill] || '无'));
        info.push('蓝耗 ' + GPUS[c.idx].mana + ' · 冷却 ' + GPUS[c.idx].cd.toFixed(1) + ' 秒');
        info.push('技能伤害看 CPU');
      } else if (c.kind === 'ram') {
        info.push('蓝上限 ' + ram().maxMana + ' → ' + RAMS[c.idx].maxMana);
        info.push('回蓝 ' + ram().regen + ' → ' + RAMS[c.idx].regen + ' /秒');
        info.push('冷却缩短 ' + (G.ramIdx * 5.5).toFixed(1) + '% → ' + (c.idx * 5.5).toFixed(1) + '%');
      } else if (c.kind === 'ssd') {
        info.push('能同时携带 ' + SSDS[c.idx].slots + ' 个主动技能');
        info.push('装满后新软件顶掉最旧的');
      } else if (c.kind === 'software') {
        info.push('冷却 ' + c.sw.cd + ' 秒 · 占 1 槽');
      }

      ctx.font = '13px ' + FONT;
      ctx.fillStyle = 'rgba(150,175,210,0.85)';
      if (c.kind === 'software') {
        ctx.fillText(info[0], x0 + cw / 2, y0 + 272);
        ctx.font = '12px ' + FONT;
        ctx.fillStyle = c.sw.color;
        wrapText(c.sw.desc, x0 + cw / 2, y0 + 292, cw - 26, 15);
      } else {
        for (let i = 0; i < info.length && i < 3; i++) {
          ctx.fillText(info[i], x0 + cw / 2, y0 + 272 + i * 17);
        }
      }

      ctx.font = 'bold 24px ' + FONT;
      ctx.fillStyle = afford ? '#ffd166' : '#5a6478';
      ctx.fillText('◈ ' + c.cost, x0 + cw / 2, y0 + 348);

      if (!afford) {
        ctx.font = 'bold 13px ' + FONT;
        ctx.fillStyle = 'rgba(255,90,90,0.85)';
        ctx.fillText('金币不够', x0 + cw / 2, y0 + 372);
      }

      G.uiButtons.push({ x: x0, y: y0, w: cw, h: chh, action: () => buyCard(c) });
      x0 += cw + gap;
    }

    const skW = 190, skH = 48, skX = W / 2 - skW / 2, skY = 582;
    const hov = mouse.x > skX && mouse.x < skX + skW && mouse.y > skY && mouse.y < skY + skH;
    ctx.fillStyle = hov ? 'rgba(60,80,110,0.9)' : 'rgba(30,42,64,0.9)';
    ctx.beginPath(); ctx.roundRect(skX, skY, skW, skH, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(140,170,210,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(skX, skY, skW, skH, 10); ctx.stroke();
    ctx.fillStyle = '#cfe3ff';
    ctx.font = 'bold 17px ' + FONT;
    ctx.fillText('装好，继续战斗', skX + skW / 2, skY + skH / 2 + 1);
    G.uiButtons.push({ x: skX, y: skY, w: skW, h: skH, action: continueWave });

    if (G.shopHintT > 0) {
      G.shopHintT -= 1 / 60;
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillStyle = 'rgba(255,120,120,0.95)';
      ctx.fillText(G.shopHint, W / 2, 646);
    }
  }

  function drawShopIcon(c, cx, cy, size) {
    if (c.kind === 'software') {
      const col = c.sw.color;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.shadowBlur = 16;
      ctx.shadowColor = col;
      ctx.fillStyle = 'rgba(12,22,44,0.95)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-46, -46, 92, 92, 12); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      // 窗口三条杠
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.roundRect(-32, -32, 64, 12, 4); ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.roundRect(-32, -14, 64, 9, 4); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-32, 1, 44, 9, 4); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = 'bold 17px ' + FONT;
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.fillText('SW', 0, 33);
      ctx.restore();
      return;
    }
    if (c.kind === 'ssd') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#8ef2ff';
      ctx.fillStyle = '#1a2740';
      ctx.strokeStyle = '#8ef2ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-60, -38, 120, 76, 8); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#2f4062';
      ctx.beginPath(); ctx.roundRect(-48, -26, 70, 52, 4); ctx.fill();
      ctx.fillStyle = '#8ef2ff';
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 3; i++) { ctx.fillRect(30, -20 + i * 14, 16, 8); }
      ctx.globalAlpha = 1;
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillStyle = '#cfe9ff';
      ctx.textAlign = 'center';
      ctx.fillText('SSD', -13, 6);
      ctx.restore();
      return;
    }
    if (c.kind === 'gpu') {
      const img = ASSETS['gpu_' + c.idx];
      if (img && img.complete && img.naturalWidth) {
        const hh = size * 0.70;
        const ww = img.width / img.height * hh;
        const k = Math.min(1, (size * 1.12) / ww);
        ctx.drawImage(img, cx - (ww * k) / 2, cy - (hh * k) / 2, ww * k, hh * k);
        return;
      }
      // 没图时画个通用卡
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#2a3550';
      ctx.strokeStyle = '#ff8ad8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-58, -26, 116, 52, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8ad8';
      ctx.beginPath(); ctx.arc(-26, 0, 15, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(26, 0, 15, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    if (c.kind === 'cpu') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#243050';
      ctx.strokeStyle = '#7dffd4';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-46, -46, 92, 92, 8); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#7dffd4';
      ctx.beginPath(); ctx.roundRect(-32, -32, 64, 64, 4); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillStyle = '#cfe3ff';
      ctx.textAlign = 'center';
      ctx.fillText('CPU', 0, 2);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#2a3550';
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-66, -26, 132, 52, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 4; i++) ctx.fillRect(-56 + i * 31, -16, 22, 32);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText('RAM', 0, 5);
    ctx.restore();
  }

  function affordabilityStroke(afford, col) {
    return afford ? col : 'rgba(120,135,160,0.5)';
  }

  function wrapText(text, cx, y, maxW, lh) {
    const chars = Array.from(text);
    let line = '', yy = y;
    for (const ch of chars) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = ch; yy += lh;
      } else line += ch;
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  // ----- 成就 UI -----
  function alphaColor(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function drawAchievementBadge(a, cx, cy, size, unlocked) {
    const r = RARITIES[a.rarity] || RARITIES.common;
    const rad = size / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (unlocked) { ctx.shadowBlur = 16; ctx.shadowColor = alphaColor(r.color, 0.55); }
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 3;
      const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = unlocked ? alphaColor(r.color, 0.16) : 'rgba(80,95,120,0.18)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = unlocked ? r.color : 'rgba(125,145,175,0.34)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = unlocked ? r.color : 'rgba(145,165,195,0.55)';
    const fs = a.badge.length >= 3 ? Math.max(9, Math.round(size * 0.22)) : Math.round(size * 0.28);
    ctx.font = 'bold ' + fs + 'px ' + FONT_MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.badge, 0, 1);
    ctx.restore();
  }

  function drawRarityPill(a, x, y, fontPx) {
    const r = RARITIES[a.rarity] || RARITIES.common;
    const fs = fontPx || 10;
    ctx.save();
    ctx.font = 'bold ' + fs + 'px ' + FONT;
    const w = ctx.measureText(r.name).width + 14, h = fs + 7;
    ctx.fillStyle = alphaColor(r.color, 0.13);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = alphaColor(r.color, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = r.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.name, x + 7, y + h / 2 + 0.5);
    ctx.restore();
    return w;
  }

  function achievementDate(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' +
      String(d.getDate()).padStart(2, '0');
  }

  function drawAchievementCard(a, x, y, w, h) {
    const unlocked = achievementUnlocked(a);
    const r = RARITIES[a.rarity] || RARITIES.common;
    ctx.save();
    ctx.fillStyle = unlocked ? 'rgba(10,18,32,0.95)' : 'rgba(8,12,22,0.72)';
    ctx.strokeStyle = unlocked ? alphaColor(r.color, 0.6) : 'rgba(80,100,130,0.28)';
    ctx.lineWidth = 1.3;
    if (unlocked) { ctx.shadowBlur = 12; ctx.shadowColor = alphaColor(r.color, 0.18); }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();

    drawAchievementBadge(a, x + 44, y + h / 2, 52, unlocked);

    const tx = x + 82;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = unlocked ? '#eaf3ff' : 'rgba(170,190,215,0.7)';
    ctx.fillText(a.name, tx, y + 27);
    const nameW = ctx.measureText(a.name).width;
    drawRarityPill(a, Math.min(tx + nameW + 10, x + w - 140), y + 15, 10);

    ctx.font = '12px ' + FONT;
    ctx.fillStyle = unlocked ? 'rgba(205,225,248,0.88)' : 'rgba(160,180,205,0.55)';
    ctx.fillText(a.desc, tx, y + 50);

    ctx.font = '11px ' + FONT;
    ctx.fillStyle = unlocked ? 'rgba(150,180,215,0.85)' : 'rgba(140,160,190,0.5)';
    ctx.fillText('条件：' + a.condition, tx, y + 73);

    ctx.textAlign = 'right';
    ctx.font = 'bold 11px ' + FONT;
    ctx.fillStyle = unlocked ? r.color : 'rgba(135,155,185,0.55)';
    ctx.fillText(unlocked ? '✓ 已解锁' : '未解锁', x + w - 16, y + 26);
    if (unlocked) {
      ctx.font = '10px ' + FONT;
      ctx.fillStyle = 'rgba(150,175,205,0.65)';
      ctx.fillText(achievementDate(SaveData.achievements[a.id]), x + w - 16, y + 45);
    }
  }

  function drawAchievements() {
    G.uiButtons.length = 0;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(16,30,52,0.55)');
    bg.addColorStop(0.55, 'rgba(5,7,13,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 38px ' + FONT;
    ctx.fillStyle = '#8ef2ff';
    ctx.fillText('成就', W / 2, 56);
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = 'rgba(170,195,230,0.75)';
    ctx.fillText('装机之路，每一步都算数', W / 2, 82);

    const total = ACHIEVEMENTS.length;
    const unlocked = unlockedAchievementCount();
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(unlocked + ' / ' + total, W - 52, 56);

    const pw = 320, px = W / 2 - pw / 2, py = 96;
    ctx.fillStyle = 'rgba(80,110,150,0.25)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, 6, 3); ctx.fill();
    if (unlocked) {
      const g = ctx.createLinearGradient(px, 0, px + pw, 0);
      g.addColorStop(0, '#8ef2ff');
      g.addColorStop(1, '#ffd166');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(px, py, pw * unlocked / total, 6, 3); ctx.fill();
    }

    const pageSize = 8;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    G.achvPage = clamp(G.achvPage || 0, 0, pages - 1);
    const start = G.achvPage * pageSize;
    const items = ACHIEVEMENTS.slice(start, start + pageSize);
    const cw = 586, chh = 96, gapX = 24, gapY = 14;
    const x0 = (W - (cw * 2 + gapX)) / 2;
    const y0 = 120;
    items.forEach((a, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      drawAchievementCard(a, x0 + col * (cw + gapX), y0 + row * (chh + gapY), cw, chh);
    });

    if (pages > 1) {
      drawSmallButton('上一页', W / 2 - 180, 562, 100, 34, () => applyAchievementPage(-1));
      drawSmallButton('下一页', W / 2 + 80, 562, 100, 34, () => applyAchievementPage(1));
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px ' + FONT;
      ctx.fillStyle = 'rgba(180,205,235,0.8)';
      ctx.fillText('第 ' + (G.achvPage + 1) + ' / ' + pages + ' 页', W / 2, 581);
    }
    drawMenuButton(G.achvReturn === 'menu' ? '返回大厅' : '返回结算', W / 2 - 100, 610, 200, 44, '#8ef2ff', closeAchievements);
    ctx.textAlign = 'center';
    ctx.font = '11px ' + FONT;
    ctx.fillStyle = 'rgba(140,165,195,0.55)';
    ctx.fillText(pages > 1 ? '← → 切页 · Esc 返回' : 'Esc 返回', W / 2, 680);
  }

  function drawResultAchievementCard(a, x, y, w, h) {
    const r = RARITIES[a.rarity] || RARITIES.common;
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,26,0.94)';
    ctx.strokeStyle = alphaColor(r.color, 0.55);
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 14;
    ctx.shadowColor = alphaColor(r.color, 0.18);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();

    drawAchievementBadge(a, x + 40, y + 45, 50, true);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#eaf3ff';
    ctx.fillText(a.name, x + 74, y + 30);
    const nw = ctx.measureText(a.name).width;
    drawRarityPill(a, Math.min(x + 74 + nw + 8, x + w - 80), y + 18, 10);

    ctx.font = '11px ' + FONT;
    ctx.fillStyle = 'rgba(195,215,240,0.82)';
    wrapText(a.desc, x + 18, y + 92, w - 36, 14);
    ctx.textAlign = 'right';
    ctx.font = '10px ' + FONT;
    ctx.fillStyle = 'rgba(150,175,205,0.6)';
    ctx.fillText(achievementDate(SaveData.achievements[a.id]), x + w - 16, y + h - 12);
  }

  // ----- 结算 -----
  function drawRunResult(won) {
    G.uiButtons.length = 0;
    const dd = diffOf(G.difficulty);
    const dr = SaveData.stats[G.difficulty] || emptyStats();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = won ? '#04100c' : '#0a040a';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 260, 60, W / 2, 260, 720);
    glow.addColorStop(0, won ? 'rgba(35,95,82,0.18)' : 'rgba(105,22,34,0.16)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    if (won) {
      ctx.font = 'bold 54px ' + FONT;
      const g = ctx.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0);
      g.addColorStop(0, '#7dffd4');
      g.addColorStop(1, '#ffd166');
      ctx.fillStyle = g;
    } else {
      ctx.font = 'bold 56px ' + FONT;
      ctx.fillStyle = '#ff5a5a';
    }
    ctx.fillText(won ? '矿卡之王' : '蓝屏了', W / 2, 82);

    ctx.font = 'bold 17px ' + FONT;
    ctx.fillStyle = won ? 'rgba(210,235,255,0.9)' : 'rgba(210,200,220,0.85)';
    ctx.fillText(won ? '双芯核弹被你打回废品站，这波不亏' : '你的矿卡烧了，但数据还在硬盘里', W / 2, 118);

    const cy = 140, ch = 120;
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,26,0.86)';
    ctx.strokeStyle = 'rgba(90,130,180,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(140, cy, 1000, ch, 14); ctx.fill(); ctx.stroke();
    ctx.restore();

    const cols = [265, 515, 765, 1015];
    const labels = ['难度', won ? '用时' : '坚持', '波次', '击杀'];
    const values = [dd.name, fmtRunTime(G.playTime), '第 ' + G.wave + ' 波', String(G.kills)];
    for (let i = 0; i < 4; i++) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px ' + FONT;
      ctx.fillStyle = 'rgba(150,180,215,0.75)';
      ctx.fillText(labels[i], cols[i], cy + 26);
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillStyle = '#eaf3ff';
      ctx.fillText(values[i], cols[i], cy + 55);
    }

    ctx.textAlign = 'center';
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = 'rgba(185,210,235,0.85)';
    ctx.fillText('总伤害 ' + fmtNum(G.damageDealt) + '   ·   获得矿币 ' + fmtNum(G.goldEarned) +
      '   ·   显卡技能 ' + G.skillCasts + ' 次', W / 2, cy + 85);
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = 'rgba(255,209,102,0.85)';
    ctx.fillText('本难度纪录：第 ' + dr.bestWave + ' 波 · 击杀 ' + dr.bestKills, W / 2, cy + 106);

    const px = 140, py = 276, pw = 1000, ph = 246;
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,26,0.90)';
    ctx.strokeStyle = 'rgba(90,130,180,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 14); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('本局新成就', px + 24, py + 30);
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = 'rgba(180,205,235,0.8)';
    ctx.fillText('已解锁 ' + unlockedAchievementCount() + ' / ' + ACHIEVEMENTS.length, px + pw - 24, py + 29);

    const newList = (G.newAchievements || [])
      .map(achievementById)
      .filter(Boolean)
      .sort((a, b) => (RARITIES[b.rarity] || RARITIES.common).rank - (RARITIES[a.rarity] || RARITIES.common).rank);
    if (G.debugMode) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillStyle = 'rgba(255,150,150,0.85)';
      ctx.fillText('调试局不计入成就', W / 2, py + 120);
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = 'rgba(180,160,175,0.7)';
      ctx.fillText('正常对局结算时才会解锁成就。', W / 2, py + 145);
    } else if (!newList.length) {
      const allDone = unlockedAchievementCount() >= ACHIEVEMENTS.length;
      ctx.textAlign = 'center';
      ctx.font = 'bold 18px ' + FONT;
      ctx.fillStyle = allDone ? '#ffd166' : 'rgba(170,195,230,0.8)';
      ctx.fillText(allDone ? '全部成就已解锁' : '本局没有解锁新成就', W / 2, py + 115);
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = 'rgba(150,175,210,0.65)';
      ctx.fillText(allDone ? '装机世界已经被你走完了。' : '打开「查看全部成就」看看还差哪一步。', W / 2, py + 142);
    } else {
      const show = newList.slice(0, 3);
      const cw = 300, gap = 20;
      const totalW = show.length * cw + (show.length - 1) * gap;
      let ax = W / 2 - totalW / 2;
      for (const a of show) {
        drawResultAchievementCard(a, ax, py + 46, cw, 140);
        ax += cw + gap;
      }
      if (newList.length > 3) {
        ctx.textAlign = 'center';
        ctx.font = '12px ' + FONT;
        ctx.fillStyle = 'rgba(255,209,102,0.85)';
        ctx.fillText('另有 ' + (newList.length - 3) + ' 个新成就，点击「查看全部成就」查看', W / 2, py + 218);
      }
    }

    drawMenuButton('再来一局', W / 2 - 320, 546, 200, 46, '#8ef2ff', startNewGame);
    drawMenuButton('查看全部成就', W / 2 - 100, 546, 200, 46, '#ffd166', () => openAchievements(G.state));
    drawMenuButton('返回大厅', W / 2 + 120, 546, 200, 46, 'rgba(190,215,255,0.75)', () => {
      G.state = 'menu';
      G.uiButtons.length = 0;
    });

    ctx.textAlign = 'center';
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = 'rgba(150,175,210,0.6)';
    ctx.fillText('R 再来一局 · Esc 返回大厅', W / 2, 622);
    if (won && G.justUnlocked) {
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText('已解锁：突然死亡模式（只有 1 滴血）', W / 2, 650);
    }
  }

  function drawGameOver() {
    drawRunResult(false);
  }

  function drawWin() {
    drawRunResult(true);
  }

  // ---------------- 主循环 ----------------
  let last = performance.now();
  function loop(nowMs) {
    let dt = (nowMs - last) / 1000;
    last = nowMs;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 1 / 30);

    // 倍速：多跑几次固定步长的 update，而不是把 dt 放大，避免子弹/碰撞穿透
    const steps = G.speedMul || 1;
    for (let i = 0; i < steps; i++) update(dt);
    draw(dt);

    requestAnimationFrame(loop);
  }

  const game = {
    restart() {
      startNewGame();
    },
    click,
  };

  loadSave();
  loadAudioSettings();
  AC.muted = SaveData.muted;
  resetGame();
  G.state = 'menu';
  backfillAchievements(true);
  window.__GAME = G;   // 调试用，正式版无副作用
  window.__SAVE = SaveData;
  window.__ACHIEVEMENTS = ACHIEVEMENTS;
  window.__exportSaveText = exportSaveText;
  window.__importSaveText = importSaveText;

  // 调试/演示入口：?auto=1 直接开局，?wave=N 跳到第 N 波
  const qs = new URLSearchParams(location.search);
  if (qs.has('auto')) {
    resetGame();
    const w = parseInt(qs.get('wave') || '1', 10);
    if (w > 1) { G.wave = w - 1; nextWave(); }
    if (qs.has('gold')) G.gold = parseInt(qs.get('gold'), 10) || 0;
  }

  requestAnimationFrame(loop);
})();
