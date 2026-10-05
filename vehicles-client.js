(() => {
  function build911({THREE,group,paint,glass,trim,chrome,rubber,lamp,rearLamp,wheels,frontWheels}){
    group.name='Porsche 911 GT3 RS';group.userData.displayName='Porsche 911 GT3 RS';group.userData.wheelRadius=.35;
    const rsRed=new THREE.MeshStandardMaterial({color:0xa91524,metalness:.55,roughness:.29});rsRed.userData.vehicleOwned=true;rsRed.userData.rim=true;
    function mesh(g,m,x=0,y=0,z=0,parent=group){g.userData.vehicleOwned=true;const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
    function box(m,x,y,z,w,h,d,parent){return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent);}
    function skin(m,rows){const p=[],ix=[],n=12;for(const [z,w,y,h]of rows)for(let i=0;i<=n;i++){const a=i*Math.PI/n;p.push(-w*Math.cos(a),y+h*Math.sin(a),z);}for(let j=0;j<rows.length-1;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+n+1;ix.push(a,b,a+1,a+1,b,b+1);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return mesh(g,m);}
    // Low nose, high rounded fenders, arched cabin and descending rear engine cover.
    const bodyRows=[[-2,.77,.67,.62],[-1.86,.88,.81,.78],[-1.60,.93,.92,.91],[-1.25,.95,.99,1.01],[-.85,.90,.99,.97],[-.4,.87,.98,.94],[.15,.85,.96,.93],[.60,.86,.88,.91],[1.0,.89,.81,.94],[1.30,.90,.76,.92],[1.58,.87,.69,.85],[1.85,.79,.61,.69],[2,.68,.56,.56]];
    for(const r of bodyRows)if(r[0]<-.75)r[1]+=.065;
    const bodyCurve=new THREE.CatmullRomCurve3(bodyRows.map(r=>new THREE.Vector3(r[0],r[1],r[2]))),shoulderCurve=new THREE.CatmullRomCurve3(bodyRows.map(r=>new THREE.Vector3(r[0],r[1],r[3]))),bp=[],bi=[],bn=24;
    for(let j=0;j<=64;j++){const row=bodyCurve.getPoint(j/64),edge=shoulderCurve.getPoint(j/64);for(let i=0;i<=bn;i++){const t=i/bn*2-1;bp.push(t*row.y,row.z+(edge.z-row.z)*Math.pow(Math.abs(t),1.6),row.x);}}
    for(let j=0;j<64;j++)for(let i=0;i<bn;i++){const a=j*(bn+1)+i,b=a+bn+1;bi.push(a,b,a+1,a+1,b,b+1);}const bodyGeo=new THREE.BufferGeometry();bodyGeo.setAttribute('position',new THREE.Float32BufferAttribute(bp,3));bodyGeo.setIndex(bi);bodyGeo.computeVertexNormals();mesh(bodyGeo,paint);
    box(trim,0,.29,0,1.48,.14,3.65);
    skin(glass,[[-1.39,.65,.91,.10],[-.78,.69,1.02,.33],[-.35,.67,1.04,.41],[.1,.64,1.03,.38],[.64,.69,.95,.12]]);
    skin(paint,[[-.85,.65,1.33,.025],[-.56,.66,1.40,.055],[-.2,.64,1.40,.055],[.11,.61,1.36,.045]]);
    function face(mat,points,parent=group){const p=[];for(let i=1;i<points.length-1;i++)p.push(...points[0],...points[i],...points[i+1]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return mesh(g,mat,0,0,0,parent);}
    function badge(text,x,y,z,w,h,rotation=0){if(typeof document==='undefined'||typeof document.createElement!=='function')return;const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,128);ctx.fillStyle='#dae0e4';ctx.font='600 67px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64,485);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshStandardMaterial({map,transparent:true,roughness:.3,metalness:.35});mat.userData.vehicleOwned=true;const m=mesh(new THREE.PlaneGeometry(w,h),mat,x,y,z);m.rotation.y=rotation;return m;}
    const door=new THREE.Group();door.position.set(.87,.43,.58);group.add(door);
    for(const side of [-1,1]){
      const outline=new THREE.Shape();outline.moveTo(-1.97,.32);for(const axle of [-1.2,1.23]){outline.lineTo(axle-.415,.35);for(let i=0;i<=24;i++){const a=Math.PI-i*Math.PI/24;outline.lineTo(axle+Math.cos(a)*.415,.35+Math.sin(a)*.415);}}outline.lineTo(1.98,.32);outline.quadraticCurveTo(2.04,.47,1.91,.63);outline.quadraticCurveTo(1.65,.85,1.22,.92);outline.quadraticCurveTo(.90,.95,.58,.92);outline.lineTo(-.5,.97);outline.quadraticCurveTo(-1.26,1.07,-1.75,.85);outline.quadraticCurveTo(-2.02,.70,-1.97,.32);outline.closePath();
      if(side>0){const cut=new THREE.Path();cut.moveTo(-.62,.43);cut.lineTo(-.62,.93);cut.lineTo(.58,.91);cut.lineTo(.58,.43);cut.closePath();outline.holes.push(cut);}
      const shell=new THREE.ExtrudeGeometry(outline,{depth:.025,bevelEnabled:true,bevelThickness:.025,bevelSize:.022,bevelSegments:3,curveSegments:24});shell.rotateY(-Math.PI/2);const sp=shell.attributes.position;for(let i=0;i<sp.count;i++){const z=sp.getZ(i),flare=.075*Math.exp(-Math.pow((z+1.2)/.58,2))+.035*Math.exp(-Math.pow((z-1.23)/.5,2));sp.setX(i,sp.getX(i)+side*flare);}shell.computeVertexNormals();mesh(shell,paint,side*.87,0,0);
      const window=[[side*.865,.95,.59],[side*.615,1.36,.10],[side*.655,1.40,-.55],[side*.82,.99,-.93]];
      const local=side>0?window.map(p=>[p[0]-.87,p[1]-.43,p[2]-.58]):window,parent=side>0?door:group;face(glass,local,parent);face(glass,[...local].reverse(),parent);
      const quarter=[[side*.83,1.00,-.96],[side*.65,1.38,-.61],[side*.65,1.32,-.88],[side*.80,1.01,-1.25]];face(glass,quarter);face(glass,[...quarter].reverse());
      const pillar=[[side*.80,1.0,-1.27],[side*.65,1.33,-.88],[side*.59,1.22,-1.08],[side*.75,.97,-1.43]];face(paint,pillar);face(paint,[...pillar].reverse());
      for(const [a,b]of [[window[0],window[1]],[window[2],window[3]]]){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va),pillar=mesh(new THREE.CylinderGeometry(.027,.027,delta.length(),8),paint);pillar.position.copy(va.add(vb).multiplyScalar(.5));pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
      // Independent fenders give the 911 its raised front wings and broad rear hips.
      for(const z of [-1.2,1.23]){
        const arch=mesh(new THREE.TorusGeometry(.407,z<0?.042:.035,8,36,Math.PI),paint,side*(z<0?.957:.927),.35,z);arch.rotation.y=Math.PI/2;
        const wheel=new THREE.Group();wheel.position.set(side*(z<0?.975:.945),.35,z);group.add(wheel);wheels.push(wheel);if(z>0)frontWheels.push(wheel);
        const tire=mesh(new THREE.TorusGeometry(.272,.078,10,28),rubber,0,0,0,wheel);tire.rotation.y=Math.PI/2;
        const hub=mesh(new THREE.CylinderGeometry(.235,.235,.17,24),trim,0,0,0,wheel);hub.rotation.z=Math.PI/2;
        const ring=mesh(new THREE.TorusGeometry(.228,.015,6,24),rsRed,side*.10,0,0,wheel);ring.rotation.y=Math.PI/2;
        for(let i=0;i<10;i++){const a=Math.floor(i/2)*Math.PI*2/5+(i%2?.07:-.07),s=box(rsRed,side*.11,Math.cos(a)*.13,Math.sin(a)*.13,.023,.21,.033,wheel);s.rotation.x=a;}
        const center=mesh(new THREE.CylinderGeometry(.044,.044,.019,16),chrome,side*.115,0,0,wheel);center.rotation.z=Math.PI/2;
        box(rearLamp,side*.91,.38,z+.17,.045,.15,.08);
      }
      const headRoot=new THREE.Group();headRoot.position.set(side*.64,.825,1.49);headRoot.rotation.x=-.92;group.add(headRoot);
      const head=mesh(new THREE.SphereGeometry(1,24,16),glass,0,0,0,headRoot);head.scale.set(.195,.185,.052);
      const led=mesh(new THREE.TorusGeometry(.164,.009,8,32),lamp,0,0,.047,headRoot);led.scale.y=1.08;
      for(const x of [-.057,.057])for(const y of [-.05,.05])box(lamp,x,y,.058,.032,.024,.008,headRoot);
      // Bake the lens tilt into its vertices so it merges with the body details.
      headRoot.updateMatrix();for(const child of [...headRoot.children]){child.updateMatrix();child.geometry.applyMatrix4(child.matrix);child.geometry.applyMatrix4(headRoot.matrix);child.position.set(0,0,0);child.rotation.set(0,0,0);child.scale.set(1,1,1);group.add(child);}group.remove(headRoot);
      const intake=box(trim,side*.54,.43,1.94,.43,.13,.055);intake.rotation.y=-side*.12;box(lamp,side*.55,.58,1.925,.32,.018,.014);
      for(let i=0;i<3;i++)box(trim,side*.54,.405+i*.034,1.976,.38,.011,.014);
      const mirror=mesh(new THREE.SphereGeometry(1,16,10),paint,side*.95,1.02,.47);mirror.scale.set(.14,.055,.11);box(glass,side*.95,1.02,.37,.17,.06,.014);
      // RS bonnet ducts, fender louvers and upright aero blades.
      const hoodY=(x,z)=>{let row,edge,dist=Infinity;for(let i=0;i<=128;i++){const p=bodyCurve.getPoint(i/128);if(Math.abs(p.x-z)<dist){dist=Math.abs(p.x-z);row=p;edge=shoulderCurve.getPoint(i/128);}}return row.z+(edge.z-row.z)*Math.pow(Math.abs(x/row.y),1.6)+.012;},ductPoints=[[side*.18,0,.76],[side*.40,0,.76],[side*.35,0,1.14],[side*.23,0,1.14]].map(([x,y,z])=>[x,hoodY(x,z),z]);face(trim,ductPoints);face(trim,[...ductPoints].reverse());
      for(let i=0;i<4;i++){const vent=box(trim,side*.78,.986,1.02+i*.06,.14,.012,.029);vent.rotation.z=-side*.16;}
      const inlet=[[side*.971,.92,-.74],[side*.984,.92,-.91],[side*.984,.65,-.87],[side*.971,.70,-.79]];face(trim,inlet);face(trim,[...inlet].reverse());
      box(trim,side*.947,.51,.72,.045,.35,.17);box(trim,side*.935,.31,-.03,.075,.045,1.6);
      const canard=box(trim,side*.84,.365,1.71,.07,.27,.32);canard.rotation.x=-.2;
      box(trim,side*.85,.84,-.1,.014,.014,1.25);box(chrome,side*.855,.83,-.32,.018,.035,.15);
      const pipe=mesh(new THREE.CylinderGeometry(.075,.075,.20,16),chrome,side*.55,.29,-1.98);pipe.rotation.x=Math.PI/2;
      const hole=mesh(new THREE.CircleGeometry(.056,16),rubber,side*.55,.29,-2.085);hole.rotation.y=Math.PI;
      box(trim,side*.39,.57,-.22,.51,.13,.57);box(trim,side*.39,.87,-.45,.5,.50,.14);
    }
    for(const [z,w,y,h]of [[2,.68,.31,.25],[-2,.77,.31,.36]]){const points=[];for(let i=0;i<=24;i++){const a=i*Math.PI/24;points.push([-w*Math.cos(a),y+h*Math.sin(a),z]);}face(paint,z>0?points:[...points].reverse());}
    box(trim,0,.40,2.007,.48,.09,.025);box(trim,0,.295,1.96,1.46,.035,.13);
    const lip=mesh(new THREE.SphereGeometry(1,32,12),paint,0,.565,1.95);lip.scale.set(.73,.055,.07);
    const rearBumper=mesh(new THREE.SphereGeometry(1,32,12),paint,0,.55,-1.97);rearBumper.scale.set(.77,.09,.065);
    box(rearLamp,0,.78,-1.94,1.55,.045,.036);box(trim,0,.39,-1.99,1.46,.18,.07);
    skin(paint,[[-1.82,.88,.83,.065],[-1.62,.88,.93,.045]]);for(let i=-6;i<=6;i++)box(trim,i*.075,.955,-1.53,.023,.018,.25);
    box(chrome,0,.52,-2.035,.43,.1,.014);box(chrome,0,.42,1.97,.4,.09,.014);
    badge('P O R S C H E',0,.69,-2.018,.71,.067,Math.PI);badge('911',0,.59,-2.025,.16,.06,Math.PI);
    const crest=mesh(new THREE.PlaneGeometry(.055,.075),new THREE.MeshStandardMaterial({color:0xbaa25b,metalness:.65,roughness:.25}),0,.665,1.76);crest.material.userData.vehicleOwned=true;crest.rotation.x=-1.3;
    box(paint,0,.25,-.60,.035,.49,1.18,door);
    box(rsRed,.032,.058,-.60,.022,.10,1.13,door);box(rsRed,-.918,.488,-.02,.026,.10,1.13);
    for(const side of [-1,1]){const decal=badge('GT3 RS',side*.937,.49,-.02,.82,.10,side*Math.PI/2);if(decal&&side>0){group.remove(decal);door.add(decal);decal.position.set(.047,.06,-.60);}}
    // Tall swan-neck wing and end plates establish the GT3 RS silhouette.
    for(const side of [-1,1]){const support=box(trim,side*.55,1.22,-1.50,.055,.62,.10);support.rotation.x=-.15;box(trim,side*.55,1.48,-1.72,.055,.055,.45);const end=box(paint,side*1.02,1.51,-1.85,.035,.22,.51);end.rotation.x=-.13;}
    const wing=box(trim,0,1.52,-1.85,2.04,.065,.48);wing.rotation.x=-.12;box(rsRed,0,1.515,-2.10,1.97,.026,.035);
    box(trim,0,.82,.28,1.24,.12,.23);box(trim,0,.58,-.05,.16,.22,.65);
    const steering=mesh(new THREE.TorusGeometry(.13,.02,8,24),trim,.32,1.03,.22);steering.rotation.x=-.3;
    // Narrow bonnet shut-lines and rear diffuser fins add scale without noise.
    for(const side of [-1,1]){const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(side*.42,.65,1.79),new THREE.Vector3(side*.44,.78,1.1),new THREE.Vector3(side*.47,.90,.61)]),line=new THREE.Line(g,new THREE.LineBasicMaterial({color:0x43494c}));g.userData.vehicleOwned=true;line.material.userData.vehicleOwned=true;group.add(line);}
    for(const x of [-.36,-.18,0,.18,.36])box(trim,x,.30,-2.005,.018,.09,.11);
    // Bake fixed details into one mesh per material, preserving wheels and door.
    for(const parent of [...wheels,door,group]){const buckets=new Map();for(const child of [...parent.children])if(child.isMesh){child.updateMatrix();const geo=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();geo.applyMatrix4(child.matrix);const b=buckets.get(child.material)||{p:[],n:[],uv:[]};b.p.push(...geo.attributes.position.array);b.n.push(...geo.attributes.normal.array);b.uv.push(...(geo.attributes.uv?.array||new Array(geo.attributes.position.count*2).fill(0)));buckets.set(child.material,b);geo.dispose();child.geometry.dispose();parent.remove(child);}for(const [mat,b]of buckets){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geo.computeBoundingSphere();mesh(geo,mat,0,0,0,parent);}}
    return door;
  }
  // One authored Mk7-style hatchback. Static details are merged by material;
  // only the four wheels and the usable driver door retain separate transforms.
  function buildGolf({THREE,group,paint,glass,trim,chrome,rubber,lamp,rearLamp,wheels,frontWheels}){
    group.name='Golf GTI Mk7';group.userData.displayName='Golf GTI';group.userData.wheelRadius=.345;
    const red=new THREE.MeshStandardMaterial({color:0xc71932,roughness:.34,metalness:.25});red.userData.vehicleOwned=true;
    const geometryList=new Set(),staticParents=[];
    function mesh(geo,mat,parent=group){geo.userData.vehicleOwned=true;geometryList.add(geo);const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
    function block(mat,x,y,z,w,h,d,parent=group){const m=mesh(new THREE.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);return m;}
    function face(mat,points,parent=group){const positions=[];for(let i=1;i<points.length-1;i++)positions.push(...points[0],...points[i],...points[i+1]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();return mesh(g,mat,parent);}
    function rod(mat,a,b,r=.015,parent=group){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va),m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),6),mat,parent);m.position.copy(va.add(vb).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
    function loft(mat,sections){const vertices=[],indices=[];
      for(const [z,w,lo,hi]of sections)for(const [x,y]of [[-w*.91,lo],[-w,lo+.035],[-w,hi-.04],[-w*.89,hi],[w*.89,hi],[w,hi-.04],[w,lo+.035],[w*.91,lo]])vertices.push(x,y,z);
      for(let j=0;j<sections.length-1;j++)for(let i=0;i<8;i++){const a=j*8+i,b=j*8+(i+1)%8,c=b+8,d=a+8;indices.push(a,c,b,a,d,c);}
      for(let i=1;i<7;i++){indices.push(0,i,i+1);const last=(sections.length-1)*8;indices.push(last,last+i+1,last+i);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,mat);
    }
    function label(text,x,y,z,w,h,rotation=0,parent=group,color='#edf1f4',background='#111820'){
      if(typeof document==='undefined'||typeof document.createElement!=='function')return;
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='italic 900 88px Arial';ctx.fillText(text,256,68,485);
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshStandardMaterial({map,roughness:.4});mat.userData.vehicleOwned=true;const m=mesh(new THREE.PlaneGeometry(w,h),mat,parent);m.position.set(x,y,z);m.rotation.y=rotation;m.castShadow=false;
    }
    const door=new THREE.Group();door.position.set(.835,.42,.60);group.add(door);
    // Sculpted side panels have true wheel cut-outs, rather than tires over a box.
    for(const side of [-1,1]){
      const shape=new THREE.Shape();shape.moveTo(-1.77,.32);shape.lineTo(-1.54,.32);
      for(const axle of [-1.10,1.10]){shape.lineTo(axle-.43,.345);for(let i=0;i<=18;i++){const a=Math.PI-i*Math.PI/18;shape.lineTo(axle+Math.cos(a)*.43,.345+Math.sin(a)*.43);}}
      shape.lineTo(1.78,.32);shape.lineTo(1.83,.55);shape.lineTo(1.76,.94);shape.lineTo(1.36,.98);shape.lineTo(.58,1.01);shape.lineTo(-.7,1.04);shape.lineTo(-1.52,1.0);shape.lineTo(-1.78,.96);shape.closePath();
      if(side>0){const opening=new THREE.Path();opening.moveTo(-.49,.43);opening.lineTo(-.49,.99);opening.lineTo(.55,.99);opening.lineTo(.55,.43);opening.closePath();shape.holes.push(opening);}
      const g=new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelSize:.018,bevelThickness:.013,bevelSegments:2,steps:1,curveSegments:12});g.rotateY(-Math.PI/2);const shell=mesh(g,paint);shell.position.x=side>0?.87:-.825;
      block(trim,side*.854,.30,0,.075,.105,1.30);
      // Belt line, rear door cut and handles. Front right door moves as one piece.
      rod(trim,[side*.891,.97,-1.38],[side*.891,.97,.54],.006);
      rod(trim,[side*.892,.42,-.54],[side*.892,1.02,-.54],.006);
      block(paint,side*.891,.92,-.89,.045,.042,.17);
      if(side<0){block(paint,side*.891,.92,-.26,.045,.042,.18);rod(trim,[side*.892,.43,.56],[side*.892,1.01,.56],.006);}
      const front=[[side*.795,1.035,.51],[side*.69,1.455,.09],[side*.69,1.485,-.47],[side*.80,1.045,-.47]];
      const rear=[[side*.80,1.045,-.56],[side*.69,1.485,-.56],[side*.69,1.46,-1.05],[side*.79,1.045,-1.37]];
      if(side>0){const p=front.map(v=>[v[0]-.835,v[1]-.42,v[2]-.60]);face(glass,p,door);face(glass,[...p].reverse(),door);}else{face(glass,front);face(glass,[...front].reverse());}
      face(glass,rear);face(glass,[...rear].reverse());
      rod(paint,[side*.79,1.015,.58],[side*.68,1.49,.11],.033);
      rod(trim,[side*.80,1.03,-.515],[side*.69,1.49,-.515],.036);
      face(paint,[[side*.80,1.025,-1.39],[side*.69,1.475,-1.07],[side*.66,1.46,-1.24],[side*.77,1.01,-1.64]]);
      face(paint,[[side*.77,1.01,-1.64],[side*.66,1.46,-1.24],[side*.69,1.475,-1.07],[side*.80,1.025,-1.39]]);
      rod(trim,[side*.8,1.015,-1.41],[side*.8,1.015,.57],.012);
      const mirror=block(paint,side*.98,1.11,.47,.22,.115,.22);mirror.rotation.y=side*.16;block(glass,side*.98,1.115,.35,.17,.072,.014);block(trim,side*.87,1.065,.45,.12,.055,.11);
      block(chrome,side*.896,.97,.76,.014,.035,.14);
    }
    loft(paint,[[-1.78,.78,.36,.87],[-1.59,.59,.36,1.005],[.58,.59,.36,1.01],[1.76,.77,.36,.86]]);
    loft(paint,[[.55,.83,.95,1.035],[.92,.86,.93,1.005],[1.49,.84,.88,.975],[1.77,.77,.84,.945]]);
    loft(paint,[[-1.25,.64,1.43,1.495],[-1.05,.70,1.47,1.535],[-.30,.705,1.475,1.54],[.12,.67,1.44,1.515]]);
    face(glass,[[-.735,1.04,.59],[.735,1.04,.59],[.665,1.46,.115],[-.665,1.46,.115]]);
    face(glass,[[.735,1.04,.59],[-.735,1.04,.59],[-.665,1.46,.115],[.665,1.46,.115]]);
    face(glass,[[-.73,1.04,-1.66],[-.64,1.43,-1.255],[.64,1.43,-1.255],[.73,1.04,-1.66]]);
    face(glass,[[.73,1.04,-1.66],[.64,1.43,-1.255],[-.64,1.43,-1.255],[-.73,1.04,-1.66]]);
    block(paint,0,1.50,-1.265,1.46,.07,.22);block(trim,0,1.459,-1.345,1.42,.028,.10);block(rearLamp,0,1.463,-1.405,.66,.022,.012);
    rod(trim,[-.50,1.055,.584],[.13,1.055,.584],.010);rod(trim,[-.3,1.09,-1.625],[.28,1.09,-1.625],.010);
    block(paint,.004,.275,-.55,.042,.53,1.12,door);block(paint,.052,.50,-.85,.05,.045,.17,door);
    // GTI face: slim red grille line, U-shaped lamps and three bumper fins.
    block(trim,0,.79,1.79,1.50,.19,.11);block(trim,0,.455,1.805,1.14,.26,.11);
    block(red,0,.842,1.854,1.52,.025,.018);
    for(const side of [-1,1]){
      block(glass,side*.598,.855,1.80,.43,.13,.065);
      for(const xx of [side*.48,side*.70]){block(lamp,xx,.811,1.847,.142,.022,.012);block(lamp,xx-side*.066,.852,1.847,.020,.085,.012);block(lamp,xx+side*.066,.847,1.847,.018,.075,.012);}
      block(trim,side*.69,.49,1.78,.22,.30,.07);
      for(const y of [.41,.49,.57]){const fin=block(trim,side*.70,y,1.845,.28,.022,.10);fin.rotation.y=side*.10;}
      block(lamp,side*.79,.49,1.824,.025,.17,.013);
      block(rearLamp,side*.56,.907,-1.787,.48,.105,.035);block(rearLamp,side*.856,.92,-1.59,.022,.095,.27);
      block(trim,side*.56,.883,-1.81,.36,.020,.012);block(lamp,side*.43,.886,-1.824,.14,.014,.010);
      const exhaust=mesh(new THREE.CylinderGeometry(.07,.07,.19,16),chrome);exhaust.rotation.x=Math.PI/2;exhaust.position.set(side*.63,.28,-1.78);
      const exhaustHole=mesh(new THREE.CircleGeometry(.054,16),rubber);exhaustHole.position.set(side*.63,.28,-1.88);exhaustHole.rotation.y=Math.PI;
    }
    block(trim,0,.28,1.80,1.61,.075,.12);block(paint,0,.65,1.80,1.63,.13,.10);for(const side of [-1,1])block(paint,side*.817,.49,1.78,.085,.32,.12);block(trim,0,.29,-1.73,1.60,.12,.21);block(paint,0,.61,-1.765,1.59,.40,.08);
    for(const x of [-.40,-.20,0,.20,.40])block(trim,x,.265,-1.79,.018,.065,.10);
    // Repeated hexagonal inserts are baked into the grille material's one mesh.
    for(let row=0;row<3;row++)for(let col=0;col<13;col++){const x=(col-6)*.079+(row%2)*.039,y=.38+row*.065;for(let i=0;i<6;i++){const a=i*Math.PI/3,b=(i+1)*Math.PI/3;rod(chrome,[x+Math.cos(a)*.038,y+Math.sin(a)*.038,1.869],[x+Math.cos(b)*.038,y+Math.sin(b)*.038,1.869],.003);}}
    for(const [z,rot,y]of [[1.862,0,.824],[-1.826,Math.PI,.96]]){const badge=mesh(new THREE.TorusGeometry(.072,.009,6,24),chrome);badge.position.set(0,y,z);badge.rotation.y=rot;label('VW',0,y,z+(z>0?.003:-.003),.11,.10,rot);}
    label('GTI',-.40,.785,1.852,.17,.065,0,group,'#ecedef');label('GTI',.52,.78,-1.813,.20,.078,Math.PI,group,'#ecedef');
    label('LOWKEY',0,.607,1.87,.43,.10,0,group,'#14202c','#edf0ee');label('LOWKEY',0,.61,-1.82,.43,.10,Math.PI,group,'#14202c','#edf0ee');
    // Diamond-cut five-spoke alloys, brake discs and red calipers.
    for(const side of [-1,1])for(const z of [-1.10,1.10]){
      const root=new THREE.Group();root.position.set(side*.825,.345,z);group.add(root);wheels.push(root);if(z>0)frontWheels.push(root);staticParents.push(root);
      const tire=mesh(new THREE.TorusGeometry(.266,.079,10,32),rubber,root);tire.rotation.y=Math.PI/2;
      const disc=mesh(new THREE.CylinderGeometry(.213,.213,.045,24),chrome,root);disc.rotation.z=Math.PI/2;
      const barrel=mesh(new THREE.CylinderGeometry(.242,.242,.15,24),trim,root);barrel.rotation.z=Math.PI/2;
      for(const facing of [-1,1]){
        const ring=mesh(new THREE.TorusGeometry(.231,.012,6,32),chrome,root);ring.rotation.y=Math.PI/2;ring.position.x=facing*.085;
        for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const spoke=block(chrome,facing*.09,Math.cos(a)*.132,Math.sin(a)*.132,.024,.20,.05,root);spoke.rotation.x=a;const cut=block(trim,facing*.106,Math.cos(a+.10)*.15,Math.sin(a+.10)*.15,.006,.14,.018,root);cut.rotation.x=a+.1;}
        const hub=mesh(new THREE.CylinderGeometry(.055,.055,.022,16),chrome,root);hub.rotation.z=Math.PI/2;hub.position.x=facing*.095;
      }
      block(red,side*.88,.40,z+.165,.05,.16,.09);
    }
    for(const x of [-.39,.39]){block(trim,x,.55,-.22,.53,.12,.61);const back=block(trim,x,.84,-.49,.53,.55,.14);back.rotation.x=-.11;block(trim,x,1.18,-.51,.26,.17,.12);for(const dz of [-.4,-.2,0])block(red,x,.614,dz,.38,.006,.022);}
    block(trim,0,1.01,.38,1.38,.14,.26);const steering=mesh(new THREE.TorusGeometry(.13,.025,6,18),trim);steering.position.set(.32,1.08,.19);steering.rotation.x=-.35;
    staticParents.push(door,group);
    for(const parent of staticParents){const buckets=new Map();for(const child of [...parent.children])if(child.isMesh){child.updateMatrix();const g=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();g.applyMatrix4(child.matrix);const bucket=buckets.get(child.material)||{positions:[],normals:[],uvs:[]};bucket.positions.push(...g.attributes.position.array);bucket.normals.push(...g.attributes.normal.array);if(g.attributes.uv)bucket.uvs.push(...g.attributes.uv.array);else bucket.uvs.push(...new Array(g.attributes.position.count*2).fill(0));buckets.set(child.material,bucket);g.dispose();parent.remove(child);}
      for(const [mat,bucket]of buckets){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(bucket.positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(bucket.normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(bucket.uvs,2));geo.computeBoundingSphere();geo.userData.vehicleOwned=true;const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);}
    }
    for(const geo of geometryList)geo.dispose();return door;
  }
  function create({THREE,scene,box,mats,getExternalVehicles=()=>[]}) {
    const models=new Map(),rubber=new THREE.MeshStandardMaterial({color:0x16191d,roughness:.95}),chrome=new THREE.MeshStandardMaterial({color:0xb9c3ce,metalness:.7,roughness:.3});
    const glass=new THREE.MeshStandardMaterial({color:0x152129,roughness:.18,metalness:.35});
    const trim=new THREE.MeshStandardMaterial({color:0x252b33,roughness:.55,metalness:.25}),seatMaterial=new THREE.MeshStandardMaterial({color:0x343d49,roughness:.9});
    const rearLamp=new THREE.MeshStandardMaterial({color:0xe83c40,emissive:0xbd1724,emissiveIntensity:.55,roughness:.3});
    const lamp=new THREE.MeshStandardMaterial({color:0xffe9bc,emissive:0xffdba0,emissiveIntensity:1});
    // A tiny shared reflection environment gives paint and glass readable highlights
    // without six scene renders per car or a postprocessing pass on mobile.
    let reflections=null;
    if(typeof document!=='undefined'&&typeof document.createElement==='function'){
      const faces=Array.from({length:6},(_,i)=>{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,128);gradient.addColorStop(0,'#b6d7f4');gradient.addColorStop(.47,'#e1e9ef');gradient.addColorStop(.5,'#64727d');gradient.addColorStop(1,'#293037');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);ctx.fillStyle=i%2?'#edf2f6':'#94a8b8';ctx.fillRect(16,9,15,59);ctx.fillRect(71,4,30,46);return canvas;});
      reflections=new THREE.CubeTexture(faces);reflections.colorSpace=THREE.SRGBColorSpace;reflections.needsUpdate=true;
      for(const m of [glass,chrome]){m.envMap=reflections;m.envMapIntensity=.65;}glass.color.set(0x233642);glass.roughness=.14;
    }
    function addModel(state) {
      const group=new THREE.Group(),wheels=[],frontWheels=[];scene.add(group);let doorPivot=null;
      const paint=new THREE.MeshPhysicalMaterial({color:state.color||(state.kind==='car'?'#e9eceb':'#5067ed'),roughness:.27,metalness:.32,clearcoat:.85,clearcoatRoughness:.2});
      paint.envMap=reflections;paint.envMapIntensity=.75;
      function panel(x,y,z,width,height,depth,topWidth,topDepth,mat=paint){
        const geometry=new THREE.BoxGeometry(width,height,depth),positions=geometry.attributes.position;
        for(let i=0;i<positions.count;i++)if(positions.getY(i)>0){positions.setX(i,positions.getX(i)*topWidth/width);positions.setZ(i,positions.getZ(i)*topDepth/depth);}
        geometry.userData.vehicleOwned=true;geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
      }
      function wheel(x,z,radius,width,front){const root=new THREE.Group();root.position.set(x,radius,z);group.add(root);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,16),rubber);mesh.rotation.z=Math.PI/2;mesh.castShadow=true;root.add(mesh);const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.67,radius*.67,width+.018,12),trim);hub.rotation.z=Math.PI/2;root.add(hub);for(const side of [-1,1]){for(let i=0;i<5;i++){const spoke=box(root,side*(width/2+.014),0,0,.018,radius*1.16,.055,chrome,{cast:false});spoke.rotation.x=i*Math.PI/5;}box(root,side*(width/2+.022),0,0,.026,.10,.10,chrome,{cast:false});}wheels.push(root);if(front)frontWheels.push(root);}
      if(state.kind==='car') {
        doorPivot=(state.model==='911'?build911:buildGolf)({THREE,group,paint,glass,trim,chrome,rubber,lamp,rearLamp,wheels,frontWheels});
        group.scale.setScalar(LowkeyWorld.CAR_SCALE);
        group.userData.wheelRadius*=LowkeyWorld.CAR_SCALE;
      } else if(state.kind==='moto') {
        wheel(0,-.85,.36,.16,false);wheel(0,.9,.36,.16,true);
        box(group,0,.56,-.04,.22,.16,1.65,trim);
        const tank=box(group,0,.89,.21,.45,.30,.62,paint);tank.rotation.x=.12;
        panel(0,.66,.33,.59,.60,.98,.47,.72);
        const nose=panel(0,1.02,.72,.53,.39,.52,.40,.34);nose.rotation.x=-.20;
        const screen=panel(0,1.30,.65,.35,.32,.055,.27,.045,glass);screen.rotation.x=-.34;
        for(const x of [-.30,.30]){const fairing=box(group,x,.67,.25,.045,.34,.51,paint);fairing.rotation.z=x<0?-.12:.12;box(group,x*1.02,.72,.40,.025,.09,.24,trim);}
        box(group,0,1.05,.18,.18,.022,.13,chrome,{cast:false});
        const engine=new THREE.Mesh(new THREE.CylinderGeometry(.20,.21,.27,8),chrome);engine.position.set(0,.5,.04);engine.rotation.z=Math.PI/2;group.add(engine);
        for(const y of [.42,.48,.54,.60])box(group,0,y,.09,.40,.025,.31,trim,{cast:false});
        for(const x of [-.16,.16]){const frame=box(group,x,.61,-.11,.05,.52,.055,trim);frame.rotation.x=.7;box(group,x,.39,-.31,.055,.07,.62,chrome);}
        box(group,0,.83,-.29,.43,.12,.59,rubber);box(group,0,.88,-.64,.38,.12,.25,rubber);
        const tail=box(group,0,.75,-.75,.41,.14,.40,paint);tail.rotation.x=-.12;
        for(const z of [-.85,.9]){const fender=box(group,0,.73,z,.25,.07,.47,paint);fender.rotation.x=z>0?.07:-.15;}
        for(const x of [-.1,.1]){const fork=box(group,x,.73,.79,.065,.77,.065,chrome);fork.rotation.x=-.2;const shock=box(group,x,.56,-.68,.055,.36,.055,chrome);shock.rotation.x=.42;}
        box(group,0,1.10,.72,.70,.055,.065,chrome);for(const x of [-.33,.33]){box(group,x,1.10,.72,.16,.085,.085,rubber);const stem=box(group,x,1.25,.75,.025,.27,.025,chrome);stem.rotation.z=x<0?-.25:.25;box(group,x*1.14,1.36,.75,.18,.09,.05,trim);}
        box(group,0,1.06,.89,.27,.23,.14,trim);box(group,0,1.06,.98,.22,.16,.035,lamp,{cast:false});
        box(group,0,.80,-.95,.22,.075,.035,rearLamp,{cast:false});box(group,0,.63,-1.04,.16,.14,.025,chrome,{cast:false});
        for(const x of [-.26,.26]){box(group,x,.42,-.2,.18,.045,.08,trim);box(group,x,.46,-.63,.14,.035,.07,trim);}
        box(group,.27,.43,-.49,.13,.13,.75,chrome);box(group,.27,.43,-.88,.08,.08,.04,rubber);
      } else {
        const boat=state.kind==='boat',width=boat?3.0:.95,length=boat?6.6:2.65;
        // Faceted bow and tapered underside share the same footprint as hull probes.
        const shape=new THREE.Shape();shape.moveTo(-width*.43,-length*.5);shape.lineTo(width*.43,-length*.5);shape.lineTo(width*.5,length*.12);shape.lineTo(width*.30,length*.39);shape.lineTo(0,length*.5);shape.lineTo(-width*.30,length*.39);shape.lineTo(-width*.5,length*.12);shape.closePath();
        const geometry=new THREE.ExtrudeGeometry(shape,{depth:boat?.48:.28,bevelEnabled:true,bevelSegments:1,bevelSize:boat?.12:.06,bevelThickness:.08,steps:1});geometry.userData.vehicleOwned=true;geometry.rotateX(Math.PI/2);const hull=new THREE.Mesh(geometry,paint);hull.position.y=boat?.48:.27;hull.castShadow=true;hull.receiveShadow=true;group.add(hull);
        if(boat){
          panel(0,.43,-.22,2.66,.12,5.7,2.62,5.65,chrome);
          for(const x of [-1.35,1.35])box(group,x,.73,-.55,.13,.53,4.8,paint);
          panel(0,.81,1.45,2.62,.46,1.20,2.35,.94);panel(0,1.24,1.02,2.24,.51,.11,1.98,.09,glass);
          box(group,.57,.93,.68,.51,.38,.36,trim);const helm=new THREE.Mesh(new THREE.TorusGeometry(.17,.028,6,12),chrome);helm.position.set(.55,1.13,.54);helm.rotation.x=-.6;group.add(helm);
          for(const x of [-.75,.75]){box(group,x,.65,.7,.60,.14,.7,seatMaterial);box(group,x,.93,.27,.6,.58,.13,seatMaterial);box(group,x,.63,-1.50,.62,.16,2.25,seatMaterial);box(group,x*1.49,.96,-1.5,.12,.52,2.25,seatMaterial);}
          box(group,0,.73,-3.05,2.25,.14,.44,paint);for(const x of [-.67,.67]){box(group,x,.31,-3.43,.41,.58,.5,trim);box(group,x,-.18,-3.53,.12,.46,.21,chrome);}
          for(const x of [-1.07,1.07])box(group,x,1.1,2.0,.045,.13,1.2,chrome);
        }else{
          panel(0,.47,.60,.85,.50,1.15,.50,.75);box(group,0,.55,-.36,.46,.19,1.19,seatMaterial);box(group,0,.89,.30,.72,.065,.07,chrome);
          for(const x of [-.31,.31])box(group,x,.89,.30,.18,.10,.09,rubber);const screen=panel(0,.85,.72,.40,.24,.065,.30,.045,glass);screen.rotation.x=-.28;
          for(const x of [-.47,.47])box(group,x,.24,-.25,.13,.06,1.7,trim);box(group,0,.17,-1.34,.24,.13,.13,chrome);
        }
      }
      const headlight=new THREE.PointLight(0xffdfa5,0,10,2);headlight.position.set(0,.90,state.kind==='car'?2:1.2);group.add(headlight);
      group.position.set(state.x,state.y,state.z);group.rotation.y=state.rotation;
      const wheelPaint=chrome.clone();wheelPaint.userData.vehicleOwned=true;wheelPaint.color.set(state.wheelColor||(state.model==='911'?'#a91524':'#b9c3ce'));for(const wheel of wheels)wheel.traverse(m=>{if(m.isMesh&&(m.material===chrome||m.material.userData.rim))m.material=wheelPaint;});
      models.set(state.id,{group,wheels,frontWheels,headlight,doorPivot,paint,wheelPaint,state:{...state},motion:new LowkeyMotion.MotionBuffer(),predicted:{...state},driverRevision:0,wheelAngle:0});
    }
    for(const state of LowkeyWorld.initialVehicles())addModel(state);
    function receive(world,arrival,serverNow) {
      const current=new Set((world.vehicles||[]).map(v=>v.id));
      for(const [id,model] of models)if(!current.has(id)){scene.remove(model.group);const geos=new Set(),ownedMaterials=new Set();model.group.traverse(o=>{if(o.geometry&&(o.geometry.type!=='BoxGeometry'||o.geometry.userData.vehicleOwned))geos.add(o.geometry);if(o.material?.userData.vehicleOwned)ownedMaterials.add(o.material);});for(const g of geos)g.dispose();for(const m of ownedMaterials){m.map?.dispose();m.dispose();}model.paint.dispose();model.headlight.dispose();models.delete(id);}
      for(const state of world.vehicles||[]) {
        if(!models.has(state.id))addModel(state);const model=models.get(state.id);
        if(model.state.driverId!==state.driverId)model.driverRevision++;
        model.state={...state};model.authoritativeAt=world.serverTime;
        model.paint.color.set(state.color||(state.kind==='car'?'#e9eceb':'#5067ed'));
        model.wheelPaint.color.set(state.wheelColor||(state.model==='911'?'#a91524':'#b9c3ce'));
        model.motion.push({x:state.x,y:state.y,z:state.z,rotation:state.rotation,motionTime:world.serverTime,motionReset:model.driverRevision,walking:Math.abs(state.speed)>.05,speed:Math.abs(state.speed)},arrival);
        model.pending={...state};model.pendingAge=Math.min(.2,Math.max(0,(serverNow-world.serverTime)/1000));
      }
    }
    function update(dt,now,serverNow,localId,input,night,localPosition) {
      const focus=localPosition||active(localId)?.group.position||new THREE.Vector3(),lit=new Set([...models.values()].filter(m=>m.group.position.distanceTo(focus)<28).sort((a,b)=>a.group.position.distanceToSquared(focus)-b.group.position.distanceToSquared(focus)).slice(0,4).map(m=>m.state.id));
      let collisionStates=null;
      for(const model of models.values()) {
        const owned=localId&&model.state.driverId===localId;model.owned=Boolean(owned);
        let pose;
        if(owned) {
          // Only the driver's vehicle runs physics. Remote vehicles just interpolate.
          collisionStates ||= [...models.values()].map(other=>other.state).concat(getExternalVehicles());
          const obstacles=LowkeyWorld.vehicleObstacles(model.state,collisionStates),controls={...(model.state.wrecked||model.state.hijacking?{throttle:0,steer:0,brake:true}:input),serverTime:serverNow};
          if(model.pending) {
            const expected=model.pending,age=Math.min(.3,Math.max(0,(serverNow-model.authoritativeAt)/1000)),steps=Math.ceil(age/.025);
            for(let i=0;i<steps;i++){LowkeyWorld.advanceVehicle(expected,controls,age/steps,obstacles);if(expected.collision)break;}
            if(Math.hypot(model.predicted.x-expected.x,model.predicted.z-expected.z)>4||model.predicted.driverId!==expected.driverId||model.state.hijacking||model.state.wrecked){model.predicted={...expected};model.correction=null;}
            else model.correction={x:expected.x-model.predicted.x,z:expected.z-model.predicted.z,rotation:Math.atan2(Math.sin(expected.rotation-model.predicted.rotation),Math.cos(expected.rotation-model.predicted.rotation))};
            if(Boolean(model.predicted.airborne)!==Boolean(expected.airborne)||Math.abs(model.predicted.y-expected.y)>1){model.predicted.y=expected.y;}
            for(const key of ['airborne','airVelocityX','airVelocityY','airVelocityZ','airPitch','airTime','rampCooldown'])model.predicted[key]=expected[key];
            model.predicted.speed=expected.speed;model.predicted.steering=expected.steering;model.predicted.wheelieAngle=expected.wheelieAngle;model.pending=null;
          }
          const steps=Math.max(1,Math.ceil(dt/.025));
          for(let i=0;i<steps;i++){LowkeyWorld.advanceVehicle(model.predicted,controls,dt/steps,obstacles);if(model.predicted.collision)break;}
          if(model.correction){const blend=1-Math.exp(-10*dt),x=model.predicted.x+model.correction.x*blend,z=model.predicted.z+model.correction.z*blend;if(LowkeyWorld.vehicleClearAt(model.predicted,x,z,model.predicted.rotation+model.correction.rotation*blend,obstacles)){for(const axis of ['x','z','rotation']){const delta=model.correction[axis]*blend;model.predicted[axis]+=delta;model.correction[axis]-=delta;}}else model.correction=null;}
          pose=model.predicted;
        } else {pose=model.motion.sample(now,dt)||model.state;model.pending=null;}
        model.wheelieAngle=THREE.MathUtils.damp(model.wheelieAngle||0,(owned?model.predicted.wheelieAngle:model.state.wheelieAngle)||0,18,dt);
        const frame=LowkeyWorld.vehicleFrame({...model.state,x:pose.x,y:pose.y,z:pose.z,rotation:pose.rotation,wheelieAngle:model.wheelieAngle,airborne:owned?model.predicted.airborne:model.state.airborne,airPitch:owned?model.predicted.airPitch:model.state.airPitch});
        const watercraft=LowkeyWorld.isWatercraft(model.state);if(watercraft)frame.y=LowkeyWorld.waterHeight(frame.x,frame.z,serverNow);
        model.group.position.set(frame.x,frame.y,frame.z);model.group.rotation.order='YXZ';model.group.rotation.x=frame.pitch;model.group.rotation.y=pose.rotation;
        const speed=owned?model.predicted.speed:model.state.speed,steer=(owned?model.predicted.steering:model.state.steering)||0;
        if(watercraft)model.group.rotation.x=Math.sin(serverNow*.0015+pose.z*.1)*.025+Math.min(.08,Math.abs(speed)*.004);
        model.group.rotation.z=THREE.MathUtils.damp(model.group.rotation.z,model.state.kind==='moto'||watercraft?Math.max(-.24,Math.min(.24,steer*speed*.013)):0,8,dt);
        if(model.doorPivot){const progress=model.state.hijacking?Math.max(0,Math.min(1,(serverNow-model.state.hijacking.startedAt)/LowkeyWorld.HIJACK_MS)):0,open=model.state.wrecked?.35:model.state.hijacking?Math.min(1,progress/.28)*Math.min(1,(1-progress)/.12)*1.05:0;model.doorPivot.rotation.y=THREE.MathUtils.damp(model.doorPivot.rotation.y,-open,18,dt);model.group.rotation.x=THREE.MathUtils.damp(model.group.rotation.x,model.state.wrecked?.08:0,5,dt);}
        model.wheelAngle+=speed*dt/(model.group.userData.wheelRadius||(model.state.kind==='car'?.41:.36));
        for(const wheel of model.wheels){wheel.rotation.x=model.wheelAngle;wheel.rotation.y=model.frontWheels.includes(wheel)?-steer*.35:0;}
        model.headlight.visible=night>.01&&lit.has(model.state.id);model.headlight.intensity=night*(model.state.kind==='car'?7:4);
      }
    }
    function active(id){if(!id)return null;return [...models.values()].find(model=>model.state.driverId===id||(model.state.passengerIds||[]).includes(id))||null;}
    function isDriver(id,model){return Boolean(id&&model?.state.driverId===id);}
    function canBoard(model){return Boolean(model&&!model.state.wrecked&&!model.state.hijacking&&(!model.state.driverId||(model.state.passengerIds||[]).length<LowkeyWorld.passengerCapacity(model.state)));}
    function renderedState(model){const airPitch=-model.group.rotation.x,airborne=Boolean(model.owned?model.predicted.airborne:model.state.airborne),frame=LowkeyWorld.vehicleFrame({...model.state,x:0,y:0,z:0,rotation:model.group.rotation.y,wheelieAngle:model.wheelieAngle,airborne,airPitch});return {...model.state,x:model.group.position.x-frame.x,y:model.group.position.y-frame.y,z:model.group.position.z-frame.z,rotation:model.group.rotation.y,wheelieAngle:model.wheelieAngle,airborne,airPitch};}
    function driverPose(model){return LowkeyWorld.driverPose(renderedState(model));}
    function passengerPose(model,seat=0){return LowkeyWorld.passengerPose(renderedState(model),seat);}
    function interaction(model,position){return LowkeyWorld.vehicleInteraction(renderedState(model),position);}
    function pose(model,id){if(isDriver(id,model))return driverPose(model);const seat=(model.state.passengerIds||[]).indexOf(id);return seat>=0?passengerPose(model,seat):driverPose(model);}
    function nearest(position,predicate=()=>true){return [...models.values()].filter(model=>!model.state.wrecked&&predicate(model)&&Math.hypot(position.x-model.group.position.x,position.z-model.group.position.z)<=3.5&&Math.abs(position.y-model.group.position.y)<1.5).sort((a,b)=>position.distanceTo(a.group.position)-position.distanceTo(b.group.position))[0]||null;}
    function animateHijack(id,group,arms,legs,body,serverNow){
      const model=[...models.values()].find(item=>item.state.hijacking&&(item.state.hijacking.thiefId===id||item.state.hijacking.victimId===id));
      if(!model){if(group.userData.hijacking){group.userData.hijacking=false;group.scale.setScalar(1);body.rotation.set(0,0,0);for(const arm of arms){arm.rotation.set(0,0,0);arm.userData.forearm?.rotation.set(0,0,0);}for(const leg of legs)leg.rotation.set(0,0,0);}return false;}
      const victim=model.state.hijacking.victimId===id,state={...model.state,x:model.group.position.x,y:model.group.position.y,z:model.group.position.z,rotation:model.group.rotation.y},pose=LowkeyWorld.hijackPose(state,victim?'victim':'thief',serverNow),t=pose.progress;
      group.userData.hijacking=true;group.position.set(pose.x,pose.y,pose.z);group.rotation.y=pose.rotation;group.scale.setScalar(pose.scale);
      if(victim){body.rotation.set(-.15*Math.sin(pose.pull*Math.PI),0,-.2*Math.sin(pose.pull*Math.PI));for(const [i,arm] of arms.entries()){arm.rotation.set(-.8*(1-pose.pull),0,(i?1:-1)*(.12+Math.sin(pose.pull*Math.PI)*.35));arm.userData.forearm?.rotation.set(-.3,0,0);}for(const [i,leg] of legs.entries())leg.rotation.set(-1.35*(1-pose.pull)+Math.sin(pose.pull*Math.PI)*(i?-.25:.3),0,0);}
      else{const reach=Math.max(0,Math.min(1,(t-.12)/.13)),pull=pose.pull,enter=pose.enter;body.rotation.set(.18*reach*(1-enter)-.12*Math.sin(pull*Math.PI),0,-.08*Math.sin(pull*Math.PI));for(const [i,arm] of arms.entries()){const forward=i===0?reach:reach*Math.max(0,Math.min(1,(t-.27)/.1));arm.rotation.set(-1.45*forward*(1-enter)-1.1*enter,0,(i?1:-1)*.16);arm.userData.forearm?.rotation.set(-.2-forward*pull*.75,0,0);}for(const [i,leg] of legs.entries()){const stride=t<.22?Math.sin(t/.22*Math.PI*2)*(i?-.25:.25):0;leg.rotation.set(stride-1.35*enter-(i===0?Math.sin(enter*Math.PI)*.65:0),0,0);}}
      return true;
    }
    return{models,receive,update,active,isDriver,canBoard,interaction,driverPose,passengerPose,pose,nearest,animateHijack};
  }
  globalThis.LowkeyVehicles={create};
})();
