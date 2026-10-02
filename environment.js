(() => {
  function create({THREE,scene,sky,sun,sunOrb,hemi,fill,ambient,renderer,lamps,lampMaterial,cloudMaterials,getFocus}) {
    let serverAnchor=Date.now(),localAnchor=performance.now(),lastLabel=-1;
    const dayFog=new THREE.Color(0xadcbd1),nightFog=new THREE.Color(0x10182e),daySky=new THREE.Color(0xd9eeff),nightSky=new THREE.Color(0x7185be),dayFill=new THREE.Color(0xb9d5ff),nightFill=new THREE.Color(0x688ad4);
    const moon=new THREE.Mesh(new THREE.SphereGeometry(6,16,12),new THREE.MeshBasicMaterial({color:0xd8e6ff}));moon.position.set(180,240,-140);scene.add(moon);
    scene.add(sun.target);
    const positions=[];let seed=73219;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<260;i++){const angle=random()*Math.PI*2,y=.12+random()*.86,r=Math.sqrt(1-y*y)*320;positions.push(Math.cos(angle)*r,y*320,Math.sin(angle)*r);}
    const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const starMaterial=new THREE.PointsMaterial({color:0xe4ebff,size:.13,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true});scene.add(new THREE.Points(starGeometry,starMaterial));
    const label=document.querySelector('.brand-sub');
    function sync(serverTime){if(!Number.isFinite(serverTime))return;serverAnchor=serverTime;localAnchor=performance.now();}
    function serverNow(){return serverAnchor+performance.now()-localAnchor;}
    function update(){
      const now=serverNow(),day=LowkeyWorld.daylight(now),night=1-day;
      // Follow the player with the original shadow resolution instead of stretching it over the whole city.
      if(getFocus){const focus=getFocus();sun.position.set(focus.x-22,32,focus.z+18);sun.target.position.set(focus.x,0,focus.z);sun.target.updateMatrixWorld(true);}
      sky.material.uniforms.daylight.value=day;sun.intensity=.16+2.49*day;hemi.intensity=.46+.84*day;hemi.color.copy(nightSky).lerp(daySky,day);fill.intensity=.28+.27*day;fill.color.copy(nightFill).lerp(dayFill,day);ambient.intensity=.09+.03*day;
      renderer.toneMappingExposure=1+.08*night;scene.fog.color.copy(nightFog).lerp(dayFog,day);sunOrb.visible=day>.02;moon.visible=night>.02;moon.material.color.setRGB(.84*night,.90*night,night);starMaterial.opacity=night*.9;
      for(const light of lamps)light.intensity=night*18;lampMaterial.emissiveIntensity=.03+night*1.6;
      for(const material of cloudMaterials){material.emissiveIntensity=.015+.065*day;}
      const second=Math.floor(now/1000);
      if(label&&second!==lastLabel){lastLabel=second;const remaining=Math.ceil((LowkeyWorld.SEGMENT_MS-now%LowkeyWorld.SEGMENT_MS)/1000);label.textContent=`PRAÇA 001 · ${Math.floor(now/LowkeyWorld.SEGMENT_MS)%2?'🌙 NOITE':'☀ DIA'} · ${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;}
      return night;
    }
    return{sync,serverNow,update};
  }
  globalThis.LowkeyEnvironment={create};
})();
