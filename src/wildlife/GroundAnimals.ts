import * as THREE from 'three';
import type { SpeciesId, Subject } from '../safari/species';
import type { Collider } from '../world/props';
import type { BiomeId } from '../world/biomes';
import type { World } from '../world/World';
import { ALERT_DURATION, animateAlert, animateHold, animateZzz, createAlert, createNote, createWary, createZzz } from './alert';
import { rareChance, updateAlert, WARY, type CarPresence } from './awareness';
import { BONK_IMMUNITY, Bonk, carHits } from './bonk';
import {
  createBadger,
  createBunny,
  createCamel,
  createCat,
  CATS,
  createPenguin,
  createSnail,
  SNAIL_COLORS,
  createCrab,
  createDeer,
  createFox,
  createHedgehog,
  createLizard,
  createSeagull,
  createSeal,
  FOX_COLORS,
  LIZARD_COLORS,
  makeLegendary,
  SEAL_COLORS,
  type GroundModel,
} from './models';

type Kind =
  | 'crochePatte'
  | 'kiki'
  | 'chablis'
  | 'deer'
  | 'fox'
  | 'hedgehog'
  | 'moonFox'
  | 'camel'
  | 'fennec'
  | 'lizard'
  | 'rainbowLizard'
  | 'crab'
  | 'seal'
  | 'seagull'
  | 'pearlSeal'
  | 'arcticFox'
  | 'bunny'
  | 'penguin'
  | 'auroraFox'
  | 'snail'
  | 'badger'
  | 'glowSnail';
/** Which behaviour/animation set an animal uses (a legendary can reuse a regular one). */
type Behaves = 'deer' | 'fox' | 'hedgehog';

interface KindDef {
  species: SpeciesId;
  behaves: Behaves;
  /** The biome it lives in ('anywhere' for mythic animals). */
  biome: BiomeId | 'anywhere';
  /** Mythic (the cats): any biome, day or night, never more than one in the world, and rarest of all. */
  mythic?: boolean;
  /** Takes naps any time of day (with a Zzz), instead of only sleeping at night. */
  naps?: boolean;
  /** Beach dwellers: only spawn and wander within reach of water. */
  nearWater?: boolean;
  /** How far the body drops when lying down to sleep. */
  sleepDrop: number;
  /** Legendaries: base chance per spawn check (scaled by difficulty) that one turns up. */
  legendaryChance?: number;
  create: () => GroundModel;
  scale: number;
  walkSpeed: number;
  fleeSpeed: number;
  /** Notice radius at full car speed (see awareness). */
  notice: number;
  groupSize: [number, number];
  maxGroups: number;
  /** Only out after dusk. */
  nocturnal: boolean;
  /** Lies down to sleep at night. */
  sleepsAtNight: boolean;
  /** Photo subject size (unscaled). */
  height: number;
  radius: number;
  /** Startled animals either run away or roll up into a ball. */
  reaction: 'flee' | 'curl';
  /** Leg swings per unit of speed. */
  gait: number;
}

