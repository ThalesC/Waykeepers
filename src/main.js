import * as THREE from 'three';
import { CFG } from './config.js';
import { getState, setState, resetState, loadSave, saveNow as saveNowCore, hasSave, defaultState } from './state.js';
import { initWorld } from './world.js';
import { buildLevel } from './level.js';
import { Player } from './player.js';
import { Enemy } from './enemies.js';
import { Boss } from './boss.js';

// ---------- Scene ----------
const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88aacc);
scene.fog = new THREE.Fog(0x88aacc, 30, 120);
const camera = new THREE.PerspectiveCamera(CFG.camera.fov, window.innerWidth/window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

initWorld(scene);
buildLevel(scene);

// ---------- State ----------
let save = loadSave();
if(save){ setState(save); } else { setState(defaultState()); }
let st = getState();

// ---------- Entities ----------
const player = new Player(scene);
// apply checkpoint pos
const checkpointPositions = {
  camp: new THREE.Vector3(0,0,-2),
  brazier: new THREE.Vector3(0,0,205)
};
player.resetToCheckpoint(checkpointPositions[st.progress.activeCheckpoint] || checkpointPositions.camp);
player.applySavePlayer();

// enemies
const enemies = [];
function spawnEnemy(type, pos, boundary){
  const e = new Enemy(scene, type, pos);
  e.boundary = boundary;
  enemies.push(e);
  return e;
}
// Briarling in lower mossroad
spawnEnemy('briarling', new THREE.Vector3(0,0,55), {minX:-12,maxX:12,minZ:45,maxZ:80});
// Mossguard in cart yard
spawnEnemy('mossguard', new THREE.Vector3(0,0,105), {minX:-18,maxX:18,minZ:95,maxZ:130});
// mixed encounter upper wayhouse: one of each
spawnEnemy('briarling', new THREE.Vector3(-6,0,160), {minX:-20,maxX:20,minZ:145,maxZ:180});
spawnEnemy('mossguard', new THREE.Vector3(6,0,170), {minX:-20,maxX:20,minZ:145,maxZ:180});

// boss
const boss = new Boss(scene, new THREE.Vector3(0,0,230));
let bossActive = false;
let bossDefeated = st.progress.bossDefeated;
if(bossDefeated){ boss.group.visible=false; boss.dead=true; }

// caches sync claimed
for(const c of (window.cachesList||[])){}
for(const cc of caches){ if(st.progress.claimedCaches.includes(cc.id)) cc.claimed=true; }

// ---------- Input ----------
const input = {
  move: new THREE.Vector3(),
  sprint:false,
  lightPressed:false, heavyPressed:false, dodgePressed:false, healPressed:false,
  interactPressed:false,
  lockToggle:false, wheel:0,
  pause:false
};
let mouseCaptured=false;
let yaw=0, pitch=0;
const keys={};
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='Escape'){ togglePause(); }
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });
window.addEventListener('mousemove', e=>{
  if(mouseCaptured){
    yaw -= e.movementX * st.settings.sensitivity;
    pitch -= e.movementY * st.settings.sensitivity * (st.settings.invertY?-1:1);
    pitch = Math.max(-0.6, Math.min(0.8, pitch));
  }
});
renderer.domElement.addEventListener('click', ()=>{
  if(!mouseCaptured && !paused && !inMenu){ renderer.domElement.requestPointerLock(); }
});
window.addEventListener('blur', ()=>{ if(started && !paused){ paused=true; showPause(); document.exitPointerLock(); } });
document.addEventListener('pointerlockchange', ()=>{
  mouseCaptured = document.pointerLockElement === renderer.domElement;
  if(!mouseCaptured && !paused){ paused=true; showPause(); }
});
window.addEventListener('mousedown', e=>{
  if(paused||inMenu) return;
  if(e.button===0) input.lightPressed=true;
  if(e.button===2) input.heavyPressed=true;
});
window.addEventListener('mouseup', e=>{
  // held buttons do not queue; nothing
});
window.addEventListener('contextmenu', e=>e.preventDefault());
window.addEventListener('wheel', e=>{
  if(paused||inMenu) return;
  input.wheel += Math.sign(e.deltaY);
});
window.addEventListener('keydown', e=>{
  if(e.code==='Space') input.dodgePressed=true;
  if(e.code==='KeyQ') input.lockToggle=true;
  if(e.code==='KeyR') input.healPressed=true;
  if(e.code==='KeyE') input.interactPressed=true;
  if(e.code==='ShiftLeft') input.sprint=true;
});
window.addEventListener('keyup', e=>{
  if(e.code==='Space') input.dodgePressed=false;
  if(e.code==='ShiftLeft') input.sprint=false;
});

