import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import { createApp } from '../server.mjs';
import { monthLater } from '../store.mjs';

const password='un-mot-de-passe-test-unique';
const salt='0123456789abcdef0123456789abcdef';
async function fixture(options={}){
  const dir=mkdtempSync(path.join(tmpdir(),'pierre-transferts-test-'));
  const service=createApp({NODE_ENV:'test',ADMIN_AUTH_MODE:'password',DATA_DIR:dir,ADMIN_USERNAME:'pierre',ADMIN_PASSWORD_HASH:`${salt}:${scryptSync(password,salt,64).toString('hex')}`,SESSION_SECRET:'a'.repeat(96),BASE_URL:'http://localhost:3333',TRUST_PROXY:'0',SMTP_HOST:'',MAX_FILE_BYTES:'32',MAX_TRANSFER_BYTES:'60',MAX_FILES:'10',noCleanupTimer:true,...options});
  const server=await new Promise(resolve=>{const s=service.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  async function request(url,{body,method='GET',origin='http://localhost:3333',authenticated=true,headers={}}={}){
    const r=await fetch(base+url,{method,headers:{Origin:origin,...(authenticated&&cookie?{Cookie:cookie}:{}),...(body && !(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},body:body?body instanceof FormData?body:JSON.stringify(body):undefined});
    if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
  }
  await request('/api/login',{method:'POST',body:{username:'pierre',password}});
  return {...service,dir,request,async close(){await new Promise(r=>server.close(r));service.close();rmSync(dir,{recursive:true,force:true});}};
}
async function draft(f,extra={}){const r=await f.request('/api/admin/transfers',{method:'POST',body:{title:'Séance & portraits',...extra}});assert.equal(r.status,201);return r.json();}
async function upload(f,t,name='été.webp',bytes='photo',key='file-0'){const form=new FormData();form.append('file',new Blob([bytes]),name);return f.request(`/api/admin/transfers/${t.id}/files`,{method:'POST',body:form,headers:{'X-Upload-Key':key}});}
async function publish(f,t){return f.request(`/api/admin/transfers/${t.id}/publish`,{method:'POST'});}

test('Un mois calendaire : jours de fin de mois et année bissextile',()=>{
  assert.equal(monthLater('2026-01-31T12:30:45.000Z'),'2026-02-28T12:30:45.000Z');
  assert.equal(monthLater('2028-01-31T12:30:45.000Z'),'2028-02-29T12:30:45.000Z');
  assert.equal(monthLater('2026-12-31T12:30:45.000Z'),'2027-01-31T12:30:45.000Z');
});
test('Authentification et protection des écritures contre une autre origine',async()=>{
  const f=await fixture();try{
    assert.equal((await f.request('/api/admin/transfers',{authenticated:false})).status,401);
    assert.equal((await f.request('/api/admin/transfers',{method:'POST',origin:'https://malveillant.example',body:{title:'test'}})).status,403);
    assert.equal((await f.request('/api/login',{method:'POST',body:{username:'pierre',password:'incorrect'}})).status,401);
    assert.equal((await f.request('/api/admin/session')).status,200);
    assert.equal((await f.request('/api/logout',{method:'POST'})).status,200);
    assert.equal((await f.request('/api/admin/session')).status,401);
  }finally{await f.close();}
});
test('Flux complet, brouillon privé, téléchargement exact et ZIP avec noms uniques',async()=>{
  const f=await fixture();try{
    const t=await draft(f);
    assert.equal((await f.request(`/api/transfers/${t.token}`,{authenticated:false})).status,404);
    assert.equal((await publish(f,t)).status,400);
    const u=await upload(f,t);assert.equal(u.status,201);const file=await u.json();assert.equal(file.name,'été.webp');
    assert.equal((await upload(f,t,'été.webp','autre','file-1')).status,201);
    const p=await publish(f,t);assert.equal(p.status,200);const active=await p.json();
    assert.equal(active.status,'active');assert.equal(active.fileCount,2);assert.equal(active.expiresAt,monthLater(active.createdAt));
    const data=await (await f.request(`/api/transfers/${t.token}`)).json();assert.equal(data.recipient,undefined);assert.equal(data.token,undefined);
    const downloaded=await f.request(`/api/transfers/${t.token}/files/${file.id}`,{authenticated:false});assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),'photo');assert.match(downloaded.headers.get('content-disposition'),/attachment/);
    const zip=await f.request(`/api/transfers/${t.token}/zip`,{authenticated:false});assert.equal(zip.status,200);const buffer=Buffer.from(await zip.arrayBuffer());assert.equal(buffer.readUInt32LE(0),0x04034b50);assert.ok(buffer.includes(Buffer.from('été.webp')));assert.ok(buffer.includes(Buffer.from('été (2).webp')));
    assert.equal((await upload(f,t)).status,409);
    assert.equal((await f.request('/data/transfers.sqlite')).status,404);
  }finally{await f.close();}
});
test('Les reprises d’upload et de publication ne dupliquent ni fichier ni e-mail',async()=>{
  const sent=[];const f=await fixture({mailer:{sendMail:async m=>{sent.push(m);return {rejected:[]};}}});try{
    const t=await draft(f,{recipient:'client@example.fr',message:'Bonjour <script>'});
    assert.equal((await upload(f,t)).status,201);
    assert.equal((await upload(f,t)).status,200);
    assert.equal(f.store.files(t.id).length,1);
    assert.equal((await publish(f,t)).status,200);assert.equal((await publish(f,t)).status,200);
    assert.equal(sent.length,1);assert.match(sent[0].html,/&lt;script&gt;/);assert.ok(!sent[0].html.includes('<script>'));assert.match(sent[0].text,new RegExp(t.token));
    assert.equal(f.store.transfer(t.id).email_status,'sent');
  }finally{await f.close();}
});
test('Une erreur SMTP ne perd pas le transfert ; renvoi manuel possible',async()=>{
  let failed=true;const f=await fixture({mailer:{sendMail:async()=>{if(failed)throw Error('SMTP');return {rejected:[]};}}});try{
    const t=await draft(f,{recipient:'client@example.fr'});await upload(f,t);const p=await (await publish(f,t)).json();assert.equal(p.status,'active');assert.equal(p.emailStatus,'failed');
    failed=false;assert.equal((await f.request(`/api/admin/transfers/${t.id}/email`,{method:'POST'})).status,200);assert.equal(f.store.transfer(t.id).email_status,'sent');
  }finally{await f.close();}
});
test('Expiration vérifiée avant tout accès, puis suppression des fichiers sur disque',async()=>{
  const f=await fixture();try{
    const t=await draft(f);const file=await (await upload(f,t)).json();await publish(f,t);
    f.store.db.prepare('UPDATE transfers SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',t.id);
    for(const suffix of ['',`/files/${file.id}`,'/zip'])assert.equal((await f.request(`/api/transfers/${t.token}${suffix}`)).status,410);
    assert.equal(readdirSync(f.store.filesDir).length,1);assert.equal(f.store.cleanup().expired,1);assert.equal(readdirSync(f.store.filesDir).length,0);assert.equal(f.store.transfer(t.id).status,'expired');
  }finally{await f.close();}
});
test('Limites d’upload, nettoyage des refus et suppression manuelle',async()=>{
  const f=await fixture();try{
    const t=await draft(f);assert.equal((await upload(f,t,'grand.jpg','a'.repeat(40))).status,413);assert.equal(readdirSync(f.store.filesDir).length,0);
    assert.equal((await upload(f,t,'a.jpg','a'.repeat(32),'file-0')).status,201);
    assert.equal((await upload(f,t,'b.jpg','b'.repeat(32),'file-1')).status,413);assert.equal(f.store.files(t.id).length,1);assert.equal(readdirSync(f.store.filesDir).length,1);
    await publish(f,t);assert.equal((await f.request(`/api/admin/transfers/${t.id}`,{method:'DELETE'})).status,200);assert.equal((await f.request(`/api/transfers/${t.token}`)).status,404);assert.equal(readdirSync(f.store.filesDir).length,0);
  }finally{await f.close();}
});
