import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import archiver from 'archiver';
import nodemailer from 'nodemailer';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, monthLater } from './store.mjs';
import { adminAccess } from './admin-access.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const opaque=()=>randomBytes(24).toString('base64url');
const safeName=s=>String(s).normalize('NFC').replace(/[\\/<>:"|?*\x00-\x1f\x7f]/g,'_').replace(/^\.+/,'').trim().slice(0,180) || 'fichier';
const html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const httpError=(status,message)=>Object.assign(new Error(message),{status});
const checkPassword=(password,hash)=>{
  try { const [salt,key]=hash.split(':'); const a=Buffer.from(key,'hex'),b=scryptSync(password,salt,64); return a.length===b.length && timingSafeEqual(a,b); } catch {return false;}
};

export function createApp(options={}) {
  const cfg={...process.env,...options};
  const authMode=cfg.ADMIN_AUTH_MODE || 'link';
  if (!['link','password'].includes(authMode)) throw new Error('ADMIN_AUTH_MODE doit être link ou password.');
  if (authMode==='password' && (!cfg.ADMIN_PASSWORD_HASH || !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(cfg.ADMIN_PASSWORD_HASH))) throw new Error('ADMIN_PASSWORD_HASH manquant ou invalide. Lance npm run password.');
  if (authMode==='password' && (!cfg.SESSION_SECRET || cfg.SESSION_SECRET.length<48)) throw new Error('SESSION_SECRET doit contenir au moins 48 caractères aléatoires.');
  const base=new URL(cfg.BASE_URL || 'http://localhost:3000');
  if (!['http:','https:'].includes(base.protocol) || base.username || base.password || base.pathname!=='/' || base.search || base.hash) throw new Error('BASE_URL doit être une origine HTTP(S), sans chemin.');
  const secure=cfg.NODE_ENV==='production';
  if (secure && base.protocol!=='https:') throw new Error('BASE_URL doit utiliser HTTPS en production.');
  const maxFile=Number(cfg.MAX_FILE_BYTES || 2147483648),maxTotal=Number(cfg.MAX_TRANSFER_BYTES || 21474836480),maxFiles=Number(cfg.MAX_FILES || 1000);
  for (const v of [maxFile,maxTotal,maxFiles]) if (!Number.isSafeInteger(v) || v<=0) throw new Error('Limites d’upload invalides.');
  const dataDir=cfg.DATA_DIR || path.join(here,'data');
  const access=authMode==='link' ? adminAccess(dataDir) : null;
  const store=openStore(dataDir);
  const {db,filesDir}=store;
  const app=express();
  app.disable('x-powered-by');
  if (Number(cfg.TRUST_PROXY)>0) app.set('trust proxy',Number(cfg.TRUST_PROXY));
  app.use(helmet({contentSecurityPolicy:{directives:{
    defaultSrc:["'self'"], imgSrc:["'self'","https://photos-pierre.s3.fr-par.scw.cloud"],
    scriptSrc:["'self'"],styleSrc:["'self'"],connectSrc:["'self'"],
    objectSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'none'"],
    upgradeInsecureRequests:secure ? [] : null
  }},strictTransportSecurity:secure ? undefined : false,referrerPolicy:{policy:'no-referrer'}}));
  app.use(express.json({limit:'32kb'}));
  app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store'); next();});
  app.use((req,res,next)=>{
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('origin')!==base.origin) return res.status(403).json({error:'Origine de la requête non autorisée.'});
    next();
  });
  const sign=s=>access ? access.sign(s) : createHmac('sha256',cfg.SESSION_SECRET).update(s).digest('base64url');
  function authenticated(req) {
    const cookie=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('pc_session='))?.slice(11);
    if (!cookie) return false;
    const parts=cookie.split('.'); if (parts.length!==3) return false;
    const payload=parts.slice(0,2).join('.'),signature=sign(payload);
    if (signature.length!==parts[2].length || !timingSafeEqual(Buffer.from(signature),Buffer.from(parts[2]))) return false;
    return /^\d+$/.test(parts[0]) && Number(parts[0])>Date.now();
  }
  const auth=(req,res,next)=>authenticated(req)?next():res.status(401).json({error:'Connecte-toi pour accéder à l’administration.'});
  const cookieOptions={httpOnly:true,secure,sameSite:'strict',path:'/'};
  app.get('/api/auth',(_req,res)=>res.json({mode:authMode}));
  app.post('/api/login',rateLimit({windowMs:15*60000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Trop de tentatives. Réessaie dans 15 minutes.'}}),(req,res)=>{
    const {username,password,token}=req.body || {};
    const valid=access ? access.accepts(token) : typeof username==='string' && typeof password==='string' && password.length<=512 && checkPassword(password,cfg.ADMIN_PASSWORD_HASH) && username===(cfg.ADMIN_USERNAME || 'pierre');
    if (!valid) return res.status(401).json({error:access?'Lien privé invalide ou révoqué.':'Identifiants incorrects.'});
    const payload=`${Date.now()+8*3600000}.${opaque()}`;
    res.cookie('pc_session',`${payload}.${sign(payload)}`,{...cookieOptions,maxAge:8*3600000}); res.json({ok:true});
  });
  app.post('/api/logout',auth,(req,res)=>{res.clearCookie('pc_session',cookieOptions);res.json({ok:true});});
  const mailer=options.mailer || (cfg.SMTP_HOST ? nodemailer.createTransport({host:cfg.SMTP_HOST,port:Number(cfg.SMTP_PORT || 587),secure:cfg.SMTP_SECURE==='true',requireTLS:cfg.SMTP_SECURE!=='true',auth:cfg.SMTP_USER ? {user:cfg.SMTP_USER,pass:cfg.SMTP_PASSWORD} : undefined,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000}) : null);
  app.get('/api/admin/session',auth,(req,res)=>res.json({username:cfg.ADMIN_USERNAME || 'pierre',emailConfigured:!!mailer,maxFileBytes:maxFile,maxTransferBytes:maxTotal,maxFiles}));
  const effectiveStatus=t=>t.status==='active' && t.expires_at<=new Date().toISOString() ? 'expired' : t.status;
  function summary(t,admin=false) {
    const files=store.files(t.id);
    return {id:t.id,title:t.title,message:t.message,createdAt:t.created_at,expiresAt:t.expires_at,status:effectiveStatus(t),totalBytes:files.reduce((sum,f)=>sum+f.size,0),fileCount:files.length,files:files.map(f=>({id:f.id,name:f.name,size:f.size})),...(admin?{recipient:t.recipient,token:t.token,url:`${base.origin}/t/${t.token}`,emailStatus:t.email_status,downloads:t.downloads}:{})};
  }
  app.get('/api/admin/transfers',auth,(req,res)=>res.json(db.prepare("SELECT * FROM transfers WHERE status!='deleted' ORDER BY created_at DESC").all().map(t=>summary(t,true))));
  app.post('/api/admin/transfers',auth,(req,res)=>{
    const {title,recipient='',message=''}=req.body || {};
    if (typeof title!=='string' || !title.trim() || title.length>120 || typeof message!=='string' || message.length>3000 || typeof recipient!=='string' || recipient.length>254 || (recipient && !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(recipient))) return res.status(400).json({error:'Vérifie le titre, le message et l’adresse e-mail.'});
    const id=opaque(); db.prepare('INSERT INTO transfers(id,token,title,recipient,message,created_at) VALUES(?,?,?,?,?,?)').run(id,opaque(),title.trim(),recipient,message,new Date().toISOString());
    res.status(201).json(summary(store.transfer(id),true));
  });
  const busy=new Set();
  const upload=multer({storage:multer.diskStorage({destination:filesDir,filename:(req,file,done)=>done(null,opaque())}),limits:{fileSize:maxFile,files:1,fields:0,parts:1}}).single('file');
  app.post('/api/admin/transfers/:id/files',auth,(req,res,next)=>{
    const t=store.transfer(req.params.id);
    if (!t || t.status!=='draft') return next(httpError(409,'Ce transfert ne peut plus recevoir de fichiers.'));
    if (busy.has(t.id)) return next(httpError(409,'Un upload est déjà en cours pour ce transfert.'));
    const uploadKey=req.get('x-upload-key');
    if (!uploadKey || !/^[a-zA-Z0-9_-]{1,80}$/.test(uploadKey)) return next(httpError(400,'Identifiant d’upload invalide.'));
    const existing=db.prepare('SELECT id,name,size FROM files WHERE transfer_id=? AND upload_key=?').get(t.id,uploadKey);
    if (existing) {req.resume();return res.json(existing);}
    const before=store.files(t.id);
    if (before.length>=maxFiles) return next(httpError(413,'Nombre maximal de fichiers atteint.'));
    busy.add(t.id);
    upload(req,res,err=>{
      try {
        if (err) throw err;
        if (!req.file) throw httpError(400,'Choisis un fichier.');
        if (before.reduce((s,f)=>s+f.size,0)+req.file.size>maxTotal) throw httpError(413,'Taille maximale du transfert dépassée.');
        // Les noms multipart UTF-8 sont décodés depuis le latin-1 de busboy.
        const original=/[^\x00-\x7f]/.test(req.file.originalname) ? Buffer.from(req.file.originalname,'latin1').toString('utf8') : req.file.originalname;
        const name=safeName(original);
        const f={id:opaque(),name,size:req.file.size};
        db.prepare('INSERT INTO files(id,transfer_id,name,size,disk_name,upload_key) VALUES(?,?,?,?,?,?)').run(f.id,t.id,name,f.size,req.file.filename,uploadKey);
        res.status(201).json(f);
      } catch (e) {
        if (req.file) rmSync(req.file.path,{force:true}); next(e);
      } finally { busy.delete(t.id); }
    });
  });
  async function sendEmail(id) {
    let t=store.transfer(id);
    if (!t?.recipient || !mailer || effectiveStatus(t)!=='active') return;
    const claimed=db.prepare("UPDATE transfers SET email_status='sending' WHERE id=? AND email_status IN ('none','pending','failed','unconfigured','sent')").run(id).changes;
    if (!claimed) return;
    const url=`${base.origin}/t/${t.token}`;
    const date=new Date(t.expires_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'});
    const text=`Bonjour,\n\nVos fichiers « ${t.title} » sont prêts.\n${t.message ? '\n'+t.message+'\n' : ''}\nTélécharger : ${url}\nDisponibles jusqu’au ${date} (heure de Paris).\n\nPierre Coutherut — Photographe`;
    try {
      const result=await mailer.sendMail({from:cfg.MAIL_FROM || 'Pierre Coutherut <transferts@pierre-coutherut.fr>',replyTo:cfg.MAIL_REPLY_TO || undefined,to:{address:t.recipient},subject:`Vos fichiers sont prêts — ${t.title}`,text,html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#111827"><p style="color:#ff6900;font-weight:bold">PIERRE COUTHERUT</p><h1 style="font-size:28px">Vos fichiers sont prêts.</h1><h2 style="font-size:20px">${html(t.title)}</h2><p style="white-space:pre-wrap">${html(t.message)}</p><p style="margin:32px 0"><a href="${html(url)}" style="background:#ff6900;color:#111827;padding:16px 24px;text-decoration:none;border-radius:12px;font-weight:bold">Récupérer mes fichiers</a></p><p>Disponibles jusqu’au ${html(date)} (heure de Paris).</p><p>Pierre Coutherut<br>Photographe</p></div>`});
      if (result.rejected?.length) throw new Error('Destinataire refusé');
      db.prepare("UPDATE transfers SET email_status='sent' WHERE id=?").run(id);
    } catch { db.prepare("UPDATE transfers SET email_status='failed' WHERE id=?").run(id); }
  }
  app.post('/api/admin/transfers/:id/publish',auth,async(req,res)=>{
    const t=store.transfer(req.params.id);
    if (t && effectiveStatus(t)==='active') return res.json(summary(t,true));
    if (!t || t.status!=='draft' || busy.has(t.id)) throw httpError(409,'Ce transfert n’est pas prêt à être publié.');
    if (!store.files(t.id).length) throw httpError(400,'Ajoute au moins un fichier.');
    const now=new Date();
    db.prepare("UPDATE transfers SET status='active', created_at=?, expires_at=?, email_status=? WHERE id=?").run(now.toISOString(),monthLater(now),t.recipient ? (mailer?'pending':'unconfigured'):'none',t.id);
    if (t.recipient && mailer) await sendEmail(t.id);
    res.json(summary(store.transfer(t.id),true));
  });
  app.post('/api/admin/transfers/:id/email',auth,async(req,res)=>{
    const t=store.transfer(req.params.id);
    if (!t || effectiveStatus(t)!=='active' || !t.recipient) throw httpError(400,'Aucun destinataire ou transfert expiré.');
    if (!mailer) throw httpError(503,'L’envoi par e-mail doit être configuré sur le serveur.');
    if (t.email_status==='sending') throw httpError(409,'L’envoi est déjà en cours.');
    await sendEmail(t.id); res.json(summary(store.transfer(t.id),true));
  });
  app.delete('/api/admin/transfers/:id',auth,(req,res)=>{
    const t=store.transfer(req.params.id);if (!t) throw httpError(404,'Transfert introuvable.');
    if (busy.has(t.id) || t.email_status==='sending') throw httpError(409,'Un traitement est en cours. Réessaie dans un instant.');
    store.purge(t.id);res.json({ok:true});
  });
  const publicLimit=rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Trop de requêtes. Réessaie dans une minute.'}});
  app.use('/api/transfers',publicLimit);
  function publicTransfer(req,res,next) {
    const t=db.prepare('SELECT * FROM transfers WHERE token=?').get(req.params.token);
    if (!t || ['draft','deleted'].includes(t.status)) return next(httpError(404,'Ce lien est introuvable.'));
    if (effectiveStatus(t)!=='active') return next(httpError(410,'Ce transfert a expiré. Contactez Pierre pour un nouvel envoi.'));
    req.transfer=t; next();
  }
  app.get('/api/transfers/:token',publicTransfer,(req,res)=>res.json(summary(req.transfer)));
  app.get('/api/transfers/:token/files/:fileId',publicTransfer,(req,res,next)=>{
    const f=store.files(req.transfer.id).find(f=>f.id===req.params.fileId);
    if (!f) throw httpError(404,'Fichier introuvable.');
    res.set({'Cache-Control':'no-store','Content-Type':'application/octet-stream'});
    res.download(path.join(filesDir,f.disk_name),f.name,err=>{if (err) { if (!res.headersSent) next(err); } else db.prepare('UPDATE transfers SET downloads=downloads+1 WHERE id=?').run(req.transfer.id);});
  });
  app.get('/api/transfers/:token/zip',publicTransfer,(req,res,next)=>{
    const archive=archiver('zip',{store:true,forceZip64:true});
    res.attachment(safeName(req.transfer.title)+'.zip');
    archive.on('error',e=>{if (!res.headersSent) next(e);else res.destroy();});
    archive.on('warning',e=>{if (!res.headersSent) next(e);else res.destroy();archive.abort();});
    res.on('close',()=>archive.abort());
    res.on('finish',()=>db.prepare('UPDATE transfers SET downloads=downloads+1 WHERE id=?').run(req.transfer.id));
    archive.pipe(res);
    const used=new Set();
    for (const f of store.files(req.transfer.id)) {
      let name=f.name,n=2;const ext=path.extname(name),stem=name.slice(0,name.length-ext.length);
      while (used.has(name.toLowerCase())) name=`${stem} (${n++})${ext}`;
      used.add(name.toLowerCase());archive.file(path.join(filesDir,f.disk_name),{name});
    }
    archive.finalize().catch(e=>{if (!res.headersSent) next(e);else res.destroy();});
  });
  const fallbackPhotos=[
    {url:'/assets/bests-fallback.webp',name:'Alpes',description:''},
    {url:'/assets/bests-fallback-2.webp',name:'Vue aérienne',description:''},
    {url:'/assets/bests-fallback-3.webp',name:'Annecy',description:''}
  ];
  let cached=[],cacheUntil=0,loadingPhotos=null;
  app.get('/api/backgrounds',(req,res)=>{
    // Une réponse immédiate ; un seul rafraîchissement concurrent de l’API.
    if (Date.now()>cacheUntil && !loadingPhotos) {
      loadingPhotos=(async()=>{
       try {
        const api=new URL(`/gallery/${encodeURIComponent(cfg.BESTS_GALLERY_ID || '8c5ae7e1-e5b3-4738-adde-4d4041f99405')}`,cfg.PHOTO_API_URL || 'https://api.pierre-coutherut.fr');
        api.searchParams.set('randomPhotosCount','30');
        const response=await fetch(api,{signal:AbortSignal.timeout(8000)});
        if (!response.ok) throw new Error('API indisponible');
        const gallery=await response.json();
        const photos=(gallery.photos || []).flatMap(p=>{
          const url=p.urls?.large || p.urls?.medium;
          try {const u=new URL(url);return u.protocol==='https:' && u.hostname==='photos-pierre.s3.fr-par.scw.cloud' ? [{url:u.href,name:p.name || '',description:p.description || ''}] : [];} catch {return [];}
        });
        if (!photos.length) throw new Error('Galerie vide');
        cached=photos;cacheUntil=Date.now()+5*60000;
       } catch {cacheUntil=Date.now()+30000;}
       finally {loadingPhotos=null;}
      })();
    }
    res.json(cached.length?cached:fallbackPhotos);
  });
  app.use(express.static(path.join(here,'public'),{index:false}));
  app.get(['/', '/admin', '/t/:token', '/demo'],(req,res)=>{res.set('Cache-Control','no-store');res.sendFile(path.join(here,'public/index.html'));});
  app.use((req,res)=>res.status(404).json({error:'Page introuvable.'}));
  app.use((err,req,res,next)=>{
    if (res.headersSent) return next(err);
    if (err instanceof multer.MulterError) return res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({error:err.code==='LIMIT_FILE_SIZE'?'Le fichier dépasse la taille autorisée.':'Upload invalide : envoie un seul fichier à la fois.'});
    const status=err.status || 500;
    if (status>=500) console.error('Erreur serveur :',err.code || err.name);
    res.status(status).json({error:status>=500?'Le serveur n’a pas pu terminer cette action.':err.message});
  });
  // Une interruption d’envoi reste visible plutôt que de produire un doublon automatique.
  db.prepare("UPDATE transfers SET email_status='failed' WHERE email_status='sending'").run();
  store.cleanup();
  const interval=options.noCleanupTimer?null:setInterval(()=>{try{store.cleanup();}catch{console.error('Nettoyage interrompu ; vérifier le disque.');}},3600000);
  interval?.unref();
  return {app,store,close:()=>{if(interval)clearInterval(interval);db.close();}};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const service=createApp();
  const port=Number(process.env.PORT || 3000);
  const host=process.env.HOST || '127.0.0.1';
  const server=service.app.listen(port,host,()=>console.log(`Pierre Transferts : ${host}:${port}`));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{server.close(()=>{service.close();process.exit(0);});setTimeout(()=>process.exit(1),30000).unref();});
}