// ---------- Game state flow ----------
function saveNow(){
  const ok = saveNowCore();
  if(ok){ showSaveIndicator(); }
  else { showMsg('Save unavailable'); }
  return ok;
}
let paused=false;
let inMenu=true;
let started=false;

let lastCombatTime=0;
let lastTime=performance.now();

function showTitle(){
  inMenu=true; paused=false;
  document.getElementById('title').classList.remove('hidden');
  document.getElementById('btnContinue').disabled = !hasSave();
}
function showPause(){
  document.getElementById('pause').classList.remove('hidden');
  inMenu=true;
}
function hideMenus(){
  document.getElementById('title').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('journal').classList.add('hidden');
  document.getElementById('settings').classList.add('hidden');
  inMenu=false;
}
function togglePause(){
  if(inMenu && !paused) return;
  paused = !paused;
  if(paused){ showPause(); document.exitPointerLock(); }
  else { hideMenus(); }
}

document.getElementById('btnContinue').addEventListener('click', ()=>{
  const s=loadSave(); if(s){ setState(s); }
  st = getState();
  applyStateToGame();
  hideMenus(); started=true; paused=false;
  renderer.domElement.requestPointerLock();
});
document.getElementById('btnNew').addEventListener('click', ()=>{
  if(hasSave()){
    if(!confirm('Replace existing progress?')) return;
  }
  resetState(); saveNow();
  st = getState();
  applyStateToGame();
  hideMenus(); started=true; paused=false;
  renderer.domElement.requestPointerLock();
});
document.getElementById('btnSettings').addEventListener('click', ()=>{ document.getElementById('settings').classList.remove('hidden'); });
document.getElementById('btnResume').addEventListener('click', ()=>{ paused=false; hideMenus(); renderer.domElement.requestPointerLock(); });
document.getElementById('btnJournal').addEventListener('click', ()=>{ updateJournal(); document.getElementById('journal').classList.remove('hidden'); });
document.getElementById('btnJournalClose').addEventListener('click', ()=>{ document.getElementById('journal').classList.add('hidden'); });
document.getElementById('btnSettings2').addEventListener('click', ()=>{ document.getElementById('settings').classList.remove('hidden'); });
document.getElementById('btnTitle').addEventListener('click', ()=>{ paused=false; inMenu=true; document.getElementById('pause').classList.add('hidden'); document.getElementById('title').classList.remove('hidden'); started=false; document.exitPointerLock(); });
document.getElementById('btnSettingsClose').addEventListener('click', ()=>{ document.getElementById('settings').classList.add('hidden'); saveSettings(); });
document.getElementById('btnProjectBuy').addEventListener('click', ()=>{
  const st=getState();
  if(projectType==='workshop'){
    if(st.progress.workshop){ showMsg('Already restored'); return; }
    if(st.progress.salvage < 4){ showMsg('Need 4 Salvage'); return; }
    st.progress.salvage -= 4;
    st.progress.workshop = true;
    st.player.spearUpgraded = true;
    saveNow(); showSaveIndicator();
    showMsg('Workshop restored. Spear upgraded.');
  } else {
    if(st.progress.beacon){ showMsg('Already restored'); return; }
    if(st.progress.salvage < 8 || !st.progress.lens || st.progress.lensConsumed){ showMsg('Need 8 Salvage and Beacon Lens'); return; }
    st.progress.salvage -= 8;
    st.progress.lensConsumed = true;
    st.progress.beacon = true;
    st.progress.chapterComplete = true;
    saveNow(); showSaveIndicator();
    showMsg('Beacon restored. Chapter complete!');
  }
  document.getElementById('projectpanel').classList.add('hidden');
  inMenu=false; paused=false; renderer.domElement.requestPointerLock();
});
document.getElementById('btnProjectClose').addEventListener('click', ()=>{ document.getElementById('projectpanel').classList.add('hidden'); inMenu=false; paused=false; renderer.domElement.requestPointerLock(); });

