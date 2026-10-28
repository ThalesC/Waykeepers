import * as THREE from 'three';
import { addGround, addBox, addWall, addRamp, grounds, walls, interactables, caches } from './world.js';

export function buildLevel(scene){
  // Camp: Alder Hollow
  addGround(-20,20,-20,20, ()=>0);
  // hearth
  addBox(0,0,0,1.2,0.6,1.2,0xffaa44);
  // Mara NPC marker
  addBox(-4,0,-2,0.8,1.6,0.8,0xff88cc);
  // workshop collapsed
  addBox(6,0,-4,3,1.5,2,0x886644);
  // broken beacon
  addBox(-6,0,6,1.0,2.5,1.0,0xaaaaaa);
  // bridge
  addBox(0,0,12,6,0.2,8,0x777777);
  // outer walls camp
  addWall(-20,0,-20,1,2,40,0x333333);
  addWall(20,0,-20,1,2,40,0x333333);
  addWall(-20,0,-20,40,2,1,0x333333);
  addWall(-20,0,20,40,2,1,0x333333);

  // road to lower mossroad (ramp up? flat)
  addGround(-4,4,20,45, ()=>0);
  // lower mossroad area
  addGround(-12,12,45,80, ()=>0);
  // Briarling encounter area marker (empty)
  // cache A
  caches.push({id:'A',pos:new THREE.Vector3(8,0,60),claimed:false});

  // cart yard
  addGround(-4,4,80,95, ()=>0);
  addGround(-18,18,95,130, ()=>0);
  caches.push({id:'B',pos:new THREE.Vector3(-10,0,110),claimed:false});
  // shortcut gate (far side) - wall with gate opening
  addWall(-18,0,125,1,2,8,0x555555);
  addWall(18,0,125,1,2,8,0x555555);
  addWall(-10,0,125,8,2,1,0x555555);
  addWall(10,0,125,8,2,1,0x555555);
  // gate passage open after shortcut
  // upper wayhouse
  addGround(-4,4,130,145, ()=>0);
  addGround(-20,20,145,180, ()=>0);
  caches.push({id:'C',pos:new THREE.Vector3(12,0,160),claimed:false});
  caches.push({id:'D',pos:new THREE.Vector3(-12,0,170),claimed:false});
  // mixed encounter area

  // field brazier
  addGround(-4,4,180,195, ()=>0);
  addGround(-12,12,195,215, ()=>0);
  // brazier pillar
  addBox(0,0,205,1,1.5,1,0xff6600);
  interactables.push({pos:new THREE.Vector3(0,0,205), radius:2, id:'brazier', type:'brazier'});

  // warden courtyard (circular-ish via box)
  addGround(-16,16,215,247, ()=>0);
  // courtyard walls
  addWall(-16,0,215,1,2,32,0x666666);
  addWall(16,0,215,1,2,32,0x666666);
  addWall(-16,0,247,32,2,1,0x666666);
  addWall(-16,0,215,32,2,1,0x666666);
  // boss spawn point
  // interactables for caches
  for(const c of caches){
    interactables.push({pos:c.pos.clone(), radius:2, id:'cache_'+c.id, type:'cache', cacheId:c.id});
  }
  // keepsake detour near shortcut (abandoned shelter)
  addGround(25,45,105,125, ()=>0);
  addBox(35,0,115,2,1.5,2,0x887766);
  const ks = new THREE.Vector3(35,0,115);
  interactables.push({pos:ks, radius:2, id:'keepsake', type:'keepsake'});
  // camp interactables
  interactables.push({pos:new THREE.Vector3(0,0,0), radius:2, id:'hearth', type:'hearth'});
  interactables.push({pos:new THREE.Vector3(-4,0,-2), radius:2, id:'mara', type:'mara'});
  interactables.push({pos:new THREE.Vector3(6,0,-4), radius:2, id:'workshop', type:'workshop'});
  interactables.push({pos:new THREE.Vector3(-6,0,6), radius:2, id:'beacon', type:'beacon'});
  interactables.push({pos:new THREE.Vector3(0,0,12), radius:2, id:'bridge', type:'bridge'});
  // shortcut gate interact (far side) to open
  interactables.push({pos:new THREE.Vector3(0,0,125), radius:3, id:'shortcut', type:'shortcut'});

  // lights
  const amb = new THREE.AmbientLight(0x8899bb,0.6);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff,0.8);
  dir.position.set(20,40,10);
  dir.castShadow=true;
  scene.add(dir);
  // camp warm light
  const pl = new THREE.PointLight(0xffaa44,1.5,20);
  pl.position.set(0,2,0);
  scene.add(pl);
}
