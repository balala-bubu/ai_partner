// 資料層：同一組介面，背後是 Supabase（雲端同步）或 localStorage（本機模式）。
import { CONFIG } from './config.js';

const TABLES = ['inbox_items', 'tasks', 'life_logs', 'activity_logs'];
const LS_KEY = 'secretary.v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const nowISO = () => new Date().toISOString();

class LocalStore {
  constructor() {
    this.mode = 'local';
    this.user = { id: 'local', email: '本機模式' };
    try { this.db = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { this.db = {}; }
    for (const t of TABLES) this.db[t] ||= [];
  }
  save() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.db)); } catch { /* 空間不足或無痕模式 */ } }
  async session() { return this.user; }
  async list(table) { return [...this.db[table]].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)); }
  async insert(table, row) {
    const r = { id: uid(), user_id: this.user.id, created_at: nowISO(), ...row };
    this.db[table].push(r); this.save(); return r;
  }
  async update(table, id, patch) {
    const r = this.db[table].find((x) => x.id === id);
    if (!r) throw new Error('找不到這筆資料');
    Object.assign(r, patch, table === 'tasks' ? { updated_at: nowISO() } : {}); this.save(); return r;
  }
  async remove(table, id) { this.db[table] = this.db[table].filter((x) => x.id !== id); this.save(); }
  async signOut() {}
  exportAll() { return this.db; }
}

class SupabaseStore {
  constructor(client) { this.mode = 'cloud'; this.sb = client; this.user = null; }
  async session() {
    const { data } = await this.sb.auth.getSession();
    this.user = data.session?.user ?? null;
    return this.user;
  }
  async sendCode(email) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  }
  async verifyCode(email, token) {
    const { data, error } = await this.sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    this.user = data.user; return this.user;
  }
  async signOut() { await this.sb.auth.signOut(); this.user = null; }
  async list(table) {
    const { data, error } = await this.sb.from(table).select('*').order('created_at', { ascending: false }).limit(table === 'activity_logs' ? 200 : 1000);
    if (error) throw error; return data;
  }
  async insert(table, row) {
    const { data, error } = await this.sb.from(table).insert({ ...row, user_id: this.user.id }).select().single();
    if (error) throw error; return data;
  }
  async update(table, id, patch) {
    const { data, error } = await this.sb.from(table).update(patch).eq('id', id).select().single();
    if (error) throw error; return data;
  }
  async remove(table, id) {
    const { error } = await this.sb.from(table).delete().eq('id', id);
    if (error) throw error;
  }
  async invoke(fn, body) {
    const { data, error } = await this.sb.functions.invoke(fn, { body });
    if (error) throw error; return data;
  }
  async exportAll() {
    const out = {};
    for (const t of TABLES) out[t] = await this.list(t);
    return out;
  }
}

export async function createStore() {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return new SupabaseStore(client);
  }
  return new LocalStore();
}

// 操作紀錄：每次寫入都留一筆。level 對應 01_REQUIREMENTS 的操作風險分級。
export async function logAction(store, { action, level, actor = 'user', target_table = null, target_id = null, detail = {} }) {
  try {
    return await store.insert('activity_logs', { action, level, actor, target_table, target_id, detail });
  } catch (e) {
    console.warn('操作紀錄寫入失敗', e);
  }
}
