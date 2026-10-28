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
    this.currentAttack=null; // {key, id}
    this.attackActive=false;
    this.attackHitSet=new Set();
    this.phase=1;
    this.transitionDone=false;
    this.transitionPending=false;
    this.lastKey=null;
    this.cycleIndex=0;
    this.pendingSecond=false; // waiting to do second sweep
    this.secondDelay=0;
    this.doingSecond=false;
    this._idCounter=0;
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
    this.transitionPending=false;
    this.currentAttack=null;
    this.attackActive=false;
    this.attackHitSet=new Set();
    this.lastKey=null;
    this.cycleIndex=0;
    this.pendingSecond=false;
    this.secondDelay=0;
    this.doingSecond=false;
    this.group.visible=true;
  }
  nextId(){ this._idCounter++; return this._idCounter; }
  update(dt, player){
    if(this.dead) return;
    const ppos=player.pos;
    const dist=this.pos.distanceTo(ppos);
    const toP=new THREE.Vector3().subVectors(ppos,this.pos);
    const targetYaw=Math.atan2(toP.x,toP.z);

    // transition trigger
    if(!this.transitionDone && this.health <= CFG.boss.hp*0.5){
      this.transitionPending=true;
    }

    switch(this.state){
      case 'idle':
      case 'approach': {
        if(this.transitionPending && (this.state==='idle')){
          // finish current action -> transition now
          this.state='transition'; this.stateTimer=0; this.transitionPending=false; this.transitionDone=true; this.phase=2;
          break;
        }
        if(dist > CFG.boss.stopDist){
          this.state='approach';
          const dir=toP.clone(); dir.y=0;
          if(dir.length()>0.01){ dir.normalize(); this.pos.x += dir.x*CFG.boss.speed*dt; this.pos.z += dir.z*CFG.boss.speed*dt; }
          this.yaw=targetYaw;
        } else {
          if(this.state!=='idle'){ this.state='idle'; this.stateTimer=0; }
          this.stateTimer += dt;
          if(this.stateTimer > 0.3){
            this.startNextAttack();
          }
        }
        break;
      }
      case 'transition': {
        this.stateTimer+=dt;
        if(this.stateTimer>=1.0){
          this.state='idle'; this.stateTimer=0;
        }
        break;
      }
      case 'windup': {
        this.stateTimer+=dt;
        const key=this.currentAttack.key;
        const c = key==='A'?CFG.boss.A:CFG.boss.B;
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
        const key=this.currentAttack.key;
        const c = key==='A'?CFG.boss.A:CFG.boss.B;
        if(this.stateTimer>=c.active){
          this.state='recovery';
          this.stateTimer=0;
          this.attackActive=false;
          // schedule second sweep if doing double
          if(this.doingSecond){
            // this was first of double; schedule second
            this.doingSecond=false;
            this.pendingSecond=true;
            this.secondDelay=0.85;
          }
        }
        break;
      }
      case 'recovery': {
        this.stateTimer+=dt;
        const key=this.currentAttack.key;
        let rec = (key==='A'?CFG.boss.A.rec:CFG.boss.B.rec);
        // if pending second, wait delay then start second
        if(this.pendingSecond){
          this.secondDelay -= dt;
          if(this.secondDelay<=0){
            this.pendingSecond=false;
            // start second sweep
            this.currentAttack={key:'A', id:this.nextId()};
            this.state='windup';
            this.stateTimer=0;
            this.attackActive=false;
            this.attackHitSet=new Set();
            this.doingSecond=false;
            // mark that recovery after this second is 2.0 (handled by rec override? we'll set a flag)
            this._secondRecovery=true;
            return;
          }
          // no recovery countdown until second? just wait
          return;
        }
        if(this._secondRecovery){ rec=2.0; }
        if(this.stateTimer>=rec){
          this.state='idle';
          this.stateTimer=0;
          this.currentAttack=null;
          this._secondRecovery=false;
        }
        break;
      }
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y=this.yaw;
  }
  startNextAttack(){
    let key;
    let isDouble=false;
    if(this.phase===1){
      key = (this.lastKey==='A')?'B':'A';
    } else {
      // cycle: 0 A, 1 B, 2 AA
      const mod = this.cycleIndex % 3;
      if(mod===0){ key='A'; }
      else if(mod===1){ key='B'; }
      else { key='A'; isDouble=true; }
      this.cycleIndex++;
    }
    this.lastKey=key;
    this.currentAttack={key, id:this.nextId()};
    this.state='windup';
    this.stateTimer=0;
    this.attackActive=false;
    this.attackHitSet=new Set();
    this.doingSecond=isDouble;
    this.pendingSecond=false;
  }
  currentAttackKey(){ return this.currentAttack?this.currentAttack.key:'A'; }
  takeDamage(amount){
    if(this.dead) return;
    this.health=Math.max(0,this.health-amount);
    if(this.health<=0){ this.dead=true; this.state='dead'; this.group.visible=false; this.attackActive=false; }
  }
}
