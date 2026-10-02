import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSocialStore} from '../social-server.mjs';
test('saved contacts require acceptance; groups stay private and persist',{timeout:15000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'lowkey-social-test-'));const alice={id:'alice',username:'alice'},bob={id:'bob',username:'bob'},eve={id:'eve',username:'eve'};const accounts=[alice,bob,eve],options={root,findAccount:async name=>accounts.find(a=>a.username===name),online:()=>new Set(['bob'])};
  try{let store=await createSocialStore(options);let state=await store.run(alice,'contact/request',{username:'bob'});assert.equal(state.contacts[0].status,'pending');assert.equal(state.contacts[0].online,true);const id=state.contacts[0].id;
    await assert.rejects(store.run(alice,'contact/accept',{id}),{statusCode:403});await assert.rejects(store.run(eve,'contact/remove',{id}),{statusCode:404});
    await assert.rejects(store.run(alice,'group/create',{name:'Crew',members:['bob']}),{statusCode:403});
    await store.run(bob,'contact/accept',{id});state=await store.run(alice,'group/create',{name:'Crew',members:['bob']});const group=state.groups[0];
    await store.run(bob,'group/message',{id:group.id,text:'Olá!'});await assert.rejects(store.run(eve,'group/message',{id:group.id,text:'Invadir'}),{statusCode:404});assert.deepEqual((await store.run(eve,'state')).groups,[]);
    store=await createSocialStore(options);state=await store.run(alice,'state');assert.equal(state.contacts[0].status,'accepted');assert.equal(state.groups[0].messages[0].username,'bob');
    await store.run(alice,'group/leave',{id:group.id});assert.equal((await store.run(bob,'state')).groups[0].ownerId,'bob');
  }finally{assert.ok(root.startsWith(join(tmpdir(),'lowkey-social-test-')));await rm(root,{recursive:true,force:true});}
});
test('public photos use authenticated author, validate image and enforce owner deletion',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lowkey-photo-test-')),alice={id:'alice',username:'alice'},bob={id:'bob',username:'bob'};
  try{const store=await createSocialStore({root,findAccount:async()=>null});await assert.rejects(store.run(alice,'post',{image:'javascript:alert(1)'}),{statusCode:400});
    const bytes=Buffer.alloc(24);bytes[0]=255;bytes[1]=216;bytes[2]=255;bytes[22]=255;bytes[23]=217;const image='data:image/jpeg;base64,'+bytes.toString('base64');
    const {post}=await store.run(alice,'post',{image,caption:'Praia',username:'bob',authorId:'bob'});assert.equal(post.username,'alice');assert.equal(post.authorId,'alice');assert.equal((await store.run(bob,'feed')).posts[0].id,post.id);
    await assert.rejects(store.run(bob,'post/delete',{id:post.id}),{statusCode:404});await store.run(alice,'post/delete',{id:post.id});assert.equal((await store.run(bob,'feed')).posts.length,0);
  }finally{assert.ok(root.startsWith(join(tmpdir(),'lowkey-photo-test-')));await rm(root,{recursive:true,force:true});}
});
