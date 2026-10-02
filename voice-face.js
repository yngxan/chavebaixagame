(()=>{
  function create(){
    let context=null,lastAt=0;const meters=new Map();
    function remove(id){const meter=meters.get(id);if(meter){meter.source.disconnect();meter.analyser.disconnect();meters.delete(id);}}
    function update(entries,now){
      if(now-lastAt<90)return;lastAt=now;const active=new Set();
      for(const {id,stream,head} of entries){
        const face=head?.userData.voiceFace;if(!face)continue;let speaking=false;
        if(stream?.getAudioTracks().some(t=>t.readyState==='live'&&t.enabled)){
          active.add(id);try{context||=new(window.AudioContext||window.webkitAudioContext)();let meter=meters.get(id);if(meter?.stream!==stream){remove(id);const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();analyser.fftSize=256;source.connect(analyser);meter={stream,source,analyser,data:new Uint8Array(256),until:0};meters.set(id,meter);}meter.analyser.getByteTimeDomainData(meter.data);let energy=0;for(const value of meter.data)energy+=((value-128)/128)**2;if(Math.sqrt(energy/256)>.024)meter.until=now+160;speaking=now<meter.until;}catch{}
        }
        const open=speaking&&Math.floor(now/140)%3!==0;if(face.open===open)continue;face.open=open;face.ctx.putImageData(face.neutral,0,0);if(open){face.ctx.fillStyle='#301a26';face.ctx.beginPath();face.ctx.ellipse(256,306,23,14,0,0,Math.PI*2);face.ctx.fill();face.ctx.fillStyle='#efe5e2';face.ctx.fillRect(241,294,30,5);}face.texture.needsUpdate=true;
      }
      for(const id of meters.keys())if(!active.has(id))remove(id);
    }
    window.addEventListener('pointerdown',()=>{if(context?.state==='suspended')void context.resume();});
    return{update};
  }
  globalThis.LowkeyVoiceFace={create};
})();
