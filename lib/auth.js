'use strict';

function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  req.session.returnTo = req.originalUrl;
  req.session.flash = { type: 'error', text: '请先登录档案馆工作台。' };
  return res.redirect('/login');
}

function setUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  next();
}

function flash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

module.exports = { requireLogin, setUser, flash };
