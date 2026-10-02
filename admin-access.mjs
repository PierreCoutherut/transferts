import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, linkSync, renameSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';

const secret=()=>randomBytes(48).toString('base64url');
export function adminAccess(directory,{rotate=false}={}) {
  const root=path.resolve(directory),file=path.join(root,'admin-access.json');
  mkdirSync(root,{recursive:true,mode:0o700});
  const read=()=>{
    const value=JSON.parse(readFileSync(file,'utf8'));
    if(value.version!==1 || !/^[A-Za-z0-9_-]{64}$/.test(value.token) || !/^[A-Za-z0-9_-]{64}$/.test(value.sessionSecret)) throw new Error('Accès admin invalide dans DATA_DIR : restaurer le fichier privé depuis une sauvegarde.');
    return value;
  };
  let missing=false;
  try{read();}catch(e){if(e.code==='ENOENT')missing=true;else throw e;}
  if(missing || rotate){
    const temporary=path.join(root,`.admin-access-${randomBytes(12).toString('hex')}.tmp`);
    writeFileSync(temporary,JSON.stringify({version:1,token:secret(),sessionSecret:secret()})+'\n',{mode:0o600,flag:'wx'});
    try{
      if(rotate)renameSync(temporary,file);
      else try{linkSync(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;}
    }finally{rmSync(temporary,{force:true});}
  }
  chmodSync(file,0o600);
  read();
  return {
    token:()=>read().token,
    accepts:token=>{const expected=read().token;return typeof token==='string' && /^[A-Za-z0-9_-]{64}$/.test(token) && timingSafeEqual(Buffer.from(token),Buffer.from(expected));},
    sign:payload=>{const state=read();return createHmac('sha256',state.sessionSecret).update(state.token+'.'+payload).digest('base64url');}
  };
}
