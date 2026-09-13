'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff']);
const MAX_BYTES = 20 * 1024 * 1024;

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 2 },
  fileFilter(req, file, cb) {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 JPG、PNG、WebP、GIF、TIFF 格式的图片。'));
  }
});

/**
 * 将上传缓冲处理为统一 JPEG：
 * - 长边不超过 2000px，去除 EXIF 旋转信息
 * - 质量 88，保留充足细节，避免“美颜”式加工
 * 返回 public/uploads 下的文件名。
 */
async function persistImage(buffer) {
  const id = crypto.randomBytes(8).toString('hex');
  const filename = `${Date.now().toString(36)}-${id}.jpg`;
  const outPath = path.join(UPLOAD_DIR, filename);

  const image = sharp(buffer, { failOn: 'none', animated: false })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true });

  const meta = await image.metadata();
  let pipeline = image.clone();

  // 透明背景（PNG/WebP）合成为纸质底色
  if (meta.hasAlpha) {
    pipeline = pipeline.flatten({ background: '#ece6d8' });
  }

  await pipeline.jpeg({ quality: 88, mozjpeg: true }).toFile(outPath);
  return filename;
}

/** 同时保存原图缓冲（供需要时调阅），仅存一份不做公开处理——这里简化：仅保留处理图。 */
function unlinkUploaded(filename) {
  if (!filename) return;
  fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
}

module.exports = { upload, persistImage, unlinkUploaded, UPLOAD_DIR };
