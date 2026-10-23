const $=s=>document.querySelector(s);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;};
let guides=[],shelters=[];
const STOP=new Set('a an the is are was were be to of in on at for and or my me i we you he she it this that with what how do does can should someone some please help need'.split(' '));
const stem=w=>{for(const s of['ing','ed','es','s'])if(w.endsWith(s)&&w.length-s.length>=3)return w.slice(0,-s.length);return w;};
const toks=t=>(t.toLowerCase().match(/[a-z]+/g)||[]).filter(w=>!STOP.has(w)).map(stem);

async function loadData(){
  guides=await (await fetch('/data/firstaid.json')).json();
  shelters=await (await fetch('/data/shelters.json')).json();
  guides.forEach(g=>{g._kw=new Set(toks(g.keywords));g._t=new Set(toks(g.title));g._b=new Set(toks(g.steps.join(' ')));});
  const quick=$('#quick');
  ['Bleeding','Burns','CPR','Snake bite','Earthquake','Flood'].forEach(x=>{const b=el('button','chip',x);b.onclick=()=>{$('#q').value=x;ask();};quick.append(b);});
}
function retrieve(q){
  const qs=new Set(toks(q));
  return guides.map(g=>({g,s:[...qs].reduce((a,t)=>a+(g._kw.has(t)?3:0)+(g._t.has(t)?2:0)+(g._b.has(t)?1:0),0)}))
    .filter(x=>x.s>=2).sort((a,b)=>b.s-a.s).map(x=>x.g);
}
// ---- agent router: decides answer / shelters / SOS ----
function intent(q){const t=q.toLowerCase();
  if(/\b(sos|rescue me|trapped|send help)\b/.test(t))return'sos';
  if(/\b(shelter|camp|hospital|safe place|nearest)\b/.test(t))return'shelters';
  return'ask';}
function show(tab){document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id===tab));
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.t));

function card(mode,title,text,sources){
  const a=$('#answer');a.replaceChildren();const c=el('div','card');
  const label={gemini:'AI answer, grounded in verified guides',local:'Offline guide',none:'No guide found'}[mode];
  c.append(el('span','badge '+mode,label));
  if(title)c.append(el('h3',null,title));
  if(text){c.append(el('div','steps',text));
    const sp=el('button','chip','Read aloud');sp.onclick=()=>{try{speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(text));}catch{}};c.append(sp);}
  if(sources&&sources.length)c.append(el('div','muted','Sources: '+sources.join(', ')));
  a.append(c);
}
async function ask(){
  const q=$('#q').value.trim();if(!q)return;
  const it=intent(q);
  if(it==='sos'){show('sos');return;} if(it==='shelters'){show('shelters');locate();return;}
  card('none','Thinking...','');
  let res=null;
  if(navigator.onLine){try{const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),9000);
    const r=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q}),signal:ctl.signal});
    clearTimeout(to);if(r.ok)res=await r.json();}catch{}}
  if(res&&res.answer)return card(res.mode,res.sources[0]||'',res.answer,res.sources);
  const hits=retrieve(q);
  if(hits.length){const g=hits[0];return card('local',g.title,g.steps.map((s,i)=>`${i+1}. ${s}`).join('\n')+'\nCall 112 if the person is in danger.',[g.title]);}
  card('none','No matching guide','Call 112 (emergency), 108 (ambulance) or 101 (fire). You can also send an SOS from the SOS tab.');
}
$('#go').onclick=ask;$('#q').addEventListener('keydown',e=>{if(e.key==='Enter')ask();});

// ---- shelters ----
const rad=d=>d*Math.PI/180;
function km(a,b,c,d){const R=6371,x=rad(c-a),y=rad(d-b);const h=Math.sin(x/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function getPos(){return new Promise(res=>{if(!navigator.geolocation)return res(null);
  navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude,real:true}),()=>res(null),{timeout:6000,maximumAge:60000});});}
