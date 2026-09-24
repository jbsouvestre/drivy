import './style.css';
import * as THREE from 'three';
import { CameraRig } from './game/CameraRig';
import { Car, type DriveInput } from './game/Car';
import { audioContext, playBells, playChime, playEcho, playFoghorn, playLaunch, playPoof, playShutter, playSquash, playTwinkle } from './game/audio';
import { Ambience } from './game/Ambience';
import { Horn } from './game/Horn';
import { Input } from './game/Input';
import { SkidMarks } from './game/SkidMarks';
import { warmUpShaders } from './game/warmup';
import { Splashes } from './game/Splashes';
import { hashString, randomSeedName } from './rng';
import { count, gauge, reporting } from './analytics';
import { SessionMetrics } from './game/SessionMetrics';
import type { Collider } from './world/props';
import { BIOMES, biome, type BiomeId } from './world/biomes';
import { DayNight } from './world/DayNight';
import { Weather } from './world/Weather';
import { setNightGlow } from './world/props';
import { updateWater } from './world/Water';
import { World } from './world/World';
import { Journal, type RecordResult } from './safari/Journal';
import { Photobook } from './safari/Photobook';
import { encodeFrame, grabFrame, type Frame } from './safari/snapshot';
import { PhotoMode } from './safari/PhotoMode';
import { Requests } from './safari/Requests';
import { scoreShot } from './safari/scoring';
import { SPECIES, type Subject } from './safari/species';
import { JournalView } from './ui/JournalView';
import { PhotoHud } from './ui/PhotoHud';
import { Speedometer } from './ui/Speedometer';
import { Birds } from './wildlife/Birds';
import { Dragonflies } from './wildlife/Dragonflies';
import { Ducks } from './wildlife/Ducks';
import { Fireflies } from './wildlife/Fireflies';
import { GroundAnimals } from './wildlife/GroundAnimals';
import { Owls } from './wildlife/Owls';
import { Drift, PETALS, RAIN, SNOW, SPORES } from './wildlife/Petals';
import { Squirrels } from './wildlife/Squirrels';
import { WetlandAnimals } from './wildlife/WetlandAnimals';
import type { CarPresence } from './wildlife/awareness';
import { onBonk } from './wildlife/bonk';

// Error reporting and metrics, live site only. When no DSN was built in, this whole
// branch (and the Sentry chunk) is dropped from the bundle.
if (__SENTRY_DSN__ && reporting) {
  void import('./sentry').then((m) => m.initSentry(__SENTRY_DSN__));
}

const IDLE: DriveInput = { throttle: 0, steer: 0, handbrake: false };
const HONK_WORDS = ['beep!', 'honk!', 'meep!', 'toot!'];
const CHIME_WORDS = ['♪ ding~', '♪ tinkle~', '♪ ding-ding'];
/** Seconds between chimes. */
const CHIME_COOLDOWN = 1.2;
/** How long the speech bubble lingers after the horn is released. */
const BUBBLE_LINGER = 0.35;
/** Car speed allowed in photo mode, as a fraction of top speed: a gentle creep. */
const PHOTO_CREEP = 0.15;
/** How often the viewfinder re-checks what's in frame. */
const HINT_INTERVAL = 0.25;

// ---------- renderer & scene ----------

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// Capped at 1.5: on big Retina windows full 2× resolution halves the frame rate for little visible gain.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#fde4ec', 45, 110);

const hemi = new THREE.HemisphereLight('#fff1f6', '#c8ead9', 1.6);
scene.add(hemi);

