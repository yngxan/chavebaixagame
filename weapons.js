(()=>{
  const definitions={
    punch:{id:'punch',name:'SOCO',category:'Desarmado',interval:80,range:2.7,damage:4,icon:'fist'},
    glock:{id:'glock',name:'GLOCK',category:'Pistola · semiautomática',interval:150,range:70,damage:34,headDamage:100,spread:.0015,bloom:.0017,kick:.024,pellets:1,magazine:20,icon:'pistol'},
    mp5:{id:'mp5',name:'MP5',category:'Submetralhadora · automática',interval:100,range:62,damage:22,headDamage:66,spread:.0028,bloom:.0018,kick:.014,pellets:1,magazine:30,automatic:true,icon:'smg'},
    ak47:{id:'ak47',name:'AK-47',category:'Fuzil · automático',interval:130,range:90,damage:36,headDamage:100,spread:.0018,bloom:.003,kick:.034,pellets:1,magazine:30,automatic:true,icon:'rifle'},
    shotgun:{id:'shotgun',name:'SHOTGUN',category:'Escopeta · ação por bombeamento',interval:850,range:32,damage:12,headDamage:18,spread:.057,bloom:0,kick:.075,pellets:8,magazine:8,icon:'shotgun'},
    knife:{id:'knife',name:'FACA',category:'Corpo a corpo',interval:380,range:2.65,damage:40,icon:'knife'}
  };
  const order=Object.keys(definitions),get=id=>definitions[id]||definitions.punch;
  const firearm=id=>Boolean(definitions[id]?.pellets);
  const iconPaths={
    fist:'M34 55V30q0-8 9-8h6v26h5V19h15v29h5V22h14v26h5V29h13v36q0 22-22 22H57L32 65l-13-5 5-17 10 8Z',
    pistol:'M17 31h86v24H67l9 31H55L44 56H17Zm49 24h17v12H69M27 27h12m49 0h9',
    smg:'M10 36h67l8 6h26v10H77L68 63H51l-4 27H34l4-38H10Zm51 25h15l5 26H66M80 28v13M5 42h8M23 34v18',
    rifle:'M5 43h26l9-11h39v8h36v10H78l-5 12H51L36 78H23l11-24H5Zm55 17q0 21 18 30H64Q48 76 48 60M87 32v8M105 30v10',
    shotgun:'M4 43h35l9-9h69v11H59l-9 12H35L20 75H4l21-26M59 46h50v9H59M72 30h30M44 48l9 17h-9',
    knife:'M9 82l26-26 12 12-26 26Zm27-28L86 5l27-2-2 26-47 48-8-8 33-40-42 34ZM29 48l38 38-8 8-38-38Z'
  };
  const icon=(id,klass='')=>`<svg class="${klass}" viewBox="0 0 120 100" aria-hidden="true"><path d="${iconPaths[get(id).icon]}" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;
  function shotDirections(id,yaw,pitch,spread,random=Math.random){
    return Array.from({length:get(id).pellets||1},()=>{const a=random()*Math.PI*2,r=Math.sqrt(random())*spread,y=yaw+Math.cos(a)*r,p=pitch+Math.sin(a)*r;return{x:-Math.sin(y)*Math.cos(p),y:-Math.sin(p),z:Math.cos(y)*Math.cos(p)};});
  }
  // All models share a grip origin and face +Z, so view/character rigs use the same hand.
  function addModels(THREE,mount,material){
    const pistol=new THREE.Group();for(const child of [...mount.children])pistol.add(child);mount.add(pistol);
    const variants={glock:pistol},muzzles={glock:mount.userData.muzzle};
    const dark=material('#24292b',.55),metal=material('#5a6468',.36),black=material('#101519',.6),wood=material('#92502a',.68),silver=material('#bbc9ce',.28);
    const build=id=>{const root=new THREE.Group();root.visible=false;mount.add(root);variants[id]=root;
      const box=(sx,sy,sz,x,y,z,mat=dark)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);m.castShadow=true;root.add(m);return m;};
      const tube=(r,length,x,y,z,mat=metal)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,length,10),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);m.castShadow=true;root.add(m);return m;};
      const grip=box(.105,.19,.12,0,-.105,-.075,black);grip.rotation.x=-.2;
      let tip=.68;
      if(id==='ak47'){
        box(.145,.135,.34,0,.033,.10);box(.16,.11,.25,0,.035,.385,wood);box(.145,.14,.27,0,-.005,-.32,wood).rotation.x=-.05;
        tube(.022,.31,0,.057,.64);tube(.015,.24,0,.102,.52);box(.03,.085,.035,0,.105,.73,black);
        const mag=new THREE.Group();mag.position.set(0,-.045,.155);root.add(mag);for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.078,.073,.13),black);m.position.set(0,-i*.066,.014*i*i);m.rotation.x=-i*.1;mag.add(m);}
        tip=.805;
      }else if(id==='mp5'){
        box(.135,.14,.32,0,.032,.105);tube(.063,.28,0,.028,.35,black);tube(.023,.16,0,.033,.565);box(.03,.09,.035,0,.075,.51,black);
        box(.085,.25,.11,0,-.17,.15,black).rotation.x=-.14;box(.13,.07,.25,0,.02,-.30,black);box(.16,.14,.04,0,-.015,-.435,black);
        tip=.655;
      }else if(id==='shotgun'){
        box(.145,.115,.28,0,.035,.09);tube(.026,.68,-.032,.081,.49);tube(.029,.61,.032,.015,.47,black);
        box(.165,.11,.235,0,-.027,.36,wood);box(.15,.15,.27,0,-.025,-.31,wood).rotation.x=-.13;
        for(let i=0;i<5;i++)box(.17,.013,.012,0,-.02,.28+i*.038,black);tip=.85;
      }else{
        root.remove(grip);box(.072,.18,.07,0,-.085,-.075,black);box(.16,.023,.085,0,.014,-.075,metal);
        const blade=new THREE.Shape();blade.moveTo(-.055,0);blade.lineTo(.055,0);blade.lineTo(.038,.26);blade.lineTo(0,.35);blade.lineTo(-.045,.26);blade.closePath();
        const m=new THREE.Mesh(new THREE.ExtrudeGeometry(blade,{depth:.018,bevelEnabled:true,bevelThickness:.006,bevelSize:.005,bevelSegments:1,steps:1}),silver);m.rotation.x=Math.PI/2;m.position.set(0,.043,-.072);root.add(m);tip=.30;
      }
      const muzzle=new THREE.Object3D();muzzle.position.set(0,id==='shotgun'?.081:.06,tip);root.add(muzzle);muzzles[id]=muzzle;
      if(id!=='knife'){box(.025,.025,.045,0,.12,-.018,black);box(.052,.013,.025,0,.105,.17,metal);}
    };
    for(const id of ['mp5','ak47','shotgun','knife'])build(id);
    mount.userData.variants=variants;mount.userData.muzzles=muzzles;selectModel(mount,'glock');
  }
  function selectModel(mount,id){if(!mount?.userData.variants)return;const chosen=definitions[id]&&id!=='punch'?id:'glock';for(const [key,group]of Object.entries(mount.userData.variants))group.visible=key===chosen;mount.userData.weaponId=chosen;mount.userData.muzzle=mount.userData.muzzles[chosen];}
  globalThis.LowkeyWeapons={definitions,order,get,firearm,icon,shotDirections,addModels,selectModel};
})();
