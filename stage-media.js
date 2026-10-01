(() => {
  const defaults = { master: 1, effects: 1, ambient: 1, music: .7, voice: 1 };
  let volumes = { ...defaults };
  try { const saved = JSON.parse(localStorage.getItem('lowkey-audio') || '{}'); for (const key of Object.keys(defaults)) if (Number.isFinite(saved[key])) volumes[key] = Math.max(0, Math.min(1, saved[key])); } catch {}
  window.lowkeyAudioGain = category => volumes.master * (volumes[category] ?? 1);
  // Perspective mapping of a DOM player onto the four projected screen corners.
  function screenTransform(points, width = 480, height = 270) {
    const source = [[0,0],[width,0],[width,height],[0,height]], rows = [];
    source.forEach(([x,y], i) => { const [u,v] = points[i]; rows.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]); });
    for (let i=0;i<8;i++) { let pivot=i; for(let j=i+1;j<8;j++) if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i])) pivot=j; [rows[i],rows[pivot]]=[rows[pivot],rows[i]]; const divisor=rows[i][i]; if(Math.abs(divisor)<1e-8)return null; for(let k=i;k<9;k++)rows[i][k]/=divisor; for(let j=0;j<8;j++)if(j!==i){const factor=rows[j][i];for(let k=i;k<9;k++)rows[j][k]-=factor*rows[i][k];} }
    const [a,b,c,d,e,f,g,h]=rows.map(row=>row[8]);
    return `matrix3d(${[a,d,0,g,b,e,0,h,0,0,1,0,c,f,0,1].join(',')})`;
  }
  window.lowkeyScreenTransform = screenTransform;
  window.setupStageMedia = ({ THREE, camera, avatar, banner, scene, getUser, toast }) => {
    const style=document.createElement('style');style.textContent=`
      #soundSettingsButton{position:fixed;top:calc(14px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:25;width:42px;height:42px;border-radius:12px;background:#12251eed;color:white;border:1px solid #d4ff0070;font-size:22px;cursor:pointer}
      #soundSettings{position:fixed;z-index:110;right:12px;top:calc(64px + env(safe-area-inset-top));width:min(340px,calc(100vw - 24px));max-height:calc(100dvh - 84px);overflow:auto;padding:18px;background:#12251ef5;border:1px solid #d4ff0070;border-radius:16px;color:white;font:14px Arial;box-sizing:border-box}
      #soundSettings[hidden]{display:none}#soundSettings label{display:block;margin:14px 0}#soundSettings input[type=range]{width:100%;accent-color:#d4ff00}#soundSettings button{padding:10px;border:1px solid #d4ff0070;border-radius:9px;background:#203c2f;color:white;cursor:pointer}#soundSettings input[type=url]{box-sizing:border-box;width:100%;padding:10px;margin:10px 0;border-radius:8px}#stagePlayerSurface{position:fixed;top:0;left:0;width:480px;height:270px;transform-origin:0 0;z-index:2;background:#050805;overflow:hidden}#stagePlayerSurface iframe{border:0;width:480px;height:270px}#stagePlayerSurface[hidden]{display:none}
      @media(max-height:450px){#soundSettings{top:58px;max-height:calc(100dvh - 70px)}}`;
    document.head.append(style);
    const button=document.createElement('button');button.id='soundSettingsButton';button.textContent='⚙';button.title='Som e palco';button.setAttribute('aria-label','Configurações de som e palco');button.setAttribute('aria-expanded','false');button.hidden=true;document.body.append(button);
    const panel=document.createElement('section');panel.id='soundSettings';panel.hidden=true;panel.setAttribute('aria-label','Configurações de som');
    panel.innerHTML='<button id="closeSound" style="float:right" aria-label="Fechar configurações">×</button><h3>SOM E PALCO</h3><div id="volumeSliders"></div><p style="font-size:12px">Volumes só para você, salvos neste aparelho. Ambiente e efeitos ficam preparados para os sons do jogo.</p><button id="enableStageAudio">▶ Liberar som do telão</button><p id="stageStatus" role="status">Nenhum vídeo no palco.</p><div id="stageAdmin" hidden><h4>CONTROLE DO ADMINISTRADOR</h4><input type="url" id="stageUrl" placeholder="Cole o link do YouTube" aria-label="Link do YouTube"><div><button data-stage="load">Colocar vídeo</button> <button data-stage="play">▶</button> <button data-stage="pause">Ⅱ</button> <button data-stage="stop">■</button></div></div>';
    document.body.append(panel);
    for(const [key,label] of Object.entries({master:'Geral',effects:'Efeitos do jogo',ambient:'Ambiente',music:'Música / telão',voice:'Voz dos jogadores'})) {
      const row=document.createElement('label'),range=document.createElement('input'),value=document.createElement('span');range.type='range';range.min=0;range.max=100;range.value=Math.round(volumes[key]*100);range.setAttribute('aria-label',label);row.append(`${label} · `,value,range);const update=()=>{volumes[key]=Number(range.value)/100;value.textContent=`${range.value}%`;try{localStorage.setItem('lowkey-audio',JSON.stringify(volumes));}catch{}};range.addEventListener('input',update);update();panel.querySelector('#volumeSliders').append(row);
    }
    const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');};
    button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden&&document.pointerLockElement)document.exitPointerLock();};panel.querySelector('#closeSound').onclick=close;
    const surface=document.createElement('div');surface.id='stagePlayerSurface';surface.hidden=true;const target=document.createElement('div');target.id='youtubeStage';surface.append(target);document.body.append(surface);
    let player=null,ready=false,unlocked=false,current={videoId:null,playing:false,position:0,updatedAt:0},offset=0,lastSync=0,lastVolume=-1,loaded=null;
    const status=panel.querySelector('#stageStatus');
    const position=()=>Math.max(0,current.position+(current.playing?(Date.now()+offset-current.updatedAt)/1000:0));
    function sync(force=false){if(!ready||!current.videoId)return;const time=position();if(loaded!==current.videoId){loaded=current.videoId;player.cueVideoById({videoId:loaded,startSeconds:time});force=true;}if(force||Math.abs(player.getCurrentTime()-time)>2)player.seekTo(time,true);if(current.playing&&unlocked)player.playVideo();else player.pauseVideo();}
    const apiReady=()=>{player=new YT.Player('youtubeStage',{width:480,height:270,playerVars:{playsinline:1,origin:location.origin},events:{onReady:()=>{ready=true;player.mute();sync(true);},onError:event=>{status.textContent=`YouTube não conseguiu reproduzir (${event.data}). Verifique se o vídeo permite incorporação.`;},onAutoplayBlocked:()=>{status.textContent='Toque em Liberar som do telão para começar.';}}});};
    window.onYouTubeIframeAPIReady=apiReady;
    let apiRequested=false;
    function requestApi(){if(apiRequested)return;apiRequested=true;if(window.YT?.Player)apiReady();else{const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{status.textContent='Não consegui carregar o YouTube.';};document.head.append(script);}}
    function receive(state){if(!state)return;current=state;offset=(state.serverTime||Date.now())-Date.now();if(state.videoId)requestApi();status.textContent=state.videoId?(state.playing?'Vídeo ao vivo no palco.':'Vídeo pausado no palco.'):'Nenhum vídeo no palco.';sync(true);}
    function unlock(){unlocked=true;if(ready){player.unMute();sync(true);}}panel.querySelector('#enableStageAudio').onclick=unlock;document.getElementById('startButton')?.addEventListener('click',unlock);
    panel.querySelectorAll('[data-stage]').forEach(control=>control.onclick=async()=>{try{const action=control.dataset.stage,payload={action};if(action==='load'){const url=new URL(panel.querySelector('#stageUrl').value.trim());if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname))throw Error('Use um link do YouTube.');payload.videoId=url.hostname==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v')||url.pathname.split('/').pop();if(!/^[\w-]{11}$/.test(payload.videoId||''))throw Error('Link de vídeo inválido.');}control.disabled=true;const response=await fetch('/api/stage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)throw Error(result.error);unlock();receive(result);}catch(error){status.textContent=error.message;}finally{control.disabled=false;}});
    const corners=[[-4.25,4.87,-15.005],[4.25,4.87,-15.005],[4.25,1.57,-15.005],[-4.25,1.57,-15.005]].map(p=>new THREE.Vector3(...p));
    const center=new THREE.Vector3(0,3.22,-15.005),ray=new THREE.Raycaster();let lastVisibility=0,occluded=false;
