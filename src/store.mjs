import { Redis } from '@upstash/redis';
export function createStore(cfg) {
  const redis=new Redis({url:cfg.redisUrl,token:cfg.redisToken});
  return {
    async write(id,snapshot) {
      const tx=redis.multi();
      tx.set(`perch:v1:${id}:latest`,snapshot);
      tx.lpush(`perch:v1:${id}:history`,{receivedAt:snapshot.receivedAt,cpu:snapshot.cpu});
      tx.ltrim(`perch:v1:${id}:history`,0,59);
      await tx.exec();
    },
    async list() {
      const ids=Object.keys(cfg.machines);
      const values=await redis.mget(...ids.map(id=>`perch:v1:${id}:latest`));
      return Promise.all(ids.map(async(id,i)=>({id,name:cfg.machines[id].name,snapshot:values[i],history:await redis.lrange(`perch:v1:${id}:history`,0,59)})));
    }
  };
}