const KINDS: Record<Kind, KindDef> = {
  // ---- Mythic: the three cats. Any biome, day or night, one at a time. ----
  crochePatte: cat('croche-patte', CATS.crochePatte, { walkSpeed: 1.3, fleeSpeed: 5.5, height: 0.72, radius: 0.46, sleepDrop: -0.14, gait: 6 }),
  kiki: cat('kiki', CATS.kiki, { walkSpeed: 1.6, fleeSpeed: 6, height: 0.74, radius: 0.42, sleepDrop: -0.18, gait: 6 }),
  chablis: cat('chablis', CATS.chablis, { walkSpeed: 2.1, fleeSpeed: 7.5, height: 0.76, radius: 0.36, sleepDrop: -0.26, gait: 5 }),
  deer: {
    species: 'deer',
    behaves: 'deer',
    biome: 'blossom',
    sleepDrop: -0.62,
    create: createDeer,
    scale: 1.25,
    walkSpeed: 1.3,
    fleeSpeed: 8,
    notice: 22,
    groupSize: [2, 3],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 1.5,
    radius: 0.7,
    reaction: 'flee',
    gait: 3.4,
  },
  fox: {
    species: 'fox',
    behaves: 'fox',
    biome: 'blossom',
    sleepDrop: -0.24,
    create: createFox,
    scale: 1.3,
    walkSpeed: 2,
    fleeSpeed: 6.5,
    notice: 15,
    groupSize: [1, 1],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.75,
    radius: 0.45,
    reaction: 'flee',
    gait: 5,
  },
  hedgehog: {
    species: 'hedgehog',
    behaves: 'hedgehog',
    biome: 'blossom',
    sleepDrop: -0.1,
    create: createHedgehog,
    scale: 1.3,
    walkSpeed: 0.6,
    fleeSpeed: 0,
    notice: 9,
    groupSize: [1, 1],
    maxGroups: 3,
    nocturnal: true,
    sleepsAtNight: false,
    height: 0.5,
    radius: 0.38,
    reaction: 'curl',
    gait: 9,
  },
  // Legendary: a glowing lilac fox that only comes out at night, and never sleeps.
  moonFox: {
    species: 'moon-fox',
    behaves: 'fox',
    biome: 'blossom',
    sleepDrop: -0.24,
    legendaryChance: 0.006,
    create: () => {
      const model = createFox(FOX_COLORS.moon);
      makeLegendary(model.root, 0.45);
      return model;
    },
    scale: 1.3,
    walkSpeed: 2,
    fleeSpeed: 7,
    notice: 18,
    groupSize: [1, 1],
    maxGroups: 1,
    nocturnal: true,
    sleepsAtNight: false,
    height: 0.75,
    radius: 0.45,
    reaction: 'flee',
    gait: 5,
  },

  // ---- Candy Dunes
  camel: {
    species: 'camel',
    behaves: 'deer',
    biome: 'dunes',
    sleepDrop: -0.95,
    create: createCamel,
    scale: 1.2,
    walkSpeed: 1,
    fleeSpeed: 5.5,
    notice: 20,
    groupSize: [1, 3],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 2.1,
    radius: 0.9,
    reaction: 'flee',
    gait: 2.6,
  },
  fennec: {
    species: 'fennec',
    behaves: 'fox',
    biome: 'dunes',
    sleepDrop: -0.24,
    create: () => createFox(FOX_COLORS.fennec),
    scale: 1.15,
    walkSpeed: 2.2,
    fleeSpeed: 7,
    notice: 17,
    groupSize: [1, 1],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.7,
    radius: 0.42,
    reaction: 'flee',
    gait: 5.5,
  },
  lizard: {
    species: 'lizard',
    behaves: 'fox',
    biome: 'dunes',
    sleepDrop: -0.05,
    create: () => createLizard(LIZARD_COLORS.mint),
    scale: 1.6,
    walkSpeed: 2.4,
    fleeSpeed: 7.5,
    notice: 9,
    groupSize: [1, 1],
    maxGroups: 3,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.3,
    radius: 0.35,
    reaction: 'flee',
    gait: 12,
  },
  rainbowLizard: {
    species: 'rainbow-lizard',
    behaves: 'fox',
    biome: 'dunes',
    sleepDrop: -0.05,
    legendaryChance: 0.02,
    create: () => {
      const model = createLizard(LIZARD_COLORS.rainbow);
      makeLegendary(model.root, 0.45);
      return model;
    },
    scale: 1.7,
    walkSpeed: 2.4,
    fleeSpeed: 8,
    notice: 12,
    groupSize: [1, 1],
    maxGroups: 1,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.3,
    radius: 0.35,
    reaction: 'flee',
    gait: 12,
  },

  // ---- Sherbet Coast
  crab: {
    species: 'crab',
    behaves: 'hedgehog',
    biome: 'coast',
    nearWater: true,
    sleepDrop: -0.05,
    create: createCrab,
    scale: 1.5,
    walkSpeed: 1,
    fleeSpeed: 0,
    notice: 8,
    groupSize: [1, 2],
    maxGroups: 3,
    nocturnal: false,
    sleepsAtNight: false,
    height: 0.4,
    radius: 0.4,
    reaction: 'curl',
    gait: 14,
  },
  seal: {
    species: 'seal',
    behaves: 'hedgehog',
    biome: 'coast',
    nearWater: true,
    sleepDrop: -0.05,
    create: () => createSeal(SEAL_COLORS.grey),
    scale: 1.4,
    walkSpeed: 0.5,
    fleeSpeed: 2.5,
    notice: 14,
    groupSize: [1, 2],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.7,
    radius: 0.6,
    reaction: 'flee',
    gait: 6,
  },
  seagull: {
    species: 'seagull',
    behaves: 'fox',
    biome: 'coast',
    nearWater: true,
    sleepDrop: -0.2,
    create: createSeagull,
    scale: 1.3,
    walkSpeed: 1.4,
    fleeSpeed: 6,
    notice: 13,
    groupSize: [1, 3],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.8,
    radius: 0.4,
    reaction: 'flee',
    gait: 9,
  },
  pearlSeal: {
    species: 'pearl-seal',
    behaves: 'hedgehog',
    biome: 'coast',
    nearWater: true,
    sleepDrop: -0.05,
    legendaryChance: 0.015,
    create: () => {
      const model = createSeal(SEAL_COLORS.pearl);
      makeLegendary(model.root, 0.4);
      return model;
    },
    scale: 1.5,
    walkSpeed: 0.5,
    fleeSpeed: 2.5,
    notice: 16,
    groupSize: [1, 1],
    maxGroups: 1,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.7,
    radius: 0.6,
    reaction: 'flee',
    gait: 6,
  },

  // ---- Snowdrop Hills
  arcticFox: {
    species: 'arctic-fox',
    behaves: 'fox',
    biome: 'snow',
    sleepDrop: -0.24,
    create: () => createFox(FOX_COLORS.arctic),
    scale: 1.3,
    walkSpeed: 2,
    fleeSpeed: 7.5,
    notice: 20,
    groupSize: [1, 1],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.75,
    radius: 0.45,
    reaction: 'flee',
    gait: 5,
  },
  bunny: {
    species: 'snow-bunny',
    behaves: 'hedgehog',
    biome: 'snow',
    sleepDrop: -0.06,
    create: createBunny,
    scale: 1.4,
    walkSpeed: 1.4,
    fleeSpeed: 7,
    notice: 14,
    groupSize: [1, 3],
    maxGroups: 3,
    nocturnal: false,
    sleepsAtNight: false,
    height: 0.6,
    radius: 0.35,
    reaction: 'flee',
    gait: 10,
  },
  penguin: {
    species: 'penguin',
    behaves: 'hedgehog',
    biome: 'snow',
    sleepDrop: -0.04,
    create: createPenguin,
    scale: 1.4,
    walkSpeed: 0.8,
    fleeSpeed: 2.6,
    notice: 12,
    groupSize: [2, 4],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: false,
    height: 0.95,
    radius: 0.4,
    reaction: 'flee',
    gait: 11,
  },
  auroraFox: {
    species: 'aurora-fox',
    behaves: 'fox',
    biome: 'snow',
    sleepDrop: -0.24,
    legendaryChance: 0.01,
    create: () => {
      const model = createFox(FOX_COLORS.aurora);
      makeLegendary(model.root, 0.5);
      return model;
    },
    scale: 1.35,
    walkSpeed: 2,
    fleeSpeed: 8,
    notice: 24,
    groupSize: [1, 1],
    maxGroups: 1,
    nocturnal: true,
    sleepsAtNight: false,
    height: 0.75,
    radius: 0.45,
    reaction: 'flee',
    gait: 5,
  },

  // ---- Mushroom Hollow
  snail: {
    species: 'snail',
    behaves: 'hedgehog',
    biome: 'mushroom',
    sleepDrop: 0,
    create: () => createSnail(SNAIL_COLORS.normal),
    scale: 1.8,
    walkSpeed: 0.25,
    fleeSpeed: 0,
    notice: 6,
    groupSize: [1, 2],
    maxGroups: 3,
    nocturnal: false,
    sleepsAtNight: false,
    height: 0.45,
    radius: 0.35,
    reaction: 'curl',
    gait: 0,
  },
  badger: {
    species: 'badger',
    behaves: 'fox',
    biome: 'mushroom',
    sleepDrop: -0.16,
    create: createBadger,
    scale: 1.35,
    walkSpeed: 1.1,
    fleeSpeed: 5,
    notice: 16,
    groupSize: [1, 1],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.6,
    radius: 0.5,
    reaction: 'flee',
    gait: 6,
  },
  glowSnail: {
    species: 'glow-snail',
    behaves: 'hedgehog',
    biome: 'mushroom',
    sleepDrop: 0,
    legendaryChance: 0.02,
    create: () => {
      const model = createSnail(SNAIL_COLORS.glow);
      makeLegendary(model.root, 0.6);
      return model;
    },
    scale: 1.9,
    walkSpeed: 0.25,
    fleeSpeed: 0,
    notice: 8,
    groupSize: [1, 1],
    maxGroups: 1,
    nocturnal: true,
    sleepsAtNight: false,
    height: 0.45,
    radius: 0.35,
    reaction: 'curl',
    gait: 0,
  },
};

