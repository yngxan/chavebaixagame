import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const step=Function(`return (${source.match(/function aimAssistStep\([^\n]+/)[0]});`)();
test('mobile assistance is gradual, bounded and frame-rate independent',()=>{
  assert.equal(step(0,.016),0);
  assert.equal(step(.1,0),0);
  assert.equal(step(-.1,.016),-step(.1,.016));
  assert.ok(step(.1,.016)>0&&step(.1,.016)<.1);
  assert.ok(step(2,.04)<=.32*.04);
  const run=rate=>{let error=.08;for(let i=0;i<rate;i++)error-=step(error,1/rate);return error;};
  assert.ok(Math.abs(run(30)-run(120))<1e-6);
});
test('assistance is restricted to mobile ADS, nearby cone and visible targets',()=>{
  const body=source.slice(source.indexOf('function updateMobileAimAssist'),source.indexOf('let aimPress'));
  for(const guard of ["(pointer:coarse)",'!glockAiming','localDeadUntil','degToRad(6)','range>32','ray.intersectObjects','if(!blocked)'])assert.ok(body.includes(guard),guard);
});
