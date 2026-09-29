import * as THREE from 'three';
import { track } from '../analytics';
import { species, type SpeciesId } from '../safari/species';
import { GroundAnimals } from '../wildlife/GroundAnimals';
import type { Owls } from '../wildlife/Owls';
import type { Squirrels } from '../wildlife/Squirrels';
import type { DayNight } from '../world/DayNight';
import type { Weather } from '../world/Weather';

/** How far ahead of the car a spawned animal appears, and how far to either side (so a few don't pile up). */
const SPAWN_AHEAD = 9;
const SPAWN_SPREAD = 3;

/** Named times of day (fraction of the 24 h cycle). */
const TIMES = { dawn: 0.26, morning: 0.34, noon: 0.5, day: 0.5, dusk: 0.73, evening: 0.76, night: 0.9, midnight: 0 };
type TimeName = keyof typeof TIMES;

export interface CheatDeps {
  car: { position: THREE.Vector3; heading: number };
  groundAnimals: GroundAnimals;
  squirrels: Squirrels;
  owls: Owls;
  weather: Weather;
  dayNight: DayNight;
}

/** Tree dwellers: they appear on the nearest suitable tree instead of on the ground. */
const TREE_SPECIES = ['squirrel', 'owl', 'snowy-owl'] as const satisfies readonly SpeciesId[];

/**
 * A sandbox toolkit on `window.Cheat`, for the browser's developer console:
 * spawn any animal in front of the car, change the weather or the time of day.
 * Drivy isn't competitive, so it's there for everyone (on the live site too).
 */
export function installCheats(deps: CheatDeps): void {
  const spawnable: SpeciesId[] = [...TREE_SPECIES, ...GroundAnimals.species];
  const used = (command: string) => track('cheat_used', { command });

  const cheat = {
    /** Print how to use the toolkit. */
    help(): void {
      console.log(
        [
          '%c🐾 Drivy cheats%c',
          '',
          '  Cheat.spawn("kiki")      an animal, right in front of the car',
          '  Cheat.animals()          everything you can spawn',
          '  Cheat.weather("rain")    "rain" or "clear" (rain falls as snow in the snowy hills)',
          '  Cheat.time("night")      "dawn", "morning", "noon", "dusk", "night", or a clock time like "18:30"',
          '',
          'Spawned animals behave like any other: photograph them for your journal.',
        ].join('\n'),
        'font-weight:bold;font-size:14px;color:#9b86d6',
        '',
      );
    },

    /** The names `spawn` accepts. */
    animals(): string[] {
      return spawnable;
    },

    /** Spawn an animal in front of the car, whatever the biome, time of day or rarity. */
    spawn(name: string): string {
      const id = match(name, spawnable);
      if (!id) {
        return `unknown '${name}', choices are: ${spawnable.map((s) => `'${s}'`).join(', ')}`;
      }
      used('spawn');
      const { position, heading } = deps.car;
      const ahead = SPAWN_AHEAD + (Math.random() - 0.5) * SPAWN_SPREAD;
      const side = (Math.random() - 0.5) * 2 * SPAWN_SPREAD;
      const x = position.x + Math.sin(heading) * ahead + Math.cos(heading) * side;
      const z = position.z + Math.cos(heading) * ahead - Math.sin(heading) * side;
      const label = `${species(id).emoji} ${species(id).name}`;
      if (id === 'squirrel') {
        return deps.squirrels.spawnNear(x, z) ? `${label} is up the nearest round tree` : `no free round tree nearby: squirrels need one, drive closer to some`;
      }
      if (id === 'owl' || id === 'snowy-owl') {
        return deps.owls.spawnNear(x, z, id === 'snowy-owl') ? `${label} is perched in the nearest pine` : `no free pine nearby: owls need one, drive closer to some`;
      }
      deps.groundAnimals.spawnSpecies(id, x, z);
      return `${label} appeared in front of you`;
    },

    /** "rain" or "clear". */
    weather(kind: string): string {
      const k = kind?.toLowerCase?.();
      if (k !== 'rain' && k !== 'clear') return `unknown weather '${kind}', choices are: 'rain', 'clear'`;
      used('weather');
      deps.weather.set(k === 'rain');
      return k === 'rain' ? '🌧️ here comes the rain' : '☀️ skies cleared';
    },

    /** A named time of day, or a clock time ("18:30", or an hour like 18). */
    time(when: string | number): string {
      let t: number | null = null;
      if (typeof when === 'number') t = when / 24;
      else if (typeof when === 'string') {
        const clock = /^(\d{1,2})(?::(\d{2}))?$/.exec(when.trim());
        if (clock) t = (Number(clock[1]) + Number(clock[2] ?? 0) / 60) / 24;
        else if (when.toLowerCase() in TIMES) t = TIMES[when.toLowerCase() as TimeName];
      }
      if (t === null || !Number.isFinite(t) || t < 0 || t > 1) {
        return `unknown time '${when}', choices are: ${Object.keys(TIMES).map((k) => `'${k}'`).join(', ')}, or a clock time like '18:30'`;
      }
      used('time');
      deps.dayNight.time = t % 1;
      return `🕰️ it's now ${deps.dayNight.clock}`;
    },

    toString(): string {
      return 'Drivy cheats: type Cheat.help()';
    },
  };

  Object.assign(window, { Cheat: cheat });
  console.log('%c🐾 Psst: type Cheat.help() in this console to spawn animals and change the weather.', 'color:#9b86d6');
}

/** Find a species by a forgiving name: case, spaces, hyphens and underscores don't matter. */
function match(name: string, ids: SpeciesId[]): SpeciesId | null {
  if (typeof name !== 'string') return null;
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const k = key(name);
  return ids.find((id) => key(id) === k || key(species(id).name) === k) ?? null;
}