/** A mythic cat's definition: fox-like roaming, sitting and pouncing, plus naps; sizes per cat. */
function cat(
  species: SpeciesId,
  spec: Parameters<typeof createCat>[0],
  build: Pick<KindDef, 'walkSpeed' | 'fleeSpeed' | 'height' | 'radius' | 'sleepDrop' | 'gait'>,
): KindDef {
  return {
    species,
    behaves: 'fox',
    biome: 'anywhere',
    mythic: true,
    naps: true,
    create: () => createCat(spec),
    scale: 1.25,
    notice: 14,
    groupSize: [1, 1],
    maxGroups: 1,
    nocturnal: false,
    sleepsAtNight: false,
    reaction: 'flee',
    ...build,
  };
}

/**
 * Chance per spawn check that a cat turns up (each cat is checked about every
 * 2 s): roughly one cat per 10 minutes of play.
 */
const MYTHIC_CHANCE = 0.0012;

/** Animals appear in this ring around the player (inside the right biome) and leave beyond DESPAWN_RADIUS. */
/** Animal kinds considered per spawn check (checks run 4× a second). */
const KINDS_PER_CHECK = 3;
const SPAWN_MIN = 14;
const SPAWN_MAX = 36;
const DESPAWN_RADIUS = 55;
const SCARE_RADIUS = 18;
/** Animals keep at least this far from a road's edge (plus their own clearance). */
const ROAD_SHYNESS = 3;
const CHIME_RADIUS = 22;
const CURIOUS_TIME = 4.5;
const SHOCK_TIME = 0.45;
const FLEE_TIME = 3.5;
const CURL_TIME = 4;
const APPEAR_TIME = 0.5;
const LEAVE_TIME = 0.4;

type State = 'idle' | 'walk' | 'graze' | 'sit' | 'pounce' | 'sniff' | 'sleep' | 'shock' | 'flee' | 'curl';