document.getElementById('btnRest').addEventListener('click', ()=>{
  if(!canRestNow()){ showMsg('Cannot rest now'); return; }
  const st=getState();
  if(restTarget==='brazier'){ st.progress.brazier=true; st.progress.activeCheckpoint='brazier'; }
  else { st.progress.activeCheckpoint='camp'; }
  if(restPlayer()){ saveNow(); showSaveIndicator(); showMsg('Rested'); }
  document.getElementById('restmenu').classList.add('hidden'); inMenu=false; paused=false; renderer.domElement.requestPointerLock();
});
document.getElementById('btnTravel').addEventListener('click', ()=>{
  if(!canRestNow()){ showMsg('Cannot travel now'); return; }
  const st=getState();
  const dest = (restTarget==='camp')?'brazier':'camp';
  if(dest==='brazier' && !st.progress.brazier){ showMsg('Brazier not activated'); return; }
  // perform rest reset at destination
  st.progress.activeCheckpoint=dest;
  // teleport player
  const cp = checkpointPositions[dest];
  player.resetToCheckpoint(cp);
  player.applySavePlayer();
  for(const e of enemies){ if(!e.dead) e.reset(); }
  if(!bossDefeated && bossActive){ boss.reset(); bossActive=false; }
  st.player.health=player.health; st.player.stamina=player.stamina; st.player.heals=player.heals;
  saveNow(); showSaveIndicator(); showMsg('Traveled');
  document.getElementById('restmenu').classList.add('hidden'); inMenu=false; paused=false; renderer.domElement.requestPointerLock();
});
document.getElementById('btnRestClose').addEventListener('click', ()=>{ document.getElementById('restmenu').classList.add('hidden'); inMenu=false; paused=false; renderer.domElement.requestPointerLock(); });


function applyStateToGame(){
  st = getState();
  const s=st;
  player.resetToCheckpoint(checkpointPositions[s.progress.activeCheckpoint]||checkpointPositions.camp);
  player.applySavePlayer();
  // sync caches
  for(const cc of caches){ cc.claimed = st.progress.claimedCaches.includes(cc.id); }
  bossDefeated = s.progress.bossDefeated;
  if(bossDefeated){ boss.group.visible=false; boss.dead=true; }
  else { boss.reset(); }
  // shortcut wall removal
  if(s.progress.shortcut){ removeShortcutWall(); }
}

function saveSettings(){
  const s=getState();
  s.settings.sensitivity=+document.getElementById('sens').value;
  s.settings.invertY=document.getElementById('invert').checked;
  s.settings.textScale=+document.getElementById('textscale').value;
  s.settings.music=+document.getElementById('musicvol').value;
  s.settings.sfx=+document.getElementById('sfxvol').value;
  s.settings.quality=document.getElementById('quality').value;
  saveNow();
  showSaveIndicator();
}

// ---------- Shortcut wall ----------
let shortcutOpened=false;
function removeShortcutWall(){
  // not removing geometry, just allow passage; walls remain but gap exists already
  shortcutOpened=true;
}

