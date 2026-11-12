-- When each performance and crash row was first and last reported (seconds since 1970, UTC), so the
-- report can say when something happened and not only on which day. Rows from before this have 0:
-- for those only the day is known.
ALTER TABLE perf ADD COLUMN first_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE perf ADD COLUMN last_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crashes ADD COLUMN first_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crashes ADD COLUMN last_at INTEGER NOT NULL DEFAULT 0;

-- One game's history is read by game, so its page costs that game's rows and not the whole table.
CREATE INDEX IF NOT EXISTS perf_game ON perf (game, day);
CREATE INDEX IF NOT EXISTS crashes_game ON crashes (game, day);
