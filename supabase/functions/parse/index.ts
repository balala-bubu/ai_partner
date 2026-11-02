// Supabase Edge Function：用模型解析一句話。只在 config.js 的 AI_PARSE = true 時使用。
// 金鑰只存在 Supabase 的 Secrets，不會出現在前端或 GitHub。
//
// 需要的 Secrets（擇一供應商）：
//   AI_PROVIDER = anthropic | openai
//   AI_API_KEY  = 對應的 API 金鑰（需另行申請與付費，一般訂閱不含 API 額度）
//   AI_MODEL    = 模型名稱，例如 claude-haiku-5-5 或 gpt-4o-mini（模型尚未決定）
//   AI_BASE_URL = （選填）OpenAI 相容端點，例如 Gemini 的 OpenAI 相容網址
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `你是個人秘書的輸入整理器。把使用者的一句話整理成 JSON，只輸出 JSON。
規則：
- type 只能是 task（要做的事）、event（某時間要出席的事）、life（已發生的事、感受、日記）、idea（想法、點子）、unsorted（看不出來）。
- 生活紀錄與想法不要變成任務。
- 日期用 YYYY-MM-DD，時間用 HH:MM（24 小時制）。原文沒提到就填 null，不要自行補造。
- 任何推定（例如「週五」推定是哪一天、沒說上下午），都要在 uncertain 列出 {"field":"date|time|type|title","note":"繁體中文說明"}。
- date_role：task 有「前、截止」等字樣時為 due，否則 scheduled。
- title：簡短的標題，去掉日期時間字眼；life/idea 時 title 用原文。
- tags：原文中 #後面的字；project：原文中 @後面的字，沒有就 null。
輸出格式：{"type":"","title":"","date":null,"time":null,"date_role":"scheduled","project":null,"tags":[],"uncertain":[]}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // 確認是已登入的使用者
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { text, today, weekday } = await req.json();
    if (!text || String(text).length > 2000) return json({ error: 'bad input' }, 400);

    const provider = Deno.env.get('AI_PROVIDER') ?? 'anthropic';
    const key = Deno.env.get('AI_API_KEY');
    const model = Deno.env.get('AI_MODEL');
    if (!key || !model) return json({ error: 'AI not configured' }, 503);

    // 只送這一句話與今天日期，不送其他個人資料
    const user_msg = `今天是 ${today}（週${'日一二三四五六'[weekday]}），時區 Asia/Taipei。\n輸入：${text}`;
    let out = '', usage: unknown = null;

    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 400, system: SYSTEM, messages: [{ role: 'user', content: user_msg }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j));
      out = j.content?.[0]?.text ?? ''; usage = j.usage;
    } else {
      const base = Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1';
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user_msg }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j));
      out = j.choices?.[0]?.message?.content ?? ''; usage = j.usage;
    }

    const parsed = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
    if (!['task', 'event', 'life', 'idea', 'unsorted'].includes(parsed.type)) parsed.type = 'unsorted';
    return json({ ...parsed, model, usage });
  } catch (e) {
    console.error(e);
    return json({ error: 'parse failed' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}