// Plays the sun by day and the moon by night (see DayNight).
const sun = new THREE.DirectionalLight('#fff4e0', 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0005;
sun.shadow.radius = 4;
scene.add(sun, sun.target);

const dayNight = new DayNight(scene, hemi, sun);

const world = new World();
scene.add(world.group);

const car = new Car(world);
scene.add(car.root);

const skids = new SkidMarks(2);
scene.add(skids.mesh);

const splashes = new Splashes(world.waterLevel);
scene.add(splashes.mesh);
let wasWet = false;

const ducks = new Ducks(world, splashes);
const wetland = new WetlandAnimals(world, splashes);
const dragonflies = new Dragonflies(world);
scene.add(ducks.group, wetland.group, dragonflies.group);

const birds = new Birds();
const squirrels = new Squirrels(world);
const owls = new Owls(world);
const fireflies = new Fireflies();
const petals = new Drift(PETALS);
const snowfall = new Drift(SNOW);
const spores = new Drift(SPORES);
const rainfall = new Drift(RAIN);
// In the snowy hills a shower falls as a proper snowstorm instead of rain.
const snowstorm = new Drift({ ...SNOW, count: 320, fall: 1.8, size: 0.5 });
const weather = new Weather();
const ambience = new Ambience();
const ambienceState = {
  biomes: Object.fromEntries(BIOMES.map((b) => [b.id, 0])) as Record<BiomeId, number>,
  darkness: 0,
  rain: 0,
};
let ambienceTimer = 0;

/** Feed the soundscape: which biomes are around (sampled a few times a second), time of day, weather. */
function updateAmbience(dt: number, active: boolean): void {
  ambienceTimer -= dt;
  if (ambienceTimer <= 0) {
    ambienceTimer = 0.25;
    for (const b of BIOMES) ambienceState.biomes[b.id] = world.biomeWeight(car.position.x, car.position.z, b.id);
  }
  ambienceState.darkness = dayNight.darkness;
  ambienceState.rain = weather.rain;
  ambience.update(dt, ambienceState, active);
}
const groundAnimals = new GroundAnimals(world);
scene.add(birds.group, squirrels.group, owls.group, fireflies.points, petals.points, snowfall.points, spores.points, rainfall.points, snowstorm.points, groundAnimals.group);

const rig = new CameraRig(window.innerWidth / window.innerHeight);
const input = new Input();
const photo = new PhotoMode(canvas);
const journal = new Journal();

// ---------- seed & UI ----------

const splash = document.querySelector<HTMLDivElement>('#splash')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const seedCurrent = document.querySelector<HTMLElement>('#seed-current')!;
const controlsSeed = document.querySelector<HTMLElement>('#controls-seed')!;
const seedChangeBtn = document.querySelector<HTMLButtonElement>('#seed-change')!;
const seedEditor = document.querySelector<HTMLElement>('#seed-editor')!;
const seedInput = document.querySelector<HTMLInputElement>('#seed-input')!;
const diceBtn = document.querySelector<HTMLButtonElement>('#seed-dice')!;
const playBtn = document.querySelector<HTMLButtonElement>('#play')!;
const speedo = new Speedometer(document.querySelector<HTMLElement>('#speedo')!);
document.querySelector<HTMLElement>('#version')!.textContent = `v${__APP_VERSION__}`;
/**
 * Touch-only devices (phones, tablets without a trackpad) can't drive yet: the game
 * needs a keyboard. They still see the game, with a banner explaining why.
 */
const unsupportedPlatform = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
const platformBanner = document.querySelector<HTMLElement>('#platform-banner')!;
/** Detection can be wrong: once closed, the banner stays closed on this browser. */
const BANNER_CLOSED_KEY = 'drivy.platformBannerClosed';
let bannerClosed = false;
try {
  bannerClosed = localStorage.getItem(BANNER_CLOSED_KEY) === '1';
} catch {
  // Storage blocked: show it (it can still be closed for this visit).
}
platformBanner.hidden = !unsupportedPlatform || bannerClosed;
document.querySelector<HTMLButtonElement>('#platform-banner-close')!.addEventListener('click', () => {
  platformBanner.hidden = true;
  count('platform_banner.closed');
  try {
    localStorage.setItem(BANNER_CLOSED_KEY, '1');
  } catch {
    // Session-only.
  }
});
const controlsDialog = document.querySelector<HTMLDialogElement>('#controls')!;
const showControlsBtn = document.querySelector<HTMLButtonElement>('#show-controls')!;
const hudHelpBtn = document.querySelector<HTMLButtonElement>('#hud-help')!;
const clockIcon = document.querySelector<HTMLElement>('#clock-icon')!;
const clockTime = document.querySelector<HTMLElement>('#clock-time')!;
const biomePill = document.querySelector<HTMLElement>('#hud-biome')!;
const biomeBanner = document.querySelector<HTMLElement>('#biome-banner')!;
const honkBubble = document.querySelector<HTMLDivElement>('#honk')!;
const horn = new Horn();
const requests = new Requests(journal);
const photobook = new Photobook();
const journalView = new JournalView(journal, requests, photobook);
const postCount = document.querySelector<HTMLElement>('#hud-post-count')!;
const showPostCount = () => (postCount.textContent = String(requests.list.length));
requests.onChange(showPostCount);
showPostCount();
const photoHud = new PhotoHud();
photo.onLockChange((locked) => photoHud.setLocked(locked));

let playing = false;
let currentSeed = '';

function loadSeed(seedText: string): void {
  currentSeed = seedText;
  seedCurrent.textContent = seedText;
  controlsSeed.textContent = seedText;
  world.setSeed(hashString(seedText));
  squirrels.clear();
  owls.clear();
  ducks.clear();
  groundAnimals.clear();
  wetland.clear();
  dragonflies.clear();
  car.reset();
  skids.clear();
  world.update(car.position, 0);
}

function seedFromUrl(): string | null {
  const s = new URLSearchParams(window.location.search).get('seed');
  return s && s.trim() ? s.trim() : null;
}

function startGame(): void {
  audioContext(); // unlock sound on this click so ambient night sounds can play
  const seedText = seedInput.value.trim() || randomSeedName();
  seedInput.value = seedText;
  // Which world people play: the random one they were given, a shared ?seed= link, or their own.
  const seedKind = seedText !== startSeed ? 'custom' : seedFromUrl() ? 'shared' : 'random';
  count('game.start', 1, { seed: seedKind });
  if (seedText !== currentSeed) loadSeed(seedText);
  else {
    car.reset();
    skids.clear();
  }

  splash.classList.add('hidden');
  hud.classList.remove('hidden');
  rig.mode = 'follow';
  playing = true;
  // Drop focus from the menu (including the seed box, if Enter started the game) so keys drive the car.
  (document.activeElement as HTMLElement | null)?.blur();
}

function setPhotoMode(on: boolean): void {
  if (on) photo.enter();
  else photo.exit();
  photoHud.show(on);
  photoHud.setLocked(photo.locked);
  car.speedLimit = on ? PHOTO_CREEP : 1;
}

/** Dialogs need the mouse back, so leave pointer lock (photo mode itself stays on). */
function openDialog(toggle: () => void): void {
  photo.releasePointer();
  toggle();
}

function showMenu(): void {
  setPhotoMode(false);
  playing = false;
  rig.mode = 'menu';
  splash.classList.remove('hidden');
  hud.classList.add('hidden');
  playBtn.focus();
}

// The seed stays tucked away: a small "change seed" link reveals the editor.
seedChangeBtn.addEventListener('click', () => {
  const open = seedEditor.hidden;
  seedEditor.hidden = !open;
  seedChangeBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    seedInput.focus();
    seedInput.select();
  }
});
diceBtn.addEventListener('click', () => {
  seedInput.value = randomSeedName();
  loadSeed(seedInput.value);
  count('seed.change', 1, { method: 'dice' });
});
seedInput.addEventListener('change', () => {
  const s = seedInput.value.trim();
  if (s && s !== currentSeed) {
    loadSeed(s);
    count('seed.change', 1, { method: 'typed' });
  }
});
seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
});
playBtn.addEventListener('click', startGame);