async function locate(){
  const me=(await getPos())||{lat:20.0,lng:73.79,real:false};
  const list=shelters.map(s=>({...s,d:km(me.lat,me.lng,s.lat,s.lng)})).sort((a,b)=>a.d-b.d).slice(0,5);
  const max=Math.max(...list.map(s=>s.d),0.5),NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 300 300');
  const add=(t,o)=>{const e=document.createElementNS(NS,t);for(const k in o)e.setAttribute(k,o[k]);svg.append(e);return e;};
  [50,100,140].forEach(r=>add('circle',{cx:150,cy:150,r,fill:'none',stroke:'#cbd5e1','stroke-dasharray':'3 4'}));
  add('circle',{cx:150,cy:150,r:7,fill:'#1E2761'});
  list.forEach((s,i)=>{const dx=(s.lng-me.lng)*Math.cos(rad(me.lat))*111.32,dy=(s.lat-me.lat)*110.57,m=Math.hypot(dx,dy)||1,sc=130*(s.d/max)/m;
    add('circle',{cx:150+dx*sc,cy:150-dy*sc,r:10,fill:s.type==='hospital'?'#dc2626':'#6C63FF'});
    const t=add('text',{x:150+dx*sc,y:154-dy*sc,'text-anchor':'middle','font-size':11,fill:'#fff','font-weight':700});t.textContent=i+1;});
  $('#radar').replaceChildren(svg);
  const L=$('#slist');L.replaceChildren();
  if(!me.real)L.append(el('p','muted','GPS unavailable: showing distances from a demo centre point.'));
  list.forEach((s,i)=>{const r=el('div','item');r.append(el('span',null,`${i+1}. ${s.name} (${s.type})`),el('b',null,s.d.toFixed(1)+' km'));L.append(r);});
  L.append(el('p','muted','Demo data. Replace shelters.json with verified local locations.'));
}
$('#loc').onclick=locate;

