import * as THREE from 'three';
import { BEAM, closeness, Shape, shared, SPARKLE, type Structure } from './builder';
import type { StructureKind } from './kinds';

/** Honks carry this far (reactions and their sounds fade out with distance). */
export const HONK_REACH = 35;

// A soft, toy-like palette shared by everything.
const CREAM = '#fff3e3';
const WHITE = '#fffaf5';
const STONE = '#d8d1dc';
const DARK_STONE = '#b9b3c4';
const WOOD = '#d9a67e';
const DARK_WOOD = '#a8776a';
const WARM = '#ffd98a';
const LANTERN = '#ffc27a';
const ROOF_PINK = '#ef9fb0';
const ROOF_RED = '#e58f8f';
const SAND = '#f3dcae';
const SNOW = '#f5f9ff';
const ICE = '#d6ecfa';

/** Volume for a reaction heard `d` away from the honk. */
const near = (d: number) => Math.max(0, 1 - d / HONK_REACH);

type Build = (s: Structure) => void;

// ---------------------------------------------------------------- Meadow

const windmill: Build = (s) => {
  s.body(
    shared('windmill', () =>
      new Shape()
        .cyl(2.4, 2.6, 1.5, DARK_STONE, 0, -1.3, 0, 16)
        .cyl(1.5, 2.1, 7, CREAM, 0, 0.2, 0, 16)
        .cone(2.4, 2.4, ROOF_PINK, 0, 7.1, 0, 16)
        .ball(0.25, ROOF_PINK, 0, 9.55, 0)
        .box(1.1, 1.9, 0.4, DARK_WOOD, 0, 0.2, 1.9)
        .cyl(0.28, 0.28, 0.7, DARK_WOOD, 0, 6.2, 1.55, 8)
        .build(),
    ),
  );
  s.glow(shared('windmill.glow', () => new Shape().box(0.6, 0.8, 0.3, WARM, 0, 3.4, 1.72).box(0.3, 0.7, 0.6, WARM, 1.6, 4.8, 0.2).build()));
  // Four lattice sails on a hub, turning on the front of the tower.
  const sails = s.pivot(0, 6.55, 2.0);
  s.body(
    shared('windmill.sails', () => {
      // The hub points along z, out of the tower.
      const shape = new Shape().add(new THREE.CylinderGeometry(0.35, 0.35, 0.4, 10).rotateX(Math.PI / 2), DARK_WOOD);
      const blade = () => new THREE.BoxGeometry(0.14, 3.6, 0.1).translate(0, 2, 0);
      const cloth = () => new THREE.BoxGeometry(0.85, 2.9, 0.05).translate(0.5, 2.3, 0.02);
      for (let k = 0; k < 4; k++) {
        shape.add(blade().rotateZ((k * Math.PI) / 2), WOOD);
        shape.add(cloth().rotateZ((k * Math.PI) / 2), WHITE);
      }
      return shape.build();
    }),
    sails,
  );
  let boost = 0;
  s.onHonk((d) => (boost = Math.max(boost, 6 * near(d) + 2)));
  s.onUpdate((ctx, dt) => {
    boost *= Math.exp(-dt * 0.45);
    sails.rotation.z -= (0.5 + ctx.rain * 1.3 + boost) * dt;
  });
  s.collide(0, 0, 2.4);
};

const cabin: Build = (s) => {
  s.body(
    shared('cabin', () => {
      const shape = new Shape()
        .box(4.4, 1.4, 3.4, DARK_STONE, 0, -1.2)
        .box(4.2, 2.6, 3.2, WOOD, 0, 0.2)
        .gable(4.9, 1.8, 3.9, ROOF_RED, 0, 2.8)
        .box(5.0, 0.16, 0.24, '#c97070', 0, 4.52)
        .box(0.6, 1.8, 0.6, DARK_STONE, 1.3, 3.1, -0.7)
        .box(0.85, 1.6, 0.12, DARK_WOOD, 0.6, 0.2, 1.62);
      // Log lines along the walls, shingle lines along the roof.
      for (const y of [0.8, 1.5, 2.2]) shape.box(4.3, 0.08, 3.3, DARK_WOOD, 0, y);
      for (const k of [0.33, 0.66]) {
        const y = 2.8 + 1.8 * k;
        const z = 1.95 * (1 - k);
        shape.box(4.92, 0.05, 0.08, '#c97070', 0, y + 0.02, z).box(4.92, 0.05, 0.08, '#c97070', 0, y + 0.02, -z);
      }
      return shape.build();
    }),
  );
  s.glow(shared('cabin.glow', () => new Shape().box(0.8, 0.65, 0.12, WARM, -1.1, 1.2, 1.63).box(0.12, 0.65, 0.8, WARM, 2.12, 1.2, 0).build()));
  s.smoke(1.3, 5, -0.7);
  s.onHonk(() => s.lightUp(6));
  s.collide(-1.1, 0, 1.9);
  s.collide(1.1, 0, 1.9);
};

const hayBales: Build = (s) => {
  const bale = shared('hayBale', () =>
    new Shape()
      .add(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 16).rotateZ(Math.PI / 2).translate(0, 0.66, 0), '#f3d48a')
      .add(new THREE.CylinderGeometry(0.72, 0.72, 0.12, 16).rotateZ(Math.PI / 2).translate(-0.3, 0.66, 0), '#d9b56a')
      .add(new THREE.CylinderGeometry(0.72, 0.72, 0.12, 16).rotateZ(Math.PI / 2).translate(0.3, 0.66, 0), '#d9b56a')
      .build(),
  );
  const count = 2 + Math.floor(s.rng() * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + s.rng();
    const r = i === 0 ? 0 : 1.6 + s.rng() * 0.6;
    const m = s.body(bale);
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.rotation.y = s.rng() * Math.PI;
    s.collide(m.position.x, m.position.z, 0.8);
  }
  s.wobbly(0.06);
};

