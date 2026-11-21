# Solis Bay — Design & Kit Architecture Plan

**Game file:** `src/games/solis-bay.js` (single-file, code-drawn Next Gen 3D, WebGPU + WebGL)  
**Definition:** `id: 'solis-bay'`, `title: 'Solis Bay'`, `tag: 'Next Gen · Action'`, `retro: true, era: 'nextgen', pal: 'grape'`, `goal: 100` (Rep)  
**Setting:** **Solis Bay** — a sun-soaked coastal Florida metropolis inspired by South Florida's barrier beaches, art-deco strip, bay causeways, deepwater marinas, and cypress swamp edge. All names, districts, gangs, characters, brands, and radio stations are 100% original.

---

## 1. City Layout (`gs.city.Metro` — 5 Districts + Bay Coast + Beltway)

All districts stream incrementally round the camera (`Metro` with `coast: 'bay'`, `climate: 'tropical'`, `sea: true`, `Standins` + `Skyline`), with **Coral Strip** out on the barrier island across the bay (reached by causeways that boats pass under) and ringed by the elevated *I-905 Bayshore Beltway* (`ring` + `ramps`).

| District | `STYLES` Preset & Feel | Landmarks & Threats |
| --- | --- | --- |
| **Coral Strip** (`style: 'beach'`) | Pastel art-deco hotels lit with neon at night, palm promenade, sandy beach with parasols/loungers/lifeguard huts down into the surf | *Pastel Crew* street racers; beachfront boardwalk foot traffic |
| **Glass Quarter** (`style: 'downtown'`) | Financial high-rises, glass lobbies, elevated highway slip ramps, plaza shortcuts | Dense rush-hour lanes, rooftop terraces, high-visibility police corridors |
| **Old Naranja** (`style: 'oldtown'`) | Stucco & terracotta canal blocks, 24h diners, corner bodegas, tight alleyways | *Tia Carmen's Diner* safehouse; quick line-of-sight breaks in alleys |
| **Pelican Marina** (`style: 'marina'`) | Waterfront towers on a quay with wooden/concrete piers and boat berths facing the bay | *La Flota Roja* smugglers; boat hijackings & causeway water escapes |
| **Sawgrass Edge** (`style: 'glades'`) | Low wetland town round ponds with reeds, bald cypresses, and chop-shop warehouses | *Sawgrass Salvage* crew; ambush warehouses & off-road swamp rim |

**Original Factions & Brands:** **SBPD** & **Bay Harbor Patrol** (law), *La Flota Roja*, *Pastel Crew*, *Sawgrass Salvage*; *Flamingo Motors*, *Caña Cola*, *Pelican Marine*, *Tropic Sunshade*, *Bayside Bail Bonds*.

---

## 2. Two Playable Leads

Players can tap the HUD lead badge (kept outside `api.scoreArea()`) when out of direct arrest range to switch between **Mako** and **Nadia**. Both leads stay persisted in `WorldSave`; cross-district swaps call `metro.switchTo(otherLead)` + `view.cut()` behind a brief transition so far districts are freed first and zero shaders are built mid-play.

- **Mateo "Mako" Delgado (29)** — Former marina tugboat & stunt wheelman scapegoated on a harbour container job. Starts at **Pelican Marina**.  
  *Trait — Wheelman & Water Rat:* quicker drift-recovery grip on cars and faster swimming / boat trim; starts with a matte-teal *Flamingo Barracuda* saloon and light melee baton.
- **Nadia Vance (31)** — Disgraced insurance-fraud investigator whose escrow ledger compromises half of **Glass Quarter**. Starts on **Coral Strip / Old Naranja**.  
  *Trait — Fixer & Deadeye:* faster weapon draw/aim settle and +15% fence payouts on stolen goods/missions; starts with a compact `pistol` and high-clearance coupe.

---

## 3. Core Loop & Performance Targets