// ---------- Interaction ----------
function doInteract(){
  const st=getState();
  const p=player.pos;
  // find interactable
  import('./world.js').then(async w=>{
    const {interactables, caches} = w;
    let target=null;
    for(const it of interactables){
      if(p.distanceTo(it.pos)<= (it.radius||2)){ target=it; break; }
    }
    if(!target) return;
    if(target.type==='cache'){
      const cache = caches.find(c=>c.id===target.cacheId);
      if(cache && !cache.claimed){
        cache.claimed=true;
        st.progress.claimedCaches.push(cache.id);
        st.progress.salvage += 2;
        saveNow(); showSaveIndicator();
        showMsg('Salvage x2 acquired');
      }
    } else if(target.type==='keepsake'){
      if(!st.progress.keepsake){
        st.progress.keepsake=true;
        saveNow(); showSaveIndicator();
        showMsg('Keepsake found');
      }
    } else if(target.type==='brazier'){
      if(!st.progress.brazier){
        st.progress.brazier=true;
      }
      // activate rest + checkpoint
      st.progress.activeCheckpoint='brazier';
      restPlayer();
      saveNow(); showSaveIndicator();
      showMsg('Brazier lit. Checkpoint set.');
    } else if(target.type==='hearth'){
      // rest at camp
      st.progress.activeCheckpoint='camp';
      restPlayer();
      saveNow(); showSaveIndicator();
    } else if(target.type==='shortcut'){
      if(!st.progress.shortcut){
        st.progress.shortcut=true;
        removeShortcutWall();
        saveNow(); showSaveIndicator();
        showMsg('Shortcut opened');
      }
    } else if(target.type==='workshop'){
      attemptWorkshop();
    } else if(target.type==='beacon'){
      attemptBeacon();
    } else if(target.type==='mara'){
      talkMara();
    }
  });
}

function canRestNow(){
  const engaged = engagedEnemies().length>0;
  if(engaged) return false;
  if(isCombatRecent()) return false;
  return true;
}
function restPlayer(){
  if(!canRestNow()){ showMsg('Cannot rest now'); return false; }
  player.health=100; player.stamina=100; player.heals=2;
  // reset enemies
  for(const e of enemies){ if(!e.dead) e.reset(); }
  // reset boss if undefeated
  if(!bossDefeated && bossActive){ boss.reset(); bossActive=false; }
  // reset attack volumes cleared
  getState().player.health=player.health; getState().player.stamina=player.stamina; getState().player.heals=player.heals;
  return true;
}

let restTarget=null;
function openRestMenu(target){
  restTarget=target;
  const st=getState();
  const other = target==='camp'?'brazier':'camp';
  // travel available if other rest point activated
  const otherActivated = (target==='camp') ? st.progress.brazier : true; // camp always active
  document.getElementById('btnTravel').disabled = !otherActivated || !canRestNow();
  document.getElementById('restmenu').classList.remove('hidden');
  inMenu=true; paused=true; document.exitPointerLock();
}
function isCombatRecent(){
  return (performance.now()/1000 - lastCombatTime) < 5;
}

let projectType=null;
function openProjectPanel(type){
  projectType=type;
  const st=getState();
  const info=document.getElementById('projectInfo');
  if(type==='workshop'){
    document.getElementById('projectTitle').textContent='Restore Workshop';
    info.textContent='Cost: 4 Salvage. You have: '+st.progress.salvage+'. Benefit: spear damage 30/54.';
  } else {
    document.getElementById('projectTitle').textContent='Restore Bridge Beacon';
    info.textContent='Cost: 8 Salvage + Beacon Lens. You have: '+st.progress.salvage+' Salvage, Lens: '+(st.progress.lens&&!st.progress.lensConsumed?'yes':'no')+'. Benefit: complete Light the Road.';
  }
  document.getElementById('projectpanel').classList.remove('hidden');
  inMenu=true; paused=true; document.exitPointerLock();
}
function attemptWorkshop(){
  const st=getState();
  if(st.progress.workshop){ showMsg('Workshop already restored'); return; }
  openProjectPanel('workshop');
}
function attemptBeacon(){
  const st=getState();
  if(st.progress.beacon){ showMsg('Beacon already restored'); return; }
  openProjectPanel('beacon');
}


