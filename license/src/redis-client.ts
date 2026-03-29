import Redis from 'ioredis';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL env var is required');
    _redis = new Redis(url, { lazyConnect: false, enableOfflineQueue: true });
    _redis.on('error', (err: Error) => {
      console.error('[redis] Error:', err.message);
    });
    _redis.on('connect', () => {
      console.log('[redis] Connected');
    });
  }
  return _redis;
}