const picnic: Build = (s) => {
  s.body(
    shared('picnic', () => {
      const shape = new Shape();
      // Gingham blanket: a 5 × 4 grid of alternating squares.
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 4; j++) shape.box(0.5, 0.03, 0.5, (i + j) % 2 ? '#ff9fb5' : WHITE, -1 + i * 0.5, 0.01, -0.75 + j * 0.5);
      }
      shape
        .box(0.7, 0.4, 0.45, WOOD, 0.6, 0.04, 0.2)
        .add(new THREE.TorusGeometry(0.28, 0.035, 6, 14, Math.PI).translate(0.6, 0.44, 0.2), DARK_WOOD)
        .cyl(0.2, 0.2, 0.03, WHITE, -0.5, 0.05, -0.3, 14)
        .cyl(0.2, 0.2, 0.03, WHITE, -0.1, 0.05, 0.45, 14)
        .ball(0.1, '#ef6f7f', -0.5, 0.16, -0.3)
        .ball(0.09, '#9fd98a', -0.1, 0.15, 0.45);
      return shape.build();
    }),
  );
};

// ---------------------------------------------------------------- Blossom Woods

const pagoda: Build = (s) => {
  s.body(
    shared('pagoda', () => {
      const shape = new Shape().box(7, 1.2, 7, STONE, 0, -1).box(4.6, 2.1, 4.6, CREAM, 0, 0.2).box(1, 1.6, 0.2, ROOF_RED, 0, 0.2, 2.3);
      const tiers: [number, number, number, number][] = [
        // [roof width, roof base y, next wall width, next wall height]
        [6, 2.3, 3.4, 1.7],
        [4.6, 4.4, 2.3, 1.4],
        [3.3, 6.2, 0, 0],
      ];
      for (const [w, y, nextW, nextH] of tiers) {
        shape.pyramid(w, 1.2, w, ROOF_PINK, 0, y, 0).box(w * 0.78, 0.2, w * 0.78, ROOF_RED, 0, y - 0.1);
        if (nextW > 0) shape.box(nextW, nextH, nextW, CREAM, 0, y + 0.4);
      }
      shape.cyl(0.08, 0.08, 1.6, '#f2c46d', 0, 7.3, 0, 6).ball(0.18, '#f2c46d', 0, 8.7, 0).ball(0.14, '#f2c46d', 0, 8.3, 0);
      return shape.build();
    }),
  );
  // Paper lanterns hanging from the lowest roof's corners.
  s.glow(
    shared('pagoda.glow', () => {
      const shape = new Shape();
      for (const [x, z] of [
        [2.5, 2.5],
        [-2.5, 2.5],
        [2.5, -2.5],
        [-2.5, -2.5],
      ]) shape.ball(0.28, LANTERN, x, 1.9, z, 1, 1.25, 1);
      return shape.box(0.7, 0.6, 0.15, WARM, 1.4, 1.1, 2.31).box(0.7, 0.6, 0.15, WARM, -1.4, 1.1, 2.31).build();
    }),
  );
  s.onHonk((d) => {
    s.sound('bells', near(d));
    s.lightUp(3);
  });
  s.collide(0, 0, 3.4);
};

const torii: Build = (s) => {
  const gate = shared('torii', () =>
    new Shape()
      .cyl(0.17, 0.2, 3.3, '#f08c8c', -1.5, 0, 0, 10)
      .cyl(0.17, 0.2, 3.3, '#f08c8c', 1.5, 0, 0, 10)
      .box(4.4, 0.3, 0.45, '#5f5064', 0, 3.25)
      .box(4.0, 0.14, 0.5, '#f08c8c', 0, 3.1)
      .box(3.5, 0.22, 0.3, '#f08c8c', 0, 2.55)
      .box(0.25, 0.7, 0.2, '#f08c8c', 0, 2.55)
      .build(),
  );
  const count = 2 + Math.floor(s.rng() * 2);
  for (let i = 0; i < count; i++) {
    const z = (i - (count - 1) / 2) * 4.5;
    s.body(gate).position.z = z;
    s.collide(-1.5, z, 0.3);
    s.collide(1.5, z, 0.3);
  }
};

const stoneLanterns: Build = (s) => {
  const lantern = shared('stoneLantern', () =>
    new Shape()
      .box(0.8, 0.3, 0.8, STONE, 0, -0.1)
      .cyl(0.17, 0.2, 1.0, STONE, 0, 0.2, 0, 8)
      .box(0.75, 0.14, 0.75, STONE, 0, 1.2)
      .box(0.18, 0.5, 0.18, STONE, 0.28, 1.34, 0.28)
      .box(0.18, 0.5, 0.18, STONE, -0.28, 1.34, 0.28)
      .box(0.18, 0.5, 0.18, STONE, 0.28, 1.34, -0.28)
      .box(0.18, 0.5, 0.18, STONE, -0.28, 1.34, -0.28)
      .pyramid(1.0, 0.5, 1.0, DARK_STONE, 0, 1.84)
      .ball(0.1, DARK_STONE, 0, 2.38)
      .build(),
  );
  const light = shared('stoneLantern.glow', () => new Shape().box(0.42, 0.42, 0.42, LANTERN, 0, 1.36).build());
  // A pair, flanking an imaginary path.
  for (const x of [-1.6, 1.6]) {
    s.body(lantern).position.x = x;
    s.glow(light).position.x = x;
    s.collide(x, 0, 0.5);
  }
  s.wobbly(0.04);
  // At night they're dim, and brighten as you drive up.
  s.onUpdate((ctx) => (s.glowLevel = ctx.darkness * (0.25 + 0.75 * closeness(ctx, s.site.x, s.site.z, 4, 16))));
};