// ---- SOS: IndexedDB queue + auto sync ----
const DB=()=>new Promise((res,rej)=>{const r=indexedDB.open('resqlink',1);r.onupgradeneeded=()=>r.result.createObjectStore('sos',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const tx=async(mode,fn)=>{const db=await DB();return new Promise((res,rej)=>{const t=db.transaction('sos',mode),s=t.objectStore('sos'),r=fn(s);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error);});};
const dbAll=()=>tx('readonly',s=>s.getAll());const dbPut=o=>tx('readwrite',s=>s.put(o));
async function renderSos(){const L=$('#soslist');L.replaceChildren();const all=(await dbAll()||[]).sort((a,b)=>b.ts-a.ts);
  all.forEach(s=>{const r=el('div','item');r.append(el('span',null,`${s.type}, ${s.people} person(s)`),el('span','st '+s.status,s.status.toUpperCase()));L.append(r);});}
async function flush(){if(!navigator.onLine)return;
  for(const s of(await dbAll()||[]).filter(x=>x.status==='pending')){
    try{const r=await fetch('/sos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:s.id,type:s.type,people:s.people,note:s.note,lat:s.lat,lng:s.lng,ts:s.ts,hops:s.hops})});
      if(r.ok){s.status='sent';await dbPut(s);}}catch{}}
  renderSos();}
$('#sendsos').onclick=async()=>{
  const pos=await getPos();
  await dbPut({id:crypto.randomUUID(),type:$('#stype').value,people:Math.max(1,+$('#people').value||1),note:$('#note').value.slice(0,300),
    lat:pos?pos.lat:null,lng:pos?pos.lng:null,ts:Date.now(),status:'pending',hops:[]});
  $('#note').value='';$('#sosinfo').textContent=navigator.onLine?'SOS saved. Uploading...':'SOS saved on this phone. It will upload when signal returns.';
  await renderSos();flush();};

// ---- shake alert: local contacts + user-confirmed SMS composers ----
const CONTACTS_KEY='resqlink-favorite-contacts';
let favoriteContacts=[];
let shakeEnabled=false;
let previousMotion=null;
let lastShakeAt=0;
let liveToken=null;
let liveWatchId=null;

function readContacts(){
  try{
    const saved=localStorage.getItem(CONTACTS_KEY);
    if(saved===null)return [{name:'Hardik Jain',phone:'8766747383'}];
    const parsed=JSON.parse(saved);
    return Array.isArray(parsed)?parsed.filter(c=>c&&typeof c.name==='string'&&typeof c.phone==='string').slice(0,5):[];
  }catch{
    $('#contactStatus').textContent='Saved contacts could not be read. Please re-enter and save them.';
    return [];
  }
}
function renderContacts(){
  const list=$('#contacts');
  list.replaceChildren();
  favoriteContacts.forEach((contact,index)=>{
    const row=el('div','contact-row');
    const name=document.createElement('input');
    name.type='text';name.maxLength=60;name.placeholder='Name';name.value=contact.name;
    name.setAttribute('aria-label',`Contact ${index+1} name`);
    const phone=document.createElement('input');
    phone.type='tel';phone.maxLength=24;phone.placeholder='Phone number';phone.value=contact.phone;
    phone.setAttribute('aria-label',`Contact ${index+1} phone number`);
    const remove=el('button','chip contact-remove','Remove');
    remove.type='button';remove.setAttribute('aria-label',`Remove contact ${index+1}`);
    remove.onclick=()=>{favoriteContacts.splice(index,1);renderContacts();};
    row.append(name,phone,remove);
    list.append(row);
  });
  $('#addContact').disabled=favoriteContacts.length>=5;
}
$('#addContact').onclick=()=>{
  if(favoriteContacts.length>=5)return;
  favoriteContacts.push({name:'',phone:''});
  renderContacts();
};
$('#saveContacts').onclick=()=>{
  const rows=[...$('#contacts').querySelectorAll('.contact-row')];
  const next=rows.map(row=>({name:row.children[0].value.trim(),phone:row.children[1].value.trim()}));
  const invalid=next.find(c=>!c.name||!c.phone||! /^\+?[0-9\s().-]{7,24}$/.test(c.phone));
  const normalized=next.map(c=>c.phone.replace(/\D/g,''));
  if(invalid||normalized.some(n=>n.length<7||n.length>15)||new Set(normalized).size!==normalized.length){
    $('#contactStatus').textContent='Each contact needs a name and a phone number with 7–15 digits. Phone numbers must be unique.';
    return;
  }
  try{
    localStorage.setItem(CONTACTS_KEY,JSON.stringify(next));
    favoriteContacts=next;
    $('#contactStatus').textContent='Contacts saved on this device only.';
    renderContacts();
  }catch{
    $('#contactStatus').textContent='Contacts could not be saved in this browser. Check storage settings and try again.';
  }
};

function shakeDetected(){
  $('#shakeConfirm').hidden=false;
  $('#alertLinks').replaceChildren();
  show('sos');
}
function onMotion(event){
  const a=event.accelerationIncludingGravity;
  if(!a||a.x==null||a.y==null||a.z==null)return;
  const now=Date.now();
  if(previousMotion){
    const change=Math.hypot(a.x-previousMotion.x,a.y-previousMotion.y,a.z-previousMotion.z);
    if(change>15&&now-lastShakeAt>8000){
      lastShakeAt=now;
      shakeDetected();
    }
  }
  previousMotion={x:a.x,y:a.y,z:a.z};
}
function enableShakeListener(){
  if(!window.isSecureContext){
    $('#shakeStatus').textContent='Shake detection requires HTTPS (or localhost).';
    return false;
  }
  if(!('DeviceMotionEvent'in window)){
    $('#shakeStatus').textContent='This browser does not provide motion sensor access.';
    return false;
  }
  window.addEventListener('devicemotion',onMotion);
  shakeEnabled=true;
  localStorage.setItem('resqlink-shake-enabled','true');
  $('#shakeToggle').textContent='Disable shake alerts';
  $('#shakeStatus').textContent='Shake detection is on. A confirmation is required before any alert.';
  return true;
}
async function toggleShake(){
  if(shakeEnabled){
    window.removeEventListener('devicemotion',onMotion);
    shakeEnabled=false;previousMotion=null;
    localStorage.setItem('resqlink-shake-enabled','false');
    $('#shakeToggle').textContent='Enable shake alerts';
    $('#shakeStatus').textContent='Shake detection is off.';
    return;
  }
  try{
    if(window.DeviceMotionEvent&&typeof window.DeviceMotionEvent.requestPermission==='function'){
      const permission=await window.DeviceMotionEvent.requestPermission();
      if(permission!=='granted'){
        $('#shakeStatus').textContent='Motion access was not granted. Enable it in browser settings to use shake alerts.';
        return;
      }
    }
    enableShakeListener();
  }catch{
    $('#shakeStatus').textContent='Motion access could not be enabled. Check browser permissions and try again.';
  }
}
$('#shakeToggle').onclick=toggleShake;
$('#cancelShake').onclick=()=>{$('#shakeConfirm').hidden=true;};

async function sendLiveUpdate(token,position){
  const response=await fetch(`/api/live/${encodeURIComponent(token)}`,{
    method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({lat:position.coords.latitude,lng:position.coords.longitude,updatedAt:Date.now()})
  });
  if(!response.ok)throw new Error(`Location update failed (${response.status})`);
}
function renderLiveAlert(token){
  const link=`${location.origin}/track.html?token=${encodeURIComponent(token)}`;
  const status=$('#liveStatus');
  status.replaceChildren();
  status.hidden=false;
  status.append(el('h3',null,'Live location link is active'));
  status.append(el('p','muted','Updates continue while this page remains open and has location access. The link expires after one hour.'));
  const anchor=document.createElement('a');
  anchor.href=link;anchor.textContent='Open live location page';anchor.target='_blank';
  anchor.rel='noopener noreferrer';
  status.append(anchor);
  const stop=el('button','chip','Stop sharing');
  stop.type='button';stop.onclick=stopLiveLocation;
  status.append(document.createElement('br'),stop);

  const cards=$('#alertLinks');
  cards.replaceChildren();
  const note=$('#note').value.trim().slice(0,180);
  const message=`SOS (${$('#stype').value}): I need help.${note?` ${note}`:''} Follow my live location: ${link}`;
  favoriteContacts.forEach(contact=>{
    const cardEl=el('div','card');
    cardEl.append(el('h3',null,contact.name));
    const sms=document.createElement('a');
    const phoneUri=contact.phone.replace(/[^\d+]/g,'');
    sms.className='p';sms.href=`sms:${phoneUri}?body=${encodeURIComponent(message)}`;
    sms.textContent=`Prepare SMS to ${contact.name}`;
    cardEl.append(sms);
    cards.append(cardEl);
  });
}
async function beginLiveAlert(){
  if(!navigator.onLine)throw new Error('An internet connection is required to create a live link and send SMS alerts.');
  if(!favoriteContacts.length)throw new Error('Save at least one trusted contact before sending an alert.');
  const response=await fetch('/api/live',{method:'POST'});
  if(!response.ok)throw new Error(`Could not create a live location link (${response.status}).`);
  const session=await response.json();
  liveToken=session.token;
  renderLiveAlert(liveToken);
  $('#shakeConfirm').hidden=true;
  if(!navigator.geolocation){
    $('#liveStatus').append(el('p','muted','This browser does not provide GPS. The link will show no location.'));
    return;
  }
  const activeToken=liveToken;
  let lastLocationSent=0;
  liveWatchId=navigator.geolocation.watchPosition(
    position=>{
      if(liveToken!==activeToken)return;
      if(Date.now()-lastLocationSent<5000)return;
      lastLocationSent=Date.now();
      sendLiveUpdate(activeToken,position).catch(()=>{
        if(!$('#liveNotice')){
          const notice=el('p','muted','A location update failed. Keep the app open and check GPS and internet access.');
          notice.id='liveNotice';$('#liveStatus').append(notice);
        }
      });
    },
    ()=>$('#liveStatus').append(el('p','muted','Location permission or GPS is unavailable. Enable location access to share live coordinates.')),
    {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
  );
}
$('#confirmShake').onclick=async()=>{
  const button=$('#confirmShake');
  button.disabled=true;
  try{await beginLiveAlert();}
  catch(error){$('#shakeStatus').textContent=error.message;$('#shakeConfirm').hidden=false;}
  finally{button.disabled=false;}
};
async function stopLiveLocation(){
  if(liveWatchId!=null)navigator.geolocation.clearWatch(liveWatchId);
  liveWatchId=null;
  const token=liveToken;
  liveToken=null;
  if(token){
    try{
      const response=await fetch(`/api/live/${encodeURIComponent(token)}`,{method:'DELETE'});
      if(!response.ok)throw new Error(`Stop request failed (${response.status})`);
      $('#liveStatus').textContent='Live location sharing has stopped.';
    }catch{
      $('#liveStatus').textContent='Location updates stopped on this device, but the shared link could not be revoked. It will expire within one hour.';
    }
  }
  $('#alertLinks').replaceChildren();
}
favoriteContacts=readContacts();
renderContacts();
if(localStorage.getItem('resqlink-shake-enabled')==='true'){
  if(!window.DeviceMotionEvent||typeof window.DeviceMotionEvent.requestPermission!=='function')enableShakeListener();
  else $('#shakeStatus').textContent='Tap Enable shake alerts to restore motion access for this session.';
}

// ---- online pill + boot ----
function pill(){const p=$('#pill');p.textContent=navigator.onLine?'ONLINE':'OFFLINE';p.classList.toggle('off',!navigator.onLine);}
addEventListener('online',()=>{pill();flush();});addEventListener('offline',pill);
pill();loadData().then(()=>{renderSos();flush();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js');
