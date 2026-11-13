-- Finished answers to the expensive reads (the crash and stutter report pages, the app's play stats and
-- perf totals), kept for a few minutes. Each Cloudflare location keeps its own cache, so without this
-- every location worked the same answer out again from the whole perf and crashes tables (tens of
-- thousands of rows read each time); now it is worked out once for all of them, and a location that
-- needs it reads this one row.
CREATE TABLE IF NOT EXISTS snapshots (
  key  TEXT    PRIMARY KEY,   -- 'stats', 'perf', 'kinds', 'report' or 'report:<game id>'
  at   INTEGER NOT NULL,      -- when it was worked out (ms since 1970)
  body TEXT    NOT NULL       -- what is served (JSON or the report's HTML)
);
