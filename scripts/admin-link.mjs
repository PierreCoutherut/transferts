import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminAccess } from '../admin-access.mjs';

try{
  if(process.argv.slice(2).some(arg=>arg!=='--rotate'))throw new Error('Usage : npm run admin-link [-- --rotate]');
  if((process.env.ADMIN_AUTH_MODE || 'link')!=='link')throw new Error('Renseigner ADMIN_AUTH_MODE=link pour utiliser un lien privé.');
  const base=new URL(process.env.BASE_URL || 'http://localhost:3000');
  if(!['http:','https:'].includes(base.protocol) || base.username || base.password || base.pathname!=='/' || base.search || base.hash)throw new Error('BASE_URL doit être une origine HTTP(S), sans chemin.');
  if(process.env.NODE_ENV==='production' && base.protocol!=='https:')throw new Error('HTTPS requis en production.');
  const here=path.dirname(fileURLToPath(import.meta.url));
  const access=adminAccess(process.env.DATA_DIR || path.join(here,'..','data'),{rotate:process.argv.includes('--rotate')});
  console.log('Lien privé administrateur — à conserver pour toi :');
  console.log(`${base.origin}/admin#access=${access.token()}`);
  if(process.argv.includes('--rotate'))console.log('Ancien lien et anciennes sessions révoqués.');
}catch(e){console.error(e.message);process.exitCode=1;}