- **Loop:** **Roam** (walk, climb, swim, hijack moving or parked cars via `metro.cars.near(p, r, { parked: true })` + `metro.cars.take()`, or board moored boats) -> **Navigate** via 3D `Gps` road arrows & rotating minimap -> **Strike** (burner-phone `Jobs`, interior shakedowns with `Interiors` `{ people: true }`, rival drops) -> **Evade** **SBPD** (`Wanted` 1–5 stars: break sightlines, swap rides, duck indoors, or flee by bay) -> **Bank Rep & Cash**.
- **Session & Persistence:** Earning **100 Rep** (`api.score()` -> `goal: 100` in ~60–120 s of active missions/escapes) triggers a round win on Game Scroll, while `WorldSave` (8 KB `api.save()` + 512 KB `api.saveLocal()`) carries cash, unlocked jobs/quests, reputation, radio preset, and both leads' gear across sessions.
- **Phone Targets (Galaxy Z Fold 8 Adreno & Pixel 10a Mali):** Target **60 fps native** on mid/top tiers; drop gracefully to **30 fps + GSFG** where headroom requires. Pre-warm all materials, `carKit`, `human.need`, `Wanted.ready()`, and initial `Metro` district behind the Play loading screen (zero runtime shader compilation). Follow `docs/open-city.md` budgets (~2 ms city, ~1.5 ms physics, ~6 ms draw).

---

## 4. Five Starter Missions (`gs.missions.Jobs` + `Phone`)

1. **Palma Strip Heat** *(Lead: Mako · Coral Strip -> Old Naranja)* — Answer a burner call from *Tia Carmen*, boost a parked coupe (`metro.cars.take()`), follow 3D GPS across the causeway after tripping a valet alarm (1-star SBPD pursuit), and ditch the car at Old Naranja Diner.
2. **Escrow Shakedown** *(Lead: Nadia · Glass Quarter)* — Walk into a ground-floor office lobby (`gs.city.Interiors` with `{ people: true }`), pressure a dirty adjuster (`gs.story.Talk` / `gs.fight.Melee`), recover the ledger, and shake 2-star armed interceptors via the I-905 slip ramps.
3. **Pelican Cut** *(Lead: Mako · Pelican Marina)* — Board a moored `motor` boat (`boat.enter(player)` at `helm`) at Pelican Marina, outrun Harbor Patrol launches (`law.boats`) under Pelican Causeway, scoop three floating contraband crates (`gs.craft.Boat` + `Floater`), and beach at Sawgrass Edge.
4. **Neon Protection** *(Lead: Nadia · Coral Strip)* — Hit three *Pastel Crew* extortion fronts using `Cover3D` / `TakeCover` gunplay (`pistol`/`smg`), survive a 3-star response with SBPD roadblocks and spotlight helicopter (`law.helicopter`), and slip into a beachfront bar interior to shed sight.
5. **Sawgrass Extraction** *(Dual-Lead Finale · Sawgrass Edge -> Bay)* — Nadia holds off **Tiny Brains** (`law.brains`: `cars`, `turns`, `support`, `squad`) tactical police units at a chop-shop compound while Mako extracts the getaway van & patrol boat under 4–5 stars (roadblocks + chopper searchlight + patrol launches); swap leads (`metro.switchTo()`) mid-heist to escape across Solis Bay.

---

## 5. System-to-Kit Mapping