function toggleControls(): void {
  if (controlsDialog.open) controlsDialog.close();
  else controlsDialog.showModal();
}
showControlsBtn.addEventListener('click', toggleControls);
document.querySelector('#show-journal')!.addEventListener('click', () => journalView.toggle());
const hudJournalBtn = document.querySelector<HTMLButtonElement>('#hud-journal')!;
document.querySelector<HTMLButtonElement>('#hud-post')!.addEventListener('click', (e) => {
  (e.currentTarget as HTMLButtonElement).blur();
  journalView.toggle();
});
hudJournalBtn.addEventListener('click', () => {
  hudJournalBtn.blur();
  journalView.toggle();
});
hudHelpBtn.addEventListener('click', () => {
  hudHelpBtn.blur();
  toggleControls();
});
controlsDialog.addEventListener('close', () => {
  if (!playing) showControlsBtn.focus();
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const dialogOpen = controlsDialog.open || journalView.open;
  if (e.code === 'KeyH' || e.key === '?') {
    e.preventDefault();
    if (!journalView.open) openDialog(toggleControls);
  } else if (e.code === 'KeyJ' && !e.repeat) {
    if (!controlsDialog.open) openDialog(() => journalView.toggle());
  } else if (e.code === 'KeyC' && !e.repeat && playing && !dialogOpen) {
    setPhotoMode(!photo.active);
  } else if (e.code === 'Space' && photo.active && !dialogOpen) {
    e.preventDefault();
    photo.requestShot();
  } else if (e.code === 'KeyQ' && !e.repeat && playing && !dialogOpen) {
    chime();
  } else if (e.code === 'KeyF' && !e.repeat && playing && !dialogOpen) {
    photoHud.keep(); // keep the photo on show (if any) in the photobook
  } else if (e.code === 'KeyM' && !e.repeat) {
    showMuted(ambience.toggleMute());
  } else if (e.code === 'KeyL' && !e.repeat && playing && !dialogOpen) {
    speedo.setHeadlights(car.toggleHeadlights());
  } else if (e.key === 'Escape' && playing && !dialogOpen) {
    // With a dialog open, Esc just closes it (native <dialog> behaviour).
    // In photo mode, Esc goes back to driving rather than to the menu.
    if (photo.active) setPhotoMode(false);
    else showMenu();
  }
});