const swingTree: Build = (s) => {
  s.body(
    shared('swingTree', () => {
      const shape = new Shape()
        .cyl(0.38, 0.52, 3.3, '#c9a88a', 0, -0.2, 0, 10)
        .add(new THREE.CylinderGeometry(0.16, 0.22, 2.7, 8).rotateZ(Math.PI / 2).translate(1.3, 3.05, 0), '#c9a88a');
      for (const [x, y, z, r, c] of [
        [0.2, 4.2, 0, 1.6, '#f7b7cf'],
        [1.5, 3.9, 0.4, 1.2, '#f4a6c4'],
        [-0.9, 3.8, -0.3, 1.2, '#f9c6d9'],
        [0.4, 5.0, -0.5, 1.1, '#f4a6c4'],
        [1.1, 4.7, -0.9, 0.9, '#f7b7cf'],
        [-0.3, 4.6, 0.9, 1.0, '#f9c6d9'],
      ] as [number, number, number, number, string][]) shape.ball(r, c, x, y, z);
      return shape.build();
    }),
  );
  // The swing hangs from the branch and rocks back and forth.
  const swing = s.pivot(1.9, 2.95, 0);
  s.body(
    shared('swing', () =>
      new Shape()
        .cyl(0.03, 0.03, 1.9, '#e8dcc8', 0, -1.95, 0.38, 5)
        .cyl(0.03, 0.03, 1.9, '#e8dcc8', 0, -1.95, -0.38, 5)
        .box(0.45, 0.08, 0.95, WOOD, 0, -2.0)
        .build(),
    ),
    swing,
  );
  let amp = 0.12;
  s.onHonk((d) => (amp = Math.max(amp, 0.3 + 0.4 * near(d))));
  s.onUpdate((ctx, dt) => {
    if (closeness(ctx, s.site.x, s.site.z, 5, 8) > 0.5 && ctx.carSpeed > 3) amp = Math.max(amp, 0.55);
    amp += (0.12 - amp) * Math.min(1, dt * 0.35);
    swing.rotation.z = amp * Math.sin(ctx.time * 2.2);
  });
  s.collide(0, 0, 0.6);
};

// ---------------------------------------------------------------- Lily Wetlands

const stiltHouse: Build = (s) => {
  s.body(
    shared('stiltHouse', () => {
      const shape = new Shape();
      for (const x of [-1.7, 0, 1.7]) for (const z of [-1.4, 1.4]) shape.cyl(0.14, 0.16, 3.8, DARK_WOOD, x, -2.6, z, 6);
      shape
        .box(4.4, 0.2, 3.8, WOOD, 0, 1.2)
        .box(3.2, 2.0, 2.6, '#eadcbd', 0, 1.4)
        .pyramid(4.4, 2.0, 3.8, '#d8c17e', 0, 3.4)
        .box(0.8, 1.5, 0.12, DARK_WOOD, 0.7, 1.4, 1.31);
      // A ladder down to the water on the front.
      shape.box(0.08, 2.4, 0.08, DARK_WOOD, -0.5, -1.0, 2.0).box(0.08, 2.4, 0.08, DARK_WOOD, 0.1, -1.0, 2.0);
      for (const y of [-0.5, 0, 0.5, 1.0]) shape.box(0.6, 0.06, 0.08, DARK_WOOD, -0.2, y, 2.0);
      // Railing.
      shape.box(4.4, 0.08, 0.08, DARK_WOOD, 0, 1.9, -1.85).box(0.08, 0.08, 3.8, DARK_WOOD, 2.15, 1.9, 0).box(0.08, 0.08, 3.8, DARK_WOOD, -2.15, 1.9, 0);
      return shape.build();
    }),
  );
  s.glow(shared('stiltHouse.glow', () => new Shape().box(0.7, 0.6, 0.12, WARM, -0.8, 2.0, 1.31).box(0.12, 0.6, 0.7, WARM, 1.61, 2.0, 0).build()));
  s.onHonk(() => s.lightUp(6));
  s.collide(0, 0, 2.6);
};

const jetty: Build = (s) => {
  s.body(
    shared('jetty', () => {
      const shape = new Shape().box(1.8, 0.15, 10, '#d2a883', 0, 0.2, 2.5);
      for (let z = -2; z <= 7; z += 0.9) shape.box(1.84, 0.02, 0.06, DARK_WOOD, 0, 0.35, z);
      for (const z of [-1, 2.5, 6.8]) for (const x of [-0.85, 0.85]) shape.cyl(0.11, 0.12, 2.6, DARK_WOOD, x, -2, z, 6);
      shape.cyl(0.07, 0.07, 1.8, DARK_WOOD, 0.75, 0.35, 7.2, 6).box(0.5, 0.06, 0.06, DARK_WOOD, 0.55, 2.1, 7.2);
      return shape.build();
    }),
  );
  s.glow(shared('jetty.glow', () => new Shape().ball(0.18, LANTERN, 0.35, 1.85, 7.2, 1, 1.3, 1).build()));
};

const rowBoat: Build = (s) => {
  const boat = s.pivot(0, 0, 0);
  s.body(
    shared('rowBoat', () =>
      new Shape()
        .add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.85, 0.5, 1.9).translate(0, 0.3, 0), '#f0bf98')
        // A rim round the top of the hull, and a floor that fits inside it.
        .add(new THREE.TorusGeometry(1, 0.07, 6, 28).rotateX(Math.PI / 2).scale(0.85, 1, 1.9).translate(0, 0.3, 0), '#c99a74')
        .box(1.1, 0.04, 2.2, '#a8776a', 0, 0.1)
        .box(1.45, 0.07, 0.35, WOOD, 0, 0.26, 0.3)
        .box(1.1, 0.07, 0.3, WOOD, 0, 0.26, -1.0)
        .box(0.08, 0.06, 2.3, DARK_WOOD, 0.95, 0.32, 0, 0.35)
        .box(0.08, 0.06, 2.3, DARK_WOOD, -0.95, 0.32, 0, -0.35)
        .build(),
    ),
    boat,
  );
  boat.rotation.order = 'YXZ';
  let rock = 0;
  const phase = s.rng() * 10;
  s.onUpdate((ctx, dt) => {
    if (ctx.carSpeed > 1.5 && closeness(ctx, s.site.x, s.site.z, 3, 7) > 0.5) rock = Math.max(rock, 0.3);
    rock *= Math.exp(-dt * 1.2);
    const t = ctx.time + phase;
    boat.position.y = -0.18 + Math.sin(t * 1.6) * 0.05;
    boat.rotation.z = Math.sin(t * 1.3) * 0.05 + Math.sin(t * 5) * rock;
    boat.rotation.x = Math.sin(t * 1.1) * 0.03;
  });
  s.collide(0, 0, 1.2);
};

