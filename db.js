'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'archive.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS photos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_no     TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  era            TEXT NOT NULL,                  -- 拍摄年代（自由文本，如 1930 年代）
  era_decade     INTEGER,                       -- 用于筛选的年代锚点，如 1930
  location       TEXT,
  subject        TEXT,                          -- 人物说明
  source         TEXT,                          -- 来源（捐赠人/机构）
  source_note    TEXT,                          -- 来源附言
  description    TEXT,                          -- 修复与内容记述
  image_before   TEXT NOT NULL,
  image_after    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'published'
                   CHECK (status IN ('draft','published','archived')),
  submitted_by   INTEGER REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  published_at   TEXT
);

CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id    INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  relation    TEXT,                 -- 与照片人物的关系
  contact     TEXT,                 -- 不公开
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  admin_note  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_photos_status   ON photos(status);
CREATE INDEX IF NOT EXISTS idx_photos_decade   ON photos(era_decade);
CREATE INDEX IF NOT EXISTS idx_memories_photo  ON memories(photo_id);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
`);

module.exports = db;
