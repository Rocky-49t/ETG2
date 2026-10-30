# Escape the Goanrooms II

A first-person, Backrooms-inspired co-op survival horror game for the browser.
Sequel to *Escape the Goanrooms*. Built with Three.js and the Web Audio API,
no build step, hosted as a static site (GitHub Pages). Peer-to-peer co-op over
WebRTC (PeerJS), with no game server needed.

> The machine was supposed to bring you back.

**Story.** The Goanrooms sit in a dimensional web alongside Earth and the
Tufferverse. In 2013 the Ririqian Brotherhood, led by Supreme Leader Rucky Rucky,
fled into them to escape Tufflandia. Tufflandia quietly told the United States,
and the US now sends expeditions in through the **Goaning Machine** at Site
Kestrel. You are on one of them. The transfer went wrong.

## Play

- **Online:** enable GitHub Pages for this repository (Settings → Pages → Source: *GitHub Actions*). The included workflow (`.github/workflows/pages.yml`) deploys on every push to `main`.
- **Locally:** serve the folder with any static server, then open `http://localhost:8080`:

  ```bash
  python3 -m http.server 8080
  ```

  (Opening `index.html` straight from disk won't work: ES modules and workers need HTTP.)

Dev shortcuts: `?solo=1&level=L3&seed=MYSEED&difficulty=hard` jumps straight into a level. `&class=scout` picks a role, `&god=1` disables damage, `&quality=low` for slow machines.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / C / Space | Move · sprint (loud) · crouch (silent) · jump (swim up/down in water) |
| Mouse | Look · **LMB** use/attack/throw · **RMB** aim down sights, or focus the flashlight beam with empty hands / flashlight |
| F | Toggle flashlight |
| E | Interact · hide in lockers · hold to revive teammates |
| R | Reload |
| 1–8 / wheel | Hotbar (7–8 are holster slots for roles that have them) |
| Tab / I | Inventory and crafting (click to select then click a slot to move, drag & drop, right-click to use, shift-click to quick-move). E or Tab closes it |
| G | Drop held item (Shift+G drops the whole stack) |
| J | Journal (collected notes) |
| T / Enter | Chat (co-op) |
| X (hold) | Respawn now when downed or dead (skip waiting for a revive) |
| Esc | Pause / settings · closes chat |
| ` | Cheat console (see below) |

Every binding can be changed in **Settings → Controls**.

## The run

**Prologue (Site Kestrel).** A short playable intro: walk through the lab,
pick your role in the equipment bay, step into the Goaning Machine and ride the
transfer down into Level 0. Skippable in solo; toggle it in the co-op lobby.

**Roles.** Soldier (rifle and pistol in two gun-only holsters, a ballistic vest
that slows you), Field Medic (stronger healing, faster revives, self-revive
shots), Scout (two ready-made Location Transmitters, faster and quieter),
Engineer (crowbar, parts, longer batteries, full repairs), Researcher (slower
sanity loss, senses exits from farther away, decrypts corrupted files).

**Crafting.** The inventory has a crafting panel with clear requirements. The
key recipe is the **Location Transmitter** (GPS board + antenna + battery): it
shows your coordinates and every teammate's, refreshed every few seconds.
Other recipes include clean water, bandages, medkits, knives, decoys,
glowsticks, a scrap vest and duct tape.

| Level | Atmosphere | Threat | Exit |
| --- | --- | --- | --- |
| **0: The Lobby** | Mono-yellow office space: wallpaper, damp carpet, humming fluorescents; partitions, rare rooms with doors, tall-ceilinged atrium halls, storerooms. You arrive in the wrecked Goaning Machine | **The Hush**: blind, hunts by sound. Crouch past it. *(easy)* | Round pits "where the carpet forgets to hold", shafts that fade to black: one guaranteed 2–3 chunks out, plus more scattered through the level. Follow the spray-painted EXIT arrows and the sound of the draft. |
| **1: Industrial Tunnels** | Brick service corridors, pipes, steam vents (they scald), machine halls, generator and workshop rooms, and abandoned train stations with long tunnels | **Marrowhounds**: bone dogs in packs; fire keeps them off. **The Scuttler**: a fast spider with a dozen red eyes that freezes while a flashlight is held on it, most common near stations. *(medium)* | The **service door**, opened with a keycard from the foreman's office or a break room. |
| **2: Offices & Sewers** | Cubicle farms, numbered offices, conference, break, storage and plant rooms, dark office blocks; usable corrupted computers and wall phones; long sewers reached by ladder holes and stairs, with rusted side rooms | **The Inkwalker**: a persistent black skeleton (more of them in the sewers). A flashlight held on its skull stuns it. A rare pale draught from the vending machines makes it ignore you for 10 minutes. Dial **1143141967** on a wall phone and something pale comes to see you; do not hurt it. *(hard)* | The **stairwell** (find a fuse in a sewer pump room), or rare doors marked **LEVEL 3**. |
| **3: Pool Rooms** | White-tiled halls, clear pools with caustics and railings, raised ledges, flooded corridors, blue halls of deep dark water, skylights onto a sky that isn't there | **The Undertow**: hunts swimmers and lunges at people standing at the pool edge. It gurgles as it closes in. *(hard if it gets you, easy to avoid)* | The **main drain** at the bottom of the deepest pool (drain valve key from a pump room), or a rare long spiral staircase up to a hatch. Both lead to Level 4. |
| **4: The Quiet Rooms** | Beige walls, gray carpet, a gray-green ceiling; windows onto a painted sky throwing daylight across the floor, and darkness everywhere else. Empty rooms, dead restaurants, storage units, staircases to nowhere | **Platinum snakes**: strike only when you're close, and speed up each time a bullet hits them (knives don't). Harmless figures stand behind the windows when your sanity is low. | **Toll rooms**: press the plates in the order the lock hums or lists, and the vault opens onto the LEVEL 5 door. They re-seal with a new order when you come back. |
| **5: The Sky Bridge** | A colossal bridge over an endless fog void, wind gusts, lanterns, and around it an endless network of platforms on giant columns joined by bridges and stairs | **The Goaner**: three-phase boss (see below) | Defeat the Goaner. The gate beyond the arena opens. |

**More than one way out.** Every level except the Sky Bridge has secondary exits generated with the rest of the map: extra pits on Level 0, maintenance hatches on Level 1 (force one open, or pry it with a crowbar), LEVEL 3 doors on Level 2, the spiral staircase on Level 3 and several toll rooms on Level 4. Rare **back doors** lead up a level (L1→L0, L2→L0, L3→L2, L4→L3), and lone doorways on far Sky Bridge platforms lead to Levels 0, 1 and 3. Each level paints its exit signs in its own style. Exits breathe a cold draft you can hear from about 40 m away, EXIT arrows are painted beside the doorway that leads toward the nearest exit (so they chain room to room), and objective items (keycard, fuse, valve key) chirp softly when you're close.

**Rare:** **The Lookalike** wears a teammate's shape (yours, when you're alone). It only moves while nobody is looking at it, and a sustained flashlight beam makes it come apart.

### The Goaner (boss)
A goat-headed, wasp-bodied chimera on six bone legs, faithful to the original's look (amber chitin, bone chest, yellow goat head, wings, black stinger), now with horns and a glowing sac under its back plates.

- **Phase I: Presence.** It circles the dark arena, swoops and stalks. It takes very little damage unless it's **lit**: power the **floodlight towers** (they overheat after ~40 s), throw **flares** near it, or focus a flashlight on it. Its plates open and the sac glows while it's exposed.
- **Phase II: Rage.** Telegraphed charges across the arena (a red line on the floor), and it smashes floodlight towers.
- **Phase III: Collapse.** Sections of the platform crack and fall. Debris drops (red rings). Stinger slams (big red circle, jump the shockwave) leave it **stuck**, and it takes heavy damage from any source while stuck.
- Health scales with player count. There's a checkpoint at the gatehouse, and the fight resets if everyone leaves or dies.

## Survival

- **Health, stamina, hunger, thirst, sanity, oxygen.** Hunger and thirst drain slowly (about 30 and 18 minutes). Bandages heal over time and stop bleeding.
- **Sanity** drains in darkness and near entities. Low sanity brings whispers, phantom footsteps, a heartbeat, shadow figures that vanish when stared at, and visual distortion. Light, teammates, water (clean more than dirty) and painkillers help.
- **Noise** is a resource. Crouching is silent; walking, sprinting, landing, doors, reloading and gunfire all emit noise that entities hear, muffled by walls.
- **Food and drink:** dirty and clean water, Fire Salts (L1), Blueberry Fire Salts (L3), Goan Juice and Vigor Tonic (L4), and more. Item counts scale with the number of players.
- **Inventory:** 6-slot hotbar (+2 holster slots for some roles) plus a 20-slot backpack. Items stack. Weapons have ammo or durability (repair with duct tape); flashlights use batteries; lighters use fuel. You can search containers (boxes, filing cabinets, crates, toolboxes) and store items in them.
- **Death:** you wake up again on the same level and keep your inventory, just farther from the team. In co-op you're downed first (45 s to be revived with E); hold **X** to give up and respawn straight away.
- **Movement:** jumps are buffered and forgiving at ledges; hold jump while swimming into a pool edge to haul yourself out.

## Co-op multiplayer

Host-authoritative, star topology. The host simulates entities, the director, world objects (pickups, containers, doors, lockers), level flags and the boss. Each player simulates their own movement, stats, inventory and weapon hit detection, and sends hits and interactions to the host. Remote players and entities are interpolated about 100 ms behind.

- **Host Co-op:** choose a connection, create the room, share the 5-letter code. Set seed, difficulty and friendly fire, then start when everyone is ready.
- **Join Co-op:** enter the code. Late joining works: you spawn next to the host with the current world state.
- Players can be in **different levels** at once. The host keeps simulating every occupied level.
- There's text chat in the lobby, in game and on loading screens, plus nameplates (with roles), a team list, downing and reviving. Flashlights, gunfire effects, bullet holes and eating/drinking are visible to everyone.

**Connection modes**
- **Online (PeerJS):** WebRTC data channels. Signalling uses the free public PeerJS cloud server (`0.peerjs.com`) and Google's public STUN servers. **Limitations:** you need internet access to the signalling server (only for the handshake). There's no TURN relay, so players behind symmetric NATs or strict corporate firewalls may fail to connect. The public server can be rate-limited or down; you can self-host a `peerjs-server` and pass its host to `new Peer()` in `src/net/session.js`. The host's upload bandwidth carries everyone, which is fine for small groups (1–6 is the sweet spot; there's no hard cap).
- **Local tabs:** `BroadcastChannel` between tabs of the same browser. No network at all. Useful for testing and same-machine demos.

## Graphics

- **Procedural PBR textures:** every surface is painted at load time on a Web Worker pool (albedo, normal from height, roughness/metalness, emissive) and tiles seamlessly. A world-space noise variation in the shader breaks up visible repetition.
- **Baked + dynamic lighting:** chunk geometry stores per-vertex baked irradiance (fixture light pools with tile-occlusion, plus ambient occlusion from wall corners, floors and ceilings), patched into `MeshStandardMaterial`. The nearest fixtures also get real point lights from a fixed-size pool, so there are specular highlights and normal-mapped detail. Flickering and broken fixtures are dynamic-only. Blackouts dim everything.
- **Flashlight:** shadow-casting spotlight with a projected lens cookie, battery drain, flicker and a focused beam.
- **Post-processing:** GTAO (High), bloom, ACES tone mapping and a custom grade pass (lift/gamma/gain, vignette, film grain, chromatic aberration, sanity warping and ghosting, underwater tint, damage and downed effects).
- **Water:** dual-scrolling normals, fresnel, environment reflections, caustics on submerged tiles and underwater fog.
- **Also:** particles (dust motes, sparks, blood/ichor/bone, splashes, steam, embers, debris, shockwaves), tracers, bullet holes, decals (graffiti, arrows, stains, handprints), procedurally modelled props, weapons, viewmodel hands, avatars and creatures, all with procedural animation.
- **Presets:** Low, Medium and High (resolution scale, texture size, shadows, dynamic light count, bloom, AO, view distance, particle density). Settings also cover brightness, field of view, head bob, an "intense visual effects" toggle and an FPS/draw-call meter.
- **Set dressing:** besides furniture and machinery, levels scatter environmental storytelling: the remains of earlier wanderers and abandoned camps, each with a backpack to search and sometimes a note.

## Audio
Everything is synthesized with the Web Audio API: per-level ambience beds (mains hum, machinery drones, HVAC and sewer water, lapping pools, wind), HRTF-spatialized one-shots with wall occlusion, a reverb bus per level, footsteps per surface, weapons, reloads, impacts, creature vocalisations (clicks, shrieks, growls, howls, gurgles, the Goaner's roar and bleat, wing buzz), a tension drone driven by threat, horror stingers, whispers and heartbeat. Underwater and hiding apply a muffle filter.

## Cheat console
Press **`** to open it. It's always available in solo. In co-op the host runs `cheats on` (enabling cheats for themselves), then `grant <player|number|all>` and `revoke <player|all>` to share access; `players` lists everyone and their status. The host re-checks permission on every request that touches shared state, so a client can't spawn creatures without being granted. Tab completes, arrow keys walk the history.

| Command | Effect |
| --- | --- |
| `give <item> [qty]`, `items` | Add an item / list item ids |
| `heal`, `god`, `notarget` | Restore all stats · invulnerability · creatures ignore you |
| `fly`, `noclip`, `speed <x>` | Fly with collision (Space/C) · fly through walls · speed multiplier |
| `ammo`, `sanity <n>` | Refill magazines, durability, battery and fuel · set sanity |
| `level <id\|next>` | Travel to L0, L1, L2, L3, L5 |
| `tp <x> <z>`, `tp exit`, `tp key`, `tp <player>`, `pos` | Teleport · print position |
| `spawn <entity> [n]`, `entities`, `killall` | Spawn creatures in front of you · list types · kill everything on the level |
| `flag <name> [0\|1]` | Set a level flag (`serviceDoor`, `power`, `stairOpen`, `drainOpen`, `bossDead`) |

## Project structure

```
index.html            UI shell + import map (Three.js vendored in /vendor)
css/style.css
src/
  main.js             app: boot, attract-mode menu, start solo/host/join, global keys
  core/               engine (renderer + loop + presets), input, settings, rng/noise, events
  gfx/                texgen (worker-safe painter), recipes, textures (worker pool),
                      materials (baked-light patch, decal atlas), postfx, lights (pool), water
  world/              chunk data, level instance (collision, raycasts, A*), generation helpers,
                      mesher (geometry + baking), builder, props, renderer (streaming)
  world/levels/       prologue, level0..level5 + common helpers + registry (index.js)
  world/machine.js    the Goaning Machine (prologue and Level 0 wreck)
  game/               game session (host/client logic), player controller, stats, inventory,
                      items + icons, weapons, viewmodel, models, objects, world state,
                      effects, player lights, sanity, avatar, remote players, notes (lore),
                      classes (roles), crafting
  ai/                 brain (perception/steering), manager (host sim), views (client),
                      director (tension), entities/* (one module per creature)
  audio/              engine, sfx recipes, ambience profiles
  net/session.js      PeerJS + BroadcastChannel transports
  ui/                 HUD, screens/modals, menus (settings, keybinds, customization), lobby,
                      cheat console, computer.js (L2 computers and phones)
tools/                dev harnesses (screenshots, multiplayer smoke test, syntax check)
```

### Extending
- **Level:** copy a level module, implement `generate(chunk, ctx)` (2 m tiles, 16×16 per chunk; use `world/gen.js` for ports and connectivity and `levels/common.js` for lights, decals and objects), define `palette`, `materials`, lighting and grade, `landmarks()` for exits and keys, then register it in `world/levels/index.js` and point the previous level's `next` at it.
- **Entity:** add `ai/entities/<name>.js` with `think()` (host AI, using `ai/brain.js`), `build()` / `animate()` (visuals), `hit` spheres, `resist` and sounds, then register it in `ai/entities/index.js`. Use it from a level's `entities.primary`, or spawn it from level logic.
- **Item:** add an entry to `game/items.js` (type-driven behaviour), an icon case and an optional 3D model in `game/models.js`. Weapons go in `game/weapons.js`.
- **Prop:** `registerProps({ name: { colliders, build(p, B) } })`. Geometry is merged into chunk meshes automatically.
- **Sound:** add a recipe to `audio/sfx.js`.

### Dev tools
These need Node and Playwright, plus a static server on port 8080.

```bash
./tools/check.sh
```
Syntax-checks every module.

```bash
node tools/play.cjs "solo=1&level=L2" out.png 10 [script.js] [after]
```
Screenshots the game, optionally after running a script.

```bash
node tools/mp.cjs
```
Two-tab co-op smoke test over the local transport.

## Status and known limitations
This is a prototype of the full game.
- The victory screen after the Goaner is a temporary ending.
- Online play relies on the public PeerJS signalling server and has no TURN fallback (see above).
- Client hit detection is trusted by the host (fine for co-op, not cheat-proof).
- Thrown objects are simulated independently on each peer from the same initial state. They settle in the same place almost always, but aren't strictly synchronized.
- Planar reflections aren't used. Water reflects a per-level environment map, to keep frame rates up.
- Texture generation runs on every load (cached in memory for the session only).
