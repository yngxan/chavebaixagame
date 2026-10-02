import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('ghost descent control is created before binding and releases its movement key',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  // Preserve the actual startup order: this used to throw before animate() ran.
  const startup=html.split('\n').filter(line=>/^\s*(const ghostDownButton=|ghostDownButton\.addEventListener)/.test(line)).join('\n');
  const listeners=new Map(),keys=new Set(),button={setAttribute(){},setPointerCapture(){},addEventListener(type,handler){listeners.set(type,handler);}};
  vm.runInNewContext(startup,{keys,document:{createElement:()=>button,querySelector:()=>({appendChild(){}})}});
  let prevented=false;
  listeners.get('pointerdown')({pointerId:7,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(keys.has('ShiftRight'),true);
  for(const type of ['pointerup','pointercancel','lostpointercapture']){keys.add('ShiftRight');listeners.get(type)();assert.equal(keys.has('ShiftRight'),false);}
});
