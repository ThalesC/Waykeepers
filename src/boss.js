import * as THREE from 'three';
import { CFG } from './config.js';

export class Boss {
  constructor(scene, pos){
    this.scene=scene; this.pos=pos.clone(); this.startPos=pos.clone();
    this.group=new THREE.Group();
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.6,2.2,1.2), new THREE.MeshStandardMaterial({color:0x888899}));
    body.position.y=1.1; body.castShadow=true; this.group.add(body);
    scene.add(this.group);
    this.group.position.copy(this.pos);
    this.yaw=0;
    this.health=CFG.boss.hp; this.maxHealth=this.health;
    this.dead=false;
    this.state='idle'; // idle, approach, windup, active, recovery, transition, dead
    this.stateTimer=0;
    this.attackSeq=[]; // list of attack keys for phase
    this.attackIndex=0;
    this.currentAttack=null; // {key, id}
    this.attackActive=false;
    this.attackHitSet=new Set();
    this.attackTimer=0;
    this.phase=1;
    this.transitionDone=false;
    this.pendingDouble=false;
    this.secondSweepTimer=0;
    this.waitingSecond=false;
  }
  reset(){
    this.pos.copy(this.startPos);
    this.group.position.copy(this.pos);
    this.health=this.maxHealth;
    this.dead=false;
    this.state='idle';
    this.stateTimer=0;
    this.phase=1;
    this.transitionDone=false;
    this.attackActive=false;
    this.currentAttack=null;
    this.group.visible=true;
  }
  update(dt, player){
    if(this.dead) return;
    const ppos=player.pos;
    const dist=this.pos.distanceTo(ppos);
    const toP=new THREE.Vector3().subVectors(ppos,this.pos);
    const targetYaw=Math.atan2(toP.x,toP.z);
    // phase check
    if(!this.transitionDone && this.health <= CFG.boss.hp*0.5){
      // finish current action then transition
      if(this.state==='recovery' || this.state==='idle'){
        this.state='transition';
        this.stateTimer=0;
        this.transitionDone=true;
      }
    }
    switch(this.state){
      case 'idle':
      case 'approach': {
        if(dist > CFG.boss.stopDist){
          this.state='approach';
          const dir=toP.clone(); dir.y=0; dir.normalize();
          this.pos.x += dir.x*CFG.boss.speed*dt;
          this.pos.z += dir.z*CFG.boss.speed*dt;
          this.yaw=targetYaw;
        } else {
          this.state='idle';
          // choose next attack
          if(this.stateTimer===0){
            this.stateTimer=0.01;
          }
        }
        // trigger attack after small delay when in range and idle
        if(this.state==='idle' && dist<=CFG.boss.stopDist){
          this.stateTimer += dt;
          if(this.stateTimer>0.3){
            this.startNextAttack();
          }
        }
        break;
      }
      case 'transition': {
        this.stateTimer+=dt;
        if(this.stateTimer>=1.0){
          this.phase=2;
          this.state='idle';
          this.stateTimer=0;
        }
        // harmless
        break;
      }
      case 'windup': {
        this.stateTimer+=dt;
        const atk=this.currentAttackKey();
        const c = atk==='A'?CFG.boss.A:CFG.boss.B;
        // stop facing adjust 0.30 before release
        if(this.stateTimer < c.tell-0.30){
          this.yaw=targetYaw;
        }
        if(this.stateTimer>=c.tell){
          this.state='active';
          this.stateTimer=0;
          this.attackActive=true;
          this.attackHitSet=new Set();
        }
        break;
      }
      case 'active': {
        this.stateTimer+=dt;
        const atk=this.currentAttackKey();
        const c = atk==='A'?CFG.boss.A:CFG.boss.B;
        if(this.stateTimer>=c.active){
          this.state='recovery';
          this.stateTimer=0;
          this.attackActive=false;
          // if double sweep phase2 first sweep, schedule second
          if(this.phase===2 && atk==='A' && !this.waitingSecond && this.pendingDouble){
            this.waitingSecond=true;
            this.secondSweepTimer=0.85; // after first active window ends? spec: second occurs 0.85s after first active window ends
          }
        }
        break;
      }
      case 'recovery': {
        this.stateTimer+=dt;
        const atk=this.currentAttackKey();
        const c = atk==='A'?CFG.boss.A:CFG.boss.B;
        // recovery after second strike is 2s handled by c.rec? For double, recovery 2.0
        let rec=c.rec;
        if(this.waitingSecond){
          // waiting for second sweep trigger
          this.secondSweepTimer-=dt;
          if(this.secondSweepTimer<=0){
            this.waitingSecond=false;
            // start second sweep
            this.currentAttack={key:'A', id:++this.attackSeqCounter};
            this.state='windup';
            this.stateTimer=0;
            this.attackActive=false;
            this.attackHitSet=new Set();
            this.pendingDouble=false;
            return;
          }
        }
        if(this.stateTimer>=rec){
          // if pending double sweep? handle via attack sequence
          this.state='idle';
          this.stateTimer=0;
          this.currentAttack=null;
          this.pendingDouble=false;
        }
        break;
      }
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y=this.yaw;
  }
  currentAttackKey(){
    return this.currentAttack?this.currentAttack.key:'A';
  }
  get attackSeqCounter(){ if(this._c===undefined) this._c=0; return this._c; }
  set attackSeqCounter(v){ this._c=v; }
  startNextAttack(){
    this.state='windup';
    this.stateTimer=0;
    this.attackActive=false;
    this.attackHitSet=new Set();
    // determine attack key
    let key;
    if(this.phase===1){
      // alternate A,B
      key = (this.lastKey==='A')?'B':'A';
    } else {
      // cycle A,B,AA (double sweep)
      // simple: track counter
      if(!this._cycle) this._cycle=0;
      const seq=['A','B','A']; // third triggers double? We'll handle double when A in phase2 maybe every third
      // We'll do: if cycle==2 -> double sweep (A then A)
      key = (this._cycle%3===1)?'B':'A';
      this.pendingDouble = (this._cycle%3===2);
      this._cycle++;
    }
    this.lastKey=key;
    this.currentAttack={key, id:++this._c};
  }
  takeDamage(amount){
    if(this.dead) return;
    this.health=Math.max(0,this.health-amount);
    if(this.health<=0){ this.dead=true; this.state='dead'; this.group.visible=false; }
  }
  isInvulnerable(){ return false; }
}
