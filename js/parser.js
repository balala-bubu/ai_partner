// 本機規則解析：不呼叫模型、不花費用。
// 原則：抓得到才填，推定的值一律標「待確認」，抓不到就留空，不自行補造。

const WD = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const CN_NUM = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

export const TYPES = {
  task: '任務',
  event: '行程',
  life: '生活紀錄',
  idea: '想法',
  unsorted: '未分類',
};

function cnToInt(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s === '十') return 10;
  if (s.startsWith('十')) return 10 + (CN_NUM[s[1]] ?? 0);
  if (s.endsWith('十')) return (CN_NUM[s[0]] ?? 0) * 10;
  if (s.length === 3 && s[1] === '十') return CN_NUM[s[0]] * 10 + CN_NUM[s[2]];
  return CN_NUM[s] ?? NaN;
}

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function parseDate(text, now, uncertain) {
  let m;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if ((m = text.match(/大後天/))) return { date: ymd(addDays(today, 3)), hit: m[0] };
  if ((m = text.match(/後天/))) return { date: ymd(addDays(today, 2)), hit: m[0] };
  if ((m = text.match(/明天|明日|明早|明晚/))) return { date: ymd(addDays(today, 1)), hit: m[0] };
  if ((m = text.match(/今天|今日|今晚|今早|等一下|待會/))) return { date: ymd(today), hit: m[0] };
  if ((m = text.match(/昨天|昨晚/))) return { date: ymd(addDays(today, -1)), hit: m[0] };

  // 下週五 / 下禮拜三 / 這週二 / 週五 / 星期五 / 禮拜五
  m = text.match(/(下下|下|這|本)?(?:個)?(週|周|星期|禮拜|拜)([一二三四五六日天])/);
  if (m) {
    const target = WD[m[3]];
    const cur = today.getDay();
    // 以週一為一週起點
    const curIdx = (cur + 6) % 7, tgtIdx = (target + 6) % 7;
    let diff = tgtIdx - curIdx;
    if (!m[1] && diff === 0) uncertain.push({ field: 'date', note: `「${m[0]}」推定為今天` });
    if (m[1] === '下') diff += 7;
    else if (m[1] === '下下') diff += 14;
    else if (!m[1] && diff < 0) {
      diff += 7;
      uncertain.push({ field: 'date', note: `「${m[0]}」已過，推定為下週` });
    }
    return { date: ymd(addDays(today, diff)), hit: m[0] };
  }

  // 11/15、11-15、11月15日／號
  m = text.match(/(\d{1,2})\s*[\/\-月]\s*(\d{1,2})\s*(?:日|號)?/);
  if (m) {
    const mo = +m[1], da = +m[2];
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      let y = today.getFullYear();
      const d = new Date(y, mo - 1, da);
      if (d < addDays(today, -60)) {
        y += 1;
        uncertain.push({ field: 'date', note: `年份推定為 ${y}` });
      }
      return { date: `${y}-${pad(mo)}-${pad(da)}`, hit: m[0] };
    }
  }

  // 只有「15號」
  m = text.match(/([0-9]{1,2}|[一二三四五六七八九十]{1,3})\s*號/);
  if (m) {
    const da = cnToInt(m[1]);
    if (da >= 1 && da <= 31) {
      let d = new Date(today.getFullYear(), today.getMonth(), da);
      if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, da);
      uncertain.push({ field: 'date', note: `只寫「${m[0]}」，推定為 ${d.getMonth() + 1} 月` });
      return { date: ymd(d), hit: m[0] };
    }
  }

  if ((m = text.match(/下週|下禮拜|下星期/))) {
    uncertain.push({ field: 'date', note: '只說「下週」，沒有指定哪一天' });
    return { date: null, hit: m[0] };
  }
  if ((m = text.match(/月底/))) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    uncertain.push({ field: 'date', note: '「月底」推定為本月最後一天' });
    return { date: ymd(d), hit: m[0] };
  }
  return { date: null, hit: null };
}

