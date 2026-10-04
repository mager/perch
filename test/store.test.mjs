import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../src/store.mjs';

// Shared fake transport exercises the actual store's key selection and retention.
// Hosted Upstash behavior remains an integration check.
function memoryRedis(){
  const values=new Map();
  return {
    values,
    async mget(...keys){return keys.map(key=>values.get(key)??null);},
    async lrange(key,start,end){return (values.get(key)||[]).slice(start,end+1);},
    multi(){
      const operations=[];
      return {
        set(key,value){operations.push(()=>values.set(key,value));},
        lpush(key,value){operations.push(()=>values.set(key,[value,...values.get(key)||[]]));},
        ltrim(key,start,end){operations.push(()=>values.set(key,values.get(key).slice(start,end+1)));},
        async exec(){operations.forEach(operation=>operation());},
      };
    },
  };
}
const cfg={origin:'https://one.example',clientId:'client',ownerEmail:'one@gmail.com',machines:{mini:{name:'Mini'}}};
test('installations and owners with identical machine IDs never mix snapshots or history',async()=>{
  const redis=memoryRedis(),first=createStore(cfg,redis);
  await first.write('mini',{receivedAt:1,cpu:10,hostname:'first-private-host'});
  for(const config of [{...cfg,origin:'https://two.example'},{...cfg,ownerEmail:'two@gmail.com'},{...cfg,ownerSub:'pinned-owner'},{...cfg,clientId:'another-client'}]){
    const second=createStore(config,redis);
    assert.equal((await second.list())[0].snapshot,null);
    assert.deepEqual((await second.list())[0].history,[]);
    await second.write('mini',{receivedAt:2,cpu:20,hostname:'second-private-host'});
    assert.equal((await second.list())[0].snapshot.hostname,'second-private-host');
    assert.equal((await first.list())[0].snapshot.hostname,'first-private-host');
    assert.deepEqual((await first.list())[0].history,[{receivedAt:1,cpu:10}]);
  }
});
test('legacy unscoped data is not adopted into a new owner namespace',async()=>{
  const redis=memoryRedis();redis.values.set('perch:v1:mini:latest',{hostname:'previous-owner'});
  redis.values.set('perch:v1:mini:history',[{cpu:99,receivedAt:1}]);
  assert.deepEqual(await createStore(cfg,redis).list(),[{id:'mini',name:'Mini',snapshot:null,history:[]}]);
});
test('storage lists only configured machines, bounds history, and rejects unknown writes',async()=>{
  const redis=memoryRedis(),store=createStore(cfg,redis);
  for(let i=0;i<65;i++)await store.write('mini',{receivedAt:i,cpu:i});
  const machines=await store.list();
  assert.equal(machines.length,1);assert.equal(machines[0].history.length,60);
  assert.equal(machines[0].snapshot.receivedAt,64);assert.equal(machines[0].history.at(-1).receivedAt,5);
  await assert.rejects(store.write('unknown',{}),/Unknown machine/);
  assert.equal(redis.values.size,2);
});
