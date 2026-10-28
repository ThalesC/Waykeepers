export const CFG = {
  player: { health:100, stamina:100, speed:4, sprint:6, sprintCost:15, dodgeCost:25, healCharges:2, healAmt:40, healTime:1.4 },
  camera: { dist:5, height:2.5, fov:60 },
  combat: {
    light: { dmg:25, stam:20, wind:0.22, active:0.10, rec:0.33, reach:2.8, face:0.10 },
    heavy: { dmg:45, stam:35, wind:0.62, active:0.14, rec:0.54, reach:3.2, face:0.30 },
    dodge: { dur:0.60, dist:2.6, iStart:0.06, iEnd:0.30 },
    regen: 30, regenDelay:0.75,
    hitReact:0.25, invuln:0.80,
    buffer:0.15,
    heavyStagger:0.35, staggerResist:2.0
  },
  enemies: {
    briarling: { hp:60, lunge:{tell:0.80,active:0.12,rec:0.90,dmg:18,reach:2.4} },
    mossguard: { hp:90, swing:{tell:1.20,active:0.18,rec:1.50,dmg:26,reach:3.0} }
  },
  boss: { hp:420, speed:4, stopDist:3.8,
    A:{tell:1.10,active:0.20,rec:1.70,dmg:24,arc:150*Math.PI/180,reach:4.2},
    B:{tell:1.35,active:0.16,rec:2.00,dmg:32,radius:1.3,center:2.9}
  }
};
