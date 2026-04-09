import Redis from 'ioredis';

let _redis: Redis | null = null;
let _redisErrorLogged = false;

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL env var is required');

    _redis = new Redis(url, {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 2000,
    });

    _redis.on('error', (err: Error) => {
      if (!_redisErrorLogged) {
        console.error('[redis] Error:', err.message || err);
        _redisErrorLogged = true;
      }
    });

    _redis.on('connect', () => {
      console.log('[redis] Connected');
      _redisErrorLogged = false;
    });
  }
  return _redis;
}