function parseTime(text, uncertain) {
  let m;
  // 14:30 / 9:00
  m = text.match(/(\d{1,2})[:：](\d{2})/);
  if (m && +m[1] < 24 && +m[2] < 60) {
    let h = +m[1];
    if (/下午|晚上/.test(text) && h < 12) h += 12;
    return { time: `${pad(h)}:${m[2]}`, hit: m[0] };
  }
  // 下午三點半 / 晚上8點 / 10點
  m = text.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|今晚|明晚)?\s*([0-9]{1,2}|[一二兩三四五六七八九十]{1,3})\s*[點点](半|[0-9]{1,2}分?)?/);
  if (m) {
    let h = cnToInt(m[2]);
    if (isNaN(h) || h > 24) return { time: null, hit: null };
    const p = m[1];
    if (/下午|傍晚|晚/.test(p || '') && h < 12) h += 12;
    if (p === '中午' && h < 6) h += 12;
    let min = 0;
    if (m[3] === '半') min = 30;
    else if (m[3]) min = parseInt(m[3], 10);
    if (!p && h >= 1 && h <= 7) {
      uncertain.push({ field: 'time', note: `「${m[0]}」沒說上午或下午，推定為下午` });
      h += 12;
    }
    return { time: `${pad(h)}:${pad(min)}`, hit: m[0] };
  }
  m = text.match(/早上|上午|中午|下午|傍晚|晚上|今晚|明晚/);
  if (m) {
    uncertain.push({ field: 'time', note: `只說「${m[0]}」，沒有確切時間` });
  }
  return { time: null, hit: null };
}

const RX = {
  life: /(覺得|感覺|好累|好開心|開心|難過|煩|心情|今天.*了|剛剛|剛才|吃了|去了|看了|跑了|睡了|運動了|聊了|紀錄一下|記錄一下|日記)/,
  idea: /(想到|點子|靈感|也許可以|或許可以|如果能|想法|有個想法|可以試試)/,
  event: /(開會|會議|meeting|約|見面|聚餐|聚會|上課|社課|面試|看診|看牙醫|看醫生|回診|家教|讀書會|練習|課程|活動|演講|行程|報到|表演|比賽)/i,
  taskStrong: /(記得|要帶|提醒|繳|交|報名|申請|回覆|回信|寄|買)/,
  task: /(要|得|記得|提醒|交|繳|完成|寫|準備|買|整理|回覆|回信|報名|申請|預約|處理|讀|讀完|做|印|寄|訂|改|截止|deadline|due|前)/i,
  due: /(之前|以前|前交|截止|deadline|due|到期|前要|前完成|前繳)/i,
};

function guessType(text, hasTime) {
  const scores = { life: 0, idea: 0, event: 0, task: 0 };
  if (RX.life.test(text)) scores.life += 2;
  if (RX.idea.test(text)) scores.idea += 2;
  if (RX.event.test(text)) scores.event += 2;
  if (RX.task.test(text)) scores.task += 1;
  if (RX.taskStrong.test(text)) scores.task += 2;
  if (RX.due.test(text)) scores.task += 2;
  if (hasTime && scores.event > 0) scores.event += 1;
  if (/了[。！!～~]?$/.test(text.trim()) && !RX.due.test(text)) scores.life += 1;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];
  const second = ranked[1][1];
  if (topScore === 0) return { type: 'unsorted', sure: false };
  return { type: top, sure: topScore - second >= 2 };
}

function makeTitle(text, hits) {
  let t = text;
  for (const h of hits) if (h) t = t.replace(h, ' ');
  t = t
    .replace(/#[^\s#@]+/g, ' ')
    .replace(/@[^\s#@]+/g, ' ')
    .replace(/^(記得|提醒我|幫我記|我要|要|得)\s*/, '')
    .replace(/(之前|以前)\s*/g, ' ')
    .replace(/^前\s*(把)?/, '')
    .replace(/\s前$/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[，,、。\s]+|[，,、。\s]+$/g, '')
    .trim();
  t = t.replace(/^前\s*把?\s*/, '').trim();
  if (!t) t = text.trim();
  return t.length > 40 ? t.slice(0, 40) + '…' : t;
}

/**
 * @param {string} raw 使用者原始輸入
 * @param {Date} now 現在時間（測試時可指定）
 */
export function parseLocal(raw, now = new Date()) {
  const text = raw.trim();
  const uncertain = [];
  const tags = [...text.matchAll(/#([^\s#@，,。]+)/g)].map((m) => m[1]);
  const projectM = text.match(/@([^\s#@，,。]+)/);

  const d = parseDate(text, now, uncertain);
  const t = parseTime(text, uncertain);
  const g = guessType(text, !!t.time);

  if (!g.sure) uncertain.push({ field: 'type', note: g.type === 'unsorted' ? '看不出類型，請選一個' : '類型不太確定，請確認' });

  const isDue = RX.due.test(text);
  const result = {
    type: g.type,
    title: g.type === 'life' || g.type === 'idea' ? text.replace(/#[^\s#@]+|@[^\s#@]+/g, '').trim() : makeTitle(text, [d.hit, t.hit]),
    date: d.date,
    time: t.time,
    date_role: g.type === 'task' && isDue ? 'due' : 'scheduled',
    project: projectM ? projectM[1] : null,
    tags,
    raw: text,
    uncertain,
    parser: 'rules',
  };
  return result;
}
