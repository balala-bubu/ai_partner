# 小秘書（Phase 1 最小可用版）

丟一句話 → 自動整理成可修改的預覽 → 你確認後才存成任務或生活紀錄。可加到 iPhone 主畫面使用（PWA）。

## 現在能做什麼

- **丟一句話**：不用先分類，支援「明天下午三點」「週五前」「11/15」「#標籤」「@專案」。
- **預覽卡**：類型（任務／行程／生活／想法）、標題、日期、時間都能改；推定的欄位標黃色「待確認」，原文一定保留。
- **確認後才寫入**：可「先放著」留在收件匣，或捨棄；存入後 6 秒內可一鍵復原。
- **今天**：今日任務與行程、完成進度、快到期、收件匣提醒。
- **任務**：搜尋、篩選（未完成／今天／逾期／未排日期／已完成）、編輯、刪除（刪除需單獨確認）。
- **紀錄**：生活紀錄與想法依日期排列，不轉成待辦、不做分析。
- **操作紀錄**：每次寫入都記錄，並標示風險等級 L0～L3；統計「需要你修改」的比例，用來檢查自動整理準不準。
- **匯出**：全部資料匯出成 JSON。

## 兩種模式

| 模式 | 什麼時候 | 資料存在哪 |
|---|---|---|
| 本機模式 | `js/config.js` 沒填 Supabase | 這台裝置的瀏覽器，不同步 |
| 雲端模式 | 填好 Supabase | Supabase，電腦和 iPhone 同步 |

## 開啟雲端同步（約 10 分鐘）

1. 到 [supabase.com](https://supabase.com) 建立免費專案（免費方案額度請以官方定價頁為準）。
2. **SQL Editor** → 貼上 `supabase/schema.sql` 全部內容 → Run。
3. **Authentication → Emails → Magic Link 範本**：把內容改成包含 `{{ .Token }}`，例如：
   `你的小秘書登入驗證碼：{{ .Token }}`
   （iPhone 主畫面 App 點信中連結會跳到 Safari，所以改用六位數驗證碼登入。）
4. **Authentication → URL Configuration**：Site URL 填 GitHub Pages 網址。
5. **Project Settings → API**：複製 Project URL 與 anon public key，填進 `js/config.js`。
6. 推上 GitHub，等 Pages 更新後重新整理。

## 加到 iPhone 主畫面

用 Safari 打開網址 → 分享 → 加入主畫面。

**從其他 App 分享文字進來（選用）**：用「捷徑」App 建一個捷徑：接收「文字」→「URL 編碼」→ 打開網址 `https://你的網址/?q=` 加上編碼後的文字。勾選「在分享表單中顯示」。

## AI 解析（選用，預設關閉）

預設用本機規則整理，不花任何 API 費用。要改用模型：

1. 安裝 Supabase CLI，部署 `supabase/functions/parse`。
2. 設定 Secrets：`AI_PROVIDER`（anthropic 或 openai）、`AI_API_KEY`、`AI_MODEL`，若用 OpenAI 相容端點可加 `AI_BASE_URL`。
3. `js/config.js` 把 `AI_PARSE` 改成 `true`。

注意：一般的 ChatGPT／Claude／Gemini 訂閱不含 API 額度，API 需另外申請並依用量計費。每次只送出那一句話和今天日期。

## 測試

```bash
npm test   # 用 tests/sentences.json 的 25 句測試規則解析
```

這 25 句是開發時自己寫的，規則有依它調整過，所以全對不代表實際準確度。請把你真實會說的句子加進去再測。

## 檔案

```
index.html              入口
css/app.css             樣式（淺色／深色）
js/app.js               畫面與流程
js/parser.js            本機規則解析
js/store.js             資料層（本機／Supabase）
js/config.js            設定
js/ui.js                圖示與小角色
sw.js                   離線快取
supabase/schema.sql     資料表與權限
supabase/functions/     AI 解析函式
docs/06_DECISIONS.md    本輪決策紀錄
```
