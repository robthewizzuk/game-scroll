# gs.campaign

A campaign of levels with progress.

`gs.campaign.Campaign`

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CampaignPart`, line 3798), where every option and field is described.

- `Campaign: new (chapters: { id: string; name?: string; needs?: { stars?: number; done?: string }; missions: CampaignMission[]; [k: string]: Loose }[], o?: { extras?: Re…` (:3799)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Campaigns** (`gs.campaign`): `Campaign(chapters, { extras }).attach(api)` keeps which missions are
open (in order, or by stars), up to three stars each (score targets or named challenges), best
scores, collectibles and extras that unlock at a star count, saved compactly with `api.save()`.

## In real games

1 game uses it (`node scripts/examples.mjs gs.campaign` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Zipline } = gs.gadgets;
const { Campaign } = gs.campaign;
// …
  const fx = new Juice();
  const camp = new Campaign(CHAPTERS).attach(api);
// …
    def.setup();
    for (const [i, l] of WD.letters.entries()) { const p = WD.letterSpots[id][i]; l.position.set(p.x, p.y, p.z); l.rotation.set(p.tilt, p.ry, 0); l.vi
// …
      if (letterT[i] > .8) {
        l.visible = false; camp.collect(mid, i); score += 150; api.score(score);
        found = { n: camp.collected(mid), t: 0 }; haptic('success');
// …
      keys = {}; hits = []; tagT = 0; spotting = false;
      sel = (camp.next() || camp.missions[0]).id;
// …
      const st = missions[mid].stars();
      camp.finish(mid, { stars: st });
// …
    if (briefT < .3) return;
    for (const r of briefRows) if (y >= r.y && y <= r.y + r.h && x >= r.x && x <= r.x + r.w) { if (r.id && r.id !== sel && camp.open(r.id)) { sel = r.
```
