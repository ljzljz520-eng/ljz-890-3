'use strict';

const express = require('express');
const path = require('path');
const db = require('../db');
const { requireLogin } = require('../lib/auth');
const { upload, persistImage, unlinkUploaded } = require('../lib/upload');
const { extractDecade } = require('../lib/helpers');
const { truncate } = require('../lib/helpers');

const router = express.Router();
router.use(requireLogin);

function nowLocal() {
  return db.prepare("SELECT datetime('now','localtime') AS t").get().t;
}

const cpUpload = upload.fields([
  { name: 'before', maxCount: 1 },
  { name: 'after', maxCount: 1 }
]);

/* 所有后台视图共用：待审数量角标 */
router.use((req, res, next) => {
  res.locals.pendingCounts = {
    memories: db.prepare("SELECT COUNT(*) AS c FROM memories WHERE status='pending'").get().c
  };
  next();
});

function nextArchiveNo() {
  const year = new Date().getFullYear();
  const prefix = `JY-${year}-`;
  const row = db.prepare(
    "SELECT archive_no FROM photos WHERE archive_no LIKE ? ORDER BY archive_no DESC LIMIT 1"
  ).get(prefix + '%');
  let seq = 1;
  if (row) {
    const m = row.archive_no.match(/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return prefix + String(seq).padStart(3, '0');
}

/* ---------- 概览 ---------- */
router.get('/', (req, res) => {
  const stats = {
    published: db.prepare("SELECT COUNT(*) c FROM photos WHERE status='published'").get().c,
    draft: db.prepare("SELECT COUNT(*) c FROM photos WHERE status IN ('draft','archived')").get().c,
    pendingMemories: db.prepare("SELECT COUNT(*) c FROM memories WHERE status='pending'").get().c,
    approvedMemories: db.prepare("SELECT COUNT(*) c FROM memories WHERE status='approved'").get().c
  };
  const pending = db.prepare(`
    SELECT m.*, p.title AS photo_title
    FROM memories m JOIN photos p ON p.id = m.photo_id
    WHERE m.status = 'pending'
    ORDER BY m.created_at ASC LIMIT 5
  `).all();
  res.render('admin/dashboard', { stats, pending });
});

/* ---------- 照片列表 ---------- */
router.get('/photos', (req, res) => {
  const photos = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM memories m WHERE m.photo_id = p.id AND m.status='approved') AS memory_count
    FROM photos p ORDER BY p.id DESC
  `).all();
  res.render('admin/photos', { photos, truncate });
});

/* ---------- 新建照片 ---------- */
router.get('/photos/new', (req, res) => {
  res.render('admin/photo-form', { photo: null, form: {}, error: null });
});

function readPhotoBody(body) {
  const clean = s => String(s == null ? '' : s).trim();
  return {
    title: clean(body.title).slice(0, 80),
    era: clean(body.era).slice(0, 40),
    location: clean(body.location).slice(0, 80) || null,
    subject: clean(body.subject).slice(0, 1000) || null,
    source: clean(body.source).slice(0, 120),
    source_note: clean(body.source_note).slice(0, 200) || null,
    description: String(body.description == null ? '' : body.description).trim().slice(0, 3000) || null,
    status: ['published', 'draft', 'archived'].includes(body.status) ? body.status : 'draft'
  };
}

router.post('/photos', cpUpload, async (req, res, next) => {
  try {
    const files = req.files || {};
    const form = readPhotoBody(req.body || {});

    if (!form.title || !form.era || !form.source) {
      return res.status(422).render('admin/photo-form', {
        photo: null, form: req.body, error: '标题、拍摄年代、来源为必填项。'
      });
    }
    if (!files.before || !files.after) {
      return res.status(422).render('admin/photo-form', {
        photo: null, form: req.body, error: '修复前与修复后两张照片都需要上传。'
      });
    }

    const beforeName = await persistImage(files.before[0].buffer);
    let afterName;
    try {
      afterName = await persistImage(files.after[0].buffer);
    } catch (e) {
      unlinkUploaded(beforeName);
      throw e;
    }

    const archiveNo = nextArchiveNo();
    const info = db.prepare(`
      INSERT INTO photos
        (archive_no, title, era, era_decade, location, subject, source, source_note,
         description, image_before, image_after, status, submitted_by, published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      archiveNo, form.title, form.era, extractDecade(form.era),
      form.location, form.subject, form.source, form.source_note,
      form.description, beforeName, afterName, form.status,
      req.session.user.id,
      form.status === 'published' ? nowLocal() : null
    );

    req.session.flash = { type: 'success', text: `档案 ${archiveNo} 已${form.status === 'published' ? '公开入藏' : '存为草稿'}。` };
    res.redirect(`/admin/photos/${info.lastInsertRowid}/edit`);
  } catch (e) {
    next(e);
  }
});

