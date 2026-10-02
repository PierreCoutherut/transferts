// Retirer le secret de l’adresse avant toute requête ou navigation.
function readAccessToken(){
  const token=location.pathname==='/admin' ? new URLSearchParams(location.hash.slice(1)).get('access') : null;
  if(token!==null)history.replaceState(null,'',location.pathname+location.search);
  return token;
}
let accessToken=readAccessToken();
window.addEventListener('hashchange',()=>{accessToken=readAccessToken();if(accessToken!==null)admin();});
let authMode='link';
const $=s=>document.querySelector(s);
const app=$('#app');
const escapeHTML=s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={download:'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',upload:'M12 16V4m-5 5 5-5 5 5M5 16v5h14v-5',file:'M14 2H6v20h12V6l-4-4m0-4v6h4',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4',check:'m5 12 4 4L19 6',copy:'M9 8h11v13H9zM15 8V3H4v13h5',mail:'M3 5h18v14H3zM3 5l9 7 9-7',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',x:'m6 6 12 12M6 18 18 6',eye:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.file}"/></svg>`;
function size(n){if(n===0)return '0 octet';const u=['o','Ko','Mo','Go','To'],i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return `${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:i>=2?1:0}).format(n/1024**i)} ${u[i]}`;}
const date=d=>new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris'});
const expiry=d=>new Date(d).toLocaleString('fr-FR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'});
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
async function api(url,options={}){
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data=await response.json();
  if (!response.ok) {const e=new Error(data.error || 'Une erreur est survenue.');e.status=response.status;throw e;}
  return data;
}
async function copy(value){try{await navigator.clipboard.writeText(value);toast('Lien copié.');}catch{toast('La copie automatique est indisponible. Sélectionne le lien.');}}
function render(html){app.innerHTML=html;app.setAttribute('aria-busy','false');}
function showError(container,message){container.textContent=message;container.hidden=false;}
function panelError(title,message){render(`<section class="panel"><div class="icon-badge">${icon('clock')}</div><h1>${escapeHTML(title)}</h1><p>${escapeHTML(message)}</p><a class="button wide" href="https://photos.pierre-coutherut.fr/">Voir la galerie</a></section>`);}
function home(){
  render(`<section class="panel"><div class="icon-badge">${icon('download')}</div><span class="eyebrow">PIERRE COUTHERUT · PHOTOGRAPHE</span><h1>Récupérer<br>vos fichiers.</h1><p>Ouvrez le lien reçu par e-mail, ou collez-le ici pour accéder à votre transfert.</p><form id="open-link"><label for="transfer-link">Lien de votre transfert</label><input class="input" id="transfer-link" type="text" placeholder="https://transferts.pierre-coutherut.fr/t/…" required autocomplete="off"><div id="link-error" class="error" role="alert" hidden></div><div class="form-actions"><button class="button wide">Ouvrir mon transfert</button></div></form><p class="note">Les fichiers sont disponibles pendant un mois à compter de leur envoi.</p></section>`);
  $('#open-link').addEventListener('submit',e=>{e.preventDefault();try{const url=new URL($('#transfer-link').value.trim());if(!['http:','https:'].includes(url.protocol))throw Error();const match=url.pathname.match(/^\/t\/([a-zA-Z0-9_-]{32})\/?$/);if(!match)throw Error();location.href='/t/'+match[1];}catch{showError($('#link-error'),'Ce lien ne ressemble pas à un lien de transfert. Vérifiez celui reçu par e-mail.');}});
}
async function client(token){
  try{const t=await api(`/api/transfers/${encodeURIComponent(token)}`);clientView(t,token,false);}catch(e){panelError(e.status===410?'Ce transfert a expiré.':e.status===404?'Lien introuvable.':'Le transfert est indisponible.',e.status===410?'Les fichiers ne sont plus disponibles. Contactez Pierre pour recevoir un nouveau lien.':e.status===404?'Vérifiez le lien reçu par e-mail.':'Réessayez dans quelques instants.');}
}
function clientView(t,token,demo){
  document.title=`${t.title} · Pierre Coutherut`;
  render(`<section class="panel">${demo?'<span class="demo-label">Aperçu client · photographie d’exemple</span>':''}<div class="panel-top"><span class="eyebrow">VOTRE TRANSFERT EST PRÊT</span>${icon('lock')}</div><h1>Vos fichiers<br>vous attendent.</h1><h2 class="transfer-title">${escapeHTML(t.title)}</h2>${t.message?`<p class="message">${escapeHTML(t.message)}</p>`:''}<div class="file-summary"><strong>${t.fileCount} fichier${t.fileCount>1?'s':''}</strong><span>${size(t.totalBytes)}</span></div><div class="file-list">${t.files.map(f=>`<div class="file-row"><span class="file-icon">${icon('file')}</span><div class="file-info"><span class="file-name">${escapeHTML(f.name)}</span><span class="file-size">${size(f.size)}</span></div><a class="icon-button" href="${demo?'/assets/bests-fallback.webp':`/api/transfers/${encodeURIComponent(token)}/files/${f.id}`}" download="${escapeHTML(f.name)}" aria-label="Télécharger ${escapeHTML(f.name)}">${icon('download')}</a></div>`).join('')}</div><a class="button wide" href="${demo?'/assets/bests-fallback.webp':`/api/transfers/${encodeURIComponent(token)}/zip`}" download="${demo?'Pierre-Coutherut-BESTS.webp':''}">${icon('download')} ${demo?'Télécharger la photo d’exemple':'Tout télécharger'}</a><div class="deadline">${icon('clock')}<span>${demo?'Disponibilité : un mois après l’envoi':`Jusqu’au ${escapeHTML(expiry(t.expiresAt))} (Paris)`}</span></div><p class="note">Photographies par Pierre Coutherut.</p></section>`);
  if(!demo){const remaining=new Date(t.expiresAt).getTime()-Date.now();if(remaining<=2147483647)setTimeout(()=>panelError('Ce transfert a expiré.','Contactez Pierre pour recevoir un nouveau lien.'),Math.max(0,remaining));}
}
function login(message=''){
  if(authMode==='link'){
    render(`<section class="panel"><div class="icon-badge">${icon('lock')}</div><span class="eyebrow">ESPACE ADMINISTRATEUR</span><h1>Bonjour Pierre.</h1><p>Ouvre ton lien privé pour accéder à tes transferts. Tu peux conserver le lien reçu en SSH dans tes favoris.</p>${message?`<div class="error" role="alert">${escapeHTML(message)}</div>`:''}</section>`);
    return;
  }
  render(`<section class="panel"><div class="icon-badge">${icon('lock')}</div><span class="eyebrow">ESPACE ADMINISTRATEUR</span><h1>Bonjour Pierre.</h1><p>Connecte-toi pour envoyer tes fichiers et gérer tes transferts.</p><form id="login-form"><div class="fields"><div><label for="username">Identifiant</label><input class="input" id="username" name="username" autocomplete="username" required></div><div><label for="password">Mot de passe</label><input class="input" id="password" type="password" name="password" autocomplete="current-password" required></div></div><div class="error" id="login-error" role="alert" ${message?'':'hidden'}>${escapeHTML(message)}</div><div class="form-actions"><button class="button wide" id="login-button">Se connecter</button></div></form></section>`);
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();$('#login-button').disabled=true;$('#login-error').hidden=true;try{await api('/api/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});await admin();}catch(e){if($('#login-error')){showError($('#login-error'),e.message);$('#login-button').disabled=false;}}});
}
let session=null,selected=[],draft=null,uploaded=0,isUploading=false;
function adminShell(tab,body){
  render(`<section class="admin-shell"><div class="admin-head"><div><h1>Mes transferts</h1><p>Les fichiers restent disponibles un mois.</p></div><div class="admin-tabs"><button class="tab ${tab==='create'?'active':''}" id="create-tab">Créer un transfert</button><button class="tab ${tab==='list'?'active':''}" id="list-tab">Tous les transferts</button><button class="text-button" id="logout">Déconnexion</button></div></div><div class="admin-body">${body}</div></section>`);
  $('#create-tab').addEventListener('click',()=>{if(!isUploading)createView();});
  $('#list-tab').addEventListener('click',()=>{if(!isUploading)listView();});
  $('#logout').addEventListener('click',async()=>{if(isUploading)return;try{await api('/api/logout',{method:'POST'});session=null;login();}catch(e){toast(e.message);}});
}
async function admin(){
  try{
    authMode=(await api('/api/auth')).mode;
    if(accessToken!==null){const token=accessToken;accessToken=null;await api('/api/login',{method:'POST',body:JSON.stringify({token})});}
    session=await api('/api/admin/session');createView();
  }catch(e){if(e.status===401)login(e.message);else panelError('Administration indisponible.',e.message);}
}
const mailNotice=()=>!session.emailConfigured?'<div class="notice">L’envoi par e-mail n’est pas configuré. Tu peux créer un transfert et partager son lien.</div>':'';
function createView(){
  adminShell('create',`${mailNotice()}<form id="create-form"><div class="create-grid"><div><div class="upload-zone" id="dropzone"><div class="icon-badge">${icon('upload')}</div><h2>Glisse tes fichiers ici</h2><p>Photos, vidéos, archives…</p><label class="button secondary small" for="file-input">Choisir des fichiers</label><input id="file-input" type="file" multiple aria-label="Choisir les fichiers du transfert"></div><div id="picked-files" class="picked-files"></div><p class="note">${size(session.maxFileBytes)} par fichier · ${size(session.maxTransferBytes)} par transfert</p></div><div class="fields"><div><label for="title">Nom du transfert</label><input id="title" class="input" required maxlength="120" placeholder="Ex. Séance portrait — Camille"></div><div><label for="recipient">E-mail du destinataire <span>· facultatif</span></label><input id="recipient" class="input" type="email" maxlength="254" placeholder="client@exemple.fr"><p class="note">Le lien est envoyé une fois tous les fichiers déposés.</p></div><div><label for="message">Un message <span>· facultatif</span></label><textarea id="message" class="input" maxlength="3000" placeholder="Bonjour, voici les photos de notre séance…"></textarea></div></div></div><div class="error" id="create-error" role="alert" hidden></div><div class="progress-block" id="upload-progress" role="status" hidden><div class="progress-line"><span id="progress-label">Préparation du transfert…</span><span id="progress-value">0 %</span></div><progress id="progress" value="0" max="100" aria-label="Progression de l’upload"></progress></div><div class="creation-bottom"><p>${icon('clock')} Expiration automatique après un mois</p><button id="send-button" class="button" type="submit">${icon('upload')} Créer le transfert</button></div></form>`);
  // Un brouillon conservé en mémoire permet de reprendre après une erreur d’upload.
  if(draft){$('#title').value=draft.title;$('#recipient').value=draft.recipient;$('#message').value=draft.message;lockFields(true);$('#send-button').textContent='Reprendre le transfert';}
  renderPicked();
  $('#file-input').addEventListener('change',e=>{addFiles([...e.target.files]);e.target.value='';});
  const zone=$('#dropzone');
  for(const event of ['dragenter','dragover'])zone.addEventListener(event,e=>{e.preventDefault();if(!draft)zone.classList.add('dragging');});
  for(const event of ['dragleave','drop'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.remove('dragging');});
  zone.addEventListener('drop',e=>{if(!draft)addFiles([...e.dataTransfer.files]);});
  $('#create-form').addEventListener('submit',sendTransfer);
}
function addFiles(files){
  if(draft)return;
  const candidate=[...selected];
  for(const f of files)if(!candidate.some(x=>x.name===f.name && x.size===f.size && x.lastModified===f.lastModified))candidate.push(f);
  if(candidate.length>session.maxFiles || candidate.some(f=>f.size>session.maxFileBytes) || candidate.reduce((s,f)=>s+f.size,0)>session.maxTransferBytes){showError($('#create-error'),'La sélection dépasse une des limites de taille ou de nombre de fichiers.');return;}
  selected=candidate;$('#create-error').hidden=true;renderPicked();
}
function renderPicked(){
  $('#picked-files').innerHTML=selected.map((f,i)=>`<div class="file-row"><span class="file-icon">${icon(i<uploaded?'check':'file')}</span><div class="file-info"><span class="file-name">${escapeHTML(f.name)}</span><span class="file-size">${size(f.size)}${i<uploaded?' · déposé':''}</span></div>${!draft?`<button class="icon-button remove-file" type="button" data-index="${i}" aria-label="Retirer ${escapeHTML(f.name)}">${icon('x')}</button>`:''}</div>`).join('');
  document.querySelectorAll('.remove-file').forEach(b=>b.addEventListener('click',()=>{selected.splice(Number(b.dataset.index),1);renderPicked();}));
}
function lockFields(lock){for(const selector of ['#title','#recipient','#message','#file-input'])$(selector).disabled=lock;}
function uploadFile(id,file,key,onProgress){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('POST',`/api/admin/transfers/${id}/files`);xhr.setRequestHeader('X-Upload-Key',key);xhr.responseType='json';xhr.timeout=30*60000;
    xhr.upload.addEventListener('progress',e=>{if(e.lengthComputable)onProgress(Math.min(file.size,e.loaded/e.total*file.size));});
    xhr.addEventListener('load',()=>{if(xhr.status>=200 && xhr.status<300)resolve(xhr.response);else{const e=new Error(xhr.response?.error || 'L’upload a échoué.');e.status=xhr.status;reject(e);}});
    xhr.addEventListener('error',()=>reject(new Error('Connexion interrompue. Tu peux reprendre le transfert.')));
    xhr.addEventListener('timeout',()=>reject(new Error('L’upload a pris trop de temps. Tu peux reprendre le transfert.')));
    const form=new FormData();form.append('file',file);xhr.send(form);
  });
}
function setProgress(value,label){$('#progress').value=value;$('#progress-value').textContent=Math.round(value)+' %';$('#progress-label').textContent=label;}
async function sendTransfer(e){
  e.preventDefault();if(isUploading)return;
  if(!selected.length){showError($('#create-error'),'Choisis au moins un fichier.');return;}
  isUploading=true;$('#create-error').hidden=true;$('#send-button').disabled=true;$('#upload-progress').hidden=false;
  for(const id of ['#create-tab','#list-tab','#logout'])$(id).disabled=true;
  try{
    if(!draft){draft=await api('/api/admin/transfers',{method:'POST',body:JSON.stringify({title:$('#title').value,recipient:$('#recipient').value.trim(),message:$('#message').value})});lockFields(true);renderPicked();}
    const total=selected.reduce((s,f)=>s+f.size,0);
    for(let i=uploaded;i<selected.length;i++){
      const done=selected.slice(0,i).reduce((s,f)=>s+f.size,0);
      await uploadFile(draft.id,selected[i],`file-${i}`,n=>setProgress(total?(done+n)/total*96:(i+1)/selected.length*96,`Dépôt ${i+1}/${selected.length} · ${selected[i].name}`));
      uploaded=i+1;renderPicked();
    }
    setProgress(98,'Création du lien et notification du destinataire…');
    const t=await api(`/api/admin/transfers/${draft.id}/publish`,{method:'POST'});
    draft=null;selected=[];uploaded=0;resultView(t);
  }catch(err){
    if(err.status===401){draft=null;selected=[];uploaded=0;login('Ta session a expiré. Reconnecte-toi pour créer un nouveau transfert.');}
    else if($('#create-error')){showError($('#create-error'),err.message);$('#send-button').disabled=false;$('#send-button').textContent='Réessayer';}
  }finally{isUploading=false;for(const id of ['#create-tab','#list-tab','#logout'])if($(id))$(id).disabled=false;}
}
function emailMessage(t){if(!t.recipient)return 'Partage ce lien avec ton client.';if(t.emailStatus==='sent')return `E-mail envoyé à ${escapeHTML(t.recipient)}. Le serveur mail a accepté l’envoi.`;if(t.emailStatus==='failed')return 'Le transfert est prêt, mais l’e-mail n’a pas pu être envoyé. Tu peux partager le lien ou réessayer depuis la liste.';if(t.emailStatus==='unconfigured')return 'Le transfert est prêt. Configure l’envoi par e-mail sur le serveur ou partage ce lien.';return 'Le transfert est prêt. Vérifie l’état de l’e-mail dans la liste.';}
function resultView(t){
  adminShell('create',`<div class="result-box"><div class="icon-badge success-mark">${icon('check')}</div><h1>Le transfert est prêt.</h1><h2>${escapeHTML(t.title)}</h2><p>${t.fileCount} fichier${t.fileCount>1?'s':''} · ${size(t.totalBytes)} · jusqu’au ${escapeHTML(expiry(t.expiresAt))} (Paris)</p><p>${emailMessage(t)}</p><div class="share-link"><label class="sr-only" for="share-url">Lien du transfert</label><input class="input" id="share-url" readonly value="${escapeHTML(t.url)}"><button class="button small" id="copy-link">${icon('copy')} Copier le lien</button><a class="button secondary small" href="/t/${t.token}" target="_blank" rel="noopener noreferrer">Voir le transfert</a></div><button class="text-button" id="another-transfer">Créer un autre transfert</button></div>`);
  $('#copy-link').addEventListener('click',()=>copy(t.url));$('#share-url').addEventListener('focus',e=>e.target.select());$('#another-transfer').addEventListener('click',createView);
}
async function listView(){
  adminShell('list','<p role="status">Chargement des transferts…</p>');
  try{
    const transfers=await api('/api/admin/transfers');
    const active=transfers.filter(t=>t.status==='active'),storage=transfers.reduce((s,t)=>s+t.totalBytes,0),downloads=transfers.reduce((s,t)=>s+t.downloads,0);
    adminShell('list',`${mailNotice()}<div class="stats"><div class="stat"><strong>${active.length}</strong><span>Transferts actifs</span></div><div class="stat"><strong>${size(storage)}</strong><span>Fichiers stockés</span></div><div class="stat"><strong>${downloads}</strong><span>Téléchargements</span></div></div><div class="list-toolbar"><h2>Tous les transferts</h2><button class="text-button" id="refresh-list">Actualiser</button></div>${transfers.length?transfers.map(t=>`<article class="transfer-row"><div class="transfer-info"><h3>${escapeHTML(t.title)}<span class="status ${t.status}">${{active:'Actif',expired:'Expiré',draft:'Brouillon'}[t.status] || t.status}</span></h3><div class="transfer-meta">${t.fileCount} fichier${t.fileCount>1?'s':''} · ${size(t.totalBytes)}${t.expiresAt?` · ${t.status==='expired'?'Expiré le':'Disponible jusqu’au'} ${escapeHTML(expiry(t.expiresAt))} (Paris)`: ' · Non publié'}${t.recipient?`<br>${escapeHTML(t.recipient)} · ${{sent:'E-mail envoyé',failed:'Échec de l’e-mail',unconfigured:'E-mail non configuré',pending:'Envoi en attente',sending:'Envoi en cours',none:'Pas d’e-mail envoyé'}[t.emailStatus] || ''}`:''}</div>${t.status==='draft'?'<div class="help-inline">Ce brouillon n’est pas accessible au client. Il sera supprimé après 24 heures.</div>':''}</div><div class="row-actions">${t.status==='active'?`<a class="icon-button" href="/t/${t.token}" target="_blank" rel="noopener noreferrer" aria-label="Voir ${escapeHTML(t.title)}" title="Voir le transfert">${icon('eye')}</a><button class="icon-button" data-copy="${escapeHTML(t.url)}" aria-label="Copier le lien de ${escapeHTML(t.title)}" title="Copier le lien">${icon('copy')}</button>${t.recipient?`<button class="icon-button" data-email="${t.id}" aria-label="Renvoyer l’e-mail de ${escapeHTML(t.title)}" title="Renvoyer l’e-mail" ${!session.emailConfigured || t.emailStatus==='sending'?'disabled':''}>${icon('mail')}</button>`:''}`:''}<button class="icon-button" data-delete="${t.id}" aria-label="Supprimer ${escapeHTML(t.title)}" title="Supprimer le transfert">${icon('trash')}</button></div></article>`).join(''):'<div class="empty"><div class="icon-badge">'+icon('upload')+'</div><h2>Ton premier transfert t’attend.</h2><p>Dépose tes fichiers, puis partage un seul lien.</p><button class="button" id="first-transfer">Créer un transfert</button></div>'}`);
    $('#refresh-list').addEventListener('click',listView);$('#first-transfer')?.addEventListener('click',createView);
    document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>copy(b.dataset.copy)));
    document.querySelectorAll('[data-email]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{const t=await api(`/api/admin/transfers/${b.dataset.email}/email`,{method:'POST'});toast(t.emailStatus==='sent'?'L’e-mail a été envoyé.':'Échec de l’envoi. Vérifie la configuration mail.');await listView();}catch(e){toast(e.message);b.disabled=false;}}));
    document.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Supprimer ce transfert et ses fichiers ? Le lien client cessera immédiatement de fonctionner.'))return;b.disabled=true;try{await api(`/api/admin/transfers/${b.dataset.delete}`,{method:'DELETE'});if(draft?.id===b.dataset.delete){draft=null;selected=[];uploaded=0;}toast('Transfert supprimé.');await listView();}catch(e){toast(e.message);b.disabled=false;}}));
  }catch(e){if(e.status===401)login();else{adminShell('list',`<div class="error" role="alert">${escapeHTML(e.message)}</div><button class="button" id="retry-list">Réessayer</button>`);$('#retry-list').addEventListener('click',listView);}}
}
window.addEventListener('beforeunload',e=>{if(isUploading){e.preventDefault();e.returnValue='';}});
// Une sélection sans répétition immédiate ; le serveur ne transmet que BESTS.
let backgrounds=[],currentURL='/assets/bests-fallback.webp',layer=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,backgroundLoading=false;
const localBackgrounds=[{url:'/assets/bests-fallback.webp',name:'Alpes'},{url:'/assets/bests-fallback-2.webp',name:'Vue aérienne'},{url:'/assets/bests-fallback-3.webp',name:'Annecy'}];
function updatePause(){const b=$('#pause-background');b.textContent=paused?'Reprendre':'Pause';b.setAttribute('aria-label',paused?'Reprendre le diaporama':'Mettre le diaporama en pause');b.title=b.getAttribute('aria-label');}
async function loadBackgrounds(){try{backgrounds=await api('/api/backgrounds');}catch{backgrounds=localBackgrounds;}}
async function nextBackground(){
  if(backgroundLoading)return;backgroundLoading=true;
  try{if(!backgrounds.length)await loadBackgrounds();
    let previousRefresh='';try{previousRefresh=sessionStorage.getItem('pc-background') || '';}catch{}
    const pick=list=>{const candidates=list.filter(p=>p.url!==currentURL),fresh=candidates.filter(p=>p.url!==previousRefresh),pool=fresh.length?fresh:candidates;return pool[Math.floor(Math.random()*pool.length)];};
    const decode=async photo=>{const img=new Image();img.src=photo.url;let timer;try{await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Image indisponible')),7000);})]);}finally{clearTimeout(timer);}};
    let photo=pick(backgrounds) || pick(localBackgrounds);
    try{await decode(photo);}catch{photo=pick(localBackgrounds);await decode(photo);}
    const next=layer===0?$('#background-b'):$('#background-a'),previous=layer===0?$('#background-a'):$('#background-b');
    next.style.backgroundImage=`url(${JSON.stringify(photo.url)})`;next.style.opacity='1';previous.style.opacity='0';layer=1-layer;currentURL=photo.url;
    try{sessionStorage.setItem('pc-background',photo.url);}catch{}
    $('#photo-caption').textContent='BESTS · '+(photo.description || photo.name || 'Pierre Coutherut').slice(0,100);
  }catch{/* Le fond local reste visible si le réseau ne répond pas. */}finally{backgroundLoading=false;}
}
$('#pause-background').addEventListener('click',()=>{paused=!paused;updatePause();});$('#next-background').addEventListener('click',nextBackground);updatePause();
setInterval(async()=>{if(!paused&&!document.hidden){await loadBackgrounds();nextBackground();}},60000);nextBackground();
$('#year').textContent=new Date().getFullYear();
if(location.pathname==='/admin'){admin();}
else if(location.pathname.startsWith('/t/')){client(location.pathname.split('/')[2]);}
else if(location.pathname==='/demo'){fetch('/assets/bests-fallback.webp',{method:'HEAD'}).then(r=>{const bytes=Number(r.headers.get('Content-Length') || 0);clientView({title:'Un aperçu de mes photographies',message:'Bonjour, voici un exemple de l’espace où vos clients retrouveront leurs fichiers.',fileCount:1,totalBytes:bytes,files:[{id:'demo',name:'Pierre-Coutherut-BESTS.webp',size:bytes}]},'',true);});}
else home();