function talkMara(){
  const st=getState();
  let msg='';
  if(st.progress.beacon){ msg='The road is lit. Thank you, traveler.'; }
  else if(st.progress.bossDefeated || st.progress.lens){ msg='You recovered the Lens. Restore the beacon when ready.'; }
  else { msg='Light the road. Defeat the Gate Warden, recover the Beacon Lens, restore the bridge beacon.'; }
  st.progress.dialogueStage = Math.max(st.progress.dialogueStage, 1);
  showMsg(msg);
  showDialogue(msg);
}

function showDialogue(text){
  const d=document.getElementById('dialogue');
  d.textContent=text; d.style.display='block';
  setTimeout(()=>{ d.style.display='none'; }, 4000);
}

let msgTimeout=null;
function showMsg(text){
  const el=document.getElementById('interact');
  el.textContent=text; el.classList.remove('hidden');
  if(msgTimeout) clearTimeout(msgTimeout);
  msgTimeout=setTimeout(()=>{ el.classList.add('hidden'); }, 3000);
}

function showSaveIndicator(){
  const el=document.getElementById('saveindicator');
  el.style.opacity=1;
  setTimeout(()=>{ el.style.opacity=0; }, 1200);
}

// ---------- Combat helpers ----------
function uid(e){ return e; }

function distanceXZ(a,b){ return Math.hypot(a.x-b.x, a.z-b.z); }

function inFront(attackerPos, attackerYaw, targetPos, reach, arc){
  const dx=targetPos.x-attackerPos.x;
  const dz=targetPos.z-attackerPos.z;
  const dist=Math.hypot(dx,dz);
  if(dist>reach) return false;
  const ang=Math.atan2(dx,dz);
  let diff=ang-attackerYaw;
  while(diff>Math.PI) diff-=Math.PI*2;
  while(diff<-Math.PI) diff+=Math.PI*2;
  if(arc && Math.abs(diff)>arc/2) return false;
  return true;
}

// ---------- Camera ----------
import { groundHeight, collidesWall, walls, raycastBoxes, interactables, caches } from './world.js';
// redefine updateCamera collision using raycastBoxes
function updateCamera(){
  const dist=CFG.camera.dist;
  const height=CFG.camera.height;
  const cp = Math.cos(pitch), sp=Math.sin(pitch);
  const dir = new THREE.Vector3(Math.sin(yaw)*cp, (height/dist)+sp*0.3, Math.cos(yaw)*cp);
  const origin = player.pos.clone().add(new THREE.Vector3(0,1.2,0));
  const len = dist;
  const dnorm = dir.clone().normalize();
  const hit = raycastBoxes(origin, dnorm, len);
  const finalDist = Math.min(len, hit-0.3);
  const camPos = origin.clone().add(dnorm.clone().multiplyScalar(Math.max(1.5, finalDist)));
  camera.position.copy(camPos);
  camera.lookAt(player.pos.x, player.pos.y+1.0, player.pos.z);
}

// ---------- Main loop ----------
function handleInput(dt){
  // movement vector camera-relative
  const mv=new THREE.Vector3();
  if(keys['KeyW']) mv.z -=1;
  if(keys['KeyS']) mv.z +=1;
  if(keys['KeyA']) mv.x -=1;
  if(keys['KeyD']) mv.x +=1;
  // rotate by camera yaw
  const cy=yaw;
  const rx = mv.x*Math.cos(cy) + mv.z*Math.sin(cy);
  const rz = -mv.x*Math.sin(cy) + mv.z*Math.cos(cy);
  input.move.set(rx,0,rz);
  input.sprint = !!keys['ShiftLeft'];
  // edge triggers already set true; reset after consume
}

let lockTarget=null;
player.lockTarget=null;

