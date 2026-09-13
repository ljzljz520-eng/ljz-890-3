'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { decadeLabel, truncate } = require('../lib/helpers');

/* ---------- 首页 ---------- */
router.get('/', (req, res) => {
  const photos = db.prepare(`
    SELECT id, archive_no, title, era, location, subject, image_after
    FROM photos WHERE status = 'published'
    ORDER BY published_at DESC, id DESC LIMIT 6
  `).all();
  const { c: total } = db.prepare(
    "SELECT COUNT(*) AS c FROM photos WHERE status = 'published'"
  ).get();
  res.render('index', { photos, total, truncate });
});

/* ---------- 档案浏览（年代筛选） ---------- */
router.get('/photos', (req, res) => {
  const decades = db.prepare(`
    SELECT era_decade AS decade, COUNT(*) AS cnt
    FROM photos WHERE status = 'published'
    GROUP BY era_decade ORDER BY era_decade
  `).all();

  let eraParam = req.query.era;
  let currentEra = 'all';
  let photos;

  if (eraParam === 'unknown') {
    currentEra = 'unknown';
    photos = db.prepare(`
      SELECT * FROM photos WHERE status = 'published' AND era_decade IS NULL
      ORDER BY published_at DESC, id DESC
    `).all();
  } else if (/^\d{4}$/.test(eraParam || '')) {
    const decade = parseInt(eraParam, 10);
    currentEra = decade;
    photos = db.prepare(`
      SELECT * FROM photos WHERE status = 'published' AND era_decade = ?
      ORDER BY published_at DESC, id DESC
    `).all(decade);
  } else {
    photos = db.prepare(`
      SELECT * FROM photos WHERE status = 'published'
      ORDER BY COALESCE(era_decade, 9999) ASC, published_at DESC, id DESC
    `).all();
  }

  const { c: total } = db.prepare(
    "SELECT COUNT(*) AS c FROM photos WHERE status = 'published'"
  ).get();

  res.render('photos', { photos, decades, currentEra, total, decadeLabel, truncate });
});

/* ---------- 照片详情 ---------- */
router.get('/photos/:id', (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return next();

  // 非公开档案仅工作人员可预览
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  if (!photo) return next();
  if (photo.status !== 'published' && !(req.session && req.session.user)) {
    return next();
  }

  const memories = db.prepare(`
    SELECT id, author_name, relation, content, created_at
    FROM memories WHERE photo_id = ? AND status = 'approved'
    ORDER BY created_at ASC
  `).all(id);

  res.render('detail', { photo, memories, truncate });
});

/* ---------- 家属提交补充记忆 ---------- */
router.get('/photos/:id/memories/new', (req, res, next) => {
  const photo = db.prepare(
    "SELECT id, title, archive_no FROM photos WHERE id = ? AND status = 'published'"
  ).get(parseInt(req.params.id, 10));
  if (!photo) return next();
  res.render('memories/new', { photo, form: {}, error: null });
});

router.post('/photos/:id/memories', (req, res, next) => {
  const photoId = parseInt(req.params.id, 10);
  const photo = db.prepare(
    "SELECT id, title, archive_no FROM photos WHERE id = ? AND status = 'published'"
  ).get(photoId);
  if (!photo) return next();

  const body = req.body || {};
  const authorName = String(body.author_name || '').trim().slice(0, 40);
  const relation = String(body.relation || '').trim().slice(0, 40);
  const contact = String(body.contact || '').trim().slice(0, 120);
  const content = String(body.content || '').trim().slice(0, 2000);

  const form = { author_name: authorName, relation, contact, content };

  if (!authorName || !contact || !content) {
    return res.status(422).render('memories/new', {
      photo, form,
      error: '称呼、联系方式与记忆内容均为必填。'
    });
  }
  if (content.length < 5) {
    return res.status(422).render('memories/new', {
      photo, form,
      error: '记忆内容似乎过短，请多写一些您所知道的情况。'
    });
  }

  db.prepare(`
    INSERT INTO memories (photo_id, author_name, relation, contact, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(photoId, authorName, relation || null, contact, content);

  res.redirect(`/photos/${photoId}/memories/thanks`);
});

router.get('/photos/:id/memories/thanks', (req, res, next) => {
  const photo = db.prepare(
    "SELECT id, title FROM photos WHERE id = ? AND status = 'published'"
  ).get(parseInt(req.params.id, 10));
  if (!photo) return next();
  res.render('memories/thanks', { photo });
});

module.exports = router;
