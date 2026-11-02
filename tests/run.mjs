import { readFileSync } from 'node:fs';
import { parseLocal, TYPES } from '../js/parser.js';
const now = new Date(2026, 10, 2, 22, 0); // 2026-11-02 週一
const cases = JSON.parse(readFileSync(new URL('./sentences.json', import.meta.url)));
let ok = 0;
for (const c of cases) {
  const r = parseLocal(c.text, now);
  const fails = [];
  if (r.type !== c.type) fails.push(`類型 ${TYPES[r.type]}≠${TYPES[c.type]}`);
  if ('date' in c && r.date !== c.date) fails.push(`日期 ${r.date}≠${c.date}`);
  if ('time' in c && r.time !== c.time) fails.push(`時間 ${r.time}≠${c.time}`);
  if (!fails.length) ok++;
  console.log(fails.length ? '✗' : '✓', c.text, '→', r.title, r.uncertain.map(u=>u.note).join('；'), fails.join(' '));
}
console.log(`\n${ok}/${cases.length} 完全正確`);