function updateLockOn(){
  if(input.lockToggle){ input.lockToggle=false;
    if(player.lockTarget){ player.lockTarget=null; }
    else {
      // acquire
      const candidates = enemies.filter(e=>!e.dead).concat(bossActive&&!boss.dead?[boss]:[]);
      let best=null, bestScore=Infinity;
      for(const e of candidates){
        const pos=e.pos||e.group.position;
        const d=player.pos.distanceTo(pos);
        if(d>10) continue;
        // screen center preference: project
        const v=pos.clone().project(camera);
        const score = Math.abs(v.x)+Math.abs(v.y)*0.5 + d*0.05;
        if(score<bestScore){ bestScore=score; best=e; }
      }
      player.lockTarget=best;
    }
  }
  // wheel cycle
  if(input.wheel!==0 && player.lockTarget){
    const candidates = enemies.filter(e=>!e.dead).concat(bossActive&&!boss.dead?[boss]:[]);
    const idx = candidates.indexOf(player.lockTarget);
    const dir = input.wheel>0?1:-1;
    let ni = idx + dir;
    if(ni<0) ni=candidates.length-1;
    if(ni>=candidates.length) ni=0;
    if(candidates[ni]) player.lockTarget=candidates[ni];
    input.wheel=0;
  }
  // release conditions
  if(player.lockTarget){
    const t=player.lockTarget;
    const pos=t.pos||t.group.position;
    const d=player.pos.distanceTo(pos);
    if(t.dead || d>14){ player.lockTarget=null; }
  }
  lockTarget=player.lockTarget;
}

// enemy engagement limiter
function engagedEnemies(){
  const alive = enemies.filter(e=>!e.dead);
  const near = alive.filter(e=>player.pos.distanceTo(e.pos)<25);
  near.sort((a,b)=>player.pos.distanceTo(a.pos)-player.pos.distanceTo(b.pos));
  return near.slice(0,2);
}

let lastAttackOrDamageTime = performance.now()/1000;
let chapterBoundaryShown=false;
function markCombat(){ lastCombatTime = performance.now()/1000; lastAttackOrDamageTime=lastCombatTime; }

// ---------- Update loop ----------
showTitle();

