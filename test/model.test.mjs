import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshness,relativeTime,demoScenario,historyPoints} from '../public/model.js';
import {demoMachines} from '../src/demo.mjs';
test('freshness boundary and missing snapshots are explicit',()=>{
  assert.equal(freshness(null,1000000),'empty');
  assert.equal(freshness({receivedAt:820000},1000000),'fresh');
  assert.equal(freshness({receivedAt:819999},1000000),'stale');
  assert.equal(relativeTime(1001000,1000000),'0s ago');
});
test('sample scenarios cannot alter real responses or their originals',()=>{
  const data={demo:false,serverTime:1000000,machines:demoMachines(1000000)};
  assert.equal(demoScenario(data,'empty'),data.machines);
  const sample={...data,demo:true};
  assert.equal(demoScenario(sample,'empty')[0].snapshot,null);
  assert.ok(sample.machines[0].snapshot);
});
test('history is sorted, validated, and leaves the server array intact',()=>{
  const rows=[{receivedAt:2,cpu:20},{receivedAt:1,cpu:30},{receivedAt:3,cpu:Infinity}];
  assert.deepEqual(historyPoints(rows),[{receivedAt:1,cpu:30},{receivedAt:2,cpu:20}]);
  assert.equal(rows[0].receivedAt,2);
});
