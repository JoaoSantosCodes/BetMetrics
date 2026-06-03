import { kv } from '@vercel/kv';

const hasKv = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Local in-memory cache fallback for development
const localCache = new Map<string, { value: any; expiry: number }>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (hasKv) {
    try {
      return await kv.get<T>(key);
    } catch (e) {
      console.error('Vercel KV read failed, falling back to local cache:', e);
    }
  }

  const cached = localCache.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expiry) {
    localCache.delete(key);
    return null;
  }

  return cached.value as T;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number = 60): Promise<void> {
  if (hasKv) {
    try {
      await kv.set(key, value, { ex: ttlSeconds });
      return;
    } catch (e) {
      console.error('Vercel KV write failed, falling back to local cache:', e);
    }
  }

  const expiry = Date.now() + ttlSeconds * 1000;
  localCache.set(key, { value, expiry });
}

export async function cacheDelete(key: string): Promise<void> {
  if (hasKv) {
    try {
      await kv.del(key);
      return;
    } catch (e) {
      console.error('Vercel KV delete failed, falling back to local cache:', e);
    }
  }

  localCache.delete(key);
}