interface Animal {
  kind: Kind;
  def: KindDef;
  model: GroundModel;
  alert: THREE.Sprite;
  wary: THREE.Sprite;
  note: THREE.Sprite;
  /** "z Z z" over nappers (the cats), shown while asleep. */
  zzz: THREE.Sprite | null;
  pos: THREE.Vector3;
  heading: number;
  target: THREE.Vector3;
  state: State;
  stateTime: number;
  stateDuration: number;
  speed: number;
  gaitPhase: number;
  alertness: number;
  waryTime: number;
  curiousTime: number;
  alertTime: number;
  noteTime: number;
  appear: number;
  /** Seconds into leaving (shrinking away), or -1. */
  leaving: number;
  fleeDir: THREE.Vector3;
  leader: Animal | null;
  time: number;
  /** The model's resting body height and eye size, to animate relative to. */
  restY: number;
  eyeSize: number;
  /** A car bonk in progress (squashed flat, or flying off), during which the animal's own life pauses. */
  bonk: Bonk | null;
  /** Seconds before it can be bonked again (just after popping back up). */
  bonkCooldown: number;
}

const _near: Collider[] = [];

/**
 * Ground-dwelling Blossom Woods animals: deer herds that graze and bound,
 * foxes that trot, sit and pounce, and night-time hedgehogs that roll into a
 * ball when startled. All notice the car, react to the honk and the chime.
 */
export class GroundAnimals {
  readonly group = new THREE.Group();

  private readonly animals: Animal[] = [];
  private manageTimer = 0;
  private sleepy = false;
  private kindCursor = 0;

  constructor(private readonly world: World) {}

  clear(): void {
    for (const a of this.animals) {
      a.bonk?.dispose();
      this.group.remove(a.model.root);
    }
    this.animals.length = 0;
  }

  scare(from: THREE.Vector3): void {
    for (const a of this.animals) {
      if (a.leaving >= 0 || a.appear < APPEAR_TIME || a.bonk) continue;
      if (Math.hypot(a.pos.x - from.x, a.pos.z - from.z) <= SCARE_RADIUS) this.startle(a, from);
    }
  }

  chime(from: THREE.Vector3): void {
    for (const a of this.animals) {
      if (a.leaving >= 0 || a.bonk || a.state === 'shock' || a.state === 'flee' || a.state === 'curl') continue;
      if (Math.hypot(a.pos.x - from.x, a.pos.z - from.z) > CHIME_RADIUS) continue;
      a.curiousTime = CURIOUS_TIME;
      a.noteTime = 0;
      a.alertness *= 0.3;
      if (a.state === 'sleep' || a.state === 'walk' || a.state === 'pounce') this.setState(a, 'idle', CURIOUS_TIME);
    }
  }

  collectSubjects(out: Subject[]): void {
    for (const a of this.animals) {
      // A bonked animal is never a photo subject: bonking isn't how you fill the journal.
      if (a.appear < APPEAR_TIME || a.leaving >= 0 || a.bonk) continue;
      const s = a.def.scale;
      out.push({
        species: a.def.species,
        position: a.model.root.position.clone().add(new THREE.Vector3(0, a.def.height * 0.5 * s, 0)),
        radius: a.def.radius * s,
        forward: new THREE.Vector3(Math.sin(a.heading), 0, Math.cos(a.heading)),
        behavior: this.behavior(a),
      });
    }
  }

  update(dt: number, focus: THREE.Vector3, darkness: number, car: CarPresence): void {
    this.sleepy = darkness > 0.75;
    this.manageTimer -= dt;
    if (this.manageTimer <= 0) {
      this.manageTimer = 0.25;
      this.manage(focus, darkness);
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (a.leaving >= 0) {
        a.leaving += dt;
        if (a.leaving >= LEAVE_TIME) {
          this.remove(i);
          continue;
        }
      }
      if (a.bonk) {
        this.updateBonk(a, i, dt);
        continue;
      }
      a.bonkCooldown = Math.max(0, a.bonkCooldown - dt);
      if (a.leaving < 0 && a.appear >= APPEAR_TIME && a.bonkCooldown <= 0 && carHits(a.pos.x, a.pos.z, a.def.radius * a.def.scale, car)) {
        this.bonk(a, car);
        continue;
      }
      this.sense(a, dt, car);
      this.think(a, dt, focus);
      this.animate(a, dt);
    }
  }

  // ---------------------------------------------------------------- bonks

  /** The car drove into it: squash it flat, or send it flying (never both, never harmful). */
  private bonk(a: Animal, car: CarPresence): void {
    const style = Math.random() < 0.5 ? 'squash' : 'launch';
    a.bonk = new Bonk(style, a.def.species, a.pos, car, a.model.eyes, this.group, a.def.height * a.def.scale);
    a.alert.visible = a.wary.visible = a.note.visible = false;
  }

  private updateBonk(a: Animal, index: number, dt: number): void {
    const bonk = a.bonk!;
    bonk.update(dt, a.model.root, a.pos, this.world.heightAt(a.pos.x, a.pos.z), a.def.scale);
    if (!bonk.done) return;
    if (bonk.style === 'launch') {
      // Sailed off over the horizon: it'll turn up somewhere else.
      this.remove(index);
      return;
    }
    // Back on its feet, shaken but fine: carry on as before.
    bonk.dispose();
    a.bonk = null;
    a.bonkCooldown = BONK_IMMUNITY;
    a.alertness = 0;
    a.waryTime = -1;
    this.setState(a, 'idle', 1 + Math.random());
  }