const fishingHut: Build = (s) => {
  s.body(
    shared('fishingHut', () =>
      new Shape()
        .box(2.6, 1.2, 2.2, DARK_STONE, 0, -1)
        .box(2.4, 2.0, 2.0, '#a9c9bd', 0, 0.2)
        .box(2.9, 0.16, 2.6, '#8b7f8f', 0, 2.25)
        .box(0.7, 1.4, 0.1, DARK_WOOD, -0.5, 0.2, 1.01)
        // Nets drying on poles, facing the water.
        .cyl(0.06, 0.06, 2.1, DARK_WOOD, 1.8, 0, 0.9, 6)
        .cyl(0.06, 0.06, 2.1, DARK_WOOD, 1.8, 0, 2.5, 6)
        .box(0.05, 1.3, 1.5, '#e8dcc8', 1.8, 0.6, 1.7)
        .cyl(0.38, 0.4, 0.8, WOOD, -1.6, 0, 1.2, 12)
        .build(),
    ),
  );
  s.glow(shared('fishingHut.glow', () => new Shape().box(0.6, 0.5, 0.1, WARM, 0.55, 1.1, 1.01).build()));
  s.onHonk(() => s.lightUp(6));
  s.collide(0, 0, 1.6);
};

// ---------------------------------------------------------------- Candy Dunes

const pyramid: Build = (s) => {
  s.body(
    shared('pyramid', () => {
      const shape = new Shape();
      [11, 8.8, 6.6, 4.4, 2.2].forEach((w, k) => shape.box(w, 1.5, w, k % 2 ? '#efc896' : '#f5d6a8', 0, -1 + k * 1.5));
      return shape.box(1.1, 1.4, 0.3, '#8f7064', 0, -0.3, 5.45).build();
    }),
  );
  // A golden capstone that catches the night.
  s.glow(shared('pyramid.glow', () => new Shape().pyramid(2.2, 1.7, 2.2, '#ffd98a', 0, 6.5).build()));
  s.nightLight = 0.6;
  s.onHonk((d) => s.sound('echo', near(d)));
  s.collide(0, 0, 5.6);
};

const TENT_COLORS = ['#f7b3a3', '#b8d8f0', '#f3d38a'];

const tent: Build = (s) => {
  const color = TENT_COLORS[Math.floor(s.rng() * TENT_COLORS.length)];
  s.body(
    shared(`tent.${color}`, () =>
      new Shape()
        .pyramid(3.4, 2.6, 3.4, color, 0, -0.1)
        .pyramid(1.75, 1.34, 1.75, WHITE, 0, 1.18)
        .box(0.9, 1.2, 0.05, '#6e5a66', 0, -0.05, 1.3)
        .cyl(0.05, 0.05, 1.3, DARK_WOOD, 0, 2.4, 0, 6)
        .build(),
    ),
  );
  // The door flap and a little pennant, fluttering in the desert wind.
  const flap = s.pivot(0, 1.1, 1.38);
  s.body(shared(`tent.flap.${color}`, () => new Shape().box(0.9, 1.15, 0.04, color, 0.45, -1.15, 0).build()), flap);
  const flag = s.pivot(0, 3.5, 0);
  s.body(shared('tent.flag', () => new Shape().box(0.6, 0.32, 0.03, '#ff9fb5', 0.3, -0.32, 0).build()), flag);
  let gust = 0;
  s.onHonk((d) => (gust = Math.max(gust, 1.5 * near(d) + 0.5)));
  s.onUpdate((ctx, dt) => {
    gust = Math.max(0, gust - dt * 0.6);
    flap.rotation.y = -0.45 - 0.2 * Math.sin(ctx.time * 2.3) - gust * (0.5 + 0.3 * Math.sin(ctx.time * 11));
    flag.rotation.y = Math.sin(ctx.time * (4 + gust * 4)) * (0.3 + gust * 0.3);
  });
  s.collide(0, 0, 1.7);
};

const caravan: Build = (s) => {
  s.body(
    shared('caravan', () => {
      const shape = new Shape();
      const rug = (x: number, z: number, ry: number, a: string, b: string) => {
        shape.box(2.2, 0.03, 1.4, a, x, 0.01, z, ry);
        for (const o of [-0.45, 0, 0.45]) shape.box(2.2, 0.035, 0.14, b, x - Math.sin(ry) * o, 0.012, z + Math.cos(ry) * o, ry);
      };
      rug(-0.6, 0.2, 0.2, '#e98fa1', '#fbe3a8');
      rug(1.0, -0.5, -0.4, '#9fc9e8', WHITE);
      for (const [x, z, r] of [
        [1.9, 0.9, 0.35],
        [-1.9, -0.8, 0.3],
        [2.2, 0.3, 0.25],
      ]) shape.ball(r, '#e0a07e', x, r * 0.9, z, 1, 0.9, 1).cyl(r * 0.45, r * 0.5, r * 0.5, '#d18e6c', x, r * 1.6, z, 10);
      // A canopy on four poles.
      for (const x of [-1.4, 1.4]) for (const z of [-1.1, 1.1]) shape.cyl(0.06, 0.07, 2.2, DARK_WOOD, x, 0, z, 6);
      return shape.build();
    }),
  );
  const canopy = s.pivot(0, 2.2, 0);
  s.body(shared('caravan.canopy', () => new Shape().box(3.2, 0.06, 2.6, '#f6c1d2', 0, 0).box(3.2, 0.3, 0.04, '#f6c1d2', 0, -0.3, 1.3).build()), canopy);
  s.onUpdate((ctx) => (canopy.rotation.x = Math.sin(ctx.time * 1.7) * 0.03));
  for (const x of [-1.4, 1.4]) for (const z of [-1.1, 1.1]) s.collide(x, z, 0.25);
};