| System | `gs` Kit & Exact Symbols | Role in *Solis Bay* |
| --- | --- | --- |
| **World & Streaming** | `gs.city` (`Metro`, `STYLES`, `CLIMATES`, `Gps`, `Interiors`) | 5 streaming districts (`coast: 'bay'`, `climate: 'tropical'`), stand-ins, skyline, beltway + causeways, populated interiors, minimap & 3D road arrows |
| **Environment & Water** | `gs.sky` (`Sky`, `Weather`), `gs.outdoors` (`Sea`, `Water`, `Wind`, `tree`, `Land`) | Preetham coastal sky, dawn-to-neon nights, tropical rain + wet roads, unified `metro.water` & coastal `Sea` |
| **Rendering & Lighting** | `gs.hd` (`HDView`, `sun`, `neon`, `sign`, `pbr`, `surface`, `bakeLight`, `lampLights`/`placeLamps`, `flash`, `decal`), `gs.fx3d` | WebGPU/WebGL PBR pipeline, GSSR upscaling, GSFG frame gen, pooled street/headlight/neon lamps, muzzle/blast flashes |
| **Physics & Navigation** | `gs.physics3d` (`World3D`), `gs.props` (`Props`, `Crowd`), `gs.climb` (`Climb`, `Swimmer`) | Rapier 3D chassis vehicles, city solid colliders, instanced crowd/street props, ledge hops & bay/beach swimming |
| **Vehicles & Boarding** | `gs.models` (`vehicle`, `seats`/carjacking `pull`/`enter`/`exit`), `gs.vehicles` (`Kart`/`Car`), `gs.craft` (`Boat`, `Hover`, `Floater`) | Driveable & wreckable cars, bikes, motor/patrol boats (`helm`/`seat`, water boarding), and helicopters |
| **People & Animation** | `gs.models` (`human`, `CREATOR_*`), `gs.poses` (`Rig`, `LIFELIKE`), `gs.characters` (`Face`, `Reactions`, `Carry`, `Solid`) | GNM real faces + close-up `strands` hair on leads, `Reactions` ragdolls/stumbles on NPCs & cops, IK steering/aim |
| **Law & Traffic** | `gs.city` (`Wanted`, `CRIMES`, `TACTICS`, `metro.cars` lane/way traffic & sirens) | Cross-district & highway chases, siren pull-overs, 1–5 star heat, armed squad officers (2+ stars), police chopper (3+ stars), patrol launches |
| **Combat & Cover** | `gs.combat` (`ARSENAL`, `Loadout`, `Pouch`, `Pickups`, `DriveBy`, `Health`, `Shots`, `Explosives`, `Markers`, `weaponSound`), `gs.fight` (`Melee`), `gs.tactics` (`Cover3D`, `TakeCover`, `Squad`) | On-foot, car, bike & boat gunplay (`DriveBy`), melee combos, 3D raycast cover/peek/blind-fire, AI squads flanking & flushing |
| **AI & Opponents** | `gs.brains` (`Brain`, `Wave`, `Predict`, `Coach`, `Dial`) | Adaptive SBPD pursuit tactics (`law.brains.cars`, `turns`, `support`, `squad`), turn prediction, tactical squad adaptation |
| **Story, Jobs & Save** | `gs.missions` (`Mission`, `Jobs`, `Phone`, `WorldSave`), `gs.rpg` (`Quests`, `Reputation`, `Flags`), `gs.story` (`Talk`, `Story`) | Generator mission scripts + checkpoints, ringing burner calls, branching contacts, faction rep, 8 KB + 512 KB saves |
| **Audio & Radio** | `gs.sound` (`Radio`, `compose`, `say`, `Ears`, `Foley`, `sounds`), `gs.phoneai` (`PhoneAI`) | Original Florida stations (*Coral FM 88*, *Glades Bass 95*, *Sunset Soul 102*, *Baybeat 107*), DJs + chase news |
| **Controls, Cam & Polish** | `gs.controls` (`Stick`, `Buttons`, `Gestures`), `gs.camera` (`chase`, `shoulder`), `gs.tweak`, `gs.ui`, `gs.icons`, `gs.prefs` | Touch-first drive/foot controls, collision-safe chase/shoulder cams, live `tweak` tuning, accessible motion scaling |

---

## 6. Kit Gaps Status (Resolved in PRs #455, #456, #457)

All six flagged kit requirements have landed in `src/kit/` and `src/gamescroll.d.ts`:

