import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const fail=(status,message)=>{throw Object.assign(new Error(message),{statusCode:status});};
const clean=(value,length)=>String(value||'').trim().slice(0,length);
export async function createSocialStore({root,database=null,findAccount,online=()=>new Set()}){
  const directory=join(root,'data'),file=join(directory,'social.json'),galleryFile=join(directory,'gallery.json');let state={contacts:[],groups:[]},posts=[],queue=Promise.resolve();const rates=new Map();
  if(database){
    await database.query('CREATE TABLE IF NOT EXISTS lowkey_social_state (id INTEGER PRIMARY KEY CHECK(id=1),state JSONB NOT NULL)');
    await database.query('CREATE TABLE IF NOT EXISTS lowkey_photos (id UUID PRIMARY KEY,author_id UUID NOT NULL,username TEXT NOT NULL,caption TEXT NOT NULL,image TEXT NOT NULL,created_at BIGINT NOT NULL)');
    await database.query('CREATE INDEX IF NOT EXISTS lowkey_photos_created_idx ON lowkey_photos(created_at DESC,id)');
    const saved=await database.query('SELECT state FROM lowkey_social_state WHERE id=1');if(saved.rows[0])state=saved.rows[0].state;
  }else{for(const [path,assign] of [[file,value=>state=value],[galleryFile,value=>posts=value]])try{assign(JSON.parse(await readFile(path,'utf8')));}catch(error){if(error.code!=='ENOENT')throw error;}}
  async function save(gallery=false){if(database)return database.query('INSERT INTO lowkey_social_state(id,state) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state',[state]);await mkdir(directory,{recursive:true});const path=gallery?galleryFile:file;await writeFile(path+'.tmp',JSON.stringify(gallery?posts:state));await rename(path+'.tmp',path);}
  const accepted=(a,b)=>state.contacts.some(c=>c.status==='accepted'&&((c.from.id===a&&c.to.id===b)||(c.from.id===b&&c.to.id===a)));
  const contactOf=(c,id)=>c.from.id===id?c.to:c.from;
  function snapshot(account){const present=online();return{contacts:state.contacts.filter(c=>c.from.id===account.id||c.to.id===account.id).map(c=>({id:c.id,accountId:contactOf(c,account.id).id,username:contactOf(c,account.id).username,status:c.status,incoming:c.to.id===account.id,online:present.has(contactOf(c,account.id).id)})),groups:state.groups.filter(g=>g.members.some(m=>m.id===account.id)).map(g=>({...g,members:g.members.map(m=>({...m,online:present.has(m.id)}))}))};}
  async function operation(account,action,data={}){
    if(!account?.id)fail(401,'Entre na sua conta.');
    if(action==='state')return snapshot(account);
    if(action==='feed'){const before=Math.max(0,Number(data.before)||Date.now()+1);if(database){const result=await database.query('SELECT id,author_id AS "authorId",username,caption,image,created_at AS "createdAt" FROM lowkey_photos WHERE created_at<$1 ORDER BY created_at DESC,id LIMIT 12',[before]);return{posts:result.rows.map(p=>({...p,createdAt:Number(p.createdAt)}))};}return{posts:posts.filter(p=>p.createdAt<before).slice(0,12)};}
    const now=Date.now();const recent=(rates.get(account.id)||[]).filter(t=>now-t<60000);if(recent.length>=30)fail(429,'Espere um pouco antes de outra ação.');recent.push(now);rates.set(account.id,recent);if(rates.size>512)for(const [id,times]of rates)if(now-times.at(-1)>60000)rates.delete(id);
    const person={id:account.id,username:account.username};
    if(action==='contact/request'){
      const target=await findAccount(clean(data.username,32).toLowerCase());if(!target)fail(404,'Usuário não encontrado.');if(target.id===account.id)fail(400,'Você já é você!');
      if(state.contacts.some(c=>[c.from.id,c.to.id].includes(account.id)&&[c.from.id,c.to.id].includes(target.id)))fail(409,'Esse contato já está salvo ou pendente.');
      if([account.id,target.id].some(id=>state.contacts.filter(c=>c.from.id===id||c.to.id===id).length>=100))fail(409,'Limite de 100 contatos.');
      state.contacts.push({id:randomUUID(),from:person,to:{id:target.id,username:target.username},status:'pending'});
    }else if(action==='contact/accept'||action==='contact/remove'){
      const contact=state.contacts.find(c=>c.id===data.id);if(!contact||![contact.from.id,contact.to.id].includes(account.id))fail(404,'Contato não encontrado.');
      if(action==='contact/accept'){if(contact.to.id!==account.id)fail(403,'Só quem recebeu pode aceitar.');contact.status='accepted';}else state.contacts=state.contacts.filter(c=>c!==contact);
    }else if(action==='group/create'){
      const name=clean(data.name,36),memberIds=[...new Set(Array.isArray(data.members)?data.members:[])];if(!name||memberIds.length<1||memberIds.length>11)fail(400,'Escolha um nome e de 1 a 11 contatos.');
      if(state.groups.filter(g=>g.members.some(m=>m.id===account.id)).length>=20)fail(409,'Limite de 20 grupos.');
      const members=[person];for(const id of memberIds){if(!accepted(account.id,id))fail(403,'Adicione somente contatos aceitos.');const contact=state.contacts.find(c=>c.status==='accepted'&&[c.from.id,c.to.id].includes(id)&&[c.from.id,c.to.id].includes(account.id));members.push(contactOf(contact,account.id));}
      state.groups.push({id:randomUUID(),ownerId:account.id,name,members,messages:[]});
    }else if(action==='group/message'||action==='group/leave'){
      const group=state.groups.find(g=>g.id===data.id);if(!group||!group.members.some(m=>m.id===account.id))fail(404,'Grupo não encontrado.');
      if(action==='group/message'){const text=clean(data.text,300);if(!text)fail(400,'Escreva uma mensagem.');group.messages.push({id:randomUUID(),...person,text,createdAt:now});group.messages=group.messages.slice(-50);}
      else{group.members=group.members.filter(m=>m.id!==account.id);if(group.ownerId===account.id)group.ownerId=group.members[0]?.id;state.groups=state.groups.filter(g=>g.members.length);}
    }else if(action==='post'){
      const image=String(data.image||'');if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>360000)fail(400,'Use uma foto JPEG do jogo de até 260 KB.');const bytes=Buffer.from(image.split(',')[1],'base64');if(bytes.length<20||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)fail(400,'Foto inválida.');
      const count=database?Number((await database.query('SELECT count(*) FROM lowkey_photos WHERE author_id=$1 AND created_at>$2',[account.id,now-60000])).rows[0].count):posts.filter(p=>p.authorId===account.id&&now-p.createdAt<60000).length;if(count>=5)fail(429,'Máximo de cinco fotos por minuto.');
      const post={id:randomUUID(),authorId:account.id,username:account.username,caption:clean(data.caption,180),image,createdAt:now};
      if(database){await database.query('INSERT INTO lowkey_photos(id,author_id,username,caption,image,created_at) VALUES($1,$2,$3,$4,$5,$6)',[post.id,post.authorId,post.username,post.caption,image,now]);}else{if(posts.length>=120)fail(409,'Galeria local lotada. Apague uma de suas fotos antes de publicar outra.');posts.unshift(post);await save(true);}return{post};
    }else if(action==='post/delete'){
      if(database){const result=await database.query('DELETE FROM lowkey_photos WHERE id=$1 AND author_id=$2 RETURNING id',[data.id,account.id]);if(!result.rowCount)fail(404,'Essa foto não é sua.');}else{const post=posts.find(p=>p.id===data.id&&p.authorId===account.id);if(!post)fail(404,'Essa foto não é sua.');posts=posts.filter(p=>p!==post);await save(true);}return{ok:true};
    }else fail(404,'Ação do celular não encontrada.');
    await save();return snapshot(account);
  }
  return{run(account,action,data){const task=queue.catch(()=>{}).then(async()=>{const previous=structuredClone(state),previousPosts=posts.slice();try{return await operation(account,action,data);}catch(error){state=previous;posts=previousPosts;throw error;}});queue=task;return task;}};
}
