import * as THREE from 'three';

export const grounds = []; // {minX,maxX,minZ,maxZ, h(x,z)}
export const walls = [];   // THREE.Box3 or {min,max}
export const interactables = []; // {pos, radius, id, type, data}
export const caches = []; // {id,pos,claimed}
export const enemies_spawn = [];

let scene;
export function initWorld(sceneRef){ scene = sceneRef; }

export function addGround(minX,maxX,minZ,maxZ, hfn){
  grounds.push({minX,maxX,minZ,maxZ,h:hfn});
  // visual
  const w = maxX-minX, d = maxZ-minZ;
  const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
  // sample height at center
  const y = hfn(cx,cz);
  const geo = new THREE.PlaneGeometry(w,d);
  const mat = new THREE.MeshStandardMaterial({color:0x3a4a3a, roughness:0.9});
  const m = new THREE.Mesh(geo,mat);
  m.rotation.x = -Math.PI/2;
  m.position.set(cx,y,cz);
  m.receiveShadow = true;
  scene.add(m);
}

export function addBox(x,y,z,w,h,d,color=0x666666){
  const geo=new THREE.BoxGeometry(w,h,d);
  const mat=new THREE.MeshStandardMaterial({color,roughness:0.8});
  const m=new THREE.Mesh(geo,mat);
  m.position.set(x,y+h/2,z);
  m.castShadow=true; m.receiveShadow=true;
  scene.add(m);
  // collision wall (solid)
  walls.push({min:new THREE.Vector3(x-w/2, y, z-d/2), max:new THREE.Vector3(x+w/2, y+h, z+d/2)});
  return m;
}

export function addWall(x,y,z,w,h,d,color=0x555555){
  return addBox(x,y,z,w,h,d,color);
}

export function addRamp(minX,maxX,minZ,maxZ, yStart,yEnd, axis='z'){
  // height linear along axis
  grounds.push({minX,maxX,minZ,maxZ, h:(x,z)=>{
    if(axis==='z'){
      const t=(z-minZ)/(maxZ-minZ);
      return yStart + (yEnd-yStart)*t;
    } else {
      const t=(x-minX)/(maxX-minX);
      return yStart + (yEnd-yStart)*t;
    }
  }});
  // visual as rotated plane? use box slabs approximated by many? Use a box with slope via BufferGeometry? Simpler: use plane rotated.
  const w=maxX-minX, d=maxZ-minZ;
  const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
  const yMid = (yStart+yEnd)/2;
  const geo=new THREE.PlaneGeometry(w,d);
  const mat=new THREE.MeshStandardMaterial({color:0x4a5a4a,roughness:0.9});
  const m=new THREE.Mesh(geo,mat);
  m.rotation.x = -Math.PI/2;
  // tilt
  if(axis==='z'){
    const slope = (yEnd-yStart)/d;
    m.rotation.x = -Math.PI/2 + Math.atan(slope);
  } else {
    const slope = (yEnd-yStart)/w;
    m.rotation.z = Math.atan(slope);
    m.rotation.x = -Math.PI/2;
  }
  m.position.set(cx,yMid,cz);
  m.receiveShadow=true;
  scene.add(m);
}

export function groundHeight(x,z){
  let best = -Infinity;
  for(const g of grounds){
    if(x>=g.minX && x<=g.maxX && z>=g.minZ && z<=g.maxZ){
      const y = g.h(x,z);
      if(y>best) best=y;
    }
  }
  return best === -Infinity ? null : best;
}

export function collidesWall(aabb){ // aabb {min,max} Vector3
  for(const w of walls){
    if(aabb.max.x>w.min.x && aabb.min.x<w.max.x &&
       aabb.max.y>w.min.y && aabb.min.y<w.max.y &&
       aabb.max.z>w.min.z && aabb.min.z<w.max.z) return true;
  }
  return false;
}

export function raycastBoxes(origin, dir, maxDist){
  let best = maxDist;
  for(const w of walls){
    // slab
    let tmin=0, tmax=maxDist;
    for(let i=0;i<3;i++){
      const o=[origin.x,origin.y,origin.z][i];
      const d=[dir.x,dir.y,dir.z][i];
      const mn=[w.min.x,w.min.y,w.min.z][i];
      const mx=[w.max.x,w.max.y,w.max.z][i];
      if(Math.abs(d)<1e-9){ if(o<mn || o>mx){ tmin=maxDist+1; break;} }
      else {
        let t1=(mn-o)/d, t2=(mx-o)/d;
        if(t1>t2){const tmp=t1;t1=t2;t2=tmp;}
        tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2);
        if(tmin>tmax){ tmin=maxDist+1; break;}
      }
    }
    if(tmin>=0 && tmin<best && tmin<=maxDist) best=tmin;
  }
  return best;
}
