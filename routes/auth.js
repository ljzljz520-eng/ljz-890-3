'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireLogin } = require('../lib/auth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('login', { error: null, username: '' });
});

router.post('/login', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');

  const fail = () => res.status(401).render('login', {
    error: '用户名或口令不正确。', username
  });

  if (!username || !password) return fail();

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return fail();

  bcrypt.compare(password, user.password_hash).then(ok => {
    if (!ok) return fail();
    req.session.user = { id: user.id, username: user.username, display_name: user.display_name };
    const target = req.session.returnTo || '/admin';
    delete req.session.returnTo;
    req.session.save(() => res.redirect(target));
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