seedInput.value = seedFromUrl() ?? randomSeedName();
const startSeed = seedInput.value;
loadSeed(seedInput.value);
rig.snap(car.position);
warmUpShaders(renderer, scene, rig.camera, [petals.points, snowfall.points, spores.points, rainfall.points, snowstorm.points, fireflies.points]);

// ---------- metrics ----------

const session = new SessionMetrics();
const VISITED_KEY = 'drivy.visited';
{
  let returning = false;
  try {
    returning = localStorage.getItem(VISITED_KEY) === '1';
    localStorage.setItem(VISITED_KEY, '1');
  } catch {
    // Storage blocked: count it as a first visit.
  }
  count('visit', 1, { returning, touchOnly: unsupportedPlatform });
  gauge('journal.species_found', journal.progress().species);
}

// Keeping a snapshot (F while its polaroid is up) puts it in the photobook.
photoHud.onKeep = (info) => {
  void photobook.add({
    snapshot: info.snapshot,
    takenAt: Date.now(),
    clock: shownClock,
    biome: currentBiome ?? world.dominantBiome(car.position.x, car.position.z),
    seed: currentSeed,
    subject: info.species,
    stars: info.stars,
  });
  count('photobook.kept', 1, { subject: info.species ?? 'none' });
};

function trackPhoto(species: string | null, stars: number, result: RecordResult | null, requestsDone: number): void {
  count('photo.taken', 1, { subject: species ?? 'none', stars });
  if (!species || !result) return;
  if (result.newSpecies) {
    const def = SPECIES.find((s) => s.id === species);
    count('journal.new_species', 1, { species, biome: def?.biome ?? 'unknown', legendary: !!def?.legendary });
    gauge('journal.species_found', journal.progress().species);
  }
  if (result.newBehaviors.length) count('journal.new_behavior', result.newBehaviors.length, { species });
  if (requestsDone) count('request.completed', requestsDone);
}

// ---------- loop ----------

const timer = new THREE.Timer();
timer.connect(document);
const nearby: Collider[] = [];
const rearWheels: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
const groundFocus = new THREE.Vector3();
const bubbleAnchor = new THREE.Vector3();
let bubbleTime = 0;

let wasNight = dayNight.isNight;
let shownClock = '';

