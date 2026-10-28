export const SAVE_KEY = 'waykeepers_save_v1';
export const defaultState = () => ({
  version:1,
  player:{ health:100, stamina:100, heals:2, spearUpgraded:false },
  progress:{
    salvage:0,
    claimedCaches:[],
    keepsake:false,
    shortcut:false,
    brazier:false,
    bossDefeated:false,
    lens:false, lensConsumed:false,
    workshop:false, beacon:false,
    chapterComplete:false,
    checkpoints:['camp'],
    activeCheckpoint:'camp',
    dialogueStage:0
  },
  settings:{ sensitivity:0.004, invertY:false, textScale:1, music:0.5, sfx:0.7, quality:'high', shake:false, blur:false },
  // world runtime not saved
});

let state = null;
export function getState(){ if(!state) state = defaultState(); return state; }
export function setState(s){ state = s; }
export function resetState(){ state = defaultState(); }

export function validateSave(raw){
  try{
    if(!raw || typeof raw!=='object') return null;
    if(raw.version !== 1) return null;
    const d = defaultState();
    const out = JSON.parse(JSON.stringify(d));
    // merge carefully
    if(raw.player && typeof raw.player==='object'){
      for(const k of ['health','stamina','heals','spearUpgraded']) if(raw.player[k]!==undefined) out.player[k]=raw.player[k];
    }
    if(raw.progress && typeof raw.progress==='object'){
      for(const k of Object.keys(out.progress)) if(raw.progress[k]!==undefined) out.progress[k]=raw.progress[k];
    }
    if(raw.settings && typeof raw.settings==='object'){
      for(const k of Object.keys(out.settings)) if(raw.settings[k]!==undefined) out.settings[k]=raw.settings[k];
    }
    // clamp
    out.player.health = Math.max(0,Math.min(100,out.player.health));
    out.player.stamina = Math.max(0,Math.min(100,out.player.stamina));
    out.player.heals = Math.max(0,Math.min(2,out.player.heals));
    out.progress.salvage = Math.max(0,out.progress.salvage);
    if(!Array.isArray(out.progress.claimedCaches)) out.progress.claimedCaches=[];
    return out;
  }catch(e){ return null; }
}

export function loadSave(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    const v = validateSave(parsed);
    if(v) lastValidRaw = raw;
    return v;
  }catch(e){ return null; }
}

let lastValidRaw = null;
export function saveNow(){
  try{
    const s = getState();
    const raw = JSON.stringify(s);
    // validate before writing
    const v = validateSave(JSON.parse(raw));
    if(!v) return false;
    localStorage.setItem(SAVE_KEY, raw);
    lastValidRaw = raw;
    return true;
  }catch(e){
    // retain last valid snapshot
    if(lastValidRaw){ try{ localStorage.setItem(SAVE_KEY, lastValidRaw); }catch(_){} }
    return false;
  }
}

export function hasSave(){ return !!loadSave(); }