  private remove(index: number): void {
    const a = this.animals[index];
    a.bonk?.dispose();
    this.group.remove(a.model.root);
    this.animals.splice(index, 1);
    // Followers of a departed leader carry on by themselves.
    for (const other of this.animals) if (other.leader === a) other.leader = null;
  }

  // ---------------------------------------------------------------- lifecycle

  private manage(focus: THREE.Vector3, darkness: number): void {
    for (const a of this.animals) {
      if (a.leaving >= 0) continue;
      const far = Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) > DESPAWN_RADIUS;
      // Night creatures slip away at dawn.
      const bedtime = a.def.nocturnal && darkness < 0.2 && a.state !== 'curl';
      if (far || bedtime) a.leaving = 0;
    }

    // Which biomes are around the player? Only those animals are worth trying to place.
    const around = new Set<BiomeId>();
    for (let k = 0; k < 5; k++) {
      const ang = (k / 4) * Math.PI * 2;
      const r = k === 4 ? 0 : 24;
      around.add(this.world.dominantBiome(focus.x + Math.cos(ang) * r, focus.z + Math.sin(ang) * r));
    }

    // Try a few kinds per check (round-robin), so spawning never piles into one frame.
    const kinds = Object.keys(KINDS) as Kind[];
    for (let n = 0; n < KINDS_PER_CHECK; n++) {
      const kind = kinds[this.kindCursor++ % kinds.length];
      const def = KINDS[kind];
      if (def.mythic) {
        // One cat in the world at a time, and only very rarely.
        if (this.animals.some((a) => a.def.mythic) || Math.random() > MYTHIC_CHANCE) continue;
      } else if (def.biome === 'anywhere' || !around.has(def.biome)) continue;
      if (def.nocturnal && darkness < 0.4) continue;
      if (def.legendaryChance !== undefined && Math.random() > rareChance(def.legendaryChance, this.world.difficultyAt(focus.x, focus.z))) continue;
      const groups = this.animals.filter((a) => a.kind === kind && !a.leader && a.leaving < 0).length;
      if (groups >= def.maxGroups) continue;
      const spot = this.findSpot(focus, def);
      if (spot) this.spawnGroup(kind, spot);
    }
  }

  /** A dry, open spot deep in the animal's biome (by the water for beach dwellers), away from others. */
  private findSpot(focus: THREE.Vector3, def: KindDef): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 14; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = focus.x + Math.cos(ang) * r;
      const z = focus.z + Math.sin(ang) * r;
      if (def.biome !== 'anywhere' && this.world.biomeWeight(x, z, def.biome) < 0.7) continue;
      if (!this.walkable(x, z, 1.2)) continue;
      if (def.nearWater && !this.nearWater(x, z)) continue;
      if (this.animals.some((a) => Math.hypot(a.pos.x - x, a.pos.z - z) < 9)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  private spawnGroup(kind: Kind, at: THREE.Vector3): void {
    const def = KINDS[kind];
    const [min, max] = def.groupSize;
    const size = min + Math.floor(Math.random() * (max - min + 1));
    const heading = Math.random() * Math.PI * 2;
    let leader: Animal | null = null;
    for (let i = 0; i < size; i++) {
      // Spread the group out: followers start a size-scaled distance from the leader.
      const ang = Math.random() * Math.PI * 2;
      const spread = i === 0 ? 0 : def.radius * def.scale * (2.4 + Math.random() * 1.5);
      const x = at.x + Math.cos(ang) * spread;
      const z = at.z + Math.sin(ang) * spread;
      if (i > 0 && !this.walkable(x, z, 0.8)) continue;
      const a = this.makeAnimal(kind, x, z, heading + (Math.random() - 0.5));
      a.leader = leader;
      leader ??= a;
    }
  }

  private makeAnimal(kind: Kind, x: number, z: number, heading: number): Animal {
    const def = KINDS[kind];
    const model = def.create();
    const bubbleY = def.height + 0.45;
    const alert = createAlert(bubbleY);
    const wary = createWary(bubbleY);
    const note = createNote(bubbleY);
    model.root.add(alert, wary, note);
    const zzz = def.naps ? createZzz(bubbleY) : null;
    if (zzz) model.root.add(zzz);
    model.root.scale.setScalar(0);
    this.group.add(model.root);
    const a: Animal = {
      kind,
      def,
      model,
      alert,
      wary,
      note,
      zzz,
      pos: new THREE.Vector3(x, this.world.heightAt(x, z), z),
      heading,
      target: new THREE.Vector3(x, 0, z),
      state: 'idle',
      stateTime: 0,
      stateDuration: 1 + Math.random() * 2,
      speed: 0,
      gaitPhase: Math.random() * 10,
      alertness: 0,
      waryTime: -1,
      curiousTime: 0,
      alertTime: ALERT_DURATION + 1,
      noteTime: ALERT_DURATION + 1,
      appear: 0,
      leaving: -1,
      fleeDir: new THREE.Vector3(),
      leader: null,
      time: Math.random() * 10,
      restY: model.body.position.y,
      eyeSize: model.eyes[0].scale.x,
      bonk: null,
      bonkCooldown: 0,
    };
    this.animals.push(a);
    return a;
  }

  // ---------------------------------------------------------------- behaviour

  private setState(a: Animal, state: State, duration: number): void {
    a.state = state;
    a.stateTime = 0;
    a.stateDuration = duration;
  }

  /** Notice the car: wary (stop, stare, "?") when it moves close; bolt or curl up if it keeps coming. */
  private sense(a: Animal, dt: number, car: CarPresence): void {
    const busy = a.state === 'shock' || a.state === 'flee' || a.state === 'curl';
    if (busy || a.appear < APPEAR_TIME || a.leaving >= 0) {
      a.waryTime = -1;
      return;
    }
    const dist = Math.hypot(a.pos.x - car.position.x, a.pos.z - car.position.z);
    // Sleepers are harder to disturb.
    const notice = a.state === 'sleep' ? a.def.notice * 0.5 : a.def.notice;
    a.alertness = updateAlert(a.alertness, dt, dist, notice, car);
    if (a.alertness >= 1) {
      // The whole group goes when one of them does.
      const root = a.leader ?? a;
      for (const other of this.animals) if (other === root || other.leader === root) this.startle(other, car.position);
      return;
    }
    a.waryTime = a.alertness > WARY && a.state !== 'sleep' ? (a.waryTime < 0 ? 0 : a.waryTime + dt) : -1;
  }

  private startle(a: Animal, from: THREE.Vector3): void {
    a.alertness = 0;
    a.curiousTime = 0;
    a.waryTime = -1;
    a.alertTime = -Math.random() * 0.12;
    a.fleeDir.set(a.pos.x - from.x, 0, a.pos.z - from.z).normalize();
    // A little randomness so a herd fans out as it flees.
    a.fleeDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.8);
    if (a.def.reaction === 'curl') this.setState(a, 'curl', CURL_TIME);
    else this.setState(a, 'shock', SHOCK_TIME);
  }

  /** Decide what to do and move. */
  private think(a: Animal, dt: number, focus: THREE.Vector3): void {
    a.time += dt;
    a.stateTime += dt;
    a.curiousTime = Math.max(0, a.curiousTime - dt);
    const towardCar = Math.atan2(focus.x - a.pos.x, focus.z - a.pos.z);
    const carDist = Math.hypot(focus.x - a.pos.x, focus.z - a.pos.z);
    let speed = 0;
    let desired = a.heading;

    switch (a.state) {
      case 'shock':
        desired = towardCar;
        if (a.stateTime >= a.stateDuration) this.setState(a, 'flee', FLEE_TIME);
        break;
      case 'flee':
        desired = Math.atan2(a.fleeDir.x, a.fleeDir.z);
        speed = a.def.fleeSpeed * (1 - 0.5 * (a.stateTime / a.stateDuration));
        if (a.stateTime >= a.stateDuration) this.setState(a, 'idle', 1.5);
        break;
      case 'curl':
        if (a.stateTime >= a.stateDuration) this.setState(a, 'sniff', 1.5);
        break;
      case 'walk':
        desired = Math.atan2(a.target.x - a.pos.x, a.target.z - a.pos.z);
        speed = a.def.walkSpeed;
        if (Math.hypot(a.target.x - a.pos.x, a.target.z - a.pos.z) < 0.6 || a.stateTime > a.stateDuration) this.setState(a, 'idle', 0.5);
        break;
      case 'pounce': {
        // Crouch, spring forward, land.
        if (a.stateTime > 0.5 && a.stateTime < 0.9) speed = 3;
        if (a.stateTime >= a.stateDuration) this.setState(a, 'sniff', 1.2);
        break;
      }
      default:
        if (a.stateTime >= a.stateDuration) this.decide(a);
    }

    // Night: diurnal animals settle down to sleep.
    if (this.sleepy && a.def.sleepsAtNight && a.curiousTime <= 0 && (a.state === 'idle' || a.state === 'graze' || a.state === 'sit')) {
      this.setState(a, 'sleep', 999);
    }
    if (a.state === 'sleep' && !this.sleepy && !a.def.naps) this.setState(a, 'idle', 1);

    // Wary or curious: stop and look at the car. Curious hedgehogs trundle closer.
    if (a.waryTime >= 0 || a.curiousTime > 0) {
      desired = towardCar;
      speed = a.curiousTime > 0 && a.def.behaves === 'hedgehog' && carDist > 3.5 ? a.def.walkSpeed : 0;
    }

    this.steer(a, desired, speed, dt, a.state === 'flee' ? 6 : 3);
  }

  /** Pick the next idle activity (followers keep close to their leader). */
  private decide(a: Animal): void {
    const leader = a.leader;
    // Followers keep near their leader, but never on top of it (a gap scaled to their size).
    const gap = a.def.radius * a.def.scale * 2.6;
    if (leader && Math.hypot(leader.pos.x - a.pos.x, leader.pos.z - a.pos.z) > Math.max(4, gap * 2)) {
      const ang = Math.random() * Math.PI * 2;
      a.target.set(leader.pos.x + Math.cos(ang) * gap, 0, leader.pos.z + Math.sin(ang) * gap);
      this.setState(a, 'walk', 8);
      return;
    }
    const r = Math.random();
    switch (a.def.behaves) {
      case 'deer':
        if (r < 0.55) this.setState(a, 'graze', 4 + Math.random() * 4);
        else if (r < 0.9 && this.pickTarget(a, 8)) this.setState(a, 'walk', 8);
        else this.setState(a, 'idle', 2 + Math.random());
        break;
      case 'fox':
        // Cats curl up for a nap now and then, whatever the time of day.
        if (a.def.naps && r < 0.22) this.setState(a, 'sleep', 8 + Math.random() * 10);
        else if (r < 0.4 && this.pickTarget(a, 10)) this.setState(a, 'walk', 8);
        else if (r < 0.65) this.setState(a, 'sit', 3 + Math.random() * 3);
        else if (r < 0.85) this.setState(a, 'pounce', 1.3);
        else this.setState(a, 'sniff', 2);
        break;
      case 'hedgehog':
        if (r < 0.55 && this.pickTarget(a, 5)) this.setState(a, 'walk', 8);
        else this.setState(a, 'sniff', 2 + Math.random() * 2);
        break;
    }
  }

  /** A walkable wander target within `range`, staying in the woods. */
  private pickTarget(a: Animal, range: number): boolean {
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * (range - 2);
      const x = a.pos.x + Math.cos(ang) * r;
      const z = a.pos.z + Math.sin(ang) * r;
      const inBiome = a.def.biome === 'anywhere' || this.world.biomeWeight(x, z, a.def.biome) > 0.4;
      if (inBiome && this.walkable(x, z, 0.8) && (!a.def.nearWater || this.nearWater(x, z))) {
        a.target.set(x, 0, z);
        return true;
      }
    }
    return false;
  }

  /** Water within a few steps (for beach dwellers). */
  private nearWater(x: number, z: number): boolean {
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      if (this.world.heightAt(x + Math.cos(ang) * 5, z + Math.sin(ang) * 5) < this.world.waterLevel - 0.1) return true;
    }
    return false;
  }

  /** Dry ground off the roads, with no tree or stone in the way. */
  private walkable(x: number, z: number, clearance: number): boolean {
    if (this.world.roadClearance(x, z) < clearance + ROAD_SHYNESS) return false;
    if (this.world.heightAt(x, z) < this.world.waterLevel + 0.2) return false;
    this.world.collidersNear(x, z, clearance + 1.5, _near);
    return _near.every((c) => Math.hypot(c.x - x, c.z - z) > c.radius + clearance);
  }

  /** Turn toward `desired` and move, veering around obstacles; stop if boxed in. */
  private steer(a: Animal, desired: number, speed: number, dt: number, turnRate: number): void {
    const diff = Math.atan2(Math.sin(desired - a.heading), Math.cos(desired - a.heading));
    a.heading += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);
    a.speed += (speed - a.speed) * Math.min(1, 6 * dt);
    if (a.speed < 0.02) return;
    const clearance = a.def.radius * a.def.scale * 0.6;
    for (const veer of [0, 0.6, -0.6, 1.2, -1.2, 2.2, -2.2]) {
      const h = a.heading + veer;
      const nx = a.pos.x + Math.sin(h) * a.speed * dt;
      const nz = a.pos.z + Math.cos(h) * a.speed * dt;
      if (this.walkable(nx, nz, clearance)) {
        a.pos.x = nx;
        a.pos.z = nz;
        a.heading += veer * 0.12;
        return;
      }
    }
    a.speed = 0;
  }

  private behavior(a: Animal): string {
    if (a.state === 'shock') return 'startled';
    if (a.def.behaves === 'hedgehog') {
      if (a.state === 'curl') return 'curled';
      if (a.state === 'flee') return 'startled';
      if (a.curiousTime > 0) return 'curious';
      return a.state === 'sniff' ? 'sniffing' : 'shuffling';
    }
    if (a.state === 'flee') return a.def.behaves === 'deer' ? 'bounding' : 'startled';
    if (a.curiousTime > 0) return 'curious';
    if (a.state === 'sleep') return 'sleeping';
    if (a.def.behaves === 'deer') return a.state === 'walk' ? 'walking' : 'grazing';
    if (a.state === 'sit') return 'sitting';
    if (a.state === 'pounce') return 'pouncing';
    return 'trotting';
  }

  // ---------------------------------------------------------------- animation

  private animate(a: Animal, dt: number): void {
    const { root, body, head, neck, tail, legs, eyes } = a.model;
    const s = a.def.scale;

    // Scale: pop in, shrink away when leaving.
    a.appear = Math.min(APPEAR_TIME, a.appear + dt);
    const t = a.appear / APPEAR_TIME - 1;
    let scale = s * (1 + 2.7 * t * t * t + 1.7 * t * t);
    if (a.leaving >= 0) scale = s * Math.max(0, 1 - a.leaving / LEAVE_TIME);
    root.scale.setScalar(scale);

    // Walk cycle.
    a.gaitPhase += a.speed * a.def.gait * dt;
    const swing = Math.sin(a.gaitPhase) * Math.min(0.65, a.speed * 0.35);
    let hop = 0;
    if (a.state === 'flee' && a.def.behaves === 'deer') hop = Math.abs(Math.sin(a.gaitPhase * 0.5)) * 0.55; // bounding leaps
    if (a.state === 'shock') hop = Math.sin(Math.PI * Math.min(1, a.stateTime / 0.3)) * 0.35;
    if (a.state === 'pounce' && a.stateTime > 0.5 && a.stateTime < 0.9) hop = Math.sin(((a.stateTime - 0.5) / 0.4) * Math.PI) * 0.5;

    a.pos.y = this.world.heightAt(a.pos.x, a.pos.z);
    root.position.set(a.pos.x, a.pos.y + hop * s, a.pos.z);
    root.rotation.y = a.heading;

    // Reset pose, then layer on the current state.
    body.rotation.set(0, 0, 0);
    body.position.y = a.restY;
    body.scale.set(1, 1, 1);
    head.rotation.set(0, 0, 0);
    head.scale.setScalar(1);
    tail.rotation.set(0, 0, 0);
    legs.forEach((leg, i) => {
      leg.rotation.set((i === 0 || i === 3 ? 1 : -1) * swing, 0, 0);
      leg.scale.setScalar(1);
    });
    let neckDip = a.def.behaves === 'deer' ? -0.1 : 0;

    switch (a.state) {
      case 'graze':
        neckDip = 1.25;
        head.rotation.x = Math.sin(a.time * 7) * 0.08; // munching
        break;
      case 'walk':
        neckDip = 0.15;
        tail.rotation.y = Math.sin(a.time * 4) * 0.25;
        break;
      case 'sit':
        body.rotation.x = -0.5;
        body.position.y = a.restY - 0.07;
        legs[2].rotation.x = legs[3].rotation.x = -1.2;
        tail.rotation.y = 1.1;
        break;
      case 'pounce':
        if (a.stateTime < 0.5) {
          body.rotation.x = 0.2; // crouch, bum wiggle
          body.position.y = a.restY - 0.06;
          tail.rotation.y = Math.sin(a.time * 25) * 0.3;
        } else body.rotation.x = -0.3 * Math.sin(((a.stateTime - 0.5) / 0.8) * Math.PI);
        break;
      case 'sniff':
        head.rotation.x = 0.3 + Math.sin(a.time * 18) * 0.06;
        break;
      case 'sleep':
        // Lie down: legs tucked under, head resting.
        body.position.y = a.restY + a.def.sleepDrop;
        legs.forEach((leg, i) => {
          // Front legs fold back, hind legs fold forward: tucked under the body.
          leg.rotation.x = i < 2 ? 1.45 : -1.45;
          leg.scale.setScalar(0.6);
        });
        neckDip = 0.75;
        head.rotation.x = 0.3;
        tail.rotation.y = a.def.behaves === 'fox' ? 2.2 : 0;
        body.scale.y = 1 + Math.sin(a.time * 1.3) * 0.03; // slow breathing
        break;
      case 'curl':
        // Roll into a spiky ball: head and feet tucked away, a nervous little tremble.
        body.scale.set(1.05, 1.2, 0.85);
        body.rotation.x = 0.3;
        head.scale.setScalar(0.01);
        for (const leg of legs) leg.scale.setScalar(0.01);
        body.position.y = a.restY - 0.02 + Math.sin(a.time * 40) * 0.008;
        break;
      case 'flee':
        neckDip = -0.2;
        body.rotation.x = a.def.behaves === 'deer' ? -Math.cos(a.gaitPhase * 0.5) * 0.25 : 0;
        break;
    }

    // Curious: head up and tilted, ears perked.
    if (a.curiousTime > 0 && a.state !== 'sleep') {
      neckDip = -0.2;
      head.rotation.z = 0.3 + Math.sin(a.time * 2) * 0.08;
      if (a.def.behaves === 'fox') {
        body.rotation.x = -0.5;
        body.position.y = a.restY - 0.07;
        legs[2].rotation.x = legs[3].rotation.x = -1.2;
      }
    }
    if (a.waryTime >= 0) {
      neckDip = -0.25;
      head.rotation.set(-0.1, 0, 0);
    }
    if (neck) neck.rotation.x += (neckDip - neck.rotation.x) * Math.min(1, 6 * dt);

    const wide = a.state === 'shock' || a.state === 'flee' ? 1.7 : a.curiousTime > 0 ? 1.3 : 1;
    // Asleep: eyes shut to little lines.
    const shut = a.state === 'sleep' ? 0.18 : 1;
    for (const eye of eyes) eye.scale.set(a.eyeSize * wide, a.eyeSize * wide * shut, a.eyeSize * wide);

    // Bubbles.
    a.alertTime += dt;
    a.noteTime += dt;
    const bubble = 0.45 / s;
    if (a.zzz) animateZzz(a.zzz, a.state === 'sleep', a.time, bubble, a.def.height + 0.3 + a.def.sleepDrop);
    // Mythic sparkles circle slowly, rising and falling.
    if (a.model.aura) {
      a.model.aura.rotation.y += dt * 1.1;
      a.model.aura.position.y = a.def.height * 0.6 + Math.sin(a.time * 1.7) * 0.06;
    }
    animateAlert(a.alert, a.alertTime, bubble);
    animateAlert(a.note, a.noteTime, bubble, 1.2);
    animateHold(a.wary, a.waryTime, bubble);
  }
}
