// Finished answers kept in D1 for a while (table snapshots), so an expensive read is worked out once
// for every Cloudflare location instead of once per location: the edge cache (caches.default) is kept
// per location, and each location that missed it used to read the whole perf and crashes tables
// again. A location that misses its edge cache now reads one row while the kept answer is fresh.

const MAX_BYTES = 1_900_000;   // D1 keeps at most 2 MB in a row: anything bigger is served but not kept

/**
 * The answer kept under key if it is under ttl seconds old, else make() (a string) worked out now and
 * kept. ttl 0 keeps nothing (tests). Returns { text, at }: at is when it was worked out (ms).
 */
export async function kept(db, key, ttl, make, now = Date.now()) {
  if (ttl > 0) {
    const row = await db.prepare('SELECT at, body FROM snapshots WHERE key = ?1').bind(key).first();
    if (row && row.at <= now && now - row.at < ttl * 1000) return { text: row.body, at: row.at };
  }
  const text = await make();
  if (ttl > 0 && (text.length * 3 <= MAX_BYTES || new TextEncoder().encode(text).length <= MAX_BYTES))
    await db.prepare('INSERT INTO snapshots (key, at, body) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET at = excluded.at, body = excluded.body')
      .bind(key, now, text).run();
  return { text, at: now };
}

/** Drops answers nobody has asked for in a day (a page per game adds up). Run now and then. */
export const forget = (db, now = Date.now()) => db.prepare('DELETE FROM snapshots WHERE at < ?1').bind(now - 86_400_000).run();

/** Seconds an answer worked out at `at` (ms) has left of ttl, for the edge cache's max-age. */
export const left = (ttl, at, now = Date.now()) => Math.max(1, Math.ceil(ttl - (now - at) / 1000));
