-- Running totals per build, so the crash and stutter report reads each build once instead of adding
-- up every day's rows again (with sorts and window functions that D1 counts as rows read many times
-- over) each time it is worked out.
--
-- perf_builds: the perf table added up over days (and the phone's OS version), one row per game,
-- phone model, screen, app build and game file version. crash_builds: the crashes table the same way.
-- Both are added to with every report (savePerf), and remade from perf and crashes once a day
-- (maintain() in src/perf.js), when the oldest day drops out of the PERF_DAYS window.

CREATE TABLE IF NOT EXISTS perf_builds (
  game     TEXT    NOT NULL,
  platform TEXT    NOT NULL,
  model    TEXT    NOT NULL,
  form     TEXT    NOT NULL,
  app      TEXT    NOT NULL,
  ver      TEXT    NOT NULL DEFAULT '',
  d0       INTEGER NOT NULL,             -- first and last day it reported
  d1       INTEGER NOT NULL,
  t1       INTEGER NOT NULL DEFAULT 0,   -- last report (seconds since 1970; 0: from before times were kept)
  rounds   INTEGER NOT NULL DEFAULT 0,
  frames   INTEGER NOT NULL DEFAULT 0,
  ms       INTEGER NOT NULL DEFAULT 0,
  work_ms  INTEGER NOT NULL DEFAULT 0,
  slow     INTEGER NOT NULL DEFAULT 0,
  hitches  INTEGER NOT NULL DEFAULT 0,
  worst_ms INTEGER NOT NULL DEFAULT 0,
  heat_ms  INTEGER NOT NULL DEFAULT 0,
  warm_ms  INTEGER NOT NULL DEFAULT 0,
  hot_ms   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game, platform, model, form, app, ver)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS crash_builds (
  kind     TEXT    NOT NULL,
  game     TEXT    NOT NULL,
  msg      TEXT    NOT NULL,
  place    TEXT    NOT NULL,
  platform TEXT    NOT NULL,
  model    TEXT    NOT NULL,
  app      TEXT    NOT NULL,
  ver      TEXT    NOT NULL DEFAULT '',
  n        INTEGER NOT NULL DEFAULT 0,
  d0       INTEGER NOT NULL,
  d1       INTEGER NOT NULL,
  t0       INTEGER NOT NULL DEFAULT 0,   -- first time it happened (0: not known)
  t1       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, game, msg, place, platform, model, app, ver)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS crash_builds_game ON crash_builds (game);

-- The day the running totals were last remade (one row).
CREATE TABLE IF NOT EXISTS rollup_day (
  id  INTEGER PRIMARY KEY CHECK (id = 1),
  day INTEGER NOT NULL
);
-- 0: remade from perf and crashes by the first report worked out after this (or the daily run).
INSERT OR IGNORE INTO rollup_day (id, day) VALUES (1, 0);
