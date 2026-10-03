(() => {
  function policeMarkers(police, localId) {
    if (!localId || !police.stars()) return [];
    return [...police.rigs.values()].filter(r => r.state.health > 0).map(r => ({id:r.state.id,x:r.group.position.x,z:r.group.position.z}));
  }
  function create({layout,getPosition,getRotation=()=>0,getLocalId,police,canUse,onOpen=()=>{},onClose=()=>{}}) {
    const style=document.createElement('style');style.textContent=`.lk-map-toggle{position:fixed;right:72px;top:150px;z-index:35;width:46px;height:46px;border-radius:14px;border:1px solid #d4ff0060;background:#09140ee8;color:#d4ff00;font:900 11px system-ui;touch-action:manipulation}.lk-map{position:fixed;z-index:95;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(600px,94vw);max-height:90dvh;overflow:auto;border:1px solid #d4ff0060;border-radius:18px;background:#101d1a;box-shadow:0 20px 70px #000a;color:#eef4df;font:13px system-ui}.lk-map[hidden],.lk-map-toggle[hidden]{display:none!important}.lk-map header{padding:14px 18px;display:flex;align-items:center;justify-content:space-between}.lk-map header button{background:#25372c;color:#e5ffd5;border:0;border-radius:8px;padding:8px 16px;font-size:20px;touch-action:manipulation}.lk-map canvas{display:block;width:100%;height:auto}.lk-map footer{padding:12px 18px;font-size:11px;line-height:1.6}.map-open .crosshair{visibility:hidden}.photo-mode .lk-map-toggle,body.mobile-avatar-preview .lk-map-toggle{display:none}@media(max-width:600px){.lk-map-toggle{top:225px;right:69px}.lk-map{width:94vw}}@media(max-height:500px){.lk-map-toggle{top:90px}.lk-map{width:min(520px,75vw)}.lk-map canvas{max-height:65dvh;object-fit:contain}}`;document.head.append(style);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='lk-map-toggle';toggle.textContent='MAPA';toggle.title='Mapa · M';toggle.setAttribute('aria-label','Abrir mapa');document.body.append(toggle);
    const panel=document.createElement('section');panel.className='lk-map';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Mapa da cidade');panel.innerHTML='<header><strong>LOWKEY · MAPA DA CIDADE</strong><button type="button" aria-label="Fechar mapa">×</button></header><canvas width="600" height="600" aria-label="Sua posição, cidade, praia e policiais em alerta"></canvas><footer><span></span><br>▲ Você · DP Delegacia · G Garagem · R Boutique · P Píer · J Marina<br>M ou × para fechar. A busca começa no local do crime, mesmo fora da visão da polícia.</footer>';document.body.append(panel);
    const canvas=panel.querySelector('canvas'),ctx=canvas.getContext('2d'),status=panel.querySelector('footer span'),background=document.createElement('canvas');background.width=background.height=600;const bg=background.getContext('2d'),b=layout.bounds;
    const scale=Math.min(560/(b.maxX-b.minX),560/(b.maxZ-b.minZ)),ox=300-(b.minX+b.maxX)/2*scale,oz=300-(b.minZ+b.maxZ)/2*scale;
    function rect(c,r,color){c.save();c.translate(ox+r.x*scale,oz+r.z*scale);c.rotate(-(r.rot||r.rotation||0));c.fillStyle=color;c.fillRect(-r.hx*scale,-r.hz*scale,r.hx*2*scale,r.hz*2*scale);c.restore();}
    bg.fillStyle='#164654';bg.fillRect(0,0,600,600);rect(bg,{x:0,z:0,hx:layout.MAP_HALF_SIZE,hz:layout.MAP_HALF_SIZE},'#456141');
    for(const r of layout.coast.surfaces)rect(bg,r,r.kind==='sand'?'#c9b887':r.kind==='pier'||r.kind==='dock'?'#937854':'#919b8b');
    for(const r of layout.roads)rect(bg,r,'#344047');
    for(const building of layout.buildings)rect(bg,{...building,hx:building.width/2,hz:building.depth/2},'#a5aea5');
    rect(bg,layout.safeZone,'#65874d');bg.fillStyle='#e4f4d3';bg.font='bold 12px system-ui';bg.textAlign='center';bg.fillText('PRAÇA · SAFE',ox,oz+4);
    for(const [p,label]of [[layout.policeStation,'DP'],[layout.garage,'G'],...layout.boutiques.map(p=>[p,'R']),[{x:0,z:224},'P'],[{x:0,z:280},'J']]){bg.fillStyle='#152526';bg.fillRect(ox+p.x*scale-11,oz+p.z*scale-10,22,20);bg.fillStyle='#d4ff00';bg.fillText(label,ox+p.x*scale,oz+p.z*scale+4);}
    bg.fillStyle='#bfe4e3';bg.fillText('N ↑',555,30);bg.fillText('PRAIA',ox+85,oz+157*scale);
    let open=false,last=0;
    function close(){if(!open)return;open=false;panel.hidden=true;document.body.classList.remove('map-open');toggle.setAttribute('aria-expanded','false');onClose();toggle.focus();}
    function show(){if(!canUse())return;open=true;panel.hidden=false;document.body.classList.add('map-open');toggle.setAttribute('aria-expanded','true');onOpen();last=0;update(performance.now());panel.querySelector('button').focus();}
    toggle.addEventListener('click',()=>open?close():show());panel.querySelector('button').addEventListener('click',close);panel.addEventListener('pointerdown',e=>e.stopPropagation());panel.addEventListener('keydown',e=>{if(e.code!=='Escape')e.stopPropagation();});
    document.addEventListener('keydown',e=>{if(e.target.closest?.('input,textarea,[contenteditable]'))return;if((e.code==='KeyM'&&!e.repeat)||(e.code==='Escape'&&open)){e.preventDefault();e.stopImmediatePropagation();open?close():show();}},true);
    function update(now){toggle.hidden=!getLocalId();if(open&&!getLocalId())close();if(!open||now-last<100)return;last=now;ctx.drawImage(background,0,0);const alert=police.stars();status.textContent=alert?`${'★'.repeat(alert)} · Policiais em alerta: pontos azuis (posições atualizadas)`:'SEM PERSEGUIÇÃO · Policiais ocultos no mapa';
      for(const p of policeMarkers(police,getLocalId())){ctx.beginPath();ctx.arc(ox+p.x*scale,oz+p.z*scale,4.5,0,Math.PI*2);ctx.fillStyle='#5aabff';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#e2f1ff';ctx.stroke();}
      const p=getPosition();ctx.save();ctx.translate(ox+p.x*scale,oz+p.z*scale);ctx.rotate(-getRotation());ctx.beginPath();ctx.moveTo(0,9);ctx.lineTo(-6,-6);ctx.lineTo(6,-6);ctx.closePath();ctx.fillStyle='#d4ff00';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#102112';ctx.stroke();ctx.restore();
    }
    return {isOpen:()=>open,close,update};
  }
  globalThis.LowkeyMap={create,policeMarkers};
})();