/** Keep the HUD clock current and switch headlights on at dusk / off at dawn. */
function updateNightfall(): void {
  const night = dayNight.isNight;
  if (night !== wasNight) {
    wasNight = night;
    if (car.headlightsOn !== night) speedo.setHeadlights(car.toggleHeadlights());
  }
  const clock = dayNight.clock;
  if (clock !== shownClock) {
    shownClock = clock;
    clockTime.textContent = clock;
    clockIcon.textContent = weather.isRaining ? '🌧️' : night ? '🌙' : '☀️';
  }
}

const subjects: Subject[] = [];
let hintTimer = 0;

/** Every animal that could be in a photo right now. */
function collectSubjects(): Subject[] {
  subjects.length = 0;
  ducks.collectSubjects(subjects);
  squirrels.collectSubjects(subjects);
  birds.collectSubjects(subjects);
  owls.collectSubjects(subjects);
  fireflies.collectSubjects(subjects);
  groundAnimals.collectSubjects(subjects);
  wetland.collectSubjects(subjects);
  dragonflies.collectSubjects(subjects);
  return subjects;
}

function lighting() {
  const t = dayNight.time;
  return { goldenHour: (t > 0.25 && t < 0.33) || (t > 0.68 && t < 0.76), night: dayNight.isNight, rain: weather.isRaining };
}

/** Grab the frame that was just rendered as a 4:3 JPEG (call right after rendering). */

/** Live viewfinder hint: what's in frame and how many stars it would get. */
function updatePhotoHint(dt: number): void {
  if (!photo.ready) return;
  photoHud.setZoom(photo.zoom);
  hintTimer -= dt;
  if (hintTimer > 0) return;
  hintTimer = HINT_INTERVAL;
  // A quick preview: skip the occlusion raycasts (the real shutter still does them).
  const shot = scoreShot(photo.camera, collectSubjects(), null, lighting());
  const id = shot.subject?.species ?? null;
  photoHud.setHint(id, shot.stars, id ? !!journal.entry(id) : false);
}

const muteBtn = document.querySelector<HTMLButtonElement>('#hud-mute')!;
/** Reflect the ambience mute state on the HUD button. */
function showMuted(muted: boolean): void {
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.title = muted ? 'Nature sounds off (M)' : 'Nature sounds on (M)';
}
muteBtn.addEventListener('click', () => {
  muteBtn.blur();
  showMuted(ambience.toggleMute());
});
showMuted(ambience.muted);

let currentBiome: BiomeId | null = null;
let biomeTimer = 0;
let bannerTimer = 0;

/** Track which biome the car is in: update the HUD pill, celebrate first visits. */
function updateBiome(dt: number): void {
  biomeTimer -= dt;
  if (biomeTimer > 0) return;
  biomeTimer = 0.5;
  const id = world.dominantBiome(car.position.x, car.position.z);
  if (id === currentBiome) return;
  currentBiome = id;
  const def = biome(id);
  biomePill.textContent = `${def.emoji} ${def.name}`;
  if (playing && journal.visitBiome(id)) {
    count('biome.discovered', 1, { biome: id });
    requests.refill(); // a new biome opens up new requests
    biomeBanner.innerHTML = `<span class="bb-emoji">${def.emoji}</span><strong>${def.name}</strong><small>New biome discovered! New animals to find.</small>`;
    biomeBanner.classList.add('show');
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => biomeBanner.classList.remove('show'), 3800);
  }
}

/** What the animals can sense about the car this frame. */
const presence: CarPresence = {
  position: car.position,
  speed: 0,
  difficulty: 0,
  velocity: car.velocity,
  camera: rig.camera.position,
};

// The world's structures make the odd sound of their own (a foghorn answering a honk…).
const STRUCTURE_SOUNDS = { foghorn: playFoghorn, echo: playEcho, bells: playBells, twinkle: playTwinkle, poof: playPoof };
world.structures.onSound((sound, volume) => STRUCTURE_SOUNDS[sound](volume));
const structureContext = { time: 0, car: car.position, carSpeed: 0, darkness: 0, rain: 0 };

// Drove into an animal: a cartoon sound (never a hurt one), and a note for the stats.
onBonk((style, species) => {
  if (style === 'squash') playSquash();
  else playLaunch();
  count('animal.bonk', 1, { style, species });
});
let chimeCooldown = 0;