function frame(){requestAnimationFrame(frame);const user=getUser();button.hidden=!user;panel.querySelector('#stageAdmin').hidden=user?.role!=='admin';if(!user){surface.hidden=true;close();if(ready){player.mute();player.pauseVideo();}return;}const now=performance.now();if(ready&&current.videoId){const volume=Math.round(100*window.lowkeyAudioGain('music')*Math.max(0,1-avatar.position.distanceTo(center)/18));if(volume!==lastVolume){player.setVolume(volume);lastVolume=volume;}if(now-lastSync>2000){sync();lastSync=now;}}
      if(!current.videoId||!ready){surface.hidden=true;banner.visible=true;return;}
      camera.updateMatrixWorld();const view=center.clone().applyMatrix4(camera.matrixWorldInverse),points=corners.map(c=>c.clone().project(camera));
      if(now-lastVisibility>180){lastVisibility=now;const direction=center.clone().sub(camera.position),distance=direction.length();ray.set(camera.position,direction.normalize());ray.far=distance-.12;occluded=ray.intersectObjects(scene.children,true).some(hit=>hit.object!==banner&&hit.object.visible&&(()=>{for(let parent=hit.object.parent;parent;parent=parent.parent)if(!parent.visible)return false;return true;})()&&hit.object.material?.side!==THREE.BackSide&&hit.object.type==='Mesh');}
      surface.hidden=view.z>=0||camera.position.z<center.z||occluded||points.some(p=>p.z>1||p.z< -1);banner.visible=surface.hidden;if(!surface.hidden){const transform=screenTransform(points.map(p=>[(p.x+1)*innerWidth/2,(1-p.y)*innerHeight/2]));if(transform)surface.style.transform=transform;else surface.hidden=true;}
    }
    frame();return {receive};
  };
})();