/* ---------- 编辑照片 ---------- */
router.get('/photos/:id/edit', (req, res, next) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!photo) return next();
  res.render('admin/photo-form', { photo, form: {}, error: null });
});

router.post('/photos/:id/edit', cpUpload, async (req, res, next) => {
  const photoId = parseInt(req.params.id, 10);
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
  if (!photo) return next();

  try {
    const files = req.files || {};
    const form = readPhotoBody(req.body || {});

    if (!form.title || !form.era || !form.source) {
      return res.status(422).render('admin/photo-form', {
        photo, form: req.body, error: '标题、拍摄年代、来源为必填项。'
      });
    }

    let beforeName = photo.image_before;
    let afterName = photo.image_after;
    const oldFiles = [];

    if (files.before) {
      beforeName = await persistImage(files.before[0].buffer);
      oldFiles.push(photo.image_before);
    }
    if (files.after) {
      try {
        afterName = await persistImage(files.after[0].buffer);
        oldFiles.push(photo.image_after);
      } catch (e) {
        if (beforeName !== photo.image_before) unlinkUploaded(beforeName);
        throw e;
      }
    }

    // 由草稿/归档转为公开时记录公开时间
    let publishedAt = photo.published_at;
    if (form.status === 'published' && !publishedAt) {
      publishedAt = nowLocal();
    }

    db.prepare(`
      UPDATE photos SET
        title=?, era=?, era_decade=?, location=?, subject=?, source=?, source_note=?,
        description=?, image_before=?, image_after=?, status=?, published_at=?
      WHERE id=?
    `).run(
      form.title, form.era, extractDecade(form.era), form.location, form.subject,
      form.source, form.source_note, form.description,
      beforeName, afterName, form.status, publishedAt, photoId
    );

    oldFiles.forEach(unlinkUploaded);

    req.session.flash = { type: 'success', text: '档案修改已保存。' };
    res.redirect(`/admin/photos/${photoId}/edit`);
  } catch (e) {
    next(e);
  }
});

/* ---------- 删除照片 ---------- */
router.post('/photos/:id/delete', (req, res, next) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!photo) return next();
  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  unlinkUploaded(photo.image_before);
  unlinkUploaded(photo.image_after);
  req.session.flash = { type: 'info', text: `已删除档案 ${photo.archive_no}。` };
  res.redirect('/admin/photos');
});

/* ---------- 记忆审核 ---------- */
router.get('/memories', (req, res) => {
  const allow = { pending: 'pending', approved: 'approved', rejected: 'rejected' };
  const status = allow[req.query.status] || 'pending';
  const memories = db.prepare(`
    SELECT m.*, p.title AS photo_title
    FROM memories m JOIN photos p ON p.id = m.photo_id
    WHERE m.status = ? ORDER BY m.created_at DESC
  `).all(status);
  const counts = {
    pending: db.prepare("SELECT COUNT(*) c FROM memories WHERE status='pending'").get().c,
    approved: db.prepare("SELECT COUNT(*) c FROM memories WHERE status='approved'").get().c,
    rejected: db.prepare("SELECT COUNT(*) c FROM memories WHERE status='rejected'").get().c
  };
  res.render('admin/memories', { memories, status, counts });
});

router.post('/memories/:id/approve', review('approved'));
router.post('/memories/:id/reject', review('rejected'));

function review(newStatus) {
  return (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    const m = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
    if (!m) return next();
    db.prepare(`
      UPDATE memories SET status=?, reviewed_by=?, reviewed_at=datetime('now','localtime')
      WHERE id=?
    `).run(newStatus, req.session.user.id, id);
    req.session.flash = {
      type: 'success',
      text: newStatus === 'approved' ? '记忆已通过，并在照片页公开。' : '该记忆已标记为不予公开。'
    };
    res.redirect(req.get('Referer') && req.get('Referer').includes('/admin/') ? req.get('Referer') : '/admin/memories');
  };
}

module.exports = router;