/** Ring the soft chime: curious animals nearby turn to look (and calm down a little). */
function chime(): void {
  if (chimeCooldown > 0) return;
  chimeCooldown = CHIME_COOLDOWN;
  count('chime');
  playChime();
  speedo.wake();
  squirrels.chime(car.position);
  ducks.chime(car.position);
  owls.chime(car.position);
  groundAnimals.chime(car.position);
  wetland.chime(car.position);
  fireflies.attract(car.position);
  popHonkBubble(CHIME_WORDS);
  bubbleTime = BUBBLE_LINGER * 3;
}

function popHonkBubble(words = HONK_WORDS): void {
  honkBubble.textContent = words[Math.floor(Math.random() * words.length)];
  // Restart the pop animation even if the bubble is already showing.
  honkBubble.classList.remove('show');
  void honkBubble.offsetWidth;
  honkBubble.classList.add('show');
}

function updateHonkBubble(dt: number, honking: boolean): void {
  if (bubbleTime <= 0) return;
  bubbleTime = honking ? BUBBLE_LINGER : bubbleTime - dt;
  if (bubbleTime <= 0) {
    honkBubble.classList.remove('show');
    return;
  }
  bubbleAnchor.copy(car.position).setY(car.position.y + 3.8).project(rig.camera);
  honkBubble.style.left = `${((bubbleAnchor.x + 1) / 2) * window.innerWidth}px`;
  honkBubble.style.top = `${((1 - bubbleAnchor.y) / 2) * window.innerHeight}px`;
}