const well: Build = (s) => {
  s.body(
    shared('well', () =>
      new Shape()
        .cyl(1.1, 1.2, 1.1, STONE, 0, -0.2, 0, 16)
        .cyl(0.85, 0.85, 0.05, '#5f7fa0', 0, 0.88, 0, 16)
        .cyl(0.08, 0.1, 1.7, DARK_WOOD, 0.95, 0.8, 0, 6)
        .cyl(0.08, 0.1, 1.7, DARK_WOOD, -0.95, 0.8, 0, 6)
        .add(new THREE.CylinderGeometry(0.05, 0.05, 2, 6).rotateZ(Math.PI / 2).translate(0, 2.2, 0), DARK_WOOD)
        .pyramid(2.6, 0.8, 1.6, '#e9a58a', 0, 2.45)
        .cyl(0.02, 0.02, 0.8, '#e8dcc8', 0, 1.4, 0, 4)
        .cyl(0.16, 0.13, 0.26, WOOD, 0, 1.15, 0, 10)
        .build(),
    ),
  );
  s.onHonk((d) => s.sound('echo', near(d) * 0.8));
  s.collide(0, 0, 1.25);
};

// ---------------------------------------------------------------- Sherbet Coast

const lighthouse: Build = (s) => {
  s.body(
    shared('lighthouse', () => {
      const shape = new Shape();
      for (const [x, z, r] of [
        [1.4, 0.8, 1.2],
        [-1.2, 1.1, 1.0],
        [0.3, -1.5, 1.1],
      ]) shape.add(new THREE.DodecahedronGeometry(r, 0).scale(1, 0.6, 1).translate(x, 0.1, z), DARK_STONE);
      // A tapering tower in four stripes.
      for (let k = 0; k < 4; k++) {
        const r0 = 1.8 - k * 0.15;
        shape.cyl(r0 - 0.15, r0, 2.2, k % 2 ? '#f08c8c' : WHITE, 0, -0.4 + k * 2.2, 0, 18);
      }
      shape
        .cyl(1.6, 1.6, 0.25, WHITE, 0, 8.4, 0, 18)
        .add(new THREE.TorusGeometry(1.5, 0.05, 6, 24).rotateX(Math.PI / 2).translate(0, 9.1, 0), '#6e5a66')
        .dome(1.05, '#f08c8c', 0, 9.85)
        .ball(0.18, '#6e5a66', 0, 10.95)
        .box(0.9, 1.6, 0.3, DARK_WOOD, 0, -0.4, 1.7);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        shape.cyl(0.05, 0.05, 1.2, '#6e5a66', Math.cos(a) * 0.95, 8.65, Math.sin(a) * 0.95, 4);
      }
      return shape.build();
    }),
  );
  s.glow(shared('lighthouse.glow', () => new Shape().cyl(0.92, 0.92, 1.2, '#fff0b0', 0, 8.65, 0, 16).build()));
  // Two beams sweeping round after dark.
  const beams = s.pivot(0, 9.25, 0);
  const beamMat = s.own(BEAM);
  const beamGeo = shared('lighthouse.beam', () => new THREE.ConeGeometry(2.4, 18, 16, 1, true).rotateZ(Math.PI / 2).translate(9, 0, 0));
  for (const r of [0, Math.PI]) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.y = r;
    beam.renderOrder = 2;
    beams.add(beam);
  }
  let flash = 0;
  let hornIn = -1;
  let hornVolume = 0;
  s.onHonk((d) => {
    // It answers: a deep foghorn a moment later, and a flash of the lamp.
    if (hornIn < 0) {
      hornIn = 0.7;
      hornVolume = near(d);
    }
  });
  s.onUpdate((ctx, dt) => {
    if (hornIn >= 0) {
      hornIn -= dt;
      if (hornIn < 0) {
        s.sound('foghorn', hornVolume);
        flash = 1.5;
      }
    }
    flash = Math.max(0, flash - dt);
    const night = THREE.MathUtils.smoothstep(ctx.darkness, 0.25, 0.6);
    beams.rotation.y += 0.8 * dt;
    beamMat.opacity = 0.2 * Math.max(night, Math.min(1, flash));
    beams.visible = beamMat.opacity > 0.005;
    s.glowLevel = Math.max(ctx.darkness, Math.min(1, flash));
  });
  s.collide(0, 0, 2.1);
};

const HUT_COLORS = ['#ffb3c7', '#bfe8d6', '#fbe7a1', '#d7c8f5'];

const beachHuts: Build = (s) => {
  const count = 3 + Math.floor(s.rng() * 2);
  const first = Math.floor(s.rng() * HUT_COLORS.length);
  for (let i = 0; i < count; i++) {
    const color = HUT_COLORS[(first + i) % HUT_COLORS.length];
    const hut = s.body(
      shared(`beachHut.${color}`, () =>
        new Shape()
          .box(1.9, 0.5, 1.9, DARK_WOOD, 0, -0.35)
          .box(1.8, 2.1, 1.8, color, 0, 0.15)
          .box(0.12, 2.1, 0.12, WHITE, 0.9, 0.15, 0.9)
          .box(0.12, 2.1, 0.12, WHITE, -0.9, 0.15, 0.9)
          .gable(2.2, 0.9, 2.2, WHITE, 0, 2.25, 0, Math.PI / 2)
          .box(0.7, 1.4, 0.08, WHITE, 0, 0.15, 0.92)
          .build(),
      ),
    );
    const x = (i - (count - 1) / 2) * 2.6;
    hut.position.x = x;
    s.collide(x, 0, 1.15);
  }
};

