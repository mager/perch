import { Redis } from '@upstash/redis';
import { installationScope } from './identity.mjs';
export function createStore(cfg,redis=new Redis({url:cfg.redisUrl,token:cfg.redisToken})) {
  const prefix=`perch:v2:${installationScope(cfg)}`;
  const key=(id,kind)=>`${prefix}:${id}:${kind}`;
  return {
    async write(id,snapshot) {
      if(!Object.hasOwn(cfg.machines,id))throw new Error('Unknown machine');
      const tx=redis.multi();
      tx.set(key(id,'latest'),snapshot);
      tx.lpush(key(id,'history'),{receivedAt:snapshot.receivedAt,cpu:snapshot.cpu});
      tx.ltrim(key(id,'history'),0,59);
      await tx.exec();
    },
    async list() {
      const ids=Object.keys(cfg.machines);
      const values=await redis.mget(...ids.map(id=>key(id,'latest')));
      return Promise.all(ids.map(async(id,i)=>({id,name:cfg.machines[id].name,snapshot:values[i],history:await redis.lrange(key(id,'history'),0,59)})));
    }
  };
}
