import * as THREE from 'three';
import { CFG } from './config.js';
import { getState } from './state.js';
import { groundHeight, collidesWall, walls } from './world.js';

export class Player {
  constructor(scene){
    this.scene=scene;
    this.group=new THREE.Group();
    // simple body
    const body=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.4,1.2,8), new THREE.MeshStandardMaterial({color:0x4466aa}));
    body.position.y=0.6; body.castShadow=true;
    this.group.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.25,8,8), new THREE.MeshStandardMaterial({color:0xffccaa}));
    head.position.y=1.35; head.castShadow=true;
    this.group.add(head);
    // spear
    this.spear=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.6,6), new THREE.MeshStandardMaterial({color:0xaaaaaa}));
    this.spear.rotation.z=Math.PI/2; this.spear.position.set(0.5,0.9,0); this.spear.castShadow=true;
    this.group.add(this.spear);
    scene.add(this.group);
    this.pos=new THREE.Vector3(0,0,0);
    this.vel=new THREE.Vector3();
    this.yaw=0;
    this.health=CFG.player.health;
    this.stamina=CFG.player.stamina;
    this.heals=CFG.player.healCharges;
    this.state='idle';
    this.stateTimer=0;
    this.attackId=0;
    this.currentAttack=null; // {type, phase, timer, hitTargets:Set, volume}
    this.queued=null; // queued action name
    this.bufferTimer=0;
    this.invuln=0;
    this.hitReact=0;
    this.dodgeDir=new THREE.Vector3();
    this.dodgeDist=0;
    this.dodgeTraveled=0;
    this.lockTarget=null;
    this.lastSafe=new THREE.Vector3(0,0,0);
    this._noSpend=0;
    this.grounded=true;
    this.vy=0;
    // attack volume tracking handled in combat
    this.attackActive=false;
    this.attackHitSet=new Set();
    this.attackType=null;
    this.attackTimer=0; // within attack
    this.attackPhase='none'; // windup/active/recovery
    this.attackFacingLocked=false;
    this.attackStartFacing=0;
  }
  resetToCheckpoint(pos){
    this.pos.copy(pos);
    this.vel.set(0,0,0);
    this.health=CFG.player.health;
    this.stamina=CFG.player.stamina;
    this.heals=CFG.player.healCharges;
    // apply upgrade
    const st=getState();
    if(st.player.spearUpgraded){ /* damage handled in config? we use getter */ }
    this.health=Math.min(this.health,100);
    this.state='idle';
    this.currentAttack=null;
    this.attackPhase='none';
    this.invuln=0;
    this.lastSafe.copy(pos);
  }
  applySavePlayer(){
    const st=getState();
    this.health=st.player.health;
    this.stamina=st.player.stamina;
    this.heals=st.player.heals;
  }
  spearDmg(type){
    const st=getState();
    const up=st.player.spearUpgraded;
    if(type==='light') return up?30:CFG.combat.light.dmg;
    return up?54:CFG.combat.heavy.dmg;
  }
  update(dt, input, enemies, boss){
    // timers
    if(this.invuln>0) this.invuln-=dt;
    if(this.hitReact>0) this.hitReact-=dt;
    // stamina regen delay
    this._stamDelay = (this._stamDelay||0);
    // We'll manage regen in main? do here
    // decrement buffer
    if(this.bufferTimer>0){ this.bufferTimer-=dt; if(this.bufferTimer<=0){ this.queued=null; } }
    // state machine
    this.updateState(dt,input,enemies,boss);
    // physics/movement for non-committed? handled in states
    // clamp world
    this.enforceBounds();
    // update transform
    this.group.position.copy(this.pos);
    this.group.rotation.y=this.yaw;
    // camera etc external
    // save safe pos if grounded
    const gh=groundHeight(this.pos.x,this.pos.z);
    if(gh!==null && Math.abs(this.pos.y-gh)<0.15){ this.lastSafe.copy(this.pos); }
  }
  updateState(dt,input,enemies,boss){
    const C=CFG.combat;
    // stamina regen logic (pause during attacks,dodge,sprint,heal)
    const busy = this.state.startsWith('attack')||this.state==='dodge'||this.state==='heal'||input.sprint;
    if(!busy){
      this._stamDelay += dt;
    } else {
      // delay timer continues
      this._stamDelay += dt;
    }
    // Actually delay timer continues always; regen after 0.75 without expenditure.
    // Track last expend time
    // Simplify: regen if no expend in last 0.75s
    // We'll use a timer _noSpend
    this._noSpend += dt;
    if(!busy && this._noSpend>=CFG.combat.regenDelay){
      this.stamina = Math.min(100, this.stamina + CFG.combat.regen*dt);
    }
    // movement input
    const move = input.move.clone(); // x,z camera-relative already
    // camera relative converted outside? We'll pass world-space move vector
    // For now assume input.move is world-space
    const moving = move.length()>0.1;
    if(move.length()>1) move.normalize();

    // handle queued buffer expiry already

    switch(this.state){
      case 'idle':
      case 'move':
      case 'sprint': {
        // movement
        let speed = CFG.player.speed;
        if(input.sprint && moving && this.stamina>0){ speed=CFG.player.sprint; this.state='sprint'; }
        else if(moving){ this.state='move'; }
        else { this.state='idle'; }
        // sprint cost
        if(this.state==='sprint'){
          this.stamina = Math.max(0, this.stamina - CFG.player.sprintCost*dt);
          this._noSpend=0;
          if(this.stamina<=0){ this.state='move'; speed=CFG.player.speed; }
        }
        // apply movement
        const targetVel = move.clone().multiplyScalar(speed);
        this.vel.x = targetVel.x; this.vel.z = targetVel.z;
        // facing
        if(moving && !this.lockTarget){
          this.yaw = Math.atan2(move.x, move.z);
        }
        if(this.lockTarget){
          // strafe: face target
          const toT = new THREE.Vector3().subVectors(this.lockTarget.pos||this.lockTarget.group.position, this.pos);
          this.yaw = Math.atan2(toT.x, toT.z);
        }
        // dodge input
        if(input.dodgePressed && this.stamina>=CFG.player.dodgeCost){
          this.startDodge(move, input);
        } else if(input.lightPressed){
          this.tryAttack('light', input);
        } else if(input.heavyPressed){
          this.tryAttack('heavy', input);
        } else if(input.healPressed){
          this.tryHeal();
        }
        // physics
        this.integrateMovement(dt, move, speed);
        break;
      }
      case 'attack_light':
      case 'attack_heavy': {
        const type = this.state==='attack_light'?'light':'heavy';
        const c = C[type];
        this.attackTimer += dt;
        // facing adjust window
        const faceWindow = type==='light'?C.light.face:C.heavy.face;
        if(this.attackTimer < faceWindow){
          // allow facing adjust toward lock target or move
          if(this.lockTarget){
            const toT = new THREE.Vector3().subVectors(this.lockTarget.pos||this.lockTarget.group.position, this.pos);
            this.yaw = Math.atan2(toT.x, toT.z);
          }
        }
        // phase
        if(this.attackTimer < c.wind){ this.attackPhase='windup'; this.attackActive=false; }
        else if(this.attackTimer < c.wind+c.active){ this.attackPhase='active'; this.attackActive=true; }
        else { this.attackPhase='recovery'; this.attackActive=false; }
        // movement minimal (heavy forward step handled? skip)
        // velocity zero during attack? allow small
        this.vel.set(0,0,0);
        this.integrateGravity(dt);
        // completion
        const total = c.wind+c.active+c.rec;
        if(this.attackTimer >= total){
          this.state='idle';
          this.attackPhase='none';
          this.attackActive=false;
          // process queued
          this.consumeQueue();
        }
        // handle hit reaction interruption? done externally
        // inputs buffer
        if(input.lightPressed||input.heavyPressed||input.dodgePressed||input.healPressed){
          this.queueInput(input);
        }
        break;
      }
      case 'dodge': {
        this.attackPhase='none';
        const c=C.dodge;
        this.stateTimer+=dt;
        // travel
        const step = (c.dist/c.dur)*dt;
        // move along dodgeDir, check walls
        const nx = this.pos.x + this.dodgeDir.x*step;
        const nz = this.pos.z + this.dodgeDir.z*step;
        // wall check
        const testBox = new THREE.Box3(new THREE.Vector3(nx-0.35,this.pos.y,nz-0.35), new THREE.Vector3(nx+0.35,this.pos.y+1.2,nz+0.35));
        if(!collidesWall(testBox)){ this.pos.x=nx; this.pos.z=nz; }
        this.integrateGravity(dt);
        if(this.stateTimer>=c.dur){
          this.state='idle';
          this.stateTimer=0;
        }
        break;
      }
      case 'heal': {
        this.stateTimer+=dt;
        // slow movement allowed
        const move2 = move.clone().multiplyScalar(1.5);
        this.vel.x=move2.x; this.vel.z=move2.z;
        this.integrateMovement(dt, move, 1.5);
        if(input.lightPressed||input.heavyPressed||input.dodgePressed){ // damage? handled externally
        }
        if(this.stateTimer>=CFG.player.healTime){
          // complete
          this.health=Math.min(100,this.health+CFG.player.healAmt);
          this.heals=Math.max(0,this.heals-1);
          this.state='idle';
          this.stateTimer=0;
        }
        // if damage taken, interrupted externally
        break;
      }
      case 'hurt': {
        this.stateTimer+=dt;
        this.vel.x*=0.9; this.vel.z*=0.9;
        this.integrateGravity(dt);
        if(this.stateTimer>=CFG.combat.hitReact){
          this.state='idle';
          this.stateTimer=0;
        }
        break;
      }
      case 'dead': {
        break;
      }
    }
    // update attack timer tracking for active id etc
    if(this.state.startsWith('attack')){
      if(!this.currentAttack){ this.currentAttack={id:++this.attackId}; }
    } else {
      this.currentAttack=null;
    }
  }
  startDodge(move,input){
    this.stamina=Math.max(0,this.stamina-CFG.player.dodgeCost);
    this._noSpend=0;
    this.state='dodge';
    this.stateTimer=0;
    if(move.length()>0.1){
      this.dodgeDir.copy(move).normalize();
    } else {
      // backward
      const fwd=new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
      this.dodgeDir.copy(fwd).negate();
    }
    // facing? dodge doesn't change yaw necessarily
  }
  tryAttack(type,input){
    const c = CFG.combat[type];
    if(this.stamina < c.stam){
      // cannot; maybe queue? no
      return false;
    }
    // check lock target facing? no
    this.stamina=Math.max(0,this.stamina-c.stam);
    this._noSpend=0;
    this.state = type==='light'?'attack_light':'attack_heavy';
    this.attackTimer=0;
    this.attackPhase='windup';
    this.attackActive=false;
    this.attackHitSet=new Set();
    this.attackType=type;
    this.currentAttack={id:++this.attackId, type};
    // facing initial
    if(this.lockTarget){
      const toT = new THREE.Vector3().subVectors(this.lockTarget.pos||this.lockTarget.group.position, this.pos);
      this.yaw = Math.atan2(toT.x, toT.z);
    }
    return true;
  }
  tryHeal(){
    const st=getState();
    if(this.heals<=0) return false;
    if(this.health>=100) return false;
    this.state='heal';
    this.stateTimer=0;
    return true;
  }
  queueInput(input){
    if(this.bufferTimer>0) return; // already queued
    let action=null;
    if(input.lightPressed) action='light';
    else if(input.heavyPressed) action='heavy';
    else if(input.dodgePressed) action='dodge';
    else if(input.healPressed) action='heal';
    if(action){ this.queued=action; this.bufferTimer=CFG.combat.buffer; }
  }
  consumeQueue(){
    if(this.queued && this.bufferTimer>0){
      const q=this.queued; this.queued=null; this.bufferTimer=0;
      if(q==='light') this.tryAttack('light',{});
      else if(q==='heavy') this.tryAttack('heavy',{});
      else if(q==='dodge'){ if(this.stamina>=CFG.player.dodgeCost) this.startDodge(new THREE.Vector3(),{}); }
      else if(q==='heal') this.tryHeal();
    }
  }
  interruptAttack(){
    // clear volume
    this.attackActive=false;
    this.attackPhase='none';
    this.currentAttack=null;
  }
  takeDamage(amount, fromDir){
    if(this.state==='dead') return false;
    if(this.invuln>0) return false;
    // damage interrupts attack/heal
    if(this.state.startsWith('attack')){ this.interruptAttack(); this.state='hurt'; this.stateTimer=0; }
    else if(this.state==='heal'){ this.state='hurt'; this.stateTimer=0; }
    else if(this.state!=='dodge' || true){ 
      // hurt
      if(this.state!=='dodge'){ this.state='hurt'; this.stateTimer=0; }
    }
    // dodge i-frames handled by caller? check invuln window separately
    this.health=Math.max(0,this.health-amount);
    this.invuln=CFG.combat.invuln;
    this.hitReact=CFG.combat.hitReact;
    if(this.health<=0){ this.state='dead'; }
    return true;
  }
  isInvulnerableNow(){
    // dodge i-frames
    if(this.state==='dodge'){
      const t=this.stateTimer;
      if(t>=CFG.combat.dodge.iStart && t<=CFG.combat.dodge.iEnd) return true;
    }
    if(this.invuln>0) return true;
    return false;
  }
  integrateMovement(dt, move, speed){
    // gravity
    this.vy -= 9.8*dt*2? 0 : 0; // no gravity needed? use ground
    // move x/z with wall collision
    const stepX=this.vel.x*dt;
    const stepZ=this.vel.z*dt;
    // X
    {
      const nx=this.pos.x+stepX;
      const nb=new THREE.Box3(new THREE.Vector3(nx-0.35, this.pos.y, this.pos.z-0.35), new THREE.Vector3(nx+0.35, this.pos.y+1.2, this.pos.z+0.35));
      if(!collidesWall(nb)) this.pos.x=nx; else this.vel.x=0;
    }
    {
      const nz=this.pos.z+stepZ;
      const nb=new THREE.Box3(new THREE.Vector3(this.pos.x-0.35, this.pos.y, nz-0.35), new THREE.Vector3(this.pos.x+0.35, this.pos.y+1.2, nz+0.35));
      if(!collidesWall(nb)) this.pos.z=nz; else this.vel.z=0;
    }
    // ground
    const gh=groundHeight(this.pos.x,this.pos.z);
    if(gh!==null){
      if(this.pos.y <= gh+0.05){ this.pos.y=gh; this.grounded=true; this.vy=0; }
      else { this.grounded=false; this.vy-=9.8*dt; this.pos.y+=this.vy*dt; }
    } else {
      // no ground: keep y
    }
    // prevent leaving world bounds
  }
  integrateGravity(dt){
    const gh=groundHeight(this.pos.x,this.pos.z);
    if(gh!==null){
      if(this.pos.y>gh+0.01){ this.vy-=9.8*dt; this.pos.y+=this.vy*dt; if(this.pos.y<=gh){this.pos.y=gh;this.vy=0;this.grounded=true;} }
      else { this.pos.y=gh; this.vy=0; this.grounded=true; }
    }
  }
  enforceBounds(){
    if(this.pos.x<-60){this.pos.x=-60; this.vel.x=0;}
    if(this.pos.x>60){this.pos.x=60;}
    if(this.pos.z<-30){this.pos.z=-30;}
    if(this.pos.z>260){this.pos.z=260;}
    // recover invalid geometry
    const gh=groundHeight(this.pos.x,this.pos.z);
    if(gh===null){
      this.pos.copy(this.lastSafe);
    }
  }
}
