import { Redis } from '@upstash/redis';

const redis = new Redis({ 
  url: 'https://saved-crappie-181608.upstash.io', 
  token: 'gQAAAAAAAsVoAAIgcDE2NzRhMjRlYWEzNWQ0ZDZjYjRmYjVlZmViOTQzMGYzYQ'
});

const keys = await redis.keys('dev:ratelimit:*');
console.log('Rate limit keys found:', keys);
for (const k of keys) {
  await redis.del(k);
  console.log('Deleted:', k);
}
console.log('Done');
