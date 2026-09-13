'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const compression = require('compression');
const methodOverride = require('method-override');
const crypto = require('crypto');

const db = require('./db');
const { setUser, flash } = require('./lib/auth');
const { truncate } = require('./lib/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

/* session 密钥：首次启动生成并落盘，重启不失效 */
const SECRET_FILE = path.join(__dirname, 'data', '.session-secret');
let sessionSecret;
try {
  sessionSecret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
} catch {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, sessionSecret, { mode: 0o600 });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(compression());
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(methodOverride('_method'));

app.use(session({
  name: 'jyg.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(flash);
app.use(setUser);

app.use((req, res, next) => {
  res.locals.truncate = truncate;
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  index: false
}));

app.use('/', require('./routes/index'));
app.use('/', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));

/* 404 */
app.use((req, res) => {
  res.status(404).render('404');
});

/* 错误处理（含 multer 上传超限/格式错误） */
app.use((err, req, res, next) => {
  console.error('[error]', err && err.stack || err);
  const isUpload = err && (err.code === 'LIMIT_FILE_SIZE' || /multer|图片|格式/.test(String(err.message)));
  res.status(err && err.status || 500);
  if (req.path.startsWith('/admin') || isUpload) {
    res.render('error', {
      message: isUpload
        ? '图片上传失败：' + err.message
        : '服务器处理时发生错误，请稍后重试。'
    });
  } else {
    res.render('error', { message: '页面暂时无法打开，请稍后重试。' });
  }
});

app.listen(PORT, () => {
  console.log(`旧影修复档案馆已启动：http://localhost:${PORT}`);
});

module.exports = app;