const parasol: Build = (s) => {
  s.body(
    shared('parasol', () => {
      const shape = new Shape().cyl(0.04, 0.05, 2.4, WHITE, 0, -0.1, 0, 6);
      // Two deckchairs, facing the parasol's shade.
      for (const x of [-0.95, 0.95]) {
        shape
          .box(0.65, 0.05, 1.0, x < 0 ? '#8fd3e8' : '#ffb3c7', x, 0.35, 0.8)
          .add(new THREE.BoxGeometry(0.65, 0.05, 0.9).rotateX(-0.9).translate(x, 0.65, 0.05), x < 0 ? '#8fd3e8' : '#ffb3c7')
          .box(0.05, 0.35, 0.05, WOOD, x - 0.28, 0, 1.2)
          .box(0.05, 0.35, 0.05, WOOD, x + 0.28, 0, 1.2);
      }
      return shape.box(0.9, 0.02, 1.7, '#fbe7a1', 0.2, 0.01, 2.0, 0.3).build();
    }),
  );
  // The canopy can spin like a toy windmill.
  const top = s.pivot(0, 2.25, 0);
  s.body(
    shared('parasol.top', () => {
      const shape = new Shape();
      const colors = ['#ff9fb5', WHITE];
      for (let k = 0; k < 8; k++) {
        // Eight wedge panels in alternating colours.
        const g = new THREE.ConeGeometry(1.7, 0.55, 2, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4).translate(0, 0.27, 0);
        shape.add(g, colors[k % 2]);
      }
      return shape.ball(0.08, WHITE, 0, 0.58).build();
    }),
    top,
  );
  let spin = 0;
  s.onHonk((d) => (spin = Math.max(spin, 10 * near(d) + 3)));
  s.onUpdate((_ctx, dt) => {
    spin *= Math.exp(-dt * 0.8);
    top.rotation.y += spin * dt;
  });
  s.collide(0, 0, 0.35);
  s.collide(-0.95, 0.6, 0.55);
  s.collide(0.95, 0.6, 0.55);
  s.wobbly(0.08);
};

const sandcastle: Build = (s) => {
  const castle = s.pivot(0, 0, 0);
  s.body(
    shared('sandcastle', () => {
      const shape = new Shape().box(2.1, 0.5, 2.1, SAND, 0, -0.05);
      for (const x of [-0.85, 0.85]) {
        for (const z of [-0.85, 0.85]) {
          shape.cyl(0.33, 0.36, 0.95, SAND, x, 0, z, 10);
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            shape.box(0.14, 0.16, 0.14, SAND, x + Math.cos(a) * 0.24, 0.95, z + Math.sin(a) * 0.24);
          }
        }
      }
      return shape.box(0.9, 1.3, 0.9, '#efd09b', 0, 0).cone(0.62, 0.6, '#e8c48b', 0, 1.3, 0, 4).cyl(0.02, 0.02, 0.6, DARK_WOOD, 0, 1.85, 0, 4).build();
    }),
    castle,
  );
  const flag = s.pivot(0, 2.42, 0, castle);
  s.body(shared('sandcastle.flag', () => new Shape().box(0.34, 0.2, 0.02, '#ff9fb5', 0.17, -0.2, 0).build()), flag);
  // Drive over it and it flattens — then, like magic, builds itself back up.
  let flat = -1;
  s.onUpdate((ctx, dt) => {
    flag.rotation.y = Math.sin(ctx.time * 5) * 0.4;
    if (flat < 0 && ctx.carSpeed > 2 && closeness(ctx, s.site.x, s.site.z, 1.6, 2.2) > 0.5) {
      flat = 0;
      s.sound('poof', 0.8);
    }
    if (flat < 0) return;
    flat += dt;
    let y: number;
    if (flat < 0.15) y = 1 - (flat / 0.15) * 0.85;
    else if (flat < 7) y = 0.15;
    else {
      const k = Math.min(1, (flat - 7) / 0.6);
      y = 0.15 + 0.85 * (1 - Math.cos(k * Math.PI * 2.5) * Math.exp(-k * 4));
      if (k >= 1) {
        flat = -1;
        y = 1;
      }
    }
    castle.scale.set(1 + (1 - y) * 0.25, y, 1 + (1 - y) * 0.25);
  });
};

// ---------------------------------------------------------------- Snowdrop Hills

const iglooVillage: Build = (s) => {
  const igloo = shared('igloo', () => {
    const shape = new Shape().dome(1.9, SNOW, 0, -0.2);
    for (const y of [0.45, 1.05]) {
      const r = Math.sqrt(1.9 * 1.9 - (y + 0.2) ** 2) + 0.01;
      shape.add(new THREE.TorusGeometry(r, 0.035, 5, 28).rotateX(Math.PI / 2).translate(0, y, 0), '#dce9f7');
    }
    // Entrance tunnel (half a cylinder) on the front.
    return shape
      .add(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(0, -0.2, 1.9), SNOW)
      .build();
  });
  const door = shared('igloo.glow', () =>
    new Shape().add(new THREE.CircleGeometry(0.55, 14, 0, Math.PI).translate(0, -0.2, 2.61), '#ffcf8a').build(),
  );
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const x = Math.sin(a) * 4.4;
    const z = Math.cos(a) * 4.4;
    const m = s.body(igloo);
    m.position.set(x, 0, z);
    m.rotation.y = a + Math.PI; // entrances face the fire
    const d = s.glow(door);
    d.position.copy(m.position);
    d.rotation.copy(m.rotation);
    s.collide(x, z, 2);
  }
  // A crackling fire pit in the middle.
  s.body(
    shared('firePit', () => {
      const shape = new Shape();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        shape.add(new THREE.DodecahedronGeometry(0.22, 0).translate(Math.cos(a) * 0.65, 0.1, Math.sin(a) * 0.65), DARK_STONE);
      }
      return shape.box(0.9, 0.14, 0.18, DARK_WOOD, 0, 0.05, 0, 0.5).box(0.9, 0.14, 0.18, DARK_WOOD, 0, 0.05, 0, -0.6).build();
    }),
  );
  s.fire(shared('firePit.flame', () => new Shape().cone(0.4, 0.8, '#ffae5c', 0, 0.1, 0, 7).cone(0.22, 0.55, '#ffe08a', 0, 0.15, 0, 6).build()));
  s.smoke(0, 1.2, 0);
  s.onHonk(() => s.lightUp(5));
  s.collide(0, 0, 0.8);
};

