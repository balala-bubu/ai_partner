// 部署前填入 Supabase 專案資訊（Project Settings → API）。
// anon key 本來就是給前端用的公開金鑰，資料安全靠資料表的 Row Level Security。
// 兩個值都留空時，App 會以「本機模式」運作：資料只存在這台裝置的瀏覽器。
export const CONFIG = {
  SUPABASE_URL: 'https://yzbvxmivlniyjdrzodbi.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnZ4bWl2bG5peWpkcnpvZGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MjgzMjEsImV4cCI6MjEwOTIwNDMyMX0.ljL6SHBXT5qv-8iNGdlU0gzZY1X95RTPFl6n49YWQTg',
  // 設為 true 時，輸入會先送到 Supabase Edge Function「parse」由模型解析；失敗時退回本機規則。
  AI_PARSE: false,
};
