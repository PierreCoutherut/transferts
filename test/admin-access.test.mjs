import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { adminAccess } from '../admin-access.mjs';
import { createApp } from '../server.mjs';

async function running(dir){
  const service=createApp({NODE_ENV:'test',ADMIN_AUTH_MODE:'link',ADMIN_PASSWORD_HASH:'',SESSION_SECRET:'',DATA_DIR:dir,BASE_URL:'http://localhost:3333',TRUST_PROXY:'0',SMTP_HOST:'',noCleanupTimer:true});
  const server=await new Promise(resolve=>{const s=service.app.listen(0,'127.0.0.1',()=>resolve(s));});
  return {async request(url,{token,cookie,origin='http://localhost:3333'}={}){return fetch(`http://127.0.0.1:${server.address().port}`+url,{method:token!==undefined?'POST':'GET',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},body:token!==undefined?JSON.stringify({token}):undefined});},async close(){await new Promise(resolve=>server.close(resolve));service.close();}};
}
test('Lien privé sans hash : session, persistance, révocation immédiate et protection',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'pierre-access-'));let app;
  try{
    app=await running(dir);
    const access=adminAccess(dir),token=access.token();
    assert.equal((await app.request('/api/admin/session')).status,401);
    assert.equal((await app.request('/api/login',{token:'incorrect'})).status,401);
    assert.equal((await app.request('/api/login',{token,origin:'https://autre.example'})).status,403);
    const login=await app.request('/api/login',{token});assert.equal(login.status,200);
    const header=login.headers.get('set-cookie');assert.match(header,/HttpOnly/i);assert.match(header,/SameSite=Strict/i);
    const cookie=header.split(';')[0];assert.equal((await app.request('/api/admin/session',{cookie})).status,200);
    await app.close();app=await running(dir);
    assert.equal(adminAccess(dir).token(),token);
    assert.equal((await app.request('/api/admin/session',{cookie})).status,200);
    assert.equal(statSync(path.join(dir,'admin-access.json')).mode & 0o777,0o600);
    adminAccess(dir,{rotate:true});
    assert.equal((await app.request('/api/admin/session',{cookie})).status,401);
    assert.equal((await app.request('/api/login',{token})).status,401);
    assert.equal((await app.request('/api/login',{token:adminAccess(dir).token()})).status,200);
    assert.equal((await app.request('/admin-access.json')).status,404);
    assert.equal((await app.request('/data/admin-access.json')).status,404);
  }finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});
test('La commande SSH retrouve le lien et peut le remplacer sans publier les secrets',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'pierre-access-cli-'));
  try{
    const env={...process.env,NODE_ENV:'production',BASE_URL:'https://transferts.pierre-coutherut.fr',DATA_DIR:dir,ADMIN_AUTH_MODE:'link'};
    const run=(args=[])=>execFileSync(process.execPath,['scripts/admin-link.mjs',...args],{env,encoding:'utf8'});
    const initial=run();assert.match(initial,/\/admin#access=[A-Za-z0-9_-]{64}/);
    assert.equal(run(),initial);assert.notEqual(run(['--rotate']),initial);
    writeFileSync(path.join(dir,'admin-access.json'),'{}');
    assert.throws(()=>adminAccess(dir),/Accès admin invalide/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
