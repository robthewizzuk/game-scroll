-- Reports now say which version of a game's file they are about, and how much of the play was with
-- the phone warm or hot.
--
-- Games are streamed, so a game can change without the app build changing: the version (ver, the
-- short hash of the game's file from the catalogue) is the only thing that tells a report from
-- before a game-only fix from one after it. It is part of what a row is added up by, so both tables
-- are remade with it in their key. Rows from before this, and games built into the app, have ''.
--
-- platform may now end in "-robot" ("android-robot"): the phone says a test robot is driving it
-- (Google Play tries every build on phones of its own), so those are kept apart from players.

CREATE TABLE perf_v2 (
  day      INTEGER NOT NULL,   -- days since 1970-01-01 (UTC)
  game     TEXT    NOT NULL,
  platform TEXT    NOT NULL,   -- ios / android / web, or android-robot
  model    TEXT    NOT NULL,
  form     TEXT    NOT NULL,
  app      TEXT    NOT NULL,   -- app build, e.g. 1.0.233 2eeb6bb
  ver      TEXT    NOT NULL DEFAULT '',   -- the game file's version
  rounds   INTEGER NOT NULL DEFAULT 0,
  frames   INTEGER NOT NULL DEFAULT 0,
  ms       INTEGER NOT NULL DEFAULT 0,
  work_ms  INTEGER NOT NULL DEFAULT 0,
  slow     INTEGER NOT NULL DEFAULT 0,
  hitches  INTEGER NOT NULL DEFAULT 0,
  worst_ms INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL DEFAULT 0,
  last_at  INTEGER NOT NULL DEFAULT 0,
  heat_ms  INTEGER NOT NULL DEFAULT 0,   -- of ms: with the phone's heat known (0: it doesn't say)
  warm_ms  INTEGER NOT NULL DEFAULT 0,   -- of heat_ms: warm
  hot_ms   INTEGER NOT NULL DEFAULT 0,   -- of heat_ms: hot (the phone is slowing itself down)
  PRIMARY KEY (day, game, platform, model, form, app, ver)
) WITHOUT ROWID;
INSERT INTO perf_v2 (day, game, platform, model, form, app, rounds, frames, ms, work_ms, slow, hitches, worst_ms, first_at, last_at)
  SELECT day, game, platform, model, form, app, rounds, frames, ms, work_ms, slow, hitches, worst_ms, first_at, last_at FROM perf;
DROP TABLE perf;
ALTER TABLE perf_v2 RENAME TO perf;
CREATE INDEX IF NOT EXISTS perf_game ON perf (game, day);

CREATE TABLE crashes_v2 (
  day      INTEGER NOT NULL,   -- the day it happened where the phone says when, else the day it was reported
  kind     TEXT    NOT NULL,
  game     TEXT    NOT NULL,
  msg      TEXT    NOT NULL,
  place    TEXT    NOT NULL,
  platform TEXT    NOT NULL,
  model    TEXT    NOT NULL,
  os       TEXT    NOT NULL,
  app      TEXT    NOT NULL,
  ver      TEXT    NOT NULL DEFAULT '',
  n        INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL DEFAULT 0,
  last_at  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, game, msg, place, platform, model, os, app, ver)
) WITHOUT ROWID;
INSERT INTO crashes_v2 (day, kind, game, msg, place, platform, model, os, app, n, first_at, last_at)
  SELECT day, kind, game, msg, place, platform, model, os, app, n, first_at, last_at FROM crashes;
DROP TABLE crashes;
ALTER TABLE crashes_v2 RENAME TO crashes;
CREATE INDEX IF NOT EXISTS crashes_game ON crashes (game, day);
