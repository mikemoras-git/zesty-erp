const SUPABASE_URL='https://whuytfjwdjjepayeiohj.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY';
const DB={
  _h(){return{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation,resolution=merge-duplicates'}},
  _hG(){return{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}},
  _hD(){return{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'}},
  _ok(){return!!(SUPABASE_URL&&SUPABASE_KEY&&SUPABASE_URL.includes('supabase.co'))},
  async _fetch(method,table,body,query,ms){
    if(!this._ok())return{ok:false,data:null,err:'Not configured'};
    const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),ms||15000);
    try{
      const url=SUPABASE_URL+'/rest/v1/'+table+(query||'');
      const headers=method==='GET'?this._hG():method==='DELETE'?this._hD():this._h();
      const opts={method,headers,signal:ctrl.signal};
      if(body)opts.body=JSON.stringify(body);
      const res=await fetch(url,opts);clearTimeout(t);
      if(!res.ok){
        let e='HTTP '+res.status;
        try{const j=await res.json();e=j.message||j.hint||j.error||e}catch(x){}
        return{ok:false,data:null,err:e};
      }
      if(res.status===204||method==='DELETE')return{ok:true,data:[]};
      const ct=res.headers.get('content-type')||'';
      if(!ct.includes('json'))return{ok:true,data:[]};
      try{return{ok:true,data:await res.json()}}catch(x){return{ok:true,data:[]}}
    }catch(e){clearTimeout(t);return{ok:false,data:null,err:e.name==='AbortError'?'Timeout':e.message}}
  },
  async loadAll(table){
    const r=await this._fetch('GET',table,null,'?select=id,data,updated_at&order=created_at.asc&limit=100000');
    if(!r.ok)return{ok:false,rows:null,err:r.err};
    const rows=(r.data||[]).map(row=>({id:row.id,...(row.data||{})}));
    return{ok:true,rows};
  },
  async upsertOne(table,record){
    const{id,...rest}=record;
    const rid=id||('rec_'+Date.now()+'_'+Math.random().toString(36).slice(2,6));
    const row={id:rid,data:rest,updated_at:new Date().toISOString()};
    const r=await this._fetch('POST',table,row,'?on_conflict=id');
    return{ok:r.ok,id:rid,err:r.err};
  },
  async upsertMany(table,records){
    if(!records.length)return{ok:true};
    const rows=records.map(({id,...rest})=>({id:id||('rec_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)),data:rest,updated_at:new Date().toISOString()}));
    const size=200;
    for(let i=0;i<rows.length;i+=size){
      const r=await this._fetch('POST',table,rows.slice(i,i+size),'?on_conflict=id');
      if(!r.ok)return{ok:false,err:r.err};
    }
    return{ok:true};
  },
  async deleteOne(table,id){
    const r=await this._fetch('DELETE',table,null,'?id=eq.'+encodeURIComponent(id));
    return{ok:r.ok,err:r.err};
  },
  isConfigured(){return this._ok()}
};
const SyncStore={
  _pendingDeletes:{},
  async load(lsKey,table){
    const cached=this._getLocal(lsKey);
    const result=await DB.loadAll(table);
    if(result.ok&&result.rows!==null){
      const pending=this._pendingDeletes[table]||new Set();
      const rows=result.rows.filter(r=>!pending.has(r.id));
      localStorage.setItem(lsKey,JSON.stringify(rows));
      return{data:rows,fromCache:false,online:true};
    }
    return{data:cached,fromCache:true,online:false};
  },
  async saveOne(lsKey,table,record,all){
    localStorage.setItem(lsKey,JSON.stringify(all));
    const r=await DB.upsertOne(table,record);
    if(!r.ok)showSyncErr(r.err);
    return r;
  },
  async saveAll(lsKey,table,records){
    localStorage.setItem(lsKey,JSON.stringify(records));
    const r=await DB.upsertMany(table,records);
    if(!r.ok)showSyncErr(r.err);
    return r.ok;
  },
  async deleteOne(lsKey,table,id,all){
    if(!this._pendingDeletes[table])this._pendingDeletes[table]=new Set();
    this._pendingDeletes[table].add(id);
    localStorage.setItem(lsKey,JSON.stringify(all));
    const r=await DB.deleteOne(table,id);
    if(!r.ok){
      this._pendingDeletes[table].delete(id);
      showSyncErr('Delete failed: '+r.err);
      return{ok:false,err:r.err};
    }
    setTimeout(()=>{if(this._pendingDeletes[table])this._pendingDeletes[table].delete(id)},120000);
    return{ok:true};
  },
  _getLocal(key){try{return JSON.parse(localStorage.getItem(key)||'[]')||[]}catch{return[]}}
};
function startPoll(table,lsKey,ms,onData){
  let lastHash='';
  const poll=async()=>{
    const result=await DB.loadAll(table);
    if(!result.ok||!result.rows)return;
    const pending=SyncStore._pendingDeletes[table]||new Set();
    const rows=result.rows.filter(r=>!pending.has(r.id));
    const hash=rows.length+'|'+rows.map(r=>r.id).join(',');
    if(hash!==lastHash){lastHash=hash;localStorage.setItem(lsKey,JSON.stringify(rows));onData(rows)}
  };
  setInterval(poll,ms);
  return poll;
}
function showDbStatus(online){
  const old=document.getElementById('db-status-bar');if(old)old.remove();
  if(online)return;
  const b=document.createElement('div');b.id='db-status-bar';
  b.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#c0392b;color:#fff;text-align:center;padding:8px;font-size:12px;z-index:9998;cursor:pointer;';
  b.textContent='\u26A0 Database offline \u2014 working in local mode. Click to retry.';
  b.onclick=()=>{location.reload()};
  document.body.appendChild(b);
}
function showSyncErr(err){
  let b=document.getElementById('sync-err-bar');
  if(!b){b=document.createElement('div');b.id='sync-err-bar';b.style.cssText='position:fixed;bottom:40px;right:16px;background:#c0392b;color:#fff;border-radius:8px;padding:8px 14px;font-size:12px;z-index:9999;max-width:320px;';document.body.appendChild(b)}
  b.textContent='Save error: '+err;b.style.display='block';
  clearTimeout(b._t);b._t=setTimeout(()=>b.style.display='none',6000);
}

function showDbStatus(online){
  const old=document.getElementById('db-status-bar');if(old)old.remove();
  if(online)return;
  const b=document.createElement('div');b.id='db-status-bar';
  b.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#c0392b;color:#fff;text-align:center;padding:8px;font-size:12px;z-index:9998;cursor:pointer;';
  b.textContent='\u26A0 Database offline \u2014 working in local mode. Click to retry.';
  b.onclick=()=>{location.reload()};
  document.body.appendChild(b);
}
function showSyncErr(err){
  let b=document.getElementById('sync-err-bar');
  if(!b){b=document.createElement('div');b.id='sync-err-bar';b.style.cssText='position:fixed;bottom:40px;right:16px;background:#c0392b;color:#fff;border-radius:8px;padding:8px 14px;font-size:12px;z-index:9999;max-width:320px;';document.body.appendChild(b)}
  b.textContent='Save error: '+err;b.style.display='block';
  clearTimeout(b._t);b._t=setTimeout(()=>b.style.display='none',6000);
}


