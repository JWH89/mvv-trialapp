// Checks the grammar content in data/ before you publish it.
// Run from the grammatica folder:  node tools/check_content.mjs
// Stops with a list of problems if anything is wrong; prints a summary if all is well.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const problems = [];
const bad = (where, msg) => problems.push(`${where}: ${msg}`);

const LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);
const TYPES = new Set(['choice', 'type', 'order', 'rewrite', 'translate']);
const BLOCKS = new Set(['p', 'h', 'list', 'table', 'ex', 'tip']);

// Same rules the app uses to compare answers.
const norm = (s) => String(s).normalize('NFC').toLowerCase()
  .replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"')
  .replace(/[,;:]/g, ' ').replace(/[.!?]+\s*$/g, '').replace(/\s+/g, ' ').trim();
const tilesOf = (ex) => ex.tiles || norm(ex.a[0]).replace(/[.!?]/g, '').split(' ');

function checkInline(where, s) {
  if (typeof s !== 'string') { bad(where, 'expected text'); return; }
  if ((s.match(/\*\*/g) || []).length % 2) bad(where, `unbalanced ** in "${s}"`);
  if ((s.match(/==/g) || []).length % 2) bad(where, `unbalanced == in "${s}"`);
}

const index = read('data/index.json');
const topicIds = new Set();
const exIds = new Set();
let exCount = 0;
const perType = {};
const perLevel = {};

for (const file of index.files) {
  let g;
  try { g = read(file); } catch (e) { bad(file, 'not valid JSON: ' + e.message); continue; }
  if (!g.id || !g.title || !Array.isArray(g.topics)) bad(file, 'group needs id, title, topics');
  for (const t of g.topics || []) {
    const w = `${file} › ${t.id}`;
    if (!t.id || topicIds.has(t.id)) bad(w, 'missing or duplicate topic id');
    topicIds.add(t.id);
    for (const k of ['title', 'nl', 'level', 'summary']) if (!t[k]) bad(w, `missing ${k}`);
    if (!LEVELS.has(t.level)) bad(w, `unknown level ${t.level}`);
    perLevel[t.level] = (perLevel[t.level] || 0) + 1;
    for (const b of t.body || []) {
      const kind = Object.keys(b)[0];
      if (!BLOCKS.has(kind)) { bad(w, `unknown block ${kind}`); continue; }
      if (kind === 'p' || kind === 'h' || kind === 'tip') checkInline(w, b[kind]);
      if (kind === 'list') b.list.forEach((x) => checkInline(w, x));
      if (kind === 'ex') b.ex.forEach((x) => { if (!Array.isArray(x) || x.length !== 2) bad(w, 'example needs [nl, en]'); });
      if (kind === 'table') {
        const n = b.table.head.length;
        b.table.rows.forEach((r) => { if (r.length !== n) bad(w, `table row has ${r.length} cells, head has ${n}: ${r.join(' | ')}`); r.forEach((c) => checkInline(w, c)); });
      }
    }
    for (const m of t.mistakes || []) if (!m.wrong || !m.right || !m.why) bad(w, 'mistake needs wrong, right, why');
    if (!Array.isArray(t.exercises) || !t.exercises.length) bad(w, 'no exercises');
    for (const ex of t.exercises || []) {
      const we = `${w} › ${ex.id}`;
      exCount++;
      if (!ex.id || exIds.has(ex.id)) bad(we, 'missing or duplicate exercise id');
      exIds.add(ex.id);
      if (!TYPES.has(ex.t)) bad(we, `unknown type ${ex.t}`);
      perType[ex.t] = (perType[ex.t] || 0) + 1;
      if (!ex.why) bad(we, 'missing why');
      if (ex.t === 'choice') {
        if (!Array.isArray(ex.opts) || ex.opts.length < 2) bad(we, 'choice needs 2+ opts');
        else if (!ex.opts.includes(ex.a)) bad(we, `answer "${ex.a}" is not one of the options`);
        else if (new Set(ex.opts).size !== ex.opts.length) bad(we, 'duplicate options');
        if (!ex.q) bad(we, 'missing q');
      } else {
        if (!Array.isArray(ex.a) || !ex.a.length) { bad(we, 'answers must be a non-empty list'); continue; }
        const ns = ex.a.map(norm);
        if (new Set(ns).size !== ns.length) bad(we, 'duplicate accepted answers');
        if ((ex.t === 'type' || ex.t === 'rewrite') && !ex.q) bad(we, 'missing q');
        if ((ex.t === 'translate' || ex.t === 'order') && !(ex.en || ex.q)) bad(we, 'missing English prompt');
        if (ex.t === 'order') {
          const tiles = tilesOf(ex);
          if (tiles.length < 3) bad(we, 'order needs at least 3 tiles');
          if (tiles.join(' ') !== norm(ex.a[0]).replace(/[.!?]/g, '')) bad(we, 'tiles do not build the first answer');
        }
      }
    }
  }
}

// Make-sentences items (data/sentences.json)
const sentences = read('data/sentences.json');
for (const it of sentences.items) {
  const w = `sentences › ${it.id}`;
  if (!it.id || exIds.has(it.id)) bad(w, 'missing or duplicate id');
  exIds.add(it.id);
  if (!it.en) bad(w, 'missing en');
  if (!LEVELS.has(it.level)) bad(w, `unknown level ${it.level}`);
  if (!Array.isArray(it.a) || !it.a.length) bad(w, 'answers must be a non-empty list');
  else if (new Set(it.a.map(norm)).size !== it.a.length) bad(w, 'duplicate accepted answers');
  for (const t of it.topics || []) if (!topicIds.has(t)) bad(w, `unknown topic ${t}`);
}

const pathIds = index.path || [];
const seen = new Set();
for (const id of pathIds) {
  if (!topicIds.has(id)) bad('index.path', `unknown topic ${id}`);
  if (seen.has(id)) bad('index.path', `${id} is listed twice`);
  seen.add(id);
}
for (const id of topicIds) if (!seen.has(id)) bad('index.path', `topic ${id} is not in the learning path`);

if (problems.length) {
  console.error(`${problems.length} problem(s):\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log(`OK: ${topicIds.size} topics, ${exCount} exercises, ${sentences.items.length} make-sentences items`);
console.log('per level:', perLevel);
console.log('per type:', perType);