function loop(now){
  

requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now-lastTime)/1000);
  lastTime=now;
  if(inMenu||paused||!started){
    renderer.render(scene,camera);
    return;
  }
  handleInput(dt);
  updateLockOn();

  // engaged enemies
  const engaged = engagedEnemies();
  // can an enemy attack? only one in windup/active
  const someoneAttacking = engaged.some(e=>e.state==='windup'||e.state==='active');

  // update enemies
  for(const e of enemies){
    if(e.dead) continue;
    const isEngaged = engaged.includes(e);
    if(isEngaged){
      e.update(dt, player, !someoneAttacking || (e.state==='windup'||e.state==='active'));
    } else {
      // idle, reset? if pulled beyond boundary handled in update; do nothing
      e.update(dt, player, false);
    }
  }
  // boss
  if(bossActive && !boss.dead){
    boss.update(dt, player);
  }

  // player update
  // convert input triggers to pressed flags for this frame
  const inp = {
    move: input.move.clone(),
    sprint: input.sprint,
    lightPressed: input.lightPressed,
    heavyPressed: input.heavyPressed,
    dodgePressed: input.dodgePressed,
    healPressed: input.healPressed,
    interactPressed: input.interactPressed
  };
  player.update(dt, inp, enemies, boss);

  // reset pressed
  input.lightPressed=false; input.heavyPressed=false; input.dodgePressed=false; input.healPressed=false;

  // combat resolution: player attacks
  if(player.state.startsWith('attack') && player.attackActive){
    const type=player.attackType;
    const c = type==='light'?CFG.combat.light:CFG.combat.heavy;
    const reach = type==='light'?c.reach:c.reach;
    const arc = Math.PI*0.9;
    const dmg = player.spearDmg(type);
    const heavy = type==='heavy';
    // enemies
    for(const e of engaged){
      if(e.dead) continue;
      const pos=e.pos;
      if(!player.attackHitSet.has('e'+e.type+enemies.indexOf(e))){
        if(inFront(player.pos, player.yaw, pos, reach, arc)){
          player.attackHitSet.add('e'+e.type+enemies.indexOf(e));
          e.takeDamage(dmg, heavy, player);
          markCombat();
          if(e.dead){
            // no currency
          }
        }
      }
    }
    // boss
    if(bossActive && !boss.dead){
      const pos=boss.pos;
      if(!player.attackHitSet.has('boss')){
        if(inFront(player.pos, player.yaw, pos, reach, arc)){
          player.attackHitSet.add('boss');
          boss.takeDamage(dmg);
          markCombat();
          if(boss.dead){
            onBossDefeated();
          }
        }
      }
    }
  }

  // enemy attacks damage player
  for(const e of engaged){
    if(e.dead && !e.attackActive) continue;
    if(e.attackActive && e.currentAttack){
      const c = e.atkCfg;
      const reach = c.reach;
      const arc = e.type==='briarling'? Math.PI*0.6 : Math.PI*0.9;
      if(!e.attackHitSet.has('player')){
        if(inFront(e.pos, e.yaw, player.pos, reach, arc)){
          e.attackHitSet.add('player');
          // check dodge i-frames
          if(!player.isInvulnerableNow()){
            const interrupted = player.takeDamage(c.dmg, e.pos);
            markCombat();
            lastCombatTime=performance.now()/1000;
            // damage interrupts player attack/heal handled in takeDamage
          }
        }
      }
    }
  }
  // boss attacks
  if(bossActive && !boss.dead && boss.attackActive){
    const key = boss.currentAttackKey();
    const c = key==='A'?CFG.boss.A:CFG.boss.B;
    if(!boss.attackHitSet.has('player')){
      let hit=false;
      if(key==='A'){
        // 150deg arc out to 4.2
        if(inFront(boss.pos, boss.yaw, player.pos, c.reach, c.arc)){ hit=true; }
      } else {
        // overhead impact circle centered 2.9 ahead
        const fwd=new THREE.Vector3(Math.sin(boss.yaw),0,Math.cos(boss.yaw));
        const center=boss.pos.clone().add(fwd.multiplyScalar(c.center));
        const d=player.pos.distanceTo(center);
        if(d<=c.radius){ hit=true; }
      }
      if(hit){
        boss.attackHitSet.add('player');
        if(!player.isInvulnerableNow()){
          player.takeDamage(c.dmg, boss.pos);
          markCombat();
        }
      }
    }
  }

  // healing interruption by damage already; but also if damage occurred this frame, cancel heal
  // (takeDamage sets state hurt) ok.

  // boss active enter arena detection
  if(!bossDefeated){
    const arenaCenter=new THREE.Vector3(0,0,230);
    if(!bossActive && player.pos.distanceTo(arenaCenter)<18 && st.progress.brazier){
      // entering arena sets brazier checkpoint
      st.progress.activeCheckpoint='brazier';
      bossActive=true;
      // close entrance? just set
      saveNow();
    }
  }

  // interaction
  if(inp.interactPressed){
    inp.interactPressed=false;
    // find near
    {
      let near=null;
      for(const it of interactables){ if(player.pos.distanceTo(it.pos)<=3){ near=it; break;} }
      if(near){
        if(near.type==='cache'){
          const cache=caches.find(c=>c.id===near.cacheId);
          if(cache && !cache.claimed){
            cache.claimed=true; st.progress.claimedCaches.push(cache.id); st.progress.salvage+=2; saveNow(); showSaveIndicator(); showMsg('Salvage x2');
          }
        } else if(near.type==='keepsake'){
          if(!st.progress.keepsake){ st.progress.keepsake=true; saveNow(); showSaveIndicator(); showMsg('Keepsake found'); }
        } else if(near.type==='brazier'){
          st.progress.brazier=true;
          openRestMenu('brazier');
        } else if(near.type==='hearth'){
          openRestMenu('hearth');
        } else if(near.type==='shortcut'){
          if(!st.progress.shortcut){ st.progress.shortcut=true; removeShortcutWall(); saveNow(); showSaveIndicator(); showMsg('Shortcut opened'); }
        } else if(near.type==='workshop'){ attemptWorkshop(); }
        else if(near.type==='beacon'){ attemptBeacon(); showMsg('Objective: defeat Gate Warden, recover Beacon Lens, restore beacon.'); }
        else if(near.type==='mara'){ talkMara(); }
      }
    }
  }

  // death handling
  if(player.state==='dead'){
    // respawn at active checkpoint
    const cp = checkpointPositions[st.progress.activeCheckpoint]||checkpointPositions.camp;
    player.resetToCheckpoint(cp);
    player.applySavePlayer();
    // reset enemies & boss
    for(const e of enemies){ if(!e.dead) e.reset(); }
    if(!bossDefeated){ boss.reset(); bossActive=false; }
    // clear attack volumes
    player.attackActive=false; player.attackPhase='none';
    showMsg('You died. Respawned at checkpoint.');
  }

  // update HUD
  updateHUD();

  // chapter boundary
  if(st.progress.chapterComplete && !chapterBoundaryShown && (player.pos.z>250 || player.pos.z<-30 || player.pos.x>58 || player.pos.x<-58)){ chapterBoundaryShown=true; showMsg('Chapter complete. The road ahead is not yet built.'); }
  if(st.progress.keepsake && !window.__keepsakeMesh){
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,0.3), new THREE.MeshStandardMaterial({color:0xffd700}));
    m.position.set(0.5,1.0,0); scene.add(m); window.__keepsakeMesh=m;
  }
  // camera
  updateCamera();

  renderer.render(scene,camera);
}

