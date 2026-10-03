import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('  function voicePosition('),html.indexOf('  function updateVoiceButton('));
function setup(){const rides=new Map(),vehicles=new Map(),remotePlayers=new Map([['other',{target:{x:0,y:0,z:0},group:{position:{x:1,y:0,z:0}}}]]),context={localId:'me',avatar:{position:{x:0,y:0,z:0}},remotePlayers,environment:{serverNow:()=>100},coastController:{riderPose:id=>rides.get(id)},vehicleController:{active:id=>vehicles.get(id),pose:model=>model}};vm.createContext(context);vm.runInContext(source,context);return{context,rides,vehicles};}
test('jetski drivers and passengers hear their current seats, not their old boarding locations',()=>{
 const {context:c,vehicles}=setup();vehicles.set('me',{x:100,y:1,z:280});vehicles.set('other',{x:100,y:1,z:279});assert.equal(c.voiceDistance('other'),1);
 vehicles.set('other',{x:130,y:1,z:280});assert.equal(c.voiceDistance('other'),30,'separate distant jets still respect proximity');
 vehicles.delete('other');c.remotePlayers.get('other').group.position={x:101,y:1,z:280};assert.equal(c.voiceDistance('other'),1,'a swimmer near the jet can be heard');
});
test('wheel and coaster listeners follow height and movement; on-foot audio uses the rendered player',()=>{
 const {context:c,rides}=setup();rides.set('me',{x:-18.46,y:32,z:223});rides.set('other',{x:-17.54,y:32,z:223});assert.ok(Math.abs(c.voiceDistance('other')-.92)<1e-8);
 rides.set('other',{x:-17.54,y:1.4,z:223});assert.ok(c.voiceDistance('other')>18,'ground users are not heard from the top of the wheel');
 rides.set('me',{x:22,y:12,z:227});rides.set('other',{x:22.8,y:12,z:227});assert.ok(c.voiceDistance('other')<1);
 rides.clear();assert.equal(c.voiceDistance('other'),1);assert.equal(c.voiceDistance('missing'),Infinity);
});
test('central voice remains audible while two seats travel together and mutes only outside the radius',()=>{
 const {context:c,vehicles}=setup(),audio={volume:0,muted:true,paused:false};c.sfuSubscribers=new Map([['other',{audio}]]);c.voicePlaybackUnlocked=true;c.VOICE_RADIUS=18;c.window={lowkeyAudioGain:()=>1};
 vm.runInContext(html.slice(html.indexOf('function updateSfuSpatialAudio()'),html.indexOf('  function ',html.indexOf('function updateSfuSpatialAudio()')+40)),c);
 for(const x of [0,100,250]){vehicles.set('me',{x,y:1,z:280});vehicles.set('other',{x:x+1,y:1,z:280});c.updateSfuSpatialAudio();assert.equal(audio.muted,false);assert.ok(audio.volume>.9);}
 vehicles.set('other',{x:280,y:1,z:280});c.updateSfuSpatialAudio();assert.equal(audio.muted,true);assert.equal(audio.volume,0);
});
