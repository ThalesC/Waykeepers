import * as THREE from 'three';
import { CFG } from './config.js';

export class Enemy {
  constructor(scene, type, pos){
    this.scene=scene; this.type=type; this.dead=false;
    this.group=new THREE.Group();
    const color = type==='briarling'?0x55aa55:0x778866;
    const size = type==='briarling'?0.5:0.8;
    const body=new THREE.Mesh(new THREE.BoxGeometry(size*1.2,size*1.6,size*1.2), new THREE.MeshStandardMaterial({color}));
    body.position.y=size*0.8; body.castShadow=true;
    this.group.add(body);
    scene.add(this.group);
    this.pos=pos.clone();
    this.group.position.copy(this.pos);
    this.yaw=0;
    this.health = type==='briarling'?CFG.enemies.briarling.hp:CFG.enemies.mossguard.hp;
    this.maxHealth=this.health;
    this.state='idle'; // idle, approach, windup, active, recovery, stagger, dead
    this.stateTimer=0;
    this.attackId=0;
    this.currentAttack=null;
    this.attackType=null;
    this.attackTimer=0;
    this.attackActive=false;
    this.attackHitSet=new Set();
    this.staggerResist=0; // timer
    this.startPos=pos.clone();
    this.boundary=null; // {min,max} set later
    this.engaged=false;
    this.targetFacing=0;
    this.lastAttackTime=0;
  }
  get cfg(){
    return this.type==='briarling'?CFG.enemies.briarling:CFG.enemies.mossguard;
  }
  get atkCfg(){
    const c=this.cfg;
    return this.type==='briarling'?c.lunge:c.swing;
  }
  reset(){
    this.pos.copy(this.startPos);
    this.group.position.copy(this.pos);
    this.health=this.maxHealth;
    this.dead=false;
    this.state='idle';
    this.stateTimer=0;
    this.attackActive=false;
    this.currentAttack=null;
    this.staggerResist=0;
    this.group.visible=true;
  }
  update(dt, player, canAttack){
    if(this.dead) return;
    if(this.staggerResist>0) this.staggerResist-=dt;
    const ppos=player.pos;
    const dist=this.pos.distanceTo(ppos);
    // boundary check
    if(this.boundary && (this.pos.x<this.boundary.minX || this.pos.x>this.boundary.maxX || this.pos.z<this.boundary.minZ || this.pos.z>this.boundary.maxZ)){
      this.reset(); return;
    }
    // face player generally
    const toP=new THREE.Vector3().subVectors(ppos,this.pos);
    const targetYaw=Math.atan2(toP.x,toP.z);
    // state machine
    switch(this.state){
      case 'idle':
      case 'approach': {
        // approach until within attack range
        const range = this.atkCfg.reach*0.9;
        if(dist > range){
          this.state='approach';
          const dir=toP.clone(); dir.y=0; dir.normalize();
          const speed = this.type==='briarling'?3.2:2.4;
          this.pos.x += dir.x*speed*dt;
          this.pos.z += dir.z*speed*dt;
        } else {
          // maybe attack if canAttack
          if(canAttack && this.state!=='windup'){
            this.startAttack();
          } else {
            // reposition: small strafe
            this.state='idle';
          }
        }
        // facing: track player except final 0.25 handled in windup
        if(this.state!=='windup') this.yaw=targetYaw;
        break;
      }
      case 'windup': {
        this.stateTimer+=dt;
        const c=this.atkCfg;
        // track player until final 0.25
        if(this.stateTimer < c.tell-0.25){
          this.yaw=targetYaw;
        }
        if(this.stateTimer>=c.tell){
          this.state='active';
          this.stateTimer=0;
          this.attackActive=true;
          this.attackId++;
          this.currentAttack={id:this.attackId, type:this.attackType};
          this.attackHitSet=new Set();
        }
        break;
      }
      case 'active': {
        this.stateTimer+=dt;
        const c=this.atkCfg;
        if(this.stateTimer>=c.active){
          this.state='recovery';
          this.stateTimer=0;
          this.attackActive=false;
          this.currentAttack=null;
        }
        break;
      }
      case 'recovery': {
        this.stateTimer+=dt;
        const c=this.atkCfg;
        if(this.stateTimer>=c.rec){
          this.state='idle';
          this.stateTimer=0;
        }
        break;
      }
      case 'stagger': {
        this.stateTimer+=dt;
        if(this.stateTimer>=CFG.combat.heavyStagger){
          this.state='idle';
          this.stateTimer=0;
        }
        break;
      }
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y=this.yaw;
  }
  startAttack(){
    this.state='windup';
    this.stateTimer=0;
    this.attackActive=false;
    this.attackHitSet=new Set();
    this.attackType='atk';
  }
  takeDamage(amount, heavy, attacker){
    if(this.dead) return;
    this.health-=amount;
    if(this.health<=0){
      this.dead=true;
      this.state='dead';
      this.group.visible=false;
      return;
    }
    if(heavy){
      // interrupt windup
      if(this.state==='windup'){
        this.state='stagger';
        this.stateTimer=0;
        this.staggerResist=CFG.combat.staggerResist;
        this.attackActive=false;
        this.currentAttack=null;
        // restart tell later (state idle after stagger)
      }
      // active attacks cannot be cancelled
    }
    // light hits do not interrupt
  }
  // attack volume check done externally using atkCfg
}