1. **`Metro` + `Wanted` Cross-District & Highway Chases (#455)** — `Wanted` accepts a `Metro`, `metro.cars` unifies district + connector/beltway (`ways`) + roaming chase vehicles with siren pull-overs and physics bodies, and `metro.switchTo(at)` handles instant multi-lead district swaps without mid-play shader builds.
2. **Parked, Traffic & Police Vehicle Hijacking (#455)** — `cars.near(p, r, { parked: true })` and `cars.take(car, { driver, by })` work across moving traffic, kerbside parked cars (`unpark`), and police cars on both `City` and `Metro`.
3. **Florida Biomes, Bay Causeways & Unified Water (#457)** — `STYLES` now includes `'beach'`, `'marina'`, and `'glades'`; `CLIMATES` adds `'tropical'` and `'wetland'`; `Metro` supports `coast: 'bay'` (barrier-island beach across a causeway bay) and `sea: true`, with unified `metro.water` (`Swimmer` + `Boat` ready, no solid floor over water).
4. **Boat & Helicopter Seats, Water Boarding & Wreckable Craft (#456)** — Boats have `'helm'` / `'seat'` steering seats, `enter()`/`exit()` work from water (`{ fromWater: true }`) or docks, and both boats and helicopters support `wreckable` health, `harm()`, smoke/fire, and sinking/crashing in `gs.craft.Boat` and `gs.craft.Hover`.
5. **High-Heat Police Escalation & Tiny Brains (#456)** — `Wanted` spawns armed `Squad` officers from 2 stars (`hitOfficer`), a spotlight police helicopter from 3 stars (`law.helicopter`, `hitHelicopter`), and water patrol launches (`law.boats`, `hitBoat`), all driven by `law.brains` (`cars`, `turns`, `support`, `squad`).
6. **Populated Interiors & Boat/Bike `DriveBy` (#456)** — `Interiors` (`{ people: true }`) populates rooms with a `keeper` and `patrons` (`onEnter`/`onLeave`), and `DriveBy` supports `'rider'`, `'helm'`, and `'seat'` firing arcs.

---

## 7. Implementation Status (Phases 3–5)

- **Phase 3 (#478):** Full 5-district `Metro` open world, Mako & Nadia dual-lead swap, driving + boats, initial weapons, 5-star SBPD pursuit, `WorldSave`, and starter missions.
- **Phase 4 (#479):** Phone-playtest polish + shared engine fixes in `src/kit/` (`craft.js` boat wet containment, `city-force.js` offshore standoff + bow shore probes, `city-metro.js` streaming `world.queries?.()` + unobstructed connectors + preserving pooled scene lamps, `city-ways.js` ramp sea exclusion), calibrated lighting/sky blending, bulletproof ground collision, 5-station Radio + Radio Wheel, proportionally tuned driving/drifting, 3rd-person shoulder + 1st-person ADS + lock-on aim assist, 6-weapon Arsenal Wheel, Solis Customs, Bayside Arms, rival NPCs (`Reactions`), and explosive barrels.
- **Phase 5 (`feat/solis-bay-phase5`):** Sport motorcycle (*Solis Fang* at Coral Strip beachfront + horn + open `DriveBy`), flyable light helicopter (`gs.craft.Hover` at Pelican Marina quay with climb/descend/altitude HUD), vehicle crash wear & fire/explosion wrecks, real Solis Customs 8-colour respray + speed tune, thrown `grenade` + tracked `launcher` RPG (`gs.combat.Shots`) + `sniper` scope vignette/mil-dots + 22° zoom, 3 rival crews tracked in `gs.rpg.Reputation`, *Tia Carmen's Diner* safehouse in Old Naranja (heal + advance time + swap lead), 3 Bayshore stunt jumps, and multi-stage upgrades for *Pelican Cut* (3 bobbing bay contraband crates), *Escrow Shakedown* (interactive adjuster confrontation choices), and *Sawgrass Extraction*.
- **Phase 6 (`feat/solis-bay-phase6`):** Living city density & GTA IV-tier phone polish — sculpted SBPD police cruisers (`style: 'police'` white-and-navy livery, push bar, flush lightbars, strobe flashes), fixed seated driving posture (`POSES.drive`) with closed-cabin roof/floor clearance clamping (`seatSpot` / `Fleet.driverOf`), animated door-swinging enter/exit/carjacking (`vehicle.enter`/`exit`/`pull` + pulled-driver `Reactions`), full sculpted district traffic (`fleet: true`, `parked: true`) and promoted sculpted pedestrians (`crowd: true`, `npcFullMax`, zero blocky proxy NPCs), 3D `Foley` footsteps/impacts (`stone`/`sand`/`wood`/`grass`/`water`), consolidated `metro.paint` decals + building occluders + concurrent `human.need()`/`loadPhysics3D()` cold-start optimisation, and zero-churn FX/HUD updates.

