// ── SUPABASE CONFIG ──────────────────────────────────────────
const SUPABASE_URL='https://whuytfjwdjjepayeiohj.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY';
const DB={
  _h(){return{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation,resolution=merge-duplicates'}},
  _hG(){return{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}},
  _hD(){return{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'}},
  async _fetch(method,table,body,query){
    try{
      const url=SUPABASE_URL+'/rest/v1/'+table+(query||'');
      const h=method==='GET'?this._hG():method==='DELETE'?this._hD():this._h();
      const opts={method,headers:h};if(body)opts.body=JSON.stringify(body);
      const res=await fetch(url,opts);
      if(!res.ok){let e='HTTP '+res.status;try{const j=await res.json();e=j.message||e}catch(x){}return{ok:false,err:e};}
      if(res.status===204||method==='DELETE')return{ok:true,data:[]};
      return{ok:true,data:await res.json()};
    }catch(e){return{ok:false,err:e.message};}
  },
  async loadAll(){
    const r=await this._fetch('GET','onboardings',null,'?select=id,data,updated_at&order=created_at.desc&limit=10000');
    if(!r.ok)return{ok:false,rows:[]};
    return{ok:true,rows:(r.data||[]).map(row=>({id:row.id,...(row.data||{})}))};
  },
  async upsert(record){
    const{id,...rest}=record;
    const rid=id||('onb_'+Date.now()+'_'+Math.random().toString(36).slice(2,6));
    const row={id:rid,data:rest,updated_at:new Date().toISOString(),created_at:rest.createdAt||new Date().toISOString()};
    const r=await this._fetch('POST','onboardings',row,'?on_conflict=id');
    return{ok:r.ok,id:rid,err:r.err};
  },
  async remove(id){
    return this._fetch('DELETE','onboardings',null,'?id=eq.'+encodeURIComponent(id));
  },
  async upsertOwner(record){
    const{id,...rest}=record;
    const rid=id||('owner_'+Date.now());
    const row={id:rid,data:rest,updated_at:new Date().toISOString()};
    const r=await this._fetch('POST','owners',row,'?on_conflict=id');
    return{ok:r.ok,id:rid};
  },
  async upsertProperty(record){
    const{id,...rest}=record;
    const rid=id||('prop_'+Date.now());
    const row={id:rid,data:rest,updated_at:new Date().toISOString()};
    const r=await this._fetch('POST','properties',row,'?on_conflict=id');
    return{ok:r.ok,id:rid};
  }
};

// ── DATA ──────────────────────────────────────────────────────
let cases=[];
let currentCase=null;
let currentView='board';
let filterStageVal='all';

const STAGES={
  contact:{label:'First Contact',color:'#3498db'},
  visit:{label:'Site Visit',color:'#9b59b6'},
  proposal:{label:'Proposal Sent',color:'#e67e22'},
  awaiting:{label:'Awaiting Signature',color:'#f39c12'},
  completed:{label:'Completed',color:'#27ae60'},
  declined:{label:'Declined',color:'#e74c3c'}
};

const SERVICES=[
  {key:'checkin',el:'Check-in',gr:'Check-in'},
  {key:'checkout',el:'Check-out',gr:'Check-out'},
  {key:'cleaning',el:'Cleaning / Καθαριότητα',gr:'Καθαριότητα'},
  {key:'laundry',el:'Laundry / Καθαριστήριο',gr:'Καθαριστήριο'},
  {key:'mgmt',el:'Bills Management',gr:'Management (λογαριασμοί)'},
  {key:'invoicing',el:'Invoice Issuing / Έκδοση Τιμολογίων',gr:'Έκδοση Τιμολογίων'},
  {key:'gmb',el:'Google My Business',gr:'Google MyBusiness'},
  {key:'website',el:'Website Creation / Δημιουργία Ιστοσελίδας',gr:'Δημιουργία Ιστοσελίδας'},
  {key:'webmgmt',el:'Website Management',gr:'Διαχείρηση Ιστοσελίδας'},
];

const ITEMS_KITCHEN=[
  {name:'ΠΟΤΗΡΙΑ ΝΕΡΟΥ',nameEn:'Water Glasses',formula:'guests*2'},
  {name:'ΠΟΤΗΡΙΑ ΚΡΑΣΙΟΥ',nameEn:'Wine Glasses',formula:'guests*2'},
  {name:'ΠΟΤΗΡΙΑ ΚΡΑΣΙΟΥ με ποδι',nameEn:'Stemmed Wine Glasses',formula:'guests*2'},
  {name:'ΚΟΥΠΕΣ ΚΑΦΕ (ΜΕΓΑΛΕΣ)',nameEn:'Coffee Mugs (Large)',formula:'guests*2'},
  {name:'ΦΛΙΤΖΑΝΙΑ ΜΕ ΠΙΑΤΑΚΙΑ',nameEn:'Cups with Saucers',formula:'guests'},
  {name:'ΠΛΑΣΤΙΚΑ ΠΟΤΗΡΙΑ ΠΑΙΔΙΩΝ',nameEn:"Children's Plastic Cups",formula:'guests'},
  {name:'ΠΙΑΤΕΛΛΑ',nameEn:'Serving Platter',formula:'guests/3'},
  {name:'ΜΠΟΛ ΓΙΑ ΣΑΛΑΤΑ',nameEn:'Salad Bowl',formula:'guests/3'},
  {name:'ΜΠΟΛ ΔΗΜΗΤΡΙΑΚΩΝ',nameEn:'Cereal Bowl',formula:'guests'},
  {name:'ΜΠΟΛ ΣΟΥΠΑΣ',nameEn:'Soup Bowl',formula:'guests*1.6'},
  {name:'ΜΠΟΛ ΓΙΑ ΦΡΟΥΤΑ',nameEn:'Fruit Bowl',formula:'guests*1.6'},
  {name:'ΜΕΓΑΛΑ ΠΙΑΤΑ',nameEn:'Large Plates',formula:'guests*1.6'},
  {name:'ΜΙΚΡΑ ΠΙΑΤΑ',nameEn:'Small Plates',formula:'guests*1.6'},
  {name:'ΣΟΥΡΩΤΗΡΙ',nameEn:'Colander',formula:'guests/4'},
  {name:'ΠΛΑΣΤΙΚΑ ΜΠΟΛ ΜΕ ΚΑΠΑΚΙΑ',nameEn:'Plastic Bowls with Lids',formula:'2'},
  {name:'ΤΡΙΦΤΗΣ ΤΥΡΙΩΝ',nameEn:'Cheese Grater',formula:'1'},
  {name:'ΣΤΙΦΤΗΣ ΛΕΜΟΝΙΩΝ',nameEn:'Lemon Squeezer',formula:'1'},
  {name:'ΤΣΑΓΙΕΡΑ',nameEn:'Teapot',formula:'1'},
  {name:'ΣΑΝΙΔΑ ΓΙΑ ΨΩΜΙ',nameEn:'Bread Board',formula:'1'},
  {name:'ΔΙΣΚΟΣ',nameEn:'Tray',formula:'1'},
  {name:'ΜΑΧΑΙΡΙΑ',nameEn:'Knives',formula:'guests*2'},
  {name:'ΜΑΧΑΙΡΙΑ ΒΟΥΤΥΡΟΥ',nameEn:'Butter Knives',formula:'guests*2'},
  {name:'ΠΙΡΟΥΝΙΑ',nameEn:'Forks',formula:'guests*2'},
  {name:'ΚΟΥΤΑΛΙΑ',nameEn:'Spoons',formula:'guests*2'},
  {name:'ΚΟΥΤΑΛΑΚΙΑ',nameEn:'Teaspoons',formula:'guests*2'},
  {name:'ΜΙΚΡΑ ΠΙΡΟΥΝΙΑ',nameEn:'Small Forks',formula:'guests*2'},
  {name:'ΑΝΟΙΧΤΗΡΙ ΜΠΥΡΑΣ',nameEn:'Beer Opener',formula:'1'},
  {name:'ΑΝΟΙΧΤΗΡΙ ΚΡΑΣΙΟΥ',nameEn:'Wine Opener',formula:'1'},
  {name:'ΑΝΟΙΧΤΗΡΙ ΚΟΝΣΕΡΒΩΝ',nameEn:'Can Opener',formula:'1'},
  {name:'ΣΠΑΤΟΥΛΑ ΠΛΑΣΤΙΚΗ',nameEn:'Plastic Spatula',formula:'1'},
  {name:'ΞΥΛΙΝΗ ΚΟΥΤΑΛΑ',nameEn:'Wooden Spoon',formula:'1'},
  {name:'ΚΟΥΤΑΛΑ ΜΕΓΑΛΗ',nameEn:'Large Ladle',formula:'guests/4'},
  {name:'ΚΟΥΤΑΛΙ ΜΕ ΤΡΥΠΕΣ',nameEn:'Slotted Spoon',formula:'guests/4'},
  {name:'ΕΡΓΑΛΕΙΟ ΠΑΤΑΤΑΣ',nameEn:'Potato Peeler',formula:'guests/4'},
  {name:'ΣΚΟΡΔΟΣΤΙΦΤΗΣ',nameEn:'Garlic Press',formula:'guests/4'},
  {name:'ΚΟΦΤΗΣ ΠΙΤΣΑΣ',nameEn:'Pizza Cutter',formula:'guests/4'},
  {name:'ΚΟΥΤΑΛΙ ΠΑΓΩΤΟΥ',nameEn:'Ice Cream Scoop',formula:'guests/4'},
  {name:'ΜΑΧΑΙΡΙ ΨΩΜΙΟΥ',nameEn:'Bread Knife',formula:'guests/4'},
  {name:'ΣΤΙΦΤΗΣ ΤΣΑΓΙΟΥ',nameEn:'Tea Strainer',formula:'guests/4'},
  {name:'ΑΛΑΤΟ-ΠΙΠΕΡΟ ΣΕΤ',nameEn:'Salt & Pepper Set',formula:'guests/4'},
  {name:'ΜΕΓΑΛΗ ΚΑΤΣΑΡΟΛΑ',nameEn:'Large Pot',formula:'guests/4'},
  {name:'ΜΕΤΡΙΑ ΚΑΤΣΑΡΟΛΑ',nameEn:'Medium Pot',formula:'guests/4'},
  {name:'ΜΙΚΡΗ ΚΑΤΣΑΡΟΛΑ',nameEn:'Small Pot',formula:'guests/4'},
  {name:'ΜΙΚΡΟ ΤΗΓΑΝΙ',nameEn:'Small Pan',formula:'guests/4'},
  {name:'ΜΕΣΑΙΟ ΤΗΓΑΝΙ',nameEn:'Medium Pan',formula:'guests/4'},
  {name:'ΜΕΓΑΛΟ ΤΗΓΑΝΙ',nameEn:'Large Pan',formula:'guests/4'},
  {name:'ΜΕΓΑΛΟ ΤΑΨΙ ΦΟΥΡΝΟΥ',nameEn:'Large Baking Tray',formula:'guests/4'},
  {name:'ΜΙΚΡΟ ΤΑΨΙ (ΠΥΡΕΞ)',nameEn:'Small Pyrex Dish',formula:'guests/4'},
  {name:'ΓΑΝΤΙΑ ΦΟΥΡΝΟΥ',nameEn:'Oven Gloves',formula:'guests/4'},
  {name:'ΜΕΓΑΛΟ ΨΑΛΙΔΙ',nameEn:'Large Scissors',formula:'guests/4'},
  {name:'ΠΛΑΣΤΙΚΑ ΜΠΟΛ ΝΕΡΟΧΥΤΗ',nameEn:'Plastic Sink Bowls',formula:'guests/8'},
  {name:'ΠΙΑΤΟΘΗΚΗ',nameEn:'Dish Drying Rack',formula:'1'},
];
const ITEMS_APPLIANCES=[
  {name:'Φούρνος μικροκυμάτων',nameEn:'Microwave',formula:'fixed'},
  {name:'Πλυντήριο Πιάτων',nameEn:'Dishwasher',formula:'fixed'},
  {name:'Πλυντήριο Ρούχων',nameEn:'Washing Machine',formula:'fixed'},
  {name:'DVD Player',nameEn:'DVD Player',formula:'fixed'},
  {name:'CD/Ράδιο μικρο',nameEn:'Small CD/Radio',formula:'fixed'},
  {name:'Δορυφορικό (BBC-CNN-SKY)',nameEn:'Satellite TV (BBC-CNN-SKY)',formula:'fixed'},
  {name:'Βραστήρας 1.5ltr',nameEn:'1.5L Kettle',formula:'fixed'},
  {name:'Φρυγανιέρα',nameEn:'Toaster',formula:'fixed'},
  {name:'Σίδερο & Σιδερώστρα',nameEn:'Iron & Ironing Board',formula:'fixed'},
  {name:'Πιστολάκι μαλλιών',nameEn:'Hair Dryer',formula:'fixed'},
  {name:'Καφετιέρα φίλτρου',nameEn:'Filter Coffee Machine',formula:'fixed'},
  {name:'Internet / WiFi',nameEn:'Internet / WiFi',formula:'fixed'},
  {name:'Χρηματοκιβώτιο',nameEn:'Safe Box',formula:'fixed'},
  {name:'Ξαπλώστρες',nameEn:'Sun Loungers',formula:'guests'},
  {name:'Ομπρέλες',nameEn:'Umbrellas',formula:'fixed'},
];
const ITEMS_GENERAL=[
  {name:'ΚΕΡΙΑ/ΣΠΙΡΤΑ/ΑΝΑΠΤΗΡΑ',nameEn:'Candles/Matches/Lighter',formula:'2'},
  {name:'ΦΩΤΑ ΑΣΦΑΛΕΙΑΣ σκαλές',nameEn:'Safety Lights (stairs/exits)',formula:'fixed'},
  {name:'ΒΑΖΟ',nameEn:'Vase',formula:'1'},
  {name:'ΤΑΣΑΚΙ',nameEn:'Ashtray',formula:'guests/4'},
  {name:'ΚΑΛΑΘΙ ΓΙΑ ΑΠΛΥΤΑ',nameEn:'Laundry Basket',formula:'1'},
  {name:'ΛΕΚΑΝΗ ΓΙΑ ΡΟΥΧΑ',nameEn:'Clothes Basin',formula:'1'},
  {name:'ΚΑΛΑΘΙ ΣΚΟΥΠΙΔΙΩΝ ΚΟΥΖΙΝΑΣ',nameEn:'Kitchen Bin',formula:'1'},
  {name:'ΚΑΛΑΘΑΚΙ ΤΟΥΑΛΕΤΑΣ',nameEn:'Bathroom Bin',formula:'bathrooms'},
  {name:'ΤΑΜΠΕΛΑ ΜΗΝ ΡΙΧΝΕΤΕ ΧΑΡΤΙ',nameEn:'No Paper in Toilet Sign',formula:'bathrooms'},
  {name:'ΒΟΥΡΤΣΑ ΤΟΥΑΛΕΤΤΑΣ',nameEn:'Toilet Brush',formula:'bathrooms'},
  {name:'ΣΦΟΥΓΓΑΡΙΣΤΡΑ',nameEn:'Mop',formula:'1'},
  {name:'ΚΟΥΒΑΣ',nameEn:'Bucket',formula:'1'},
  {name:'ΦΑΡΑΣΙ/ΣΚΟΥΠΑ',nameEn:'Dustpan & Brush',formula:'1'},
  {name:'ΠΕΤΣΕΤΕΣ ΚΟΥΖΙΝΑΣ',nameEn:'Kitchen Towels',formula:'guests/2'},
  {name:'ΜΑΝΤΑΛΑΚΙΑ',nameEn:'Clothes Pegs (enough)',formula:'fixed'},
  {name:'ΑΠΛΩΣΤΡΑ',nameEn:'Clothes Airer',formula:'1'},
  {name:'ΚΡΕΜΑΣΤΡΕΣ (×20 ανά δωμάτιο)',nameEn:'Hangers (×20 per room)',formula:'bedrooms*20'},
  {name:'ΚΑΛΥΜΑΤΑ ΣΤΡΩΜΑΤΟΣ',nameEn:'Mattress Protectors',formula:'bedrooms'},
  {name:'ΜΑΞΙΛΑΡΙΑ ΑΝΑ ΑΤΟΜΟ ΜΕ ΚΑΛΥΜΑΤΑ',nameEn:'Pillows per Person with Cases',formula:'guests*2'},
  {name:'ΚΟΥΒΕΡΤΕΣ ΑΝΑ ΚΡΕΒΑΤΙ',nameEn:'Blankets per Bed',formula:'bedrooms*2'},
  {name:'ΚΟΥΤΙ ΠΡΩΤΩΝ ΒΟΗΘΕΙΩΝ',nameEn:'First Aid Kit',formula:'1'},
  {name:'ΠΥΡΟΣΒΕΣΤΗΡΑΣ',nameEn:'Fire Extinguisher',formula:'fixed'},
  {name:'ΣΥΝΑΓΕΡΜΟΣ ΚΑΠΝΟΥ & ΚΟΥΒΕΡΤΑ ΠΥΡΟΣ',nameEn:'Smoke Alarm & Fire Blanket',formula:'fixed'},
  {name:'ΤΑΜΠΕΛΕΣ ΕΞΟΔΩΝ (ΠΡΑΣΙΝΕΣ)',nameEn:'Exit Signs (Green)',formula:'fixed'},
  {name:'ΚΑΝΕΛΑ ΜΠΑΛΚΟΝΙΩΝ >1M',nameEn:'Balcony Rails Min 1M Height',formula:'fixed'},
];

const SEASON_CHECKS=[
  {job:'Όλα τα φώτα να λειτουργούν',jobEn:'All lights working'},
  {job:'Αυτόματα φώτα εξω - σωστή ώρα',jobEn:'Outdoor auto lights - correct time'},
  {job:'Κλειδαριές/Κλειδιά',jobEn:'Locks/Keys check'},
  {job:'Έξτρα λάμπες',jobEn:'Spare bulbs available'},
  {job:'Χωρίς διαρροές κουζίνα & μπάνιο',jobEn:'No leaks - kitchen & bathroom'},
  {job:'Βρύσες δεν στάζουν',jobEn:'Taps not dripping'},
  {job:'Καθίσματα/Καπάκια σταθερά',jobEn:'Toilet seats/lids secure'},
  {job:'Στήριγμα ντουζ στον τοίχο',jobEn:'Shower holder secured to wall'},
  {job:'Κεφάλι ντουζ καθαρό & λειτουργεί',jobEn:'Shower head clean & working'},
  {job:'Κουρτίνες ντους χωρίς στίγματα',jobEn:'Shower curtains clean, no stains'},
  {job:'Κουρτίνες κρέμονται σωστά',jobEn:'Curtains hanging properly'},
  {job:'Καρέκλες δεν τρίζουν',jobEn:'Chairs not creaking'},
  {job:'Κουβέρτες & παπλώματα καθαρά',jobEn:'Blankets & duvets clean & good condition'},
  {job:'Μαξιλάρια με καλύμματα',jobEn:'Pillows with covers, not flattened'},
  {job:'Στρώματα με καλύμματα',jobEn:'Mattresses with protectors'},
  {job:'Κλιματιστικά καθαρά & σε σέρβις',jobEn:'A/C units cleaned & serviced'},
  {job:'Σύστημα ζεστού νερού λειτουργεί',jobEn:'Hot water system working'},
  {job:'Αρκετές κρεμάστρες & απλώστρα',jobEn:'Enough hangers & airer in good condition'},
  {job:'Σεντόνια/πετσέτες σε καλή κατάσταση',jobEn:'Sheets/towels in good condition'},
  {job:'Πετσετάκια κουζίνας αντικατάσταση',jobEn:'Kitchen towels replaced if needed'},
  {job:'Ηλεκτρικές συσκευές δουλεύουν',jobEn:'All electrical appliances working'},
  {job:'Κεφαλές σκούπας & σφουγγαρίστρας',jobEn:'Mop heads & cleaning tools OK'},
  {job:'Εξωτερικά έπιπλα καθαρά & καλά',jobEn:'Outdoor furniture clean & good condition'},
  {job:'Ξύλινα παράθυρα/εξώφυλλα βαμμένα',jobEn:'Wooden windows/shutters freshly painted'},
];

// ── SETTINGS ─────────────────────────────────────────────────
let settings={customItems:[],customJobs:[]};
function loadSettings(){try{settings=JSON.parse(localStorage.getItem('zesty_onb_settings')||'{"customItems":[],"customJobs":[]}');}catch{settings={customItems:[],customJobs:[]};}}
function saveSettings(){localStorage.setItem('zesty_onb_settings',JSON.stringify(settings));renderSettingsLists();showToast('Settings saved','success');closeSettings();}
function getAllItems(){return[...ITEMS_KITCHEN,...ITEMS_APPLIANCES,...ITEMS_GENERAL,...(settings.customItems||[])];}
function getAllJobs(){return[...SEASON_CHECKS,...(settings.customJobs||[])];}

// ── INIT ─────────────────────────────────────────────────────
async function init(){
  loadSettings();
  renderServicesRows();
  document.getElementById('seasonCheckDate').value=new Date().toISOString().slice(0,10);
  const r=await DB.loadAll();
  if(r.ok){
    cases=r.rows;
    showDbStatus(true);
  } else {
    cases=JSON.parse(localStorage.getItem('zesty_onboardings')||'[]');
    showDbStatus(false);
    console.warn('Supabase load failed:',r.err||'unknown error');
  }
  renderBoard();
  renderTable();
  updateCount();
  setInterval(async()=>{const r2=await DB.loadAll();if(r2.ok){cases=r2.rows;renderBoard();renderTable();updateCount();}},30000);
}

// ── PIPELINE BOARD ───────────────────────────────────────────
function updateCount(){
  const active=cases.filter(c=>c.stage!=='declined').length;
  const comp=cases.filter(c=>c.stage==='completed').length;
  document.getElementById('caseCount').textContent=`${active} active · ${comp} completed · ${cases.length} total`;
}

function filterStage(el){
  filterStageVal=el.dataset.stage;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderBoard();renderTable();
}

function renderBoard(){
  const board=document.getElementById('pipelineBoard');
  board.innerHTML='';
  Object.entries(STAGES).forEach(([key,stage])=>{
    const stageCases=cases.filter(c=>c.stage===key&&(filterStageVal==='all'||filterStageVal===key));
    const col=document.createElement('div');col.className='stage-col';
    col.innerHTML=`
      <div class="stage-header" style="color:${stage.color};border-bottom:3px solid ${stage.color}">
        <span>${stage.label}</span>
        <span style="background:${stage.color}20;color:${stage.color};padding:2px 7px;border-radius:10px;font-size:10px">${stageCases.length}</span>
      </div>
      <div class="stage-body">
        ${stageCases.length?stageCases.map(c=>`
          <div class="case-card" onclick="openCase('${c.id}')">
            <div class="case-name">${c.ownerData?.o_name||'Unnamed Owner'}</div>
            <div class="case-prop">${c.units&&c.units.length?c.units.map(u=>u.name||'Unit').join(', '):'No properties yet'}</div>
            <div class="case-date">${c.createdAt?new Date(c.createdAt).toLocaleDateString('el-GR'):'—'}</div>
          </div>`).join(''):'<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">No cases</div>'}
      </div>`;
    board.appendChild(col);
  });
}

function renderTable(){
  const tbody=document.getElementById('tableBody');
  const filtered=filterStageVal==='all'?cases:cases.filter(c=>c.stage===filterStageVal);
  tbody.innerHTML=filtered.map(c=>{
    const stage=STAGES[c.stage]||STAGES.contact;
    return`<tr>
      <td style="font-weight:600">${c.ownerData?.o_name||'—'}</td>
      <td>${c.units&&c.units.length?c.units.map(u=>u.name||'Unit').join(', '):'—'}</td>
      <td><span class="stage-badge" style="background:${stage.color}">${stage.label}</span></td>
      <td>${c.createdAt?new Date(c.createdAt).toLocaleDateString('el-GR'):'—'}</td>
      <td>${c.updatedAt?new Date(c.updatedAt).toLocaleDateString('el-GR'):'—'}</td>
      <td><button class="btn btn-primary btn-sm" onclick="openCase('${c.id}')">Open</button></td>
    </tr>`;
  }).join('');
}

function toggleView(){
  currentView=currentView==='board'?'table':'board';
  document.getElementById('boardView').style.display=currentView==='board'?'block':'none';
  document.getElementById('tableView').style.display=currentView==='table'?'block':'none';
  document.getElementById('viewToggle').textContent=currentView==='board'?'📋 Table View':'📌 Board View';
}

// ── RECORD OPEN/CLOSE ─────────────────────────────────────────
function newCase(){
  currentCase={id:null,stage:'contact',ownerData:{},units:[],items:{},seasonChecks:{},createdAt:new Date().toISOString()};
  populateForm();
  document.getElementById('deleteBtn').style.display='none';
  document.getElementById('completeBtn').style.display='none';
  document.getElementById('modalTitle').textContent='New Onboarding';
  showTab('owner');
  document.getElementById('recordModal').classList.add('open');
}

function openCase(id){
  currentCase=cases.find(c=>c.id===id);
  if(!currentCase)return;
  populateForm();
  document.getElementById('deleteBtn').style.display='inline-flex';
  document.getElementById('completeBtn').style.display=currentCase.stage!=='completed'?'inline-flex':'none';
  document.getElementById('modalTitle').textContent=currentCase.ownerData?.o_name||'Onboarding Record';
  showTab('owner');
  document.getElementById('recordModal').classList.add('open');
}

function closeRecord(){document.getElementById('recordModal').classList.remove('open');}

// ── FORM POPULATE ────────────────────────────────────────────
function populateForm(){
  const d=currentCase.ownerData||{};
  // Set stage
  document.getElementById('stageSelect').value=currentCase.stage||'contact';
  updateStageColor();
  // Owner fields
  ['o_name','o_phone1','o_phone2','o_email','o_address','o_coords','o_mapsLink',
   'o_cancelPolicy','o_otherAgencies','o_commission','o_afm','o_ama','o_eot',
   'o_legalName','o_bizType','o_iban','o_bank','o_bankName','o_bic','o_bankAddress',
   'o_seasonStart','o_seasonEnd','o_closedDates','o_notes'].forEach(k=>{
    const el=document.getElementById(k);if(el)el.value=d[k]||'';
  });
  ['o_bookingType','o_exclusivity','o_invoice','o_notifyBiz'].forEach(k=>{
    const el=document.getElementById(k);if(el)el.value=d[k]||'';
  });
  ['ch_airbnb','ch_booking','ch_vrbo','ch_tripadvisor','ch_website',
   'pm_stripe','pm_transfer','pm_paypal','pm_card'].forEach(k=>{
    const el=document.getElementById(k);if(el)el.checked=!!(d[k]);
  });
  if(d.coopModel){const r=document.querySelector(`input[name="coopModel"][value="${d.coopModel}"]`);if(r)r.checked=true;}
  // Services
  SERVICES.forEach(s=>{
    const yn=document.getElementById('svc_yn_'+s.key);
    const cost=document.getElementById('svc_cost_'+s.key);
    if(yn)yn.value=d['svc_yn_'+s.key]||'';
    if(cost)cost.value=d['svc_cost_'+s.key]||'';
  });
  // Units
  renderUnitsTable();
  // Items
  renderItemsTab();
  // Season
  renderSeasonCheck();
  // Report
  renderReport();
}

function collectForm(){
  const d={};
  ['o_name','o_phone1','o_phone2','o_email','o_address','o_coords','o_mapsLink',
   'o_cancelPolicy','o_otherAgencies','o_commission','o_afm','o_ama','o_eot',
   'o_legalName','o_bizType','o_iban','o_bank','o_bankName','o_bic','o_bankAddress',
   'o_seasonStart','o_seasonEnd','o_closedDates','o_notes'].forEach(k=>{
    const el=document.getElementById(k);if(el)d[k]=el.value;
  });
  ['o_bookingType','o_exclusivity','o_invoice','o_notifyBiz'].forEach(k=>{
    const el=document.getElementById(k);if(el)d[k]=el.value;
  });
  ['ch_airbnb','ch_booking','ch_vrbo','ch_tripadvisor','ch_website',
   'pm_stripe','pm_transfer','pm_paypal','pm_card'].forEach(k=>{
    const el=document.getElementById(k);if(el)d[k]=el.checked;
  });
  const cr=document.querySelector('input[name="coopModel"]:checked');
  if(cr)d.coopModel=cr.value;
  SERVICES.forEach(s=>{
    const yn=document.getElementById('svc_yn_'+s.key);
    const cost=document.getElementById('svc_cost_'+s.key);
    if(yn)d['svc_yn_'+s.key]=yn.value;
    if(cost)d['svc_cost_'+s.key]=cost.value;
  });
  return d;
}

function updateStageColor(){
  const stage=document.getElementById('stageSelect').value;
  const color=STAGES[stage]?.color||'var(--teal)';
  document.getElementById('stageSelect').style.borderColor=color;
  document.getElementById('stageSelect').style.color=color;
}

function renderServicesRows(){
  const container=document.getElementById('servicesRows');
  container.innerHTML=SERVICES.map(s=>`
    <div style="display:grid;grid-template-columns:1fr 80px 120px;align-items:center;padding:5px 12px;border-bottom:1px solid var(--border);font-size:13px">
      <span>${s.el}</span>
      <select id="svc_yn_${s.key}" style="padding:3px 6px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:'DM Sans',sans-serif">
        <option value="">—</option><option>Yes</option><option>No</option>
      </select>
      <input id="svc_cost_${s.key}" placeholder="€0" style="padding:3px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:'DM Sans',sans-serif;width:100px">
    </div>`).join('');
}

// ── UNITS TABLE ──────────────────────────────────────────────
const UNIT_FIELDS=[
  {key:'name',label:'Unit Name *',gr:'Όνομα Μονάδας'},
  {key:'address',label:'Address',gr:'Διεύθυνση'},
  {key:'sqm',label:'SQM (m²)',gr:'Τ.Μ.'},
  {key:'guests',label:'Max Guests *',gr:'Μέγ. Επισκέπτες'},
  {key:'bedrooms',label:'Bedrooms *',gr:'Υπνοδωμάτια'},
  {key:'bedroomSizes',label:'Bedroom Sizes',gr:'Μεγέθη Κρεβατιών'},
  {key:'bathrooms',label:'Bathrooms *',gr:'Μπάνια'},
  {key:'pool',label:'Pool (m²)',gr:'Πισίνα (τ.μ.)'},
  {key:'heatedPool',label:'Heated Pool',gr:'Θερμ. Πισίνα'},
  {key:'poolCost',label:'Pool Cost',gr:'Κόστος Πισίνας'},
  {key:'cancelPolicy',label:'Cancel Policy',gr:'Ακυρώσεις'},
  {key:'checkin',label:'Check-in time',gr:'Ώρα Check-in'},
  {key:'checkout',label:'Check-out time',gr:'Ώρα Check-out'},
  {key:'pets',label:'Pets',gr:'Κατοικίδια'},
  {key:'ac',label:'A/C (where)',gr:'A/C (πού)'},
  {key:'washing',label:'Washing Machine',gr:'Πλυντήριο'},
  {key:'dryer',label:'Dryer',gr:'Στεγνωτήριο'},
  {key:'crib',label:'Crib/Cot',gr:'Κούνια/Παρκοκρέβατο'},
  {key:'highchair',label:'Highchair',gr:'Καρεκλάκι'},
  {key:'internet',label:'Internet type',gr:'Σύνδεση Internet'},
  {key:'icalLink',label:'iCal Link',gr:'iCal Link'},
  {key:'cleanFreq',label:'Cleaning frequency',gr:'Συχνότητα Καθαρισμού'},
  {key:'linenFreq',label:'Linen change freq.',gr:'Αλλαγή Λευκών'},
  {key:'detergents',label:'Detergents (Y/N)',gr:'Καθαριστικά'},
  {key:'bathrobes',label:'Bathrobes (Y/N)',gr:'Μπουρνούζια'},
  {key:'slippers',label:'Slippers (Y/N)',gr:'Παντόφλες'},
  {key:'soap',label:'Hand Soap',gr:'Σαπούνι'},
  {key:'shampoo',label:'Shampoo/Shower Gel',gr:'Σαμπουάν/Αφρόλουτρο'},
  {key:'conditioner',label:'Conditioner',gr:'Μαλακτικό'},
  {key:'bodyCream',label:'Body Cream',gr:'Κρέμα σώματος'},
  {key:'dishTabs',label:'Dishwasher Tablets',gr:'Ταμπλέτες πλυντηρίου'},
  {key:'dishSoap',label:'Dish Soap',gr:'Απορυπαντικό πιάτων'},
  {key:'frenchCoffee',label:'French Coffee',gr:'Γαλλικό'},
  {key:'espresso',label:'Espresso',gr:'Espresso'},
  {key:'capsules',label:'Capsules',gr:'Κάψουλες'},
  {key:'water',label:'Bottled Water',gr:'Εμφιαλωμένο νερό'},
  {key:'oliveoil',label:'Olive Oil',gr:'Ελαιόλαδο'},
  {key:'salt',label:'Salt',gr:'Αλάτι'},
  {key:'pepper',label:'Pepper',gr:'Πιπέρι'},
  {key:'tea',label:'Tea bags',gr:'Φακελάκια τσαγιού'},
  {key:'sugar',label:'Sugar',gr:'Ζάχαρη'},
  {key:'liquidSoap',label:'Liquid Dish Soap',gr:'Υγρό πιάτων'},
  {key:'sponges',label:'Sponges',gr:'Σφουγγάρια πιάτων'},
  {key:'toilet',label:'Toilet Paper',gr:'Χαρτί υγείας'},
  {key:'toiletBags',label:'Toilet bags',gr:'Σακουλάκια τουαλέτας'},
  {key:'binBags',label:'Bin bags',gr:'Σακούλες σκουπιδιών'},
];

function renderUnitsTable(){
  const units=currentCase.units||[];
  const header=document.getElementById('unitsHeader');
  const body=document.getElementById('unitsBody');
  // Header
  header.innerHTML='<th style="min-width:160px">Field</th>'+
    units.map((u,i)=>`<th style="min-width:140px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
        <span>Unit ${i+1}</span>
        <div style="display:flex;gap:2px">
          ${i>0?'':''}
          <button onclick="duplicateUnit(${i})" title="Duplicate" style="background:var(--teal);color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">⧉</button>
          ${units.length>1?`<button onclick="removeUnit(${i})" title="Remove" style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>`:''}
        </div>
      </div>
    </th>`).join('')+
    '<th><button onclick="addUnit()" class="btn btn-primary btn-sm" style="font-size:11px">+ Add Unit</button></th>';
  // Rows
  body.innerHTML=UNIT_FIELDS.map(f=>`
    <tr>
      <td>${f.label}<br><span style="font-size:10px;color:var(--text-muted)">${f.gr}</span></td>
      ${units.map((u,i)=>`<td><input value="${u[f.key]||''}" onchange="updateUnit(${i},'${f.key}',this.value)" placeholder="—"></td>`).join('')}
      <td style="background:transparent;border:none"></td>
    </tr>`).join('');
}

function addUnit(){
  if(!currentCase.units)currentCase.units=[];
  currentCase.units.push({});
  renderUnitsTable();
  renderItemsTab();
}
function removeUnit(i){
  currentCase.units.splice(i,1);
  renderUnitsTable();renderItemsTab();
}
function duplicateUnit(i){
  const copy=JSON.parse(JSON.stringify(currentCase.units[i]||{}));
  currentCase.units.splice(i+1,0,copy);
  renderUnitsTable();renderItemsTab();
}
function updateUnit(i,key,val){
  if(!currentCase.units[i])currentCase.units[i]={};
  currentCase.units[i][key]=val;
  // Recalc items if guest/bed/bath changed
  if(['guests','bedrooms','bathrooms'].includes(key))renderItemsTab();
}

// ── ITEMS TAB ────────────────────────────────────────────────
let currentItemsUnit='total';

function calcQty(formula,guests,bedrooms,bathrooms){
  if(formula==='fixed'||formula==='Αρκετά'||formula==='Εξαρτάται')return'✓';
  const g=parseInt(guests)||0,b=parseInt(bedrooms)||0,ba=parseInt(bathrooms)||0;
  const val=eval(formula.replace(/guests/g,g).replace(/bedrooms/g,b).replace(/bathrooms/g,ba));
  return Math.ceil(val)||0;
}

function renderItemsTab(){
  const units=currentCase.units||[];
  const tabs=document.getElementById('itemsUnitTabs');
  // Build unit tabs
  const _iAct=(v)=>currentItemsUnit===v?'active':'';
  tabs.innerHTML=`<div class="items-unit-tab ${_iAct('total')}" onclick="switchItemsUnit('total')">📊 Total</div>`+
    units.map((u,i)=>`<div class="items-unit-tab ${_iAct(i)}" onclick="switchItemsUnit(${i})">Unit ${i+1}: ${u.name||'Unnamed'}</div>`).join('');

  const content=document.getElementById('itemsContent');
  if(!units.length){content.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-muted)">Add property units first in the Properties tab.</div>';return;}

  // Get display units
  let displayUnits=currentItemsUnit==='total'?units:[units[currentItemsUnit]].filter(Boolean);

  const allItems=[
    {section:'🍽 Kitchen / Κουζίνα',items:ITEMS_KITCHEN},
    {section:'⚡ Appliances / Ηλεκτρικές Συσκευές',items:ITEMS_APPLIANCES},
    {section:'🏠 General / Γενικά',items:ITEMS_GENERAL},
    {section:'⚙ Custom / Πρόσθετα',items:settings.customItems||[]},
  ];

  content.innerHTML=allItems.filter(s=>s.items.length).map(section=>`
    <div class="items-section">
      <div class="items-section-title">${section.section}</div>
      <div class="items-grid">
        <div class="items-header-row">
          <span>Item</span>
          <span style="text-align:center">${currentItemsUnit==='total'?'Required':'Required'}</span>
          <span style="text-align:center">Have</span>
        </div>
        ${section.items.map((item,idx)=>{
          // Calculate required
          let required;
          if(currentItemsUnit==='total'){
            // Sum across all units
            const vals=units.map(u=>calcQty(item.formula,u.guests,u.bedrooms,u.bathrooms));
            if(vals.every(v=>v==='✓'))required='✓';
            else required=vals.reduce((s,v)=>s+(v==='✓'?0:parseInt(v)||0),0);
          } else {
            const u=units[currentItemsUnit]||{};
            required=calcQty(item.formula,u.guests,u.bedrooms,u.bathrooms);
          }
          const unitKey=currentItemsUnit==='total'?'total':currentItemsUnit;
          const haveKey=`s${allItems.indexOf(section)}_u${unitKey}_i${idx}`;
          const have=(currentCase.items&&currentCase.items[haveKey])||'';
          const isMissing=have!==''&&required!=='✓'&&parseInt(have)<required;
          return`<div class="item-row ${isMissing?'missing':''}">
            <div><div class="item-name">${item.name}</div><div class="item-calc" style="font-size:10px;color:var(--text-muted)">${item.nameEn}</div></div>
            <div class="item-req" style="text-align:center">${required}</div>
            <div class="item-have" style="text-align:center">
              ${required==='✓'?
                `<select onchange="saveItemValue('${haveKey}',this.value)" style="padding:3px 6px;border:1.5px solid var(--border);border-radius:5px;font-size:12px;font-family:'DM Sans',sans-serif">
                  <option value="">—</option>
                  <option value="yes" ${have==='yes'?'selected':''}>✓ Yes</option>
                  <option value="no" ${have==='no'?'selected':''}>✗ No</option>
                </select>`:
                `<input type="number" min="0" value="${have}" onchange="saveItemValue('${haveKey}',this.value)" style="width:60px;padding:3px 6px;border:1.5px solid ${isMissing?'#e74c3c':'var(--border)'};border-radius:5px;font-size:13px;text-align:center;font-family:'DM Sans',sans-serif">`
              }
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function switchItemsUnit(unit){
  currentItemsUnit=unit;
  // Refresh tab active states
  document.querySelectorAll('.items-unit-tab').forEach((t,i)=>{
    const isTotal=t.textContent.includes('Total');
    t.classList.toggle('active',(isTotal&&unit==='total')||(!isTotal&&unit===i-1));
  });
  renderItemsTab();
}

function saveItemValue(key,val){
  if(!currentCase.items)currentCase.items={};
  currentCase.items[key]=val;
  // Re-render to update missing highlights
  renderItemsTab();
}

// ── SEASON CHECK ─────────────────────────────────────────────
function renderSeasonCheck(){
  const container=document.getElementById('seasonCheckRows');
  const allJobs=getAllJobs();
  container.innerHTML=allJobs.map((j,i)=>{
    const sc=(currentCase.seasonChecks||{})[i]||{};
    return`<div class="season-job-row">
      <div class="season-job-name">${j.job}<br><span style="font-size:11px;color:var(--text-muted)">${j.jobEn}</span></div>
      <select class="season-status-select ${sc.status||''}" onchange="updateSeasonCheck(${i},'status',this.value);this.className='season-status-select '+this.value">
        <option value="">— Not checked</option>
        <option value="ok" ${sc.status==='ok'?'selected':''}>✓ OK</option>
        <option value="attention" ${sc.status==='attention'?'selected':''}>⚠ Needs Attention</option>
      </select>
      <input class="season-comment" value="${sc.comment||''}" placeholder="Comment..." onchange="updateSeasonCheck(${i},'comment',this.value)">
    </div>`;
  }).join('');
}

function updateSeasonCheck(i,key,val){
  if(!currentCase.seasonChecks)currentCase.seasonChecks={};
  if(!currentCase.seasonChecks[i])currentCase.seasonChecks[i]={};
  currentCase.seasonChecks[i][key]=val;
  renderReport();
}

// ── ACTION REPORT ─────────────────────────────────────────────
function renderReport(){
  const content=document.getElementById('reportContent');
  const issues=[];
  const _allSecs=[
    {key:0,items:ITEMS_KITCHEN},{key:1,items:ITEMS_APPLIANCES},
    {key:2,items:ITEMS_GENERAL},{key:3,items:settings.customItems||[]}
  ];
  const units=currentCase.units||[];

  // Missing items
  if(units.length){
    _allSecs.forEach(sec=>{
      sec.items.forEach((item,idx)=>{
        units.forEach((u,ui)=>{
          const required=calcQty(item.formula,u.guests,u.bedrooms,u.bathrooms);
          if(required==='✓')return;
          const haveKey=`s${sec.key}_u${ui}_i${idx}`;
          const have=(currentCase.items&&currentCase.items[haveKey])||'';
          if(have!==''&&parseInt(have)<required){
            issues.push({type:'items',name:item.name,nameEn:item.nameEn,unit:`Unit ${ui+1}: ${u.name||''}`,required,have:parseInt(have),missing:required-parseInt(have)});
          }
        });
      });
    });
  }

  // Season check issues
  const allJobs=getAllJobs();
  Object.entries(currentCase.seasonChecks||{}).forEach(([i,sc])=>{
    if(sc.status==='attention'){
      const job=allJobs[parseInt(i)];
      if(job)issues.push({type:'season',name:job.job,nameEn:job.jobEn,comment:sc.comment||''});
    }
  });

  if(!issues.length){
    content.innerHTML=`<div style="text-align:center;padding:40px;color:#27ae60;font-size:14px">✅ No issues found. All items accounted for and season check passed.</div>`;
    return;
  }

  const itemIssues=issues.filter(i=>i.type==='items');
  const seasonIssues=issues.filter(i=>i.type==='season');

  content.innerHTML=`
    ${itemIssues.length?`
    <div style="font-size:13px;font-weight:700;color:var(--teal-dark);margin-bottom:8px">📦 Missing Items (${itemIssues.length})</div>
    <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:20px">
      ${itemIssues.map(i=>`<div class="report-item">
        <div><div class="ri-name">${i.name} <span style="font-size:11px;color:var(--text-muted)">(${i.nameEn})</span></div>
        <div style="font-size:11px;color:var(--text-muted)">${i.unit}</div></div>
        <span class="ri-badge rb-items">Need ${i.missing} more (have ${i.have}, need ${i.required})</span>
      </div>`).join('')}
    </div>`:''}
    ${seasonIssues.length?`
    <div style="font-size:13px;font-weight:700;color:var(--teal-dark);margin-bottom:8px">🌿 Season Check Issues (${seasonIssues.length})</div>
    <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
      ${seasonIssues.map(i=>`<div class="report-item">
        <div><div class="ri-name">${i.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${i.nameEn}</div>
        ${i.comment?`<div class="ri-comment">💬 ${i.comment}</div>`:''}
        </div>
        <span class="ri-badge rb-job">Action needed</span>
      </div>`).join('')}
    </div>`:''}
  `;
}

// ── SAVE / DELETE ─────────────────────────────────────────────
async function saveRecord(){
  const ownerData=collectForm();
  currentCase.ownerData=ownerData;
  currentCase.stage=document.getElementById('stageSelect').value;
  currentCase.updatedAt=new Date().toISOString();
  if(!currentCase.createdAt)currentCase.createdAt=new Date().toISOString();

  const r=await DB.upsert(currentCase);
  if(r.ok){
    currentCase.id=r.id;
    const existing=cases.findIndex(c=>c.id===r.id);
    if(existing>=0)cases[existing]=currentCase;
    else cases.unshift(currentCase);
    localStorage.setItem('zesty_onboardings',JSON.stringify(cases));
    renderBoard();renderTable();updateCount();
    document.getElementById('modalTitle').textContent=ownerData.o_name||'Onboarding Record';
    document.getElementById('deleteBtn').style.display='inline-flex';
    document.getElementById('completeBtn').style.display=currentCase.stage!=='completed'?'inline-flex':'none';
    showToast('Saved successfully','success');
  } else {
    showToast('Save failed: '+r.err,'error');
  }
}

async function deleteCase(){
  if(!confirm('Delete this onboarding record? This cannot be undone.'))return;
  if(currentCase.id){
    await DB.remove(currentCase.id);
    cases=cases.filter(c=>c.id!==currentCase.id);
    localStorage.setItem('zesty_onboardings',JSON.stringify(cases));
    renderBoard();renderTable();updateCount();
  }
  closeRecord();
  showToast('Deleted','error');
}

async function completeOnboarding(){
  if(!confirm('Mark as Completed and push owner + property records to the ERP?'))return;
  const d=currentCase.ownerData||{};
  const units=currentCase.units||[];

  // Push owner
  const ownerRecord={
    repFirst:d.o_name?.split(' ')[0]||'',
    repLast:d.o_name?.split(' ').slice(1).join(' ')||'',
    phone1:d.o_phone1||'',phone2:d.o_phone2||'',
    email1:d.o_email||'',
    taxNumber:d.o_afm||'',taxOffice:'',
    idPassport:'',birthdate:'',
    iban:d.o_iban||'',bank:d.o_bank||'',
    commission:d.o_commission||'',
    coopStart:new Date().toISOString().slice(0,10),
    archived:false,
    properties:units.map(u=>({id:'',name:u.name||''})),
    onboardingId:currentCase.id
  };
  const or=await DB.upsertOwner(ownerRecord);

  // Push each unit as property
  for(const u of units){
    const prop={
      shortName:u.name||'Property',
      propertyName:u.name||'',
      location:u.address||d.o_address||'',
      owner:or.id||'',
      ownerName:d.o_name||'',
      bedrooms:parseInt(u.bedrooms)||null,
      bathrooms:parseInt(u.bathrooms)||null,
      sqm:parseInt(u.sqm)||null,
      capacity:parseInt(u.guests)||null,
      pool:u.pool?'Ναι':'Όχι',
      checkin:u.checkin||'',
      status:'Active',archived:false,
      onboardingId:currentCase.id
    };
    await DB.upsertProperty(prop);
  }

  currentCase.stage='completed';
  currentCase.completedAt=new Date().toISOString();
  await saveRecord();
  showToast('✅ Pushed to ERP — Owner & Properties created!','success');
}

// ── TABS ─────────────────────────────────────────────────────
function showTab(name){
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  event.target.classList.add('active');
  if(name==='report')renderReport();
  if(name==='items')renderItemsTab();
  if(name==='season')renderSeasonCheck();
}

// ── PRINT ─────────────────────────────────────────────────────
function printItems(lang){
  const units=currentCase.units||[];
  const d=currentCase.ownerData||{};
  const allItems=[
    {section:lang==='el'?'Κουζίνα':'Kitchen',items:ITEMS_KITCHEN},
    {section:lang==='el'?'Ηλεκτρικές Συσκευές':'Appliances',items:ITEMS_APPLIANCES},
    {section:lang==='el'?'Γενικά':'General',items:ITEMS_GENERAL},
  ];
  let html=`<html><head><meta charset="UTF-8"><title>Items List</title>
  <style>body{font-family:'DM Sans',sans-serif;font-size:12px;color:#1e2a28;margin:20px}
  h1{font-size:18px;margin-bottom:4px}h2{font-size:13px;margin:12px 0 4px;background:#1a7a6e;color:#fff;padding:4px 8px;border-radius:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border:1px solid #dde8e6;padding:5px 8px;text-align:left;font-size:11px}
  th{background:#f7f4ef;font-weight:700}tr:nth-child(even){background:#fafafa}
  .title{font-weight:700}@media print{@page{margin:15mm}}</style></head><body>`;
  html+=`<h1>${lang==='el'?'Λίστα Αντικειμένων':'Items Checklist'} — ${d.o_name||''}</h1>`;
  html+=`<p style="color:#6b7e7b;font-size:11px">${lang==='el'?'Ημερομηνία':'Date'}: ${new Date().toLocaleDateString(lang==='el'?'el-GR':'en-GB')}</p>`;

  allItems.forEach(s=>{
    html+=`<h2>${s.section}</h2><table><tr><th>${lang==='el'?'Προϊόν':'Item'}</th>`;
    // Total col
    html+=`<th>${lang==='el'?'Απαιτούμενα (Σύνολο)':'Required (Total)'}</th>`;
    units.forEach((u,i)=>html+=`<th>Unit ${i+1}: ${u.name||''}</th>`);
    html+=`</tr>`;
    s.items.forEach(item=>{
      const totVals=units.map(u=>calcQty(item.formula,u.guests,u.bedrooms,u.bathrooms));
      const total=totVals.every(v=>v==='✓')?'✓':totVals.reduce((s,v)=>s+(v==='✓'?0:parseInt(v)||0),0);
      html+=`<tr><td class="title">${lang==='el'?item.name:item.nameEn}</td><td style="font-weight:700;text-align:center">${total}</td>`;
      units.forEach(u=>html+=`<td style="text-align:center">${calcQty(item.formula,u.guests,u.bedrooms,u.bathrooms)}</td>`);
      html+=`</tr>`;
    });
    html+=`</table>`;
  });
  html+=`</body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();w.print();
}

function printSeasonCheck(){
  const d=currentCase.ownerData||{};
  const allJobs=getAllJobs();
  const date=document.getElementById('seasonCheckDate').value;
  let html=`<html><head><meta charset="UTF-8"><title>Season Check</title>
  <style>body{font-family:'DM Sans',sans-serif;font-size:12px;margin:20px}
  h1{font-size:18px;margin-bottom:4px}
  table{width:100%;border-collapse:collapse}th,td{border:1px solid #dde8e6;padding:6px 10px;font-size:11px}
  th{background:#1a7a6e;color:#fff;text-align:left}tr:nth-child(even){background:#f7f4ef}
  @media print{@page{margin:15mm}}</style></head><body>`;
  html+=`<h1>Season Check — ${d.o_name||''}</h1><p style="color:#6b7e7b;font-size:11px">Date: ${date}</p>`;
  html+=`<table><tr><th>Job / Εργασία</th><th style="width:120px">Status</th><th>Comment</th></tr>`;
  allJobs.forEach((j,i)=>{
    const sc=(currentCase.seasonChecks||{})[i]||{};
    const status=sc.status==='ok'?'✓ OK':sc.status==='attention'?'⚠ Attention':'—';
    html+=`<tr><td>${j.job}<br><span style="color:#6b7e7b">${j.jobEn}</span></td><td>${status}</td><td>${sc.comment||''}</td></tr>`;
  });
  html+=`</table></body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();w.print();
}

// ── SETTINGS ──────────────────────────────────────────────────
function openSettings(){
  renderSettingsLists();
  document.getElementById('settingsModal').classList.add('open');
}
function closeSettings(){document.getElementById('settingsModal').classList.remove('open');}

function renderSettingsLists(){
  const ci=document.getElementById('customItemsList');
  ci.innerHTML=(settings.customItems||[]).map((item,i)=>`
    <div class="tag">${item.name} (${item.nameEn})
      <button onclick="removeCustomItem(${i})">×</button>
    </div>`).join('');
  const cs=document.getElementById('customSeasonList');
  cs.innerHTML=(settings.customJobs||[]).map((j,i)=>`
    <div class="tag">${j.job}
      <button onclick="removeCustomJob(${i})">×</button>
    </div>`).join('');
}

function addCustomItem(){
  const name=document.getElementById('newItemName').value.trim();
  const nameEn=document.getElementById('newItemNameEn').value.trim();
  const formula=document.getElementById('newItemFormula').value;
  if(!name)return;
  if(!settings.customItems)settings.customItems=[];
  settings.customItems.push({name,nameEn:nameEn||name,formula});
  document.getElementById('newItemName').value='';
  document.getElementById('newItemNameEn').value='';
  renderSettingsLists();
}
function removeCustomItem(i){settings.customItems.splice(i,1);renderSettingsLists();}

function addCustomJob(){
  const job=document.getElementById('newJobName').value.trim();
  const jobEn=document.getElementById('newJobNameEn').value.trim();
  if(!job)return;
  if(!settings.customJobs)settings.customJobs=[];
  settings.customJobs.push({job,jobEn:jobEn||job});
  document.getElementById('newJobName').value='';
  document.getElementById('newJobNameEn').value='';
  renderSettingsLists();
}
function removeCustomJob(i){settings.customJobs.splice(i,1);renderSettingsLists();}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg,type='info'){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast '+type+' show';
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3000);
}

// ── DB STATUS ─────────────────────────────────────────────────
function showDbStatus(online){
  const old=document.getElementById('db-status-bar');if(old)old.remove();
  if(online)return;
  const b=document.createElement('div');b.id='db-status-bar';
  b.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#c0392b;color:#fff;text-align:center;padding:8px;font-size:12px;z-index:9998;cursor:pointer;';
  b.textContent='⚠ Database offline — working in local mode. Click to retry.';
  b.onclick=()=>location.reload();
  document.body.appendChild(b);
}


// ── SIDEBAR NAVIGATION ──────────────────────────────────
function _initSidebar() {
  const sidebar = document.getElementById('erpSidebar');
  const overlay = document.getElementById('erpOverlay');
  const hamburger = document.getElementById('erpHamburger');
  if (!sidebar) return;
  // Hamburger toggle
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    });
  }
  // Close on overlay click
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }
  // Inject Azure user badge into sidebar footer
  const origBadge = document.getElementById('_azure_badge');
  const footerUser = document.getElementById('sidebarUser');
  if (origBadge && footerUser) {
    footerUser.innerHTML = origBadge.innerHTML;
    origBadge.remove();
  }
  // Watch for badge to appear
  const obs = new MutationObserver(() => {
    const b = document.getElementById('_azure_badge');
    const fu = document.getElementById('sidebarUser');
    if (b && fu) {
      fu.innerHTML = b.innerHTML;
      b.remove();
      obs.disconnect();
    }
  });
  obs.observe(document.body, {childList:true, subtree:true});
}
document.addEventListener('DOMContentLoaded', _initSidebar);


init().catch(console.error);
