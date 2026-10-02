import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('mouth moves with microphone energy and closes when speech/stream ends',async()=>{
  let loud=true,disconnects=0;const analyser={fftSize:0,disconnect(){disconnects++;},getByteTimeDomainData(data){data.fill(loud?148:128);}},source={connect(){},disconnect(){disconnects++;}};
  class AudioContext{constructor(){this.state='running';}createMediaStreamSource(){return source;}createAnalyser(){return analyser;}}
  const sandbox={window:{AudioContext,addEventListener(){}},Uint8Array,Math,Set,Map};vm.runInNewContext(await readFile(new URL('../voice-face.js',import.meta.url),'utf8'),sandbox);
  const head={userData:{voiceFace:{ctx:{putImageData(){},beginPath(){},ellipse(){},fill(){},fillRect(){}},texture:{},neutral:{},open:false}}},stream={getAudioTracks:()=>[{readyState:'live',enabled:true}]},animation=sandbox.LowkeyVoiceFace.create();
  animation.update([{id:'me',head,stream}],180);assert.equal(head.userData.voiceFace.open,true);assert.equal(head.userData.voiceFace.texture.needsUpdate,true);
  loud=false;animation.update([{id:'me',head,stream}],600);assert.equal(head.userData.voiceFace.open,false);
  animation.update([{id:'me',head,stream:null}],780);assert.equal(head.userData.voiceFace.open,false);assert.equal(disconnects,2);
});