function frame(timestamp: number): void {
  timer.update(timestamp);
  // Dialogs pause the game (but the menu backdrop keeps idling).
  const paused = playing && (controlsDialog.open || journalView.open);
  const rawDt = timer.getDelta();
  const dt = paused ? 0 : Math.min(rawDt, 1 / 20);
  session.tick(rawDt, playing && !paused);

  const honking = playing && !paused && input.honk;
  chimeCooldown = Math.max(0, chimeCooldown - dt);
  presence.speed = playing ? car.velocity.length() : 0;
  presence.difficulty = world.difficultyAt(car.position.x, car.position.z);
  if (car.setHorn(honking)) {
    count('honk');
    horn.start();
    world.structures.honk(car.position);
    speedo.wake();
    birds.scare(car.position);
    squirrels.scare(car.position);
    owls.scare(car.position);
    ducks.scare(car.position);
    groundAnimals.scare(car.position);
    wetland.scare(car.position);
    dragonflies.scare(car.position);
    fireflies.scare(car.position);
    popHonkBubble();
    bubbleTime = BUBBLE_LINGER;
  } else if (!honking) {
    horn.stop();
  }

  if (!paused) {
    // In photo mode Space is the shutter, not the handbrake.
    const drive: DriveInput = !playing ? IDLE : photo.active ? { throttle: input.throttle, steer: input.steer, handbrake: false } : input;
    car.update(dt, drive);
    world.collidersNear(car.position.x, car.position.z, 2, nearby);
    for (const hit of car.resolveCollisions(nearby)) {
      world.bump(hit.collider, hit.dirX, hit.dirZ, hit.strength);
      rig.shake(hit.strength / 40);
      if (hit.strength > 6) speedo.bump();
    }
    // No tyre marks on water; splashes instead.
    const wheels = car.rearWheelPositions(rearWheels);
    const wet = car.wetness > 0.05;
    skids.update(dt, wheels, wet ? 0 : car.skid);
    const speed = car.velocity.length();
    if (wet && !wasWet && speed > 5) splashes.burst(car.position.x, car.position.z, 26, 1.6);
    if (wet && speed > 1.5) splashes.spray(dt, wheels, speed * 2.6 * car.wetness);
    wasWet = wet;
    splashes.update(dt);
    birds.update(dt, car.position, !dayNight.isNight);
    speedo.update(dt, car.velocity.length(), car.speed, car.handbrake, car.skid);
  }

  world.update(car.position, dt);
  structureContext.time += dt;
  structureContext.carSpeed = playing ? car.velocity.length() : 0;
  structureContext.darkness = dayNight.darkness;
  structureContext.rain = weather.rain;
  world.structures.update(structureContext, dt);
  updateWater(dt);
  // Ambience plays in the game and on the menu, and hushes while a dialog is open.
  updateAmbience(dt, !paused);
  if (!paused) {
    weather.update(dt);
    dayNight.rain = weather.rain;
    dayNight.update(dt, playing && input.fastForward);
    updateNightfall();
    squirrels.update(dt, car.position, dayNight.isNight, presence);
    owls.update(dt, car.position, dayNight.darkness, presence);
    ducks.update(dt, car.position, dayNight.darkness, presence);
    groundAnimals.update(dt, car.position, dayNight.darkness, presence);
    wetland.update(dt, car.position, presence, weather.rain);
    dragonflies.update(dt, car.position, dayNight.darkness < 0.5);
    fireflies.update(dt, car.position, dayNight.darkness, world);
    const cx = car.position.x;
    const cz = car.position.z;
    petals.update(dt, car.position, world.biomeWeight(cx, cz, 'blossom'));
    const snowy = world.biomeWeight(cx, cz, 'snow');
    snowfall.update(dt, car.position, snowy);
    snowstorm.update(dt, car.position, snowy * weather.rain);
    rainfall.update(dt, car.position, (1 - snowy) * weather.rain);
    // Spores glow brighter after dark, along with the mushroom caps.
    spores.update(dt, car.position, world.biomeWeight(cx, cz, 'mushroom'), 0.45 + 0.55 * dayNight.darkness);
    setNightGlow(dayNight.darkness);
    updateBiome(dt);
  }
  // Follow the car along the ground so honk hops don't bob the camera.
  groundFocus.set(car.position.x, car.ground, car.position.z);
  rig.update(dt, groundFocus, car.velocity);
  photo.update(dt, car.root, rig.camera);
  // Seen from the roof, the car itself only gets in the way.
  car.setShellVisible(!photo.ready);
  updateHonkBubble(dt, honking);
  updatePhotoHint(dt);

  sun.position.copy(car.position).add(dayNight.lightOffset);
  sun.target.position.copy(car.position);

  // Score the shot from exactly this frame's camera, then capture what gets rendered.
  const shot = photo.takeShot() ? scoreShot(photo.camera, collectSubjects(), world.group, lighting()) : null;
  renderer.render(scene, photo.showing ? photo.camera : rig.camera);
  if (shot) {
    // Grab the pixels now (before the frame is presented), encode them off the render path.
    const grabbed = grabFrame(renderer.domElement);
    playShutter();
    photoHud.shutter();
    void develop(shot, grabbed, lighting(), currentSeed);
  }
  requestAnimationFrame(frame);
}

/** The polaroid's thumbnail URL, released when the next photo replaces it. */
let previewUrl: string | null = null;

/** Encode a snapped photo, file it in the journal and requests, and show the polaroid. */
async function develop(shot: NonNullable<ReturnType<typeof scoreShot>>, grabbed: Frame, light: ReturnType<typeof lighting>, seed: string): Promise<void> {
  const snapshot = await encodeFrame(grabbed);
  const sp = shot.subject?.species ?? null;
  const result = sp ? journal.record({ species: sp, stars: shot.stars, behaviors: shot.behaviors, snapshot, seed }) : null;
  const done = sp ? requests.submit({ species: sp, stars: shot.stars, behaviors: shot.behaviors, ...light }) : [];
  trackPhoto(sp, shot.stars, result, done.length);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(snapshot.thumb);
  photoHud.showPhoto({
    requests: done.map((r) => r.text),
    image: previewUrl,
    snapshot,
    species: sp,
    stars: shot.stars,
    behaviors: shot.behaviors,
    result,
  });
}
requestAnimationFrame(frame);

// Dev-only handle for poking at the game from the browser console (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { drivy: { car, world, rig, groundAnimals, wetland, ducks } });

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.resize(window.innerWidth / window.innerHeight);
  photo.resize(window.innerWidth / window.innerHeight);
});