const chalet: Build = (s) => {
  s.body(
    shared('chalet', () =>
      new Shape()
        .box(4.6, 1.4, 4.8, DARK_STONE, 0, -1.2)
        .gable(4.6, 4.4, 4.4, '#9b6a5a', 0, 0.2, 0, Math.PI / 2)
        .gable(4.64, 4.45, 4.2, SNOW, 0, 0.3, 0, Math.PI / 2)
        .box(0.55, 2.8, 0.55, DARK_STONE, 1.0, 2.2, -0.8)
        .box(0.65, 0.18, 0.65, SNOW, 1.0, 5.0, -0.8)
        .box(0.8, 1.3, 0.1, DARK_WOOD, 0.9, 0.2, 2.34)
        .build(),
    ),
  );
  s.glow(shared('chalet.glow', () => new Shape().gable(0.1, 1.5, 1.8, WARM, 0, 2.1, 2.34, Math.PI / 2).box(0.7, 0.6, 0.1, WARM, -0.9, 0.7, 2.34).build()));
  s.smoke(1.0, 5.2, -0.8);
  s.onHonk(() => s.lightUp(6));
  s.collide(0, 0, 2.4);
};

const sled: Build = (s) => {
  s.body(
    shared('sled', () =>
      new Shape()
        .box(0.08, 0.08, 1.6, '#ef8f96', -0.35, 0, 0)
        .box(0.08, 0.08, 1.6, '#ef8f96', 0.35, 0, 0)
        .add(new THREE.TorusGeometry(0.2, 0.04, 5, 10, Math.PI).rotateY(Math.PI / 2).translate(-0.35, 0.2, 0.8), '#ef8f96')
        .add(new THREE.TorusGeometry(0.2, 0.04, 5, 10, Math.PI).rotateY(Math.PI / 2).translate(0.35, 0.2, 0.8), '#ef8f96')
        .box(0.08, 0.25, 0.08, '#ef8f96', -0.35, 0.05, -0.4)
        .box(0.08, 0.25, 0.08, '#ef8f96', 0.35, 0.05, -0.4)
        .box(0.08, 0.25, 0.08, '#ef8f96', -0.35, 0.05, 0.4)
        .box(0.08, 0.25, 0.08, '#ef8f96', 0.35, 0.05, 0.4)
        .box(0.85, 0.06, 1.3, WOOD, 0, 0.3, 0)
        .ball(0.45, SNOW, 1.3, 0.35, -0.3)
        .ball(0.32, SNOW, 1.2, 0.2, 0.5)
        .ball(0.28, SNOW, 1.75, 0.18, 0.3)
        .ball(0.2, SNOW, 1.4, 0.95, -0.2)
        .build(),
    ),
  );
  s.collide(0, 0, 0.8);
  s.collide(1.4, 0, 0.6);
  s.wobbly(0.1);
};

const iceFishing: Build = (s) => {
  s.body(
    shared('iceFishing', () =>
      new Shape()
        .cyl(1.7, 1.75, 0.08, ICE, 0, -0.02, 0, 22)
        .cyl(0.36, 0.36, 0.1, '#3f5f7f', 0, -0.01, 0, 16)
        .cyl(0.25, 0.25, 0.08, '#6e5a66', 0.9, 0.45, -0.6, 10)
        .cyl(0.03, 0.03, 0.45, DARK_WOOD, 0.75, 0, -0.5, 4)
        .cyl(0.03, 0.03, 0.45, DARK_WOOD, 1.05, 0, -0.5, 4)
        .cyl(0.03, 0.03, 0.45, DARK_WOOD, 0.9, 0, -0.8, 4)
        .cyl(0.22, 0.2, 0.4, '#8fb8d8', -0.9, 0, -0.4, 10)
        .build(),
    ),
  );
  // The tip-up: a little flag that springs up when a fish bites.
  const tip = s.pivot(0.45, 0.08, 0.2);
  s.body(shared('iceFishing.flag', () => new Shape().cyl(0.02, 0.02, 0.8, DARK_WOOD, 0, 0, 0, 4).box(0.3, 0.2, 0.02, '#ffa15c', 0.15, 0.6).build()), tip);
  let up = 0;
  let cooldown = 0;
  s.onUpdate((ctx, dt) => {
    cooldown -= dt;
    if (cooldown <= 0 && closeness(ctx, s.site.x, s.site.z, 6, 9) > 0.5) {
      up = 4;
      cooldown = 9;
    }
    up = Math.max(0, up - dt);
    const target = up > 0 ? 0 : -1.35;
    tip.rotation.x += (target - tip.rotation.x) * Math.min(1, dt * (up > 0 ? 14 : 3));
  });
  tip.rotation.x = -1.35;
};

// ---------------------------------------------------------------- Mushroom Hollow

const mushroomHouse: Build = (s) => {
  s.body(
    shared('mushroomHouse', () => {
      const shape = new Shape()
        .cyl(2.1, 2.3, 1.2, DARK_STONE, 0, -1)
        .cyl(1.6, 1.9, 3.6, '#fff1e0', 0, 0, 0, 20)
        .cyl(3.3, 3.3, 0.12, '#f7d2c4', 0, 3.35, 0, 24)
        .dome(3.4, '#f28ca0', 0, 3.4, 0, 0.62)
        .add(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 16).rotateX(Math.PI / 2).translate(0, 0.75, 1.85), DARK_WOOD)
        .cyl(0.22, 0.26, 1.5, '#c9b8a8', 1.3, 4.6, -0.7, 8);
      // White spots on the cap.
      for (const [a, e] of [
        [0.3, 0.5],
        [1.4, 0.8],
        [2.5, 0.4],
        [3.6, 0.9],
        [4.7, 0.55],
        [5.6, 1.1],
        [0, 1.35],
      ]) {
        const r = 3.4 * Math.cos(e * 0.9);
        const y = 3.4 + 3.4 * 0.62 * Math.sin(e * 0.9);
        shape.ball(0.38, WHITE, Math.cos(a) * r * 0.97, y, Math.sin(a) * r * 0.97, 1, 0.45, 1);
      }
      return shape.build();
    }),
  );
  s.glow(
    shared('mushroomHouse.glow', () =>
      new Shape()
        .add(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 14).rotateX(Math.PI / 2).translate(-0.95, 2.1, 1.55), WARM)
        .add(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 14).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(1.72, 1.9, 0.3), WARM)
        .build(),
    ),
  );
  s.smoke(1.3, 6.2, -0.7);
  s.onHonk(() => s.lightUp(6));
  s.collide(0, 0, 2.1);
};

