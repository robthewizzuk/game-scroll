# gs.nav3d

3D paths from your level meshes, and crowds that walk them.

`gs.nav3d.NavMesh3D` (lazy): 3D paths made from your level meshes, `crowd()` agents.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`Nav3dPart`, line 1865), where every option and field is described.

- `NavMesh3D: new (objects: Loose | Loose[], o?: { radius?: number; height?: number; climb?: number; slope?: number; cell?: number; maxEdge?: number }) => { path(a: Loose…` (:1866)
- `loadNav3D(): Promise<Loose>` (:1871)
- `nav3DReady(): boolean` (:1871)

## From the maker kit

From [3D path finding](../maker-kit.md#3d-path-finding):

`const { NavMesh3D } = gs.nav3d;` (loads when first used.) Finds paths round any 3D level, using a
walkable map made from your level's meshes ([Recast & Detour](https://github.com/isaac-mason/recast-navigation-js)).

```js
reset() {
  nav = new NavMesh3D([floor, walls, crates], { radius: .4, height: 1.8, climb: .4, slope: 45 });
  crowd = nav.crowd(); g.agent = crowd.add(g.mesh.position, { speed: 3.5 });
}
update(dt) { g.agent.goto(hero.position); crowd.update(dt); g.mesh.position.copy(g.agent.position); }
```

- `path(a, b)` → corners `[Vector3]` (or `[]`), `reachable(a, b)`, `closest(p)`, `random(p, radius)`.
- Agents: `goto(p)`, `stop()`, `place(p)`, `arrived()`, `position`, `velocity`, `speed`, `remove()`.
- Set `mesh.userData.noNav = true` on things that shouldn't count (decorations, the player).
- While a card is loading, the map is made in a background worker and the card waits for it, so a big
  level doesn't hold the feed still. A new round's map (a level that changes) is made on the spot.

## In real games

No game uses `gs.nav3d` yet: the examples above are what there is.
