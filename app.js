'use strict';
const COURSES = ['Snídaně','Polévka','Hlavní chod','Příloha','Dezert','Pečení','Nápoje','Ostatní'];
const LS_OVERRIDES = 'kucharka_overrides_v1';
const LS_ADDED = 'kucharka_added_v1';
let baseRecipes = [], recipes = [], selectedCourses = new Set(), selectedIngredients = new Set();
let currentId = null, currentServings = 4, editingId = null;

const $ = s => document.querySelector(s);
const normalize = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

function formatAmount(value, unit){
  if(value === null || value === undefined || isNaN(value)) return '';
  let v;
  if(['g','ml'].includes(unit)) v = Math.round(value);
  else if(value >= 20) v = Math.round(value);
  else v = Math.round(value*4)/4;
  const frac = {0.25:'¼',0.5:'½',0.75:'¾'};
  const whole = Math.floor(v), rest = Math.round((v-whole)*100)/100;
  let txt;
  if(rest && frac[rest]) txt = (whole? whole+' ':'') + frac[rest];
  else txt = String(v).replace('.',',');
  return txt;
}
function scaledAmount(ing, factor){
  if(!ing.scalable || ing.amount === null || ing.amount === undefined) return ing.amount;
  return ing.amount * factor;
}
function loadLocal(){
  try{ return {overrides: JSON.parse(localStorage.getItem(LS_OVERRIDES)||'{}'), added: JSON.parse(localStorage.getItem(LS_ADDED)||'[]')}; }
  catch(e){ return {overrides:{}, added:[]}; }
}
function saveLocal(overrides, added){ localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides)); localStorage.setItem(LS_ADDED, JSON.stringify(added)); }
function merge(){
  const {overrides, added} = loadLocal();
  const map = new Map();
  baseRecipes.forEach(r => map.set(r.id, overrides[r.id] || r));
  added.forEach(r => map.set(r.id, r));
  recipes = [...map.values()];
}
function allIngredients(){
  const set = new Map();
  recipes.forEach(r => r.ingredients.forEach(i => set.set(i.normalized||normalize(i.name), i.normalized||normalize(i.name))));
  return [...set.keys()].sort((a,b)=>a.localeCompare(b,'cs'));
}
function renderCourseFilters(){
  $('#course-filters').innerHTML = COURSES.map(c=>`<button type="button" class="chip ${selectedCourses.has(c)?'active':''}" data-course="${c}">${c}</button>`).join('');
  document.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{ selectedCourses.has(b.dataset.course)?selectedCourses.delete(b.dataset.course):selectedCourses.add(b.dataset.course); render(); });
}
function renderIngredientFilters(){
  const q = normalize($('#ingredient-search').value);
  const list = allIngredients().filter(i=>!q || normalize(i).includes(q));
  $('#ingredient-filters').innerHTML = list.map(i=>`<label><input type="checkbox" data-ing="${i}" ${selectedIngredients.has(i)?'checked':''}> ${i}</label>`).join('');
  document.querySelectorAll('[data-ing]').forEach(cb=>cb.onchange=()=>{ cb.checked?selectedIngredients.add(cb.dataset.ing):selectedIngredients.delete(cb.dataset.ing); renderList(); });
}
function passes(r){
  const q = normalize($('#search').value);
  if(q && !normalize(r.title).includes(q) && !r.ingredients.some(i=>normalize(i.name).includes(q))) return false;
  if(selectedCourses.size && !r.courses.some(c=>selectedCourses.has(c))) return false;
  if(selectedIngredients.size){
    const have = new Set(r.ingredients.map(i=>i.normalized||normalize(i.name)));
    if($('#ingredient-mode').value==='contains'){
      if(![...selectedIngredients].every(i=>have.has(i))) return false;
    } else {
      const missing = [...have].filter(i=>!selectedIngredients.has(i)).length;
      // "Mám doma": vybrané = suroviny doma, recept smí vyžadovat max 2 další
      const extraNeeded = r.ingredients.map(i=>i.normalized||normalize(i.name)).filter(i=>!selectedIngredients.has(i)).length;
      if(extraNeeded > 2) return false;
    }
  }
  return true;
}
function renderList(){
  const filtered = recipes.filter(passes);
  $('#count').textContent = `Zobrazeno ${filtered.length} z ${recipes.length} receptů`;
  $('#list').innerHTML = filtered.map(r=>`
    <article class="card" data-id="${r.id}">
      ${r.image?`<img src="${r.image}" alt="">`:`<div class="emoji">🍽️</div>`}
      <div class="card-body"><h3>${escapeHtml(r.title)}</h3>
      <div class="meta">${r.courses.join(', ')} · ⏱ ${r.time_minutes||'?'} min · ${r.base_servings} porcí</div>
      <div class="meta">${r.ingredients.slice(0,5).map(i=>escapeHtml(i.name)).join(', ')}${r.ingredients.length>5?'…':''}</div></div>
    </article>`).join('') || '<p>Žádný recept neodpovídá filtrům.</p>';
  document.querySelectorAll('.card').forEach(c=>c.onclick=()=>openDetail(c.dataset.id));
}
function render(){ renderCourseFilters(); renderIngredientFilters(); renderList(); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function openDetail(id){
  const r = recipes.find(x=>x.id===id); if(!r) return;
  currentId = id; currentServings = r.base_servings;
  drawDetail();
  $('#detail').showModal();
}
function drawDetail(){
  const r = recipes.find(x=>x.id===currentId); if(!r) return;
  const factor = currentServings / r.base_servings;
  $('#detail-content').innerHTML = `
    ${r.image?`<img src="${r.image}" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px" alt="">`:''}
    <h2>${escapeHtml(r.title)}</h2>
    <p class="meta">${r.courses.join(', ')} · ⏱ ${r.time_minutes||'?'} min ${r.source_url?`· <a href="${r.source_url}" target="_blank" rel="noopener">Zdroj</a>`:''}</p>
    <div class="portions"><span>Porce:</span><button type="button" id="p-minus">−</button><strong>${currentServings}</strong><button type="button" id="p-plus">+</button><span class="meta">(základ ${r.base_servings})</span></div>
    <h3>Suroviny</h3>
    <ul>${r.ingredients.map(i=>{ const a=scaledAmount(i,factor); return `<li>${a!==null&&a!==undefined&&i.scalable?`<strong>${formatAmount(a,i.unit)} ${escapeHtml(i.unit)}</strong> `:''}${escapeHtml(i.name)}${i.note?` <span class="meta">(${escapeHtml(i.note)})</span>`:''}</li>`; }).join('')}</ul>
    <h3>Postup</h3>
    ${r.steps.map((s,idx)=>`<p class="step"><strong>${idx+1}.</strong> ${escapeHtml(s)}</p>`).join('')}
    ${r.notes?`<h3>Poznámka</h3><p>${escapeHtml(r.notes)}</p>`:''}`;
  $('#p-minus').onclick=()=>{ if(currentServings>1){currentServings--; drawDetail();} };
  $('#p-plus').onclick=()=>{ currentServings++; drawDetail(); };
}

// Editor
function openEditor(id){
  editingId = id || null;
  const r = id ? recipes.find(x=>x.id===id) : {title:'',source_url:'',image:'',base_servings:4,time_minutes:'',courses:[],ingredients:[{amount:'',unit:'',name:'',note:''}],steps:[],notes:''};
  const f = $('#editor-form');
  f.title.value=r.title||''; f.source_url.value=r.source_url||''; f.image.value=r.image||'';
  f.base_servings.value=r.base_servings||4; f.time_minutes.value=r.time_minutes||''; f.steps.value=(r.steps||[]).join('\n'); f.notes.value=r.notes||'';
  $('#editor-title').textContent = id ? 'Upravit recept' : 'Nový recept';
  $('#editor-courses').innerHTML = COURSES.map(c=>`<label style="display:inline-flex;gap:5px;align-items:center"><input type="checkbox" name="course" value="${c}" style="width:auto" ${r.courses.includes(c)?'checked':''}> ${c}</label>`).join('');
  $('#editor-ingredients').innerHTML='';
  (r.ingredients.length?r.ingredients:[{amount:'',unit:'',name:'',note:''}]).forEach(i=>addIngredientRow(i));
  $('#editor').showModal();
}
function addIngredientRow(i={}){
  const div=document.createElement('div'); div.className='ing-row';
  div.innerHTML=`<input placeholder="Množ." type="number" step="any" class="a" value="${i.amount??''}"><input placeholder="Jedn." class="u" value="${escapeHtml(i.unit||'')}"><input placeholder="Název" class="n" value="${escapeHtml(i.name||'')}"><input placeholder="Pozn." class="note" value="${escapeHtml(i.note||'')}"><button type="button" class="del">×</button>`;
  div.querySelector('.del').onclick=()=>div.remove();
  $('#editor-ingredients').appendChild(div);
}
function saveEditor(e){
  e.preventDefault();
  const f=$('#editor-form');
  const ingredients=[...document.querySelectorAll('#editor-ingredients .ing-row')].map(row=>{
    const amountRaw=row.querySelector('.a').value; const amount=amountRaw===''?null:parseFloat(amountRaw);
    const name=row.querySelector('.n').value.trim(); if(!name) return null;
    return {amount, unit:row.querySelector('.u').value.trim(), name, normalized:normalize(name), note:row.querySelector('.note').value.trim(), scalable: amount!==null};
  }).filter(Boolean);
  const courses=[...f.querySelectorAll('input[name="course"]:checked')].map(x=>x.value);
  const recipe={
    id: editingId || ('recept-'+Date.now()),
    title: f.title.value.trim(), source_url:f.source_url.value.trim(), image:f.image.value.trim(),
    base_servings: parseInt(f.base_servings.value,10)||1, time_minutes: f.time_minutes.value?parseInt(f.time_minutes.value,10):null,
    courses: courses.length?courses:['Ostatní'], ingredients,
    steps: f.steps.value.split('\n').map(s=>s.trim()).filter(Boolean), notes: f.notes.value.trim()
  };
  const {overrides, added}=loadLocal();
  if(editingId && baseRecipes.some(r=>r.id===editingId)) overrides[editingId]=recipe;
  else { const idx=added.findIndex(r=>r.id===recipe.id); if(idx>=0) added[idx]=recipe; else added.push(recipe); }
  saveLocal(overrides, added); merge(); render(); $('#editor').close();
  if(currentId) { /* detail se překreslí při příštím otevření */ }
}
function exportJson(){
  const blob=new Blob([JSON.stringify(recipes,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='recepty.json'; a.click(); URL.revokeObjectURL(a.href);
}

// Init
async function init(){
  try{ const res=await fetch('recepty.json'); baseRecipes=await res.json(); }
  catch(e){ baseRecipes=[]; }
  merge(); render();
  $('#search').oninput=renderList; $('#ingredient-search').oninput=renderIngredientFilters; $('#ingredient-mode').onchange=renderList;
  $('#btn-add').onclick=()=>openEditor(null);
  $('#btn-export').onclick=exportJson;
  $('#btn-reset').onclick=()=>{ if(confirm('Zrušit všechny lokální úpravy a nové recepty v tomto zařízení?')){ localStorage.removeItem(LS_OVERRIDES); localStorage.removeItem(LS_ADDED); merge(); render(); } };
  $('#file-import').onchange=async e=>{ const file=e.target.files[0]; if(!file) return; try{ const data=JSON.parse(await file.text()); const arr=Array.isArray(data)?data:data.recipes; if(!Array.isArray(arr)) throw new Error('bad'); const {overrides,added}=loadLocal(); arr.forEach(r=>{ if(baseRecipes.some(b=>b.id===r.id)) overrides[r.id]=r; else if(!added.some(a=>a.id===r.id)) added.push(r); else added[added.findIndex(a=>a.id===r.id)]=r; }); saveLocal(overrides,added); merge(); render(); alert('Import hotov.'); }catch(err){ alert('Soubor se nepodařilo načíst.'); } };
  $('#detail-close').onclick=()=>$('#detail').close();
  $('#detail-x').onclick=()=>$('#detail').close();
  $('#detail').addEventListener('click',e=>{ if(e.target.id==='detail') e.currentTarget.close(); });
  $('#detail-edit').onclick=()=>{ $('#detail').close(); openEditor(currentId); };
  $('#editor-cancel').onclick=()=>$('#editor').close();
  $('#add-ingredient').onclick=()=>addIngredientRow();
  $('#editor-form').addEventListener('submit', saveEditor);
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(reg=>reg.update()).catch(()=>{});
    let refreshing=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!refreshing){ refreshing=true; location.reload(); } });
  }
}
if(typeof document!=='undefined') document.addEventListener('DOMContentLoaded', init);
// Export pro testy
if(typeof module!=='undefined') module.exports={formatAmount, scaledAmount, normalize};