const FAIRY_CAPS = ['#ffb3c7', '#d8c8ff', '#bfe8d6', '#fbe7a1'];

const fairyRing: Build = (s) => {
  const ringR = 2.2;
  s.body(
    shared('fairyRing', () => {
      const shape = new Shape();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        shape.cyl(0.05, 0.07, 0.3, '#fff1e0', Math.cos(a) * ringR, 0, Math.sin(a) * ringR, 6);
      }
      return shape.build();
    }),
  );
  s.glow(
    shared('fairyRing.caps', () => {
      const shape = new Shape();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        shape.dome(0.17, FAIRY_CAPS[k % FAIRY_CAPS.length], Math.cos(a) * ringR, 0.28, Math.sin(a) * ringR, 0.7);
      }
      return shape.build();
    }),
  );
  // Sparkles that fly up when you drive through the ring.
  const star = shared('sparkle', () => new THREE.OctahedronGeometry(0.1));
  const sparkles: THREE.Mesh[] = [];
  for (let k = 0; k < 10; k++) {
    const m = new THREE.Mesh(star, SPARKLE);
    m.visible = false;
    s.root.add(m);
    sparkles.push(m);
  }
  let magic = -1;
  let cooldown = 0;
  s.onUpdate((ctx, dt) => {
    cooldown -= dt;
    if (cooldown <= 0 && ctx.carSpeed > 1 && closeness(ctx, s.site.x, s.site.z, ringR, ringR + 0.5) > 0.5) {
      magic = 0;
      cooldown = 3;
      s.sound('twinkle', 0.9);
    }
    let boost = 0;
    if (magic >= 0) {
      magic += dt;
      const t = magic / 1.6;
      boost = Math.max(0, 1 - t);
      sparkles.forEach((m, k) => {
        const a = (k / sparkles.length) * Math.PI * 2 + magic * 2;
        const r = ringR * (1 - t * 0.6);
        m.visible = t < 1;
        m.position.set(Math.cos(a) * r, 0.3 + t * 2.4 + Math.sin(k * 7 + magic * 9) * 0.15, Math.sin(a) * r);
        m.scale.setScalar(Math.sin(Math.PI * Math.min(1, t)) * (1 + 0.4 * Math.sin(magic * 20 + k)));
        m.rotation.y += dt * 6;
      });
      if (t >= 1) magic = -1;
    }
    s.glowLevel = Math.max(ctx.darkness * 0.8, boost);
  });
};

const signpost: Build = (s) => {
  s.body(
    shared('signpost', () => {
      const shape = new Shape().cyl(0.09, 0.1, 2.3, WOOD, 0, -0.1, 0, 8).ball(0.12, WOOD, 0, 2.25);
      const arrows: [number, number, string][] = [
        [1.9, 0.4, '#f3c9a8'],
        [1.5, -0.9, '#e9d4b0'],
        [1.1, 2.3, '#f3c9a8'],
      ];
      for (const [y, ry, c] of arrows) {
        const board = new THREE.BoxGeometry(0.9, 0.24, 0.06).translate(0.5, 0, 0);
        const tip = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 3).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2).translate(1.03, 0, 0);
        shape.add(board.rotateY(ry).translate(0, y, 0), c).add(tip.rotateY(ry).translate(0, y, 0), c);
      }
      // A short wonky fence beside it.
      for (const x of [1.2, 2.3, 3.4]) shape.box(0.12, 0.8, 0.12, DARK_WOOD, x, -0.05, 0.9);
      shape.box(2.4, 0.08, 0.06, DARK_WOOD, 2.3, 0.35, 0.9).box(2.4, 0.08, 0.06, DARK_WOOD, 2.3, 0.6, 0.9, 0.04);
      return shape.build();
    }),
  );
  s.collide(0, 0, 0.3);
  for (const x of [1.2, 2.3, 3.4]) s.collide(x, 0.9, 0.2);
  s.wobbly(0.12);
};

const LANTERN_COLORS = ['#ffcf8a', '#ffb3c7', '#bfe8ff', '#d8c8ff', '#c8f5d0'];

const lanternString: Build = (s) => {
  const span = 2.3;
  const sag = (x: number) => 2.7 - 0.5 * (1 - (x / span) ** 2);
  s.body(
    shared('lanternString', () => {
      const points = [];
      for (let k = 0; k <= 12; k++) {
        const x = -span + (k / 12) * span * 2;
        points.push(new THREE.Vector3(x, sag(x), 0));
      }
      return new Shape()
        .cyl(0.08, 0.1, 2.9, DARK_WOOD, -span, -0.1, 0, 8)
        .cyl(0.08, 0.1, 2.9, DARK_WOOD, span, -0.1, 0, 8)
        .add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.025, 4), '#6e5a66')
        .build();
    }),
  );
  const lanterns = s.pivot(0, 0, 0);
  s.glow(
    shared('lanternString.glow', () => {
      const shape = new Shape();
      for (let k = 0; k < 5; k++) {
        const x = -span + ((k + 1) / 6) * span * 2;
        shape.ball(0.17, LANTERN_COLORS[k], x, sag(x) - 0.2, 0, 1, 1.25, 1);
      }
      return shape.build();
    }),
    lanterns,
  );
  s.onUpdate((ctx) => {
    lanterns.rotation.x = Math.sin(ctx.time * 1.4) * 0.03;
    s.glowLevel = ctx.darkness * (0.3 + 0.7 * closeness(ctx, s.site.x, s.site.z, 4, 16));
  });
  s.collide(-span, 0, 0.2);
  s.collide(span, 0, 0.2);
};

export const BUILDERS: Record<StructureKind, Build> = {
  windmill,
  cabin,
  hayBales,
  picnic,
  pagoda,
  torii,
  stoneLanterns,
  swingTree,
  stiltHouse,
  jetty,
  rowBoat,
  fishingHut,
  pyramid,
  tent,
  caravan,
  well,
  lighthouse,
  beachHuts,
  parasol,
  sandcastle,
  iglooVillage,
  chalet,
  sled,
  iceFishing,
  mushroomHouse,
  fairyRing,
  signpost,
  lanternString,
};
