const statusEl=document.querySelector('#trackStatus');
const detailsEl=document.querySelector('#trackDetails');
const mapEl=document.querySelector('#trackMap');
const token=new URLSearchParams(location.search).get('token');

function showLocation(data){
  detailsEl.replaceChildren();
  mapEl.replaceChildren();
  if(data.lat==null||data.lng==null){
    statusEl.textContent='Waiting for the sender’s first GPS location…';
    detailsEl.hidden=true;
    return;
  }
  const stale=Date.now()-data.updatedAt>30000;
  statusEl.textContent=stale?'Last location received (updates may be paused)':'Location is being shared';
  detailsEl.hidden=false;
  const updated=new Date(data.updatedAt).toLocaleString();
  const link=document.createElement('a');
  link.href=`https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lng}#map=16/${data.lat}/${data.lng}`;
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.textContent=`Open map (${data.lat.toFixed(5)}, ${data.lng.toFixed(5)})`;
  detailsEl.append(link,document.createElement('br'),document.createTextNode(`Last update: ${updated}`));
}

async function poll(){
  if(!token){
    statusEl.textContent='This tracking link is missing its session token.';
    return;
  }
  try{
    const response=await fetch(`/api/live/${encodeURIComponent(token)}`,{cache:'no-store'});
    if(response.status===404){
      statusEl.textContent='This live location has expired or was stopped by the sender.';
      detailsEl.hidden=true;
      return;
    }
    if(!response.ok)throw new Error(`Request failed (${response.status})`);
    showLocation(await response.json());
  }catch{
    statusEl.textContent='Unable to load the location. Check your connection and try again.';
  }
}

poll();
setInterval(poll,5000);
