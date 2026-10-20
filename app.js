/* MVV Oefenapp — daily practice for the Basisexamen Inburgering Buitenland.
   Plain JavaScript, no build step. Content lives in content.json, progress in localStorage. */
'use strict';
(function () {
  // ---------------------------------------------------------------- constants
  const STORE_KEY = 'mvv-oefen-v1';
  const INTERVALS = { 2: 1, 3: 2, 4: 4, 5: 7 }; // Leitner box -> days until next review (box 1 = same session)
  const MAX_REVIEWS = 60;                         // per session; anything beyond stays due for tomorrow
  const TAPER_DAYS = 3;                           // no new cards when the exam is this many days away or fewer
  const REQUEUE_GAP = 3;                          // a missed card returns after this many other cards
  const REC_LIMIT_MS = 30000;

  const LINKS = {
    practiceEn: 'https://english.naarnederland.nl/taking-practice-exams',
    practiceNl: 'https://www.naarnederland.nl/oefenexamens-maken',
    selfStudy: 'https://www.naarnederland.nl/zelfstudiepakket/engels/zelfstudiepakket-engels/zelfstudiepakket-engels',
    scoring: 'https://www.naarnederland.nl/site/binaries/site-content/collections/documents/2026/examens/beoordelingsmodel-spreekvaardigheid/beoordelingsmodel-spreekvaardigheid-a1.pdf',
    itembank: 'https://www.naarnederland.nl/site/binaries/site-content/collections/documents/2026/examens/spreken-a1-maart-2024/totaalbestand-items-spreken-a1-maart-2024.pdf',
    ind: 'https://ind.nl/nl/basisexamen-inburgering-in-het-buitenland',
  };

  const DEFAULT_SETTINGS = {
    examDate: '2026-11-07',
    newPerDay: 15,
    wbPerDay: 5,          // new workbook cards per day, on top of newPerDay (0 = off)
    autoplay: true,
    voiceURI: '',
    rate: 0.85,
  };

  const PARTS = [
    { key: 'kns', label: 'KNS', sub: 'photobook + themes' },
    { key: 'speak', label: 'Speaking', sub: 'questions + sentences' },
    { key: 'word', label: 'Words', sub: 'A1 vocabulary' },
    { key: 'wb', label: 'Workbook', sub: 'lessons 21–65 + tests' },
  ];

  const TYPE_LABEL = {
    kns: 'KNS · photobook',
    theme: 'KNS · theme',
    speak: 'Speaking · question',
    complete: 'Speaking · finish the sentence',
    word: 'Word',
    wb: 'Workbook',
  };
  function typeLabel(it) {
    if (it.type !== 'wb') return TYPE_LABEL[it.type];
    return it.test ? `Workbook · test ${it.test}` : `Workbook · les ${it.lesson}`;
  }

  const ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>',
    replay: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/></svg>',
  };

  // ---------------------------------------------------------------- dates (local calendar days as YYYY-MM-DD)
  const params = new URLSearchParams(location.search);
  const pad = (n) => String(n).padStart(2, '0');
  function today() {
    const o = params.get('today'); // for testing only
    if (o && /^\d{4}-\d{2}-\d{2}$/.test(o)) return o;
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const asUTC = (s) => new Date(s + 'T00:00:00Z');
  function addDays(s, n) { const d = asUTC(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function diffDays(a, b) { return Math.round((asUTC(b) - asUTC(a)) / 86400000); }
  function fmtDate(s, opts) {
    try { return asUTC(s).toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, opts || { weekday: 'long', day: 'numeric', month: 'long' })); }
    catch (e) { return s; }
  }
  function daysToExam() {
    const e = state.settings.examDate;
    return /^\d{4}-\d{2}-\d{2}$/.test(e || '') ? diffDays(today(), e) : null;
  }

  // ---------------------------------------------------------------- storage
  let storageOk = true;
  function fresh() { return { v: 1, settings: Object.assign({}, DEFAULT_SETTINGS), cards: {}, days: {} }; }
  function normalise(s) {
    if (!s || typeof s !== 'object') return fresh();
    return {
      v: 1,
      settings: Object.assign({}, DEFAULT_SETTINGS, s.settings || {}),
      cards: s.cards && typeof s.cards === 'object' ? s.cards : {},
      days: s.days && typeof s.days === 'object' ? s.days : {},
    };
  }
  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return normalise(JSON.parse(raw)); }
    catch (e) { storageOk = false; }
    return fresh();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); storageOk = true; }
    catch (e) { storageOk = false; }
  }
  function dayRec(d) {
    if (!state.days[d]) state.days[d] = { reviews: 0, newCount: 0, done: false };
    return state.days[d];
  }
  let persistAsked = false;
  function askPersist() {
    if (persistAsked) return; persistAsked = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
  }

  let state = load();

  // ---------------------------------------------------------------- content
  let DECKS = [];
  const ITEM = {};
  let WB_LESSON = {};
  function buildDecks(c, qdata, wb) {
    // KNS photobook questions come from assets/data/questions.json (made by tools/extract_photobook.py).
    // Card ids stay k001…k100 so existing progress carries over. The two example questions are not cards.
    const kns = (qdata.questions || []).filter((q) => !q.example).map((q) => ({
      id: 'k' + String(q.number).padStart(3, '0'),
      n: q.number,
      question: q.question,
      options: q.options,
      correct: q.correct,
      answer: q.answer,
      image: q.image,
    }));
    DECKS = [
      { type: 'kns', part: 'kns', weight: 1.6, items: kns },
      { type: 'theme', part: 'kns', weight: 6, items: c.knsThemes || [] },
      { type: 'speak', part: 'speak', weight: 1.3, items: c.speakQuestions || [] },
      { type: 'complete', part: 'speak', weight: 1.1, items: c.completions || [] },
      { type: 'word', part: 'word', weight: 0.8, items: c.words || [] },
      // Workbook exercises (assets/data/workbook.json, made by tools/extract_workbook.py).
      // Own daily allowance (wbPerDay), introduced in book order.
      { type: 'wb', part: 'wb', extra: true, items: (wb && wb.items) || [] },
    ];
    WB_LESSON = {};
    ((wb && wb.lessons) || []).forEach((l) => { WB_LESSON[l.lesson] = l; });
    DECKS.forEach((d) => d.items.forEach((it) => { ITEM[it.id] = Object.assign({ type: d.type, part: d.part }, it); }));
  }
  async function getJson(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  }
  async function loadContent() {
    const [content, questions, workbook] = await Promise.all([
      window.MVV_CONTENT || getJson('content.json'),
      window.MVV_QUESTIONS || getJson('assets/data/questions.json'),
      window.MVV_WORKBOOK || getJson('assets/data/workbook.json'),
    ]);
    return { content, questions, workbook };
  }

  // ---------------------------------------------------------------- scheduling
  // The pace advice is about the core decks; workbook cards have their own allowance.
  function unseenCount() { return Object.keys(ITEM).filter((id) => !state.cards[id] && ITEM[id].part !== 'wb').length; }

  function newBudget(day) {
    const d = day || today();
    const left = state.settings.examDate ? diffDays(d, state.settings.examDate) : null;
    if (left !== null && left >= 0 && left <= TAPER_DAYS) return 0;
    const used = (state.days[d] && state.days[d].newCount) || 0;
    return Math.max(0, Number(state.settings.newPerDay) - used);
  }
  function wbBudget(day) {
    const d = day || today();
    const left = state.settings.examDate ? diffDays(d, state.settings.examDate) : null;
    if (left !== null && left >= 0 && left <= TAPER_DAYS) return 0;
    const used = (state.days[d] && state.days[d].wbNew) || 0;
    return Math.max(0, Number(state.settings.wbPerDay || 0) - used);
  }
  // Next unseen workbook cards, in book order.
  function pickWb(n, exclude) {
    const deck = DECKS.find((d) => d.type === 'wb');
    if (!deck || n <= 0) return [];
    const skip = exclude || new Set();
    const out = [];
    for (const it of deck.items) {
      if (out.length >= n) break;
      if (!state.cards[it.id] && !skip.has(it.id)) out.push(it.id);
    }
    return out;
  }

  // Spread new cards across decks, weighted by priority and by how much is left in each deck.
  function pickNew(n, exclude) {
    const skip = exclude || new Set();
    const pools = DECKS.filter((d) => !d.extra)
      .map((d) => ({ d, list: d.items.filter((it) => !state.cards[it.id] && !skip.has(it.id)), taken: 0 }));
    const out = [];
    for (let i = 0; i < n; i++) {
      let best = null, bestScore = 0;
      for (const p of pools) {
        const rem = p.list.length - p.taken;
        if (rem <= 0) continue;
        const score = (p.d.weight * rem) / (p.taken + 1);
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (!best) break;
      out.push(best.list[best.taken++].id);
    }
    return out;
  }

  function dueIds(onOrBefore) {
    const t = onOrBefore || today();
    return Object.keys(state.cards)
      .filter((id) => ITEM[id] && state.cards[id].due <= t)
      .sort((a, b) => {
        const A = state.cards[a], B = state.cards[b];
        return A.box - B.box || (A.due < B.due ? -1 : A.due > B.due ? 1 : 0);
      });
  }

  function plan() {
    const rev = dueIds().slice(0, MAX_REVIEWS);
    const nw = pickNew(newBudget()).concat(pickWb(wbBudget()));
    return { rev, nw };
  }

  // Mix card types so the same kind rarely comes twice in a row. Reviews stay ahead of new cards per type.
  function interleave(ids) {
    const groups = {};
    ids.forEach((id) => { const t = ITEM[id].type; (groups[t] = groups[t] || []).push(id); });
    const out = [];
    let last = null;
    while (out.length < ids.length) {
      const keys = Object.keys(groups).filter((k) => groups[k].length).sort((a, b) => groups[b].length - groups[a].length);
      const k = keys.find((x) => x !== last) || keys[0];
      out.push(groups[k].shift());
      last = k;
    }
    return out;
  }

  // Days in a row with a finished session. One missed day per 7 days is forgiven (a "repair day"),
  // as long as the day before it was a practice day.
  function streakInfo() {
    const isDone = (d) => !!(state.days[d] && state.days[d].done);
    const doneDays = Object.keys(state.days).filter(isDone).sort();
    const repairs = new Set();
    if (!doneDays.length) return { count: 0, repairs };
    const first = doneDays[0];
    const t = today();
    let d = isDone(t) ? t : addDays(t, -1);
    let count = 0, lastRepair = null, guard = 0;
    while (d >= first && guard++ < 2000) {
      if (isDone(d)) count++;
      else {
        const weekFree = lastRepair === null || diffDays(d, lastRepair) >= 7;
        if (weekFree && isDone(addDays(d, -1))) { repairs.add(d); lastRepair = d; }
        else break;
      }
      d = addDays(d, -1);
    }
    return { count, repairs };
  }

  function partStats(part) {
    let total = 0, seen = 0, solid = 0;
    Object.values(ITEM).forEach((it) => {
      if (it.part !== part) return;
      total++;
      const c = state.cards[it.id];
      if (c) { seen++; if (c.box >= 3) solid++; }
    });
    return { total, seen, solid };
  }

  // ---------------------------------------------------------------- speech
  let currentAudio = null;
  const Speech = {
    voices: [],
    supported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; },
    init() {
      if (!this.supported()) return;
      const update = () => {
        try { this.voices = speechSynthesis.getVoices().filter((v) => /^nl([-_]|$)/i.test(v.lang)); } catch (e) { this.voices = []; }
        if (screen === 'settings') render();
      };
      update();
      try { speechSynthesis.addEventListener('voiceschanged', update); } catch (e) { speechSynthesis.onvoiceschanged = update; }
      setTimeout(update, 600);
    },
    voice() {
      const s = state.settings.voiceURI;
      return this.voices.find((v) => v.voiceURI === s)
        || this.voices.find((v) => /nl[-_]NL/i.test(v.lang))
        || this.voices[0] || null;
    },
    clean(text) { return String(text || '').replace(/\.\.\.|…/g, ', ').replace(/\s+/g, ' ').trim(); },
    speak(text, audioUrl) {
      stopSound();
      if (audioUrl) { currentAudio = new Audio(audioUrl); currentAudio.play().catch(() => {}); return; }
      if (!this.supported()) { toast('This browser cannot read text aloud.'); return; }
      const u = new SpeechSynthesisUtterance(this.clean(text));
      const v = this.voice();
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'nl-NL';
      u.rate = Number(state.settings.rate) || 0.85;
      speechSynthesis.speak(u);
    },
  };
  function stopSound() {
    try { if (Speech.supported()) speechSynthesis.cancel(); } catch (e) {}
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
  }

  // ---------------------------------------------------------------- recorder (kept in memory only)
  const Rec = {
    mr: null, stream: null, timer: null,
    supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); },
    mime() {
      const options = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      try { return options.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || ''; } catch (e) { return ''; }
    },
    async start() {
      stopSound();
      clearRecording();
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        ui.recError = window.MVV_PREVIEW
          ? 'Recording is switched off in this preview. It works in the app on GitHub Pages.'
          : location.protocol === 'https:' || location.hostname === 'localhost'
          ? 'The microphone is blocked. Allow microphone access for this site in your browser settings.'
          : 'Recording only works when the app is opened over https (for example on GitHub Pages).';
        render();
        return;
      }
      const mime = this.mime();
      const chunks = [];
      try { this.mr = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined); }
      catch (e) { this.mr = new MediaRecorder(this.stream); }
      this.mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      this.mr.onstop = () => {
        clearTimeout(this.timer);
        this.release();
        const blob = new Blob(chunks, { type: (this.mr && this.mr.mimeType) || mime || 'audio/webm' });
        if (blob.size) ui.recUrl = URL.createObjectURL(blob);
        ui.recState = 'idle';
        this.mr = null;
        render();
      };
      this.mr.start();
      ui.recState = 'recording';
      ui.recError = null;
      this.timer = setTimeout(() => this.stop(), REC_LIMIT_MS);
      render();
    },
    stop() { if (this.mr && this.mr.state !== 'inactive') this.mr.stop(); },
    release() { if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; } },
    cancel() {
      clearTimeout(this.timer);
      if (this.mr && this.mr.state !== 'inactive') { this.mr.onstop = null; try { this.mr.stop(); } catch (e) {} }
      this.mr = null; this.release(); ui.recState = 'idle';
    },
  };
  function clearRecording() { if (ui.recUrl) { URL.revokeObjectURL(ui.recUrl); ui.recUrl = null; } }
  function playRecording() {
    if (!ui.recUrl) return;
    stopSound();
    currentAudio = new Audio(ui.recUrl);
    currentAudio.play().catch(() => toast('Could not play the recording.'));
  }

  // ---------------------------------------------------------------- ui state
  let screen = 'loading';    // loading | today | session | done | settings | error
  let session = null;        // { queue, done:Set, again, total, kind }
  let ui = {};
  let lastSession = null;
  let confirmReset = false, pendingImport = null, prevScreen = 'today';
  function resetCardUi() {
    Rec.cancel();
    clearRecording();
    ui = { revealed: false, showText: false, choice: null, lessonOpen: false, recState: 'idle', recUrl: null, recError: null };
  }
  resetCardUi();

  const $app = document.getElementById('app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }

  // ---------------------------------------------------------------- screens
  function render() {
    if (screen === 'today') renderToday();
    else if (screen === 'session') renderSession();
    else if (screen === 'done') renderDone();
    else if (screen === 'settings') renderSettings();
  }

  function topBar(left) {
    return `<header class="bar"><div class="brand">MVV <span>oefenen</span></div>${left || ''}
      <button class="icon-btn" data-action="settings" aria-label="Settings">${ICON.gear}</button></header>`;
  }

  function countdownHtml() {
    const left = daysToExam();
    const date = state.settings.examDate;
    if (left === null) return `<div class="countdown past"><div class="num">–</div><div class="what">No exam date set<span class="when">Add it in Settings</span></div></div>`;
    if (left < 0) return `<div class="countdown past"><div class="num">✓</div><div class="what">Exam day has passed<span class="when">${esc(fmtDate(date))}</span></div></div>`;
    if (left === 0) return `<div class="countdown"><div class="num">0</div><div class="what">Exam today. Succes!<span class="when">${esc(fmtDate(date))}</span></div></div>`;
    return `<div class="countdown"><div class="num">${left}</div><div class="what">${left === 1 ? 'day' : 'days'} to your exam<span class="when">${esc(fmtDate(date))}</span></div></div>`;
  }

  function weekStrip(info) {
    const t = today();
    let html = '';
    for (let i = 6; i >= 0; i--) {
      const d = addDays(t, -i);
      const done = state.days[d] && state.days[d].done;
      const cls = [done ? 'on' : info.repairs.has(d) ? 'repair' : '', d === t ? 'is-today' : ''].join(' ').trim();
      const letter = fmtDate(d, { weekday: 'narrow' });
      const title = `${fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })}: ${done ? 'practised' : info.repairs.has(d) ? 'repair day' : 'no session'}`;
      html += `<i class="${cls}" title="${esc(title)}">${esc(letter)}</i>`;
    }
    return html;
  }

  function renderToday() {
    const t = today();
    const p = plan();
    const day = state.days[t] || { reviews: 0, newCount: 0, done: false };
    const left = daysToExam();
    const taper = left !== null && left >= 0 && left <= TAPER_DAYS;
    const info = streakInfo();
    const total = p.rev.length + p.nw.length;

    let main;
    if (day.done && total === 0) {
      main = `<h2>Today's session is done. Goed gedaan!</h2>
        <p class="note">${day.reviews} answers today. New cards come back tomorrow.</p>
        ${extraButtons(taper)}`;
    } else if (total === 0) {
      main = `<h2>Nothing to review right now</h2>
        <p class="note">${unseenCount() ? 'All due cards are done.' : 'You have seen every card.'}</p>
        ${extraButtons(taper)}`;
    } else {
      const mins = Math.max(3, Math.round(p.rev.length * 0.35 + p.nw.length * 0.6));
      main = `<h2>${day.reviews ? 'Continue today’s session' : 'Today’s session'}</h2>
        <div class="counts">
          ${p.rev.length ? `<span class="chip delft">${p.rev.length} to review</span>` : ''}
          ${p.nw.length ? `<span class="chip">${p.nw.length} new</span>` : ''}
          <span class="chip">about ${mins} min</span>
        </div>
        <button class="btn primary block" data-action="start">Start session</button>`;
    }

    const parts = PARTS.map((part) => {
      const s = partStats(part.key);
      const solidPct = s.total ? (s.solid / s.total) * 100 : 0;
      const seenPct = s.total ? ((s.seen - s.solid) / s.total) * 100 : 0;
      return `<div class="part"><div class="name">${part.label}<small>${part.sub}</small></div>
        <div class="fig"><b>${s.seen}</b> / ${s.total} seen${s.solid ? ` · ${s.solid} known` : ''}</div>
        <div class="meter" role="img" aria-label="${part.label}: ${s.solid} known, ${s.seen} seen, ${s.total} total">
          <div class="solid" style="width:${solidPct.toFixed(1)}%"></div><div class="seen" style="width:${seenPct.toFixed(1)}%"></div>
        </div></div>`;
    }).join('');

    // pace: will every card have been introduced before the taper starts?
    let pace = '';
    const unseen = unseenCount();
    if (left !== null && left > TAPER_DAYS && unseen > 0) {
      const daysForNew = left - TAPER_DAYS;
      const capacity = daysForNew * Number(state.settings.newPerDay) - day.newCount;
      if (capacity < unseen) {
        const need = Math.ceil((unseen + day.newCount) / daysForNew);
        pace = `<div class="aside"><p><strong>${unseen} cards not seen yet.</strong> At ${state.settings.newPerDay} new cards a day you will see about ${Math.max(0, capacity)} of them before the exam.</p>
          <p>New cards are spread over all parts every day (KNS gets the biggest share), so each part would keep some unseen cards. To see every card before the exam, choose ${need} a day in Settings.</p></div>`;
      }
    }

    let phase = '';
    if (taper && left >= 0) phase = `<div class="phase"><strong>Review only.</strong> With ${left === 0 ? 'the exam today' : left + (left === 1 ? ' day' : ' days') + ' to go'}, no new cards: just strengthen what you know. Do the official practice exams once more.</div>`;

    let banner = '';
    if (!storageOk) banner = `<div class="banner"><strong>Progress can't be saved in this browser.</strong> Private browsing may be on. Open the app in a normal window.</div>`;
    else if (isIOS() && !isStandalone()) banner = `<div class="banner"><strong>Add this app to your Home Screen.</strong> Safari may delete the progress of websites you haven't opened for 7 days. In Safari tap Share, then <em>Add to Home Screen</em>.</div>`;

    $app.className = 'app';
    $app.innerHTML = `${topBar()}
      ${countdownHtml()}
      ${banner}
      ${phase}
      <section class="today" aria-label="Today">${main}
        <div class="streak"><div class="week">${weekStrip(info)}</div>
          <div><b>${info.count}</b> ${info.count === 1 ? 'day' : 'days'} in a row</div></div>
      </section>
      <section class="parts" aria-label="Progress per exam part">
        <h3 class="section-title">Progress</h3>
        ${parts}
        <div class="legend"><span>known well</span><span class="l-seen">seen</span></div>
        <p class="small">A card counts as known well after you knew it on two different days.</p>
      </section>
      ${pace}
      <div class="aside"><p><strong>Reading (Lezen) is not in this app.</strong> Practise it with the free official practice exam, on a laptop.</p>
        <p><a href="${LINKS.practiceEn}" target="_blank" rel="noopener">Open the practice exams</a></p></div>`;
  }

  function extraButtons(taper) {
    const seen = Object.keys(state.cards).filter((id) => ITEM[id]).length;
    const canNew = !taper && unseenCount() > 0;
    if (!canNew && !seen) return '';
    return `<div class="btn-row">
      ${canNew ? '<button class="btn quiet" data-action="extra-new">Learn 5 more</button>' : ''}
      ${seen ? '<button class="btn quiet" data-action="extra-review">Extra review</button>' : ''}</div>`;
  }

  function startSession(kind) {
    let ids;
    if (kind === 'extra-new') ids = pickNew(5);
    else if (kind === 'extra-review') {
      const t = today();
      ids = Object.keys(state.cards).filter((id) => ITEM[id] && state.cards[id].due > t)
        .sort((a, b) => state.cards[a].box - state.cards[b].box || (state.cards[a].last || '').localeCompare(state.cards[b].last || ''))
        .slice(0, 10);
    } else {
      const p = plan();
      ids = p.rev.concat(p.nw);
    }
    if (!ids.length) { toast('Nothing to practise right now.'); return; }
    askPersist();
    session = { queue: interleave(ids), done: new Set(), again: 0, total: ids.length, kind: kind || 'main', newSeen: 0 };
    resetCardUi();
    screen = 'session';
    render();
    autoPlayCurrent();
    window.scrollTo(0, 0);
  }

  function currentItem() { return session && session.queue.length ? ITEM[session.queue[0]] : null; }

  function frontText(it) {
    if (it.type === 'word') return it.nl;
    if (it.type === 'speak') return it.nl;
    if (it.type === 'complete') return it.nl;
    if (it.type === 'kns') return knsSpoken(it);
    return '';
  }
  // Read out like the exam does: the question, then both choices.
  function knsSpoken(it) {
    return `${it.question} ${it.options.A}, of ${it.options.B}?`;
  }
  function autoPlayCurrent() {
    const it = currentItem();
    if (!it || !state.settings.autoplay) return;
    const txt = frontText(it);
    if (txt) setTimeout(() => Speech.speak(txt, it.audio), 250);
  }

  function boxDots(id) {
    const c = state.cards[id];
    if (!c) return '<span class="chip">new</span>';
    let dots = '';
    for (let b = 1; b <= 5; b++) dots += `<i class="${b <= c.box ? 'on' : ''}"></i>`;
    return `<span class="boxes" title="Leitner box ${c.box} of 5"><span class="label">box ${c.box}</span>${dots}</span>`;
  }

  // ---------------------------------------------------------------- workbook card helpers
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // Big word pools (a test's 20 matching words) are cut to the answer + 3 others, the same ones every time.
  function wbChoices(it) {
    const all = it.choices;
    if (!all || !all.length) return null;
    if (all.length <= 5) return all;
    let seed = hashStr(it.id);
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    const others = all.filter((c) => c !== it.answer);
    const pick = new Set([it.answer]);
    while (pick.size < 4 && others.length) pick.add(others.splice(Math.floor(rnd() * others.length), 1)[0]);
    return all.filter((c) => pick.has(c));
  }
  function wbGloss(it, hasBlank) {
    const opp = /tegenstelling/i.test(it.instruction);
    if (it.kind === 'recall') {
      if (opp) return 'Say the opposite of the word in bold, then check.';
      return hasBlank ? 'Say the missing word, then check.' : 'Answer the question, then check.';
    }
    if (opp) return 'Choose the opposite of the word in bold.';
    if (it.kind === 'choice') return 'Choose the right answer.';
    return 'Choose the word that fits.';
  }
  // "…" is the blank; [word] marks the word to find the opposite of.
  function wbPromptHtml(prompt, fill) {
    let h = esc(prompt).replace(/\[([^\]]+)\]/g, '<strong class="wb-key">$1</strong>');
    const blanks = (prompt.match(/…/g) || []).length;
    if (fill && blanks === 1) return h.replace('…', `<mark>${esc(fill)}</mark>`);
    return h.replace(/…/g, '<span class="blank" aria-label="blank">…</span>');
  }
  function wbSpoken(it) {
    const p = it.prompt.replace(/\[([^\]]+)\]/g, '$1');
    return (p.match(/…/g) || []).length === 1 ? p.replace('…', it.answer) : `${p} ${it.answer}`;
  }

  function speakBtn(text, audio, big, label) {
    return `<button class="speak${big ? ' big' : ''}" data-action="say" data-text="${esc(text)}"${audio ? ` data-audio="${esc(audio)}"` : ''} aria-label="${esc(label || 'Play')}">${ICON.play}</button>`;
  }

  function recorderHtml() {
    if (!Rec.supported()) return `<p class="small">Recording isn't supported in this browser. Answer out loud anyway, then check the model answer.</p>`;
    const recording = ui.recState === 'recording';
    return `<div class="recorder">
      <button class="rec-btn${recording ? ' recording' : ''}" data-action="${recording ? 'rec-stop' : 'rec-start'}">
        ${recording ? '<span class="dot"></span>Stop' : ICON.mic + (ui.recUrl ? 'Record again' : 'Record answer')}</button>
      ${ui.recUrl && !recording ? `<button class="rec-btn" data-action="rec-play">${ICON.replay}My answer</button>` : ''}
      ${ui.recError ? `<span class="rec-note">${esc(ui.recError)}</span>` : recording ? '<span class="rec-note">Speak now. Stops by itself after 30 seconds.</span>' : ''}
    </div>`;
  }

  function cardHtml(it) {
    const id = it.id;
    const head = `<div class="card-head"><span class="chip delft">${esc(typeLabel(it))}</span>${boxDots(id)}</div>`;

    if (it.type === 'word') {
      const front = `<div class="line">${speakBtn(it.nl, it.audio)}<div><p class="nl-big" lang="nl">${esc(it.nl)}</p></div></div>
        ${ui.revealed ? '' : '<p class="prompt">Say what it means in English, then turn the card.</p>'}`;
      const back = ui.revealed ? `<div class="answer">
          <p class="nl-mid">${esc(it.en)}</p>
          <div class="line">${speakBtn(it.ex, it.exAudio, false, 'Play example')}<div><p lang="nl"><strong>${esc(it.ex)}</strong></p><p class="en">${esc(it.exEn)}</p></div></div>
        </div>` : '';
      return { body: head + front + back, needsReveal: true, revealLabel: 'Turn card' };
    }

    if (it.type === 'speak' || it.type === 'complete') {
      const isQ = it.type === 'speak';
      const instruction = isQ ? 'Listen to the question and answer out loud. A short answer is enough.'
                              : 'Listen and finish the sentence out loud.';
      const textShown = ui.showText || ui.revealed;
      const front = `<p class="prompt">${instruction}</p>
        <div class="line">${speakBtn(it.nl, it.audio, true, isQ ? 'Play question' : 'Play sentence')}
          <div>${textShown ? `<p class="nl-mid" lang="nl">${esc(it.nl)}</p><p class="en">${esc(it.en)}</p>`
                           : '<button class="btn quiet" data-action="show-text">Show text</button>'}</div></div>
        ${recorderHtml()}`;
      let back = '';
      if (ui.revealed) {
        const modelText = isQ ? it.model : it.full;
        const modelShown = isQ ? esc(it.model) : esc(it.full).replace(esc(it.model), `<mark>${esc(it.model)}</mark>`);
        back = `<div class="answer"><span class="label">Model answer</span>
          <div class="line">${speakBtn(modelText, it.modelAudio, false, 'Play model answer')}<div><p class="nl-mid" lang="nl">${modelShown}</p><p class="en">${esc(it.modelEn)}</p></div></div>
          ${it.tip ? `<div class="tip"><b>Tip</b> ${esc(it.tip)}</div>` : ''}
          <p class="small">Was your answer a fitting reply that someone would understand? Then it scores at the exam, even with grammar mistakes.</p>
        </div>`;
      }
      return { body: head + front + back, needsReveal: true, revealLabel: 'Show model answer' };
    }

    if (it.type === 'kns') {
      const choiceBtn = (k) => {
        let cls = 'choice';
        if (ui.revealed) cls += k === it.correct ? ' right' : (k === ui.choice ? ' wrong' : ' dim');
        return `<button class="${cls}" data-action="kns-choose" data-choice="${k}"${ui.revealed ? ' disabled' : ''}>
          <span class="key">${k}</span><span lang="nl">${esc(it.options[k])}</span></button>`;
      };
      const front = `<figure class="kns-photo"><img src="${esc(it.image)}" alt="Photo for question ${it.n}" width="396" height="296" decoding="async">
          <figcaption>${it.n}</figcaption></figure>
        <div class="line">${speakBtn(knsSpoken(it), null, false, 'Play question')}
          <div><p class="nl-mid" lang="nl">${esc(it.question)}</p></div></div>
        <div class="choices" role="group" aria-label="Choose an answer">${choiceBtn('A')}${choiceBtn('B')}</div>
        ${ui.revealed ? '' : '<p class="prompt">Look at the photo and choose A or B.</p>'}`;
      let back = '';
      if (ui.revealed) {
        const verdict = ui.choice == null ? ''
          : ui.choice === it.correct ? '<span class="chip good">Right</span>' : '<span class="chip again">Not right</span>';
        back = `<div class="answer"><span class="label">Answer ${verdict}</span>
          <p class="nl-mid" lang="nl">${it.correct}: ${esc(it.answer)}</p>
          <p class="small">Only tap “Knew it” if you chose the right answer without looking.</p></div>`;
      }
      return { body: head + front + back, needsReveal: true, revealLabel: 'Show answer' };
    }

    if (it.type === 'wb') {
      const choices = wbChoices(it);
      const hasBlank = it.prompt.includes('…');
      const choiceBtn = (c, i) => {
        const k = String.fromCharCode(65 + i);
        let cls = 'choice';
        if (ui.revealed) cls += c === it.answer ? ' right' : (c === ui.choice ? ' wrong' : ' dim');
        return `<button class="${cls}" data-action="wb-choose" data-choice="${esc(c)}"${ui.revealed ? ' disabled' : ''}>
          <span class="key">${k}</span><span lang="nl">${esc(c)}</span></button>`;
      };
      const lesson = it.lesson ? WB_LESSON[it.lesson] : null;
      const lessonBox = lesson && lesson.text && lesson.text.length
        ? `<button class="btn quiet wb-toggle" data-action="wb-text" aria-expanded="${ui.lessonOpen}">${ui.lessonOpen ? 'Hide' : 'Show'} lesson text</button>
           ${ui.lessonOpen ? `<div class="wb-text" lang="nl"><p class="wb-title">Les ${lesson.lesson} · ${esc(lesson.title)}</p>
             ${lesson.text.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}`
        : '';
      const front = `<p class="prompt">${esc(wbGloss(it, hasBlank))}<br><span class="wb-nl" lang="nl">${esc(it.instruction)}</span></p>
        <p class="nl-mid" lang="nl">${wbPromptHtml(it.prompt, ui.revealed && hasBlank ? it.answer : null)}</p>
        ${choices ? `<div class="choices" role="group" aria-label="Choose an answer">${choices.map(choiceBtn).join('')}</div>` : ''}
        ${lessonBox}`;
      let back = '';
      if (ui.revealed) {
        const verdict = !choices || ui.choice == null ? ''
          : ui.choice === it.answer ? '<span class="chip good">Right</span>' : '<span class="chip again">Not right</span>';
        back = `<div class="answer"><span class="label">Answer ${verdict}</span>
          <div class="line">${speakBtn(wbSpoken(it), null, false, 'Play sentence')}<div><p class="nl-mid" lang="nl">${esc(it.answer)}</p></div></div>
          ${it.alsoGood && it.alsoGood !== it.answer ? `<p class="small">Also good: <span lang="nl">${esc(it.alsoGood)}</span></p>` : ''}
          ${it.note ? `<p class="small">${esc(it.note)}</p>` : ''}
          <p class="small">Only tap “Knew it” if you knew it without looking.</p></div>`;
      }
      return { body: head + front + back, needsReveal: true, revealLabel: 'Show answer' };
    }

    if (it.type === 'theme') {
      const front = `<p class="nl-big">${esc(it.title)}</p>
        <p>${esc(it.prompt)}</p>
        ${ui.revealed ? '' : '<p class="prompt">Answer in your head first, then read.</p>'}`;
      const back = ui.revealed ? `<div class="answer"><p class="theme-body">${esc(it.body)}</p>
        ${it.words ? `<p class="words-line" lang="nl">${esc(it.words)}</p>` : ''}</div>` : '';
      return { body: head + front + back, needsReveal: true, revealLabel: 'Read the explanation' };
    }
    return { body: head + '<p>Unknown card.</p>', needsReveal: false };
  }

  function renderSession() {
    const it = currentItem();
    if (!it) { finishSession(); return; }
    const doneCount = session.done.size;
    const totalNow = doneCount + new Set(session.queue).size;
    const pct = totalNow ? (doneCount / totalNow) * 100 : 0;
    const c = cardHtml(it);
    const grade = ui.revealed || !c.needsReveal
      ? `<div class="grade"><button class="btn again" data-action="grade-again">Not yet</button><button class="btn good" data-action="grade-good">Knew it</button></div>`
      : `<div class="grade"><button class="btn primary single" data-action="reveal">${esc(c.revealLabel)}</button></div>`;
    $app.className = 'app session';
    $app.innerHTML = `<header class="bar">
        <button class="icon-btn" data-action="quit" aria-label="Stop session">${ICON.close}</button>
        <div class="progress-line" role="progressbar" aria-valuemin="0" aria-valuemax="${totalNow}" aria-valuenow="${doneCount}"><div style="width:${pct.toFixed(1)}%"></div></div>
        <span class="count">${doneCount} / ${totalNow}</span>
      </header>
      <article class="card" aria-live="polite">${c.body}</article>
      ${grade}`;
  }

  function gradeCurrent(knew) {
    if (!session || !session.queue.length) return;
    stopSound();
    const id = session.queue.shift();
    const t = today();
    const day = dayRec(t);
    let c = state.cards[id];
    if (!c) {
      c = { box: 1, due: t, intro: t, reviews: 0, lapses: 0 }; state.cards[id] = c; session.newSeen++;
      if (ITEM[id] && ITEM[id].part === 'wb') day.wbNew = (day.wbNew || 0) + 1; else day.newCount++;
    }
    c.reviews = (c.reviews || 0) + 1;
    c.last = t;
    day.reviews++;
    if (knew) {
      c.box = Math.min(5, (c.box || 1) + 1);
      c.due = addDays(t, INTERVALS[c.box]);
      session.done.add(id);
    } else {
      if (c.box > 1) c.lapses = (c.lapses || 0) + 1;
      c.box = 1;
      c.due = t;
      session.again++;
      session.queue.splice(Math.min(REQUEUE_GAP, session.queue.length), 0, id);
    }
    save();
    resetCardUi();
    if (!session.queue.length) { finishSession(); return; }
    render();
    autoPlayCurrent();
    window.scrollTo(0, 0);
  }

  function finishSession() {
    const t = today();
    dayRec(t).done = true;
    save();
    lastSession = session;
    session = null;
    resetCardUi();
    screen = 'done';
    render();
    window.scrollTo(0, 0);
  }

  function renderDone() {
    const s = lastSession || { done: new Set(), again: 0, newSeen: 0 };
    const t = today();
    const tomorrow = addDays(t, 1);
    const dueTomorrow = Object.keys(state.cards).filter((id) => ITEM[id] && state.cards[id].due <= tomorrow).length;
    const newTomorrow = Math.min(newBudget(tomorrow), unseenCount());
    const info = streakInfo();
    const left = daysToExam();
    const taper = left !== null && left >= 0 && left <= TAPER_DAYS;
    $app.className = 'app';
    $app.innerHTML = `${topBar()}
      <div class="done-hero">
        <span class="chip good">Session complete</span>
        <h1>${info.count > 1 ? `Goed gedaan! ${info.count} days in a row.` : 'Goed gedaan!'}</h1>
      </div>
      <div class="stats">
        <div class="stat"><b>${s.done.size}</b><span>cards done</span></div>
        <div class="stat"><b>${s.newSeen}</b><span>new today</span></div>
        <div class="stat"><b>${s.again}</b><span>tried again</span></div>
      </div>
      <section class="today">
        <h2>Tomorrow</h2>
        <p class="note">${dueTomorrow} ${dueTomorrow === 1 ? 'card comes' : 'cards come'} back for review${newTomorrow ? `, plus up to ${newTomorrow} new` : ''}.</p>
        <div class="streak"><div class="week">${weekStrip(info)}</div></div>
        ${extraButtons(taper)}
        <button class="btn block" data-action="home">Back to today</button>
      </section>`;
  }

  function renderSettings() {
    const s = state.settings;
    const voices = Speech.voices;
    const voiceOptions = voices.length
      ? voices.map((v) => `<option value="${esc(v.voiceURI)}"${Speech.voice() && Speech.voice().voiceURI === v.voiceURI ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')
      : '';
    const voiceField = !Speech.supported()
      ? '<p class="small">This browser cannot read text aloud.</p>'
      : voices.length
        ? `<div class="field"><label for="set-voice">Dutch voice</label><select id="set-voice" data-setting="voiceURI">${voiceOptions}</select></div>`
        : `<p class="small"><strong>No Dutch voice found on this device.</strong> On iPhone: Settings → Accessibility → Spoken Content → Voices → Dutch. On Android: Settings → Text-to-speech → install Dutch. Then reopen the app.</p>`;
    const used = Object.keys(state.cards).filter((id) => ITEM[id]).length;
    const ios = isIOS();

    $app.className = 'app settings';
    $app.innerHTML = `<header class="bar"><button class="icon-btn" data-action="home" aria-label="Back">${ICON.back}</button><div class="brand">Settings</div><span style="width:44px"></span></header>

      <section class="group" aria-labelledby="g-exam"><h2 id="g-exam">Exam and pace</h2>
        <div class="field"><label for="set-exam">Exam date</label><input id="set-exam" type="date" value="${esc(s.examDate)}" data-setting="examDate">
          <span class="help">From ${TAPER_DAYS} days before this date the app only repeats cards.</span></div>
        <div class="field"><label for="set-new">New cards per day</label>
          <select id="set-new" data-setting="newPerDay">${[8, 10, 12, 15, 20, 25, 30].map((n) => `<option value="${n}"${Number(s.newPerDay) === n ? ' selected' : ''}>${n}</option>`).join('')}</select>
          <span class="help">10–15 is a good daily amount. Reviews come on top.</span></div>
        <div class="field"><label for="set-wb">Workbook cards per day</label>
          <select id="set-wb" data-setting="wbPerDay">${[0, 3, 5, 8, 10, 15, 20].map((n) => `<option value="${n}"${Number(s.wbPerDay) === n ? ' selected' : ''}>${n === 0 ? 'Off' : n}</option>`).join('')}</select>
          <span class="help">Exercises from the Naar Nederland workbook, lessons 21–65 and the four tests, in book order. On top of the new cards above.</span></div>
      </section>

      <section class="group" aria-labelledby="g-sound"><h2 id="g-sound">Sound</h2>
        <label class="toggle" for="set-auto">Read cards aloud automatically <input id="set-auto" type="checkbox" data-setting="autoplay"${s.autoplay ? ' checked' : ''}></label>
        ${voiceField}
        <div class="field"><label for="set-rate">Speed: <span id="rate-val">${Number(s.rate).toFixed(2)}×</span></label>
          <input id="set-rate" type="range" min="0.6" max="1.1" step="0.05" value="${esc(s.rate)}" data-setting="rate">
          <span class="help">The exam reads questions slowly. Around 0.85× is close.</span></div>
        <div class="btn-row"><button class="btn quiet" data-action="say" data-text="Hoe heet u? Waar woont u? Ik drink graag koffie.">${ICON.play}Test voice</button>
          ${!Rec.supported() ? '' : ui.recState === 'recording'
            ? '<button class="btn again" data-action="rec-stop">Stop test recording</button>'
            : `<button class="btn quiet" data-action="mic-test">${ICON.mic}Test microphone</button>`}</div>
        ${ui.recError ? `<p class="small">${esc(ui.recError)}</p>` : ''}
        ${ui.recUrl ? `<button class="btn quiet" data-action="rec-play">${ICON.replay}Play test recording</button>` : ''}
      </section>

      <section class="group" aria-labelledby="g-backup"><h2 id="g-backup">Back up your progress</h2>
        <p class="small">Progress is saved on this phone only (${used} cards started). Make a backup now and then, or before you switch phones.</p>
        <div class="btn-row"><button class="btn quiet" data-action="export">Save backup</button>
          <label class="btn quiet" for="import-file">Restore backup</label></div>
        <input id="import-file" type="file" accept="application/json,.json" hidden>
        ${pendingImport ? `<div class="confirm"><span>Restore the backup from ${esc(pendingImport.when)} with ${pendingImport.count} cards? This replaces the progress on this phone.</span>
          <div class="btn-row"><button class="btn" data-action="import-cancel">Cancel</button><button class="btn again" data-action="import-ok">Replace progress</button></div></div>` : ''}
      </section>

      <section class="group" aria-labelledby="g-install"><h2 id="g-install">Put it on your Home Screen</h2>
        ${isStandalone() ? '<p class="small">The app is installed. It also works offline.</p>' : ''}
        <ol class="steps">${ios
          ? '<li>Open this page in Safari.</li><li>Tap the Share button.</li><li>Choose <em>Add to Home Screen</em>.</li>'
          : '<li>Open this page in Chrome.</li><li>Tap the ⋮ menu.</li><li>Choose <em>Install app</em> or <em>Add to Home screen</em>.</li>'}</ol>
      </section>

      <section class="group" aria-labelledby="g-links"><h2 id="g-links">Official material (free)</h2>
        <ul class="links">
          <li><a href="${LINKS.practiceEn}" target="_blank" rel="noopener">Practice exams</a><span>KNS, Reading and Speaking in the real format. Needs a laptop with a microphone.</span></li>
          <li><a href="${LINKS.selfStudy}" target="_blank" rel="noopener">Self-study pack Naar Nederland (English)</a><span>Film, photobook, workbook and audio.</span></li>
          <li><a href="${LINKS.itembank}" target="_blank" rel="noopener">All speaking questions (PDF)</a><span>The official list of speaking questions and sentences.</span></li>
          <li><a href="${LINKS.scoring}" target="_blank" rel="noopener">How speaking is marked (PDF)</a><span>A fitting answer and clear pronunciation count; grammar does not.</span></li>
          <li><a href="${LINKS.ind}" target="_blank" rel="noopener">IND: about the exam</a><span>Who must take it and who is exempt.</span></li>
        </ul>
      </section>

      <section class="group" aria-labelledby="g-reset"><h2 id="g-reset">Start over</h2>
        ${confirmReset
          ? `<div class="confirm"><span>Delete all progress on this phone? This can't be undone.</span>
              <div class="btn-row"><button class="btn" data-action="reset-cancel">Cancel</button><button class="btn again" data-action="reset-ok">Delete progress</button></div></div>`
          : '<button class="btn quiet" data-action="reset">Reset progress</button>'}
      </section>
      <p class="small">For educational purposes only. Unofficial app, not affiliated with DUO, the Ministerie van SZW or the IND. KNS questions and photos come from the official photobook <em>Naar Nederland – Fotoboek</em>, the workbook cards from the official <em>Naar Nederland</em> workbook (both © 2014 Ministerie van SZW); all rights stay with the owners.</p>`;
  }

  // ---------------------------------------------------------------- backup
  async function exportProgress() {
    const data = JSON.stringify({ app: 'mvv-oefenapp', exported: new Date().toISOString(), state }, null, 1);
    const name = `mvv-oefenapp-backup-${today()}.json`;
    try {
      const file = new File([data], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'MVV Oefenapp backup' });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Backup saved to your downloads.');
  }

  function readImport(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        const s = parsed && parsed.state ? parsed.state : parsed;
        if (!s || typeof s.cards !== 'object' || typeof s.days !== 'object') throw new Error('shape');
        pendingImport = {
          state: normalise(s),
          count: Object.keys(s.cards).length,
          when: parsed.exported ? fmtDate(parsed.exported.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : 'an unknown date',
        };
      } catch (e) {
        pendingImport = null;
        toast('That file is not an MVV Oefenapp backup.');
      }
      render();
    };
    r.readAsText(file);
  }

  // ---------------------------------------------------------------- events
  $app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case 'start': startSession('main'); break;
      case 'extra-new': startSession('extra-new'); break;
      case 'extra-review': startSession('extra-review'); break;
      case 'reveal': ui.revealed = true; Rec.stop(); render(); break;
      case 'show-text': ui.showText = true; render(); break;
      case 'kns-choose': if (!ui.revealed) { ui.choice = el.dataset.choice; ui.revealed = true; stopSound(); render(); } break;
      case 'wb-choose': if (!ui.revealed) { ui.choice = el.dataset.choice; ui.revealed = true; stopSound(); render(); } break;
      case 'wb-text': ui.lessonOpen = !ui.lessonOpen; render(); break;
      case 'grade-good': gradeCurrent(true); break;
      case 'grade-again': gradeCurrent(false); break;
      case 'say': Speech.speak(el.dataset.text, el.dataset.audio); break;
      case 'rec-start': Rec.start(); break;
      case 'mic-test': Rec.start(); break;
      case 'rec-stop': Rec.stop(); break;
      case 'rec-play': playRecording(); break;
      case 'quit':
        stopSound(); resetCardUi(); session = null; screen = 'today'; render(); break;
      case 'settings':
        stopSound(); prevScreen = screen === 'settings' ? prevScreen : screen; resetCardUi(); screen = 'settings'; render(); window.scrollTo(0, 0); break;
      case 'home':
        stopSound(); resetCardUi(); confirmReset = false; pendingImport = null; screen = 'today'; render(); window.scrollTo(0, 0); break;
      case 'export': exportProgress(); break;
      case 'import-cancel': pendingImport = null; render(); break;
      case 'import-ok':
        if (pendingImport) { state = pendingImport.state; save(); pendingImport = null; toast('Backup restored.'); render(); }
        break;
      case 'reset': confirmReset = true; render(); break;
      case 'reset-cancel': confirmReset = false; render(); break;
      case 'reset-ok': {
        const keep = Object.assign({}, state.settings);
        state = fresh(); state.settings = keep; save(); confirmReset = false; toast('Progress deleted.'); render(); break;
      }
    }
  });

  $app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'import-file' && el.files && el.files[0]) { readImport(el.files[0]); el.value = ''; return; }
    const key = el.dataset && el.dataset.setting;
    if (!key) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (key === 'newPerDay' || key === 'wbPerDay') v = Number(v);
    if (key === 'rate') v = Number(v);
    if (key === 'examDate' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    state.settings[key] = v;
    save();
    if (key === 'voiceURI') Speech.speak('Dit is de nieuwe stem.');
    if (key === 'rate') Speech.speak('Hoe heet u?');
  });
  $app.addEventListener('input', (e) => {
    if (e.target.id === 'set-rate') { const out = document.getElementById('rate-val'); if (out) out.textContent = Number(e.target.value).toFixed(2) + '×'; }
  });

  document.addEventListener('keydown', (e) => {
    if (screen !== 'session' || e.target.matches('input, select, textarea')) return;
    const cur = currentItem();
    if (!ui.revealed && cur && cur.type === 'kns' && /^[ab]$/i.test(e.key)) {
      ui.choice = e.key.toUpperCase(); ui.revealed = true; stopSound(); render(); return;
    }
    if (!ui.revealed && cur && cur.type === 'wb' && /^[a-f]$/i.test(e.key)) {
      const ch = wbChoices(cur);
      const c = ch && ch[e.key.toUpperCase().charCodeAt(0) - 65];
      if (c) { ui.choice = c; ui.revealed = true; stopSound(); render(); }
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      if (!ui.revealed) { e.preventDefault(); ui.revealed = true; Rec.stop(); render(); }
    } else if (ui.revealed && (e.key === '1' || e.key === 'ArrowLeft')) gradeCurrent(false);
    else if (ui.revealed && (e.key === '2' || e.key === 'ArrowRight')) gradeCurrent(true);
  });

  // Back on the app after midnight: show the new day.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && screen === 'today') render();
    if (document.visibilityState === 'hidden') { Rec.stop(); stopSound(); }
  });

  // ---------------------------------------------------------------- start
  async function boot() {
    try {
      const loaded = await loadContent();
      buildDecks(loaded.content, loaded.questions, loaded.workbook);
    } catch (e) {
      $app.innerHTML = `<p class="loading">Could not load the cards. Check your connection and reload.<br><small>${esc(e.message)}</small></p>`;
      return;
    }
    Speech.init();
    screen = 'today';
    render();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !window.MVV_CONTENT) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // exposed for tests
  window.__mvv = { state: () => state, plan, pickNew, pickWb, streakInfo, interleave, addDays, diffDays, ITEM, wbChoices, wbPromptHtml, wbSpoken };
  boot();
})();