function onBossDefeated(){
  const st=getState();
  if(st.progress.bossDefeated) return; // once
  st.progress.bossDefeated=true;
  st.progress.lens=true;
  st.progress.salvage += 4;
  bossDefeated=true;
  boss.group.visible=false;
  boss.dead=true;
  boss.attackActive=false;
  boss.currentAttack=null;
  bossActive=false;
  saveNow(); showSaveIndicator();
  showMsg('Gate Warden defeated. Beacon Lens recovered.');
}

// ---------- HUD ----------
function updateHUD(){
  const st=getState();
  document.getElementById('hpfill').style.width = (player.health)+'%';
  document.getElementById('stfill').style.width = (player.stamina)+'%';
  document.getElementById('charges').textContent = player.heals;
  // objective
  let obj='';
  if(st.progress.beacon) obj='Chapter complete';
  else if(st.progress.bossDefeated||st.progress.lens) obj='Restore bridge beacon';
  else obj='Defeat Gate Warden, recover Beacon Lens';
  document.getElementById('objective').textContent=obj;
  document.getElementById('objective').classList.remove('hidden');
  document.getElementById('hud').classList.remove('hidden');
  // enemy hp near engaged
  const engaged = enemies.filter(e=>!e.dead && player.pos.distanceTo(e.pos)<20);
  if(engaged.length>0){
    const e=engaged[0];
    document.getElementById('enemyhp').classList.remove('hidden');
    document.getElementById('enemyhpfill').style.width = (e.health/e.maxHealth*100)+'%';
  } else {
    document.getElementById('enemyhp').classList.add('hidden');
  }
  // boss bar
  if(bossActive && !boss.dead){
    document.getElementById('bosshp').style.display='block';
    document.getElementById('bosshpfill').style.width = (boss.health/boss.maxHealth*100)+'%';
  } else {
    document.getElementById('bosshp').style.display='none';
  }
  // interact prompt
  {
    let near=null;
    for(const it of interactables){ if(player.pos.distanceTo(it.pos)<=3){ near=it; break;} }
    const el=document.getElementById('interact');
    if(near && !el.textContent.includes('Salvage') && !el.textContent.includes('found') && !el.textContent.includes('Press E')){
      if(!msgTimeout) el.textContent='Press E to interact';
    }
  }
}

function updateJournal(){
  const st=getState();
  const txt = `Objective: ${st.progress.beacon?'Chapter complete':st.progress.bossDefeated?'Restore beacon':'Defeat Warden'}\nRest points: camp${st.progress.brazier?', field brazier':''}\nShortcut: ${st.progress.shortcut?'open':'closed'}\nKeepsake: ${st.progress.keepsake?'found':'not found'}\nCaches: ${st.progress.claimedCaches.join(',')||'none'}\nSalvage: ${st.progress.salvage}`;
  document.getElementById('journalText').innerText=txt;
}



requestAnimationFrame(loop);
