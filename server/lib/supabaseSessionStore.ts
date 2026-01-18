import session from 'express-session';
import { supabaseAdmin } from './supabaseAdmin';

interface SessionData {
  sid: string;
  sess: any;
  expire: string;
}

export class SupabaseSessionStore extends session.Store {
  private tableName = 'sessions';
  private initialized = false;
  private tableExists = false;
  private fallbackSessions: Map<string, { sess: session.SessionData; expire: Date }> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    super();
    this.initPromise = this.ensureTable();
  }

  private async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  private async ensureTable(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const { error } = await supabaseAdmin
        .from(this.tableName)
        .select('sid')
        .limit(1);

      if (error && (error.message.includes('does not exist') || error.message.includes('schema cache'))) {
        console.log('[SupabaseSessionStore] Sessions table does not exist. Using in-memory fallback.');
        console.log('[SupabaseSessionStore] To enable persistent sessions, create the sessions table in Supabase:');
        console.log(`
CREATE TABLE sessions (
  sid VARCHAR(255) PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_expire_idx ON sessions (expire);
        `);
        this.tableExists = false;
      } else if (error) {
        console.error('[SupabaseSessionStore] Table check error:', error.message);
        this.tableExists = false;
      } else {
        // Table exists and is ready - no need to log on every startup
        this.tableExists = true;
      }
      
      this.initialized = true;
    } catch (err) {
      console.error('[SupabaseSessionStore] Initialization error:', err);
      this.tableExists = false;
      this.initialized = true;
    }
  }

  async get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): Promise<void> {
    // Wait for initialization to complete
    await this.waitForInit();
    
    // Use fallback if table doesn't exist
    if (!this.tableExists) {
      const cached = this.fallbackSessions.get(sid);
      if (!cached) return callback(null, null);
      if (cached.expire < new Date()) {
        this.fallbackSessions.delete(sid);
        return callback(null, null);
      }
      return callback(null, cached.sess);
    }

    try {
      const { data, error } = await supabaseAdmin
        .from(this.tableName)
        .select('sess, expire')
        .eq('sid', sid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return callback(null, null);
        }
        return callback(error);
      }

      if (!data) {
        return callback(null, null);
      }

      const expire = new Date(data.expire);
      if (expire < new Date()) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      callback(null, data.sess as session.SessionData);
    } catch (err) {
      callback(err);
    }
  }

  async set(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    // Wait for initialization to complete
    await this.waitForInit();
    
    const maxAge = (sessionData.cookie?.maxAge) || 86400000;
    const expire = new Date(Date.now() + maxAge);

    // Use fallback if table doesn't exist
    if (!this.tableExists) {
      this.fallbackSessions.set(sid, { sess: sessionData, expire });
      return callback?.();
    }

    try {
      const { error } = await supabaseAdmin
        .from(this.tableName)
        .upsert({
          sid,
          sess: sessionData,
          expire: expire.toISOString(),
        }, {
          onConflict: 'sid',
        });

      if (error) {
        console.error('[SupabaseSessionStore] Set error:', error.message);
        // Fallback to memory on error
        this.fallbackSessions.set(sid, { sess: sessionData, expire });
        return callback?.();
      }

      callback?.();
    } catch (err) {
      console.error('[SupabaseSessionStore] Set exception:', err);
      // Fallback to memory on error
      this.fallbackSessions.set(sid, { sess: sessionData, expire });
      callback?.();
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    // Wait for initialization to complete
    await this.waitForInit();
    
    // Always remove from fallback
    this.fallbackSessions.delete(sid);

    if (!this.tableExists) {
      return callback?.();
    }

    try {
      const { error } = await supabaseAdmin
        .from(this.tableName)
        .delete()
        .eq('sid', sid);

      if (error) {
        return callback?.(error);
      }

      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async touch(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    // Wait for initialization to complete
    await this.waitForInit();
    
    const maxAge = (sessionData.cookie?.maxAge) || 86400000;
    const expire = new Date(Date.now() + maxAge);

    // Use fallback if table doesn't exist
    if (!this.tableExists) {
      const cached = this.fallbackSessions.get(sid);
      if (cached) {
        cached.expire = expire;
      }
      return callback?.();
    }

    try {
      const { error } = await supabaseAdmin
        .from(this.tableName)
        .update({ expire: expire.toISOString() })
        .eq('sid', sid);

      if (error) {
        return callback?.(error);
      }

      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async clear(callback?: (err?: any) => void): Promise<void> {
    this.fallbackSessions.clear();

    if (!this.tableExists) {
      return callback?.();
    }

    try {
      const { error } = await supabaseAdmin
        .from(this.tableName)
        .delete()
        .neq('sid', '');

      if (error) {
        return callback?.(error);
      }

      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async length(callback: (err: any, length?: number) => void): Promise<void> {
    if (!this.tableExists) {
      return callback(null, this.fallbackSessions.size);
    }

    try {
      const { count, error } = await supabaseAdmin
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        return callback(error);
      }

      callback(null, count || 0);
    } catch (err) {
      callback(err);
    }
  }

  async all(callback: (err: any, sessions?: session.SessionData[] | { [sid: string]: session.SessionData } | null) => void): Promise<void> {
    if (!this.tableExists) {
      const sessions: { [sid: string]: session.SessionData } = {};
      this.fallbackSessions.forEach((value, key) => {
        sessions[key] = value.sess;
      });
      return callback(null, sessions);
    }

    try {
      const { data, error } = await supabaseAdmin
        .from(this.tableName)
        .select('sid, sess');

      if (error) {
        return callback(error);
      }

      const sessions: { [sid: string]: session.SessionData } = {};
      for (const row of data || []) {
        sessions[row.sid] = row.sess as session.SessionData;
      }

      callback(null, sessions);
    } catch (err) {
      callback(err);
    }
  }
}
