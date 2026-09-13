'use strict';

/*
 * 初始化档案馆：
 *  1. 建库并写入默认工作人员账号
 *  2. 用程序生成三张示例照片的「修复前 / 修复后」影像
 *  3. 写入示例家属记忆（含一条待审核）
 * 重复运行会跳过已存在的记录。
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const db = require('../db');
const { extractDecade } = require('../lib/helpers');
const { UPLOAD_DIR } = require('../lib/upload');

const W = 800, H = 600;

/* ---------------- 画面元素 ---------------- */

function person(x, baseY, scale, opts = {}) {
  const s = scale;
  const skin = opts.skin || '#c99a78';
  const cloth = opts.cloth || '#3d4a52';
  const skirt = opts.skirt || null;
  const hair = opts.hair || '#2c241d';
  const r = 26 * s; // 头半径
  const headY = baseY - 150 * s;
  let out = `
    <g>`;
  // 身体（长衫/上衣）
  if (skirt) {
    out += `<path d="M ${x - 46*s} ${baseY} L ${x - 20*s} ${headY + r + 8*s} L ${x + 20*s} ${headY + r + 8*s} L ${x + 46*s} ${baseY} Z" fill="${skirt}"/>`;
    out += `<rect x="${x - 22*s}" y="${headY + r}" width="${44*s}" height="${60*s}" fill="${cloth}"/>`;
  } else {
    out += `<path d="M ${x - 40*s} ${baseY} L ${x - 18*s} ${headY + r + 6*s} L ${x + 18*s} ${headY + r + 6*s} L ${x + 40*s} ${baseY} Z" fill="${cloth}"/>`;
  }
  // 脖子与头
  out += `<rect x="${x - 8*s}" y="${headY + r - 6*s}" width="${16*s}" height="${14*s}" fill="${skin}"/>`;
  out += `<circle cx="${x}" cy="${headY}" r="${r}" fill="${skin}"/>`;
  // 头发
  out += `<path d="M ${x - r} ${headY - 2*s} q ${r} ${-34*s} ${2*r} 0 l ${-4*s} ${-10*s} q ${-(r - 4*s)} ${-18*s} ${-(2*r - 8*s)} 0 Z" fill="${hair}"/>`;
  // 五官（极简）
  out += `<circle cx="${x - 9*s}" cy="${headY - 2*s}" r="${2.2*s}" fill="#3a2c22"/>`;
  out += `<circle cx="${x + 9*s}" cy="${headY - 2*s}" r="${2.2*s}" fill="#3a2c22"/>`;
  out += `<path d="M ${x - 7*s} ${headY + 12*s} q ${7*s} ${6*s} ${14*s} 0" stroke="#7a4a36" stroke-width="${1.6*s}" fill="none" stroke-linecap="round"/>`;
  out += `</g>`;
  return out;
}

const SCENES = {
  /* 1937 · 苏州河边码头，全家福 */
  dock(palette) {
    const sky = palette.sky, water = palette.water, ground = palette.ground;
    return `
    <rect x="0" y="0" width="${W}" height="${H}" fill="${sky}"/>
    <rect x="0" y="330" width="${W}" height="150" fill="${water}"/>
    <path d="M0 470 L800 470 L800 600 L0 600 Z" fill="${ground}"/>
    <!-- 远景船桅与厂房 -->
    <rect x="560" y="180" width="120" height="150" fill="${palette.far}" opacity=".55"/>
    <rect x="610" y="120" width="14" height="210" fill="${palette.far}" opacity=".7"/>
    <line x1="617" y1="140" x2="670" y2="200" stroke="${palette.far}" stroke-width="2" opacity=".6"/>
    <rect x="120" y="250" width="90" height="80" fill="${palette.far}" opacity=".4"/>
    <!-- 水纹 -->
    ${[0,1,2,3,4].map(i => `<path d="M ${40 + i*150} ${380 + (i%2)*26} q 40 -8 90 0" stroke="${palette.wave}" stroke-width="2" fill="none" opacity=".6"/>`).join('')}
    <!-- 木箱 -->
    <rect x="80" y="430" width="70" height="44" fill="${palette.crate}" stroke="${palette.line}" stroke-width="2"/>
    <line x1="80" y1="452" x2="150" y2="452" stroke="${palette.line}" stroke-width="2"/>
    <!-- 人物：父、母、两个孩子 -->
    ${person(330, 470, 1.05, { cloth: palette.cloth1 })}
    ${person(470, 470, 1.0, { cloth: palette.cloth2, skirt: palette.skirt })}
    ${person(255, 470, 0.72, { cloth: palette.cloth3 })}
    ${person(555, 470, 0.62, { cloth: palette.cloth2 })}
    `;
  },

  /* 1956 · 北方院落读书 */
  courtyard(palette) {
    return `
    <rect x="0" y="0" width="${W}" height="${H}" fill="${palette.sky}"/>
    <!-- 院墙与门楼 -->
    <rect x="0" y="250" width="800" height="350" fill="${palette.wall}"/>
    <rect x="0" y="246" width="800" height="14" fill="${palette.roof}"/>
    <rect x="320" y="120" width="160" height="260" fill="${palette.gate}"/>
    <path d="M290 130 L400 70 L510 130 Z" fill="${palette.roof}"/>
    <!-- 门柱对联 -->
    <rect x="328" y="210" width="20" height="160" fill="${palette.couplet}"/>
    <rect x="452" y="210" width="20" height="160" fill="${palette.couplet}"/>
    <!-- 树 -->
    <rect x="120" y="180" width="18" height="200" fill="${palette.trunk}"/>
    <circle cx="129" cy="160" r="70" fill="${palette.leaf}" opacity=".9"/>
    <circle cx="180" cy="200" r="44" fill="${palette.leaf}" opacity=".8"/>
    <!-- 石凳与读书少年 -->
    <rect x="540" y="430" width="170" height="22" fill="${palette.stone}"/>
    <rect x="560" y="452" width="16" height="70" fill="${palette.stone}"/>
    <rect x="676" y="452" width="16" height="70" fill="${palette.stone}"/>
    ${person(620, 430, 0.9, { cloth: palette.cloth1 })}
    <!-- 翻开的书 -->
    <path d="M596 396 L620 390 L644 396 L620 392 Z" fill="#f3ead2" stroke="${palette.line}" stroke-width="1.5"/>
    <!-- 地上的影子 -->
    <ellipse cx="620" cy="524" rx="90" ry="12" fill="#000" opacity=".12"/>
    `;
  },

  /* 1978 · 照相馆结婚照 */
  studio(palette) {
    return `
    <rect x="0" y="0" width="${W}" height="${H}" fill="${palette.sky}"/>
    <!-- 背景布幔 -->
    <path d="M160 60 Q240 20 320 60 Q400 20 480 60 Q560 20 640 60 L640 520 L160 520 Z" fill="${palette.drape}" opacity=".9"/>
    <path d="M160 60 L640 60" stroke="${palette.trim}" stroke-width="6"/>
    <!-- 地板 -->
    <rect x="0" y="520" width="800" height="80" fill="${palette.floor}"/>
    <!-- 立柱花架 -->
    <rect x="120" y="180" width="26" height="340" fill="${palette.pillar}"/>
    <rect x="654" y="180" width="26" height="340" fill="${palette.pillar}"/>
    <ellipse cx="133" cy="170" rx="46" ry="20" fill="${palette.leaf}"/>
    <ellipse cx="667" cy="170" rx="46" ry="20" fill="${palette.leaf}"/>
    <!-- 新郎新娘 -->
    ${person(340, 520, 1.12, { cloth: palette.suit, skin: '#d0a283' })}
    ${person(470, 520, 1.08, { cloth: palette.veil, skirt: palette.gown, skin: '#e0b69a', hair: '#3a2a20' })}
    <!-- 新娘头纱 -->
    <path d="M430 350 Q470 300 510 350 L520 520 L420 520 Z" fill="#ffffff" opacity=".55"/>
    <!-- 胸前红花 -->
    <circle cx="372" cy="392" r="12" fill="${palette.flower}"/>
    <circle cx="372" cy="392" r="4" fill="#f3e2a0"/>
    `;
  }
};

/* 修复前：泛黄、划痕、霉点、折痕、暗角 */
function ageOverlay(seed) {
  let scratches = '';
  for (let i = 0; i < 26; i++) {
    const x = (seed * 37 + i * 53) % W;
    const y = (seed * 91 + i * 29) % H;
    const len = 30 + ((seed * 17 + i * 11) % 150);
    const op = 0.08 + ((i % 5) * 0.03);
    scratches += `<line x1="${x}" y1="${y}" x2="${x + ((i % 3) - 1) * 14}" y2="${y + len}" stroke="#5c4a30" stroke-width="${i % 4 === 0 ? 1.4 : 0.7}" opacity="${op}"/>`;
  }
  let spots = '';
  for (let i = 0; i < 40; i++) {
    const cx = (seed * 61 + i * 97) % W;
    const cy = (seed * 43 + i * 71) % H;
    const r = 2 + ((seed + i * 7) % 14);
    spots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#6b5634" opacity="${0.05 + (i % 4) * 0.03}"/>`;
  }
  return `
    <!-- 整体泛黄与褪色 -->
    <rect x="0" y="0" width="${W}" height="${H}" fill="#b8924e" opacity=".28"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="#e8d49a" opacity=".18" style="mix-blend-mode:multiply"/>
    <!-- 折痕 -->
    <path d="M0 200 Q 400 240 800 180" stroke="#8a7148" stroke-width="3" opacity=".18" fill="none"/>
    <path d="M210 0 Q 250 300 190 600" stroke="#8a7148" stroke-width="2" opacity=".14" fill="none"/>
    <!-- 划痕与霉点 -->
    ${scratches}
    ${spots}
    <!-- 缺角（左上）与破损边 -->
    <path d="M0 0 L96 0 L60 34 L84 70 L28 58 L0 92 Z" fill="#e6ddc6" opacity=".95"/>
    <!-- 暗角 -->
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#vignette)"/>
  `;
}

function defs() {
  return `
  <defs>
    <radialGradient id="vignette" cx="50%" cy="48%" r="72%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#3a2a14" stop-opacity=".42"/>
    </radialGradient>
  </defs>`;
}

function wrapSvg(inner, aged) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${defs()}
    ${inner}
    ${aged ? ageOverlay(agedSeed) : ''}
  </svg>`;
}

/* 调色板：修复后真实色彩 / 修复前褐黄色调（传入后会再被泛黄层压暗） */
const PALETTES = [
  {
    name: 'dock',
    fresh: { sky:'#cdd9de', water:'#7d96a2', wave:'#5f7a88', ground:'#9a8b72', far:'#8d8d84',
             crate:'#8a6a44', line:'#5e4830', cloth1:'#42505c', cloth2:'#6e4a42', cloth3:'#7b6a45', skirt:'#3d3a44' },
    aged:  { sky:'#cdbb92', water:'#9b8662', wave:'#7a6748', ground:'#8a7758', far:'#8a7a5c',
             crate:'#7a6138', line:'#57442a', cloth1:'#5d5548', cloth2:'#6b5640', cloth3:'#6a5d3e', skirt:'#4c4234' }
  },
  {
    name: 'courtyard',
    fresh: { sky:'#d8dde0', wall:'#d9cfb8', roof:'#6c4a38', gate:'#8a5a40', couplet:'#8a3b2e',
             trunk:'#6b4a2e', leaf:'#5e7a4a', stone:'#a89e8c', cloth1:'#3f5364' },
    aged:  { sky:'#cbbb94', wall:'#b8a680', roof:'#5c4230', gate:'#73503a', couplet:'#74402f',
             trunk:'#5d4028', leaf:'#667048', stone:'#918770', cloth1:'#525858' }
  },
  {
    name: 'studio',
    fresh: { sky:'#e4ddd0', drape:'#b8a98c', trim:'#8a6f4a', floor:'#8d7150', pillar:'#b5a382',
             leaf:'#5e7a4a', suit:'#333842', veil:'#e9e4d6', gown:'#efe9da', flower:'#8a3b2e' },
    aged:  { sky:'#cdbb94', drape:'#a8946e', trim:'#755d3c', floor:'#7a6244', pillar:'#9c8a68',
             leaf:'#667048', suit:'#3e3d38', veil:'#d8cfb6', gown:'#cfc4a8', flower:'#74362b' }
  }
];

async function makeScene(sceneName, palette, agedSeed) {
  global.agedSeed = agedSeed;
  const svg = SCENES[sceneName](agedSeed ? palette.aged : palette.fresh);
  return Buffer.from(wrapSvg(svg, agedSeed ? agedSeed : 0));
}

/* ---------------- 主流程 ---------------- */

async function main() {
  // 管理员
  const existing = db.prepare("SELECT id FROM users WHERE username='admin'").get();
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?,?,?)')
      .run('admin', hash, '档案管理员');
    console.log('已创建默认账号：admin / admin123（请登录后尽快修改）');
  }

  const now = new Date();
  const year = now.getFullYear();

  const samples = [
    {
      title: '苏州河畔的全家福',
      era: '1937 年春',
      location: '上海 · 苏州河畔码头',
      subject: '居中者为父亲周敬之（时年三十四，米行伙计），右侧母亲王素云，左侧长子周明远（九岁），右侧幼女周明蕙（六岁）。',
      source: '周明蕙家属捐赠',
      source_note: '家中仅存的战前照片，原照边缘受潮缺损。',
      description: `原照为银盐纸基明信片尺寸，左上部缺角，中部有两道折痕，表面布满划痕与霉点，影像严重泛黄褪色。\n修复中先固色、清洁霉斑，再补齐缺角与折痕，依据家属保存的同底小照还原衣装色彩，未对面容做任何改动。`,
      palette: 0,
      memories: [
        {
          name: '周国伟', relation: '孙子', contact: '13800000001',
          content: '我父亲是照片里左边的男孩。他常说拍这张照片时妹妹一直盯着脚架上的黑布看，以为会“放炮”。爷爷两年后去了内地，再回来已是胜利之后。',
          status: 'approved'
        },
        {
          name: '李婉', relation: '邻居后人', contact: 'liw@example.com',
          content: '听家里老人讲，周家以前住在闸北，开米行的。具体门牌要回去问问我姑妈再补充。',
          status: 'pending'
        }
      ]
    },
    {
      title: '院落里读书的少年',
      era: '1956 年初秋',
      location: '天津 · 老城厢某宅院',
      subject: '陈志学（时年十五，中学生）。',
      source: '陈志学本人遗赠',
      source_note: null,
      description: `原照为 120 黑白负片冲印，整体灰雾较重，右下角有指印污痕。\n本次修复去除灰雾与污痕、恢复中间影调。根据本人晚年回忆，院墙为青灰色、门前栽有海棠，据此作了克制的着色处理，人物衣着保持黑白不着色，以示慎重。`,
      palette: 1,
      memories: [
        {
          name: '陈雪梅', relation: '女儿', contact: 'chenxm@example.com',
          content: '父亲一辈子爱读书，恢复高考后又去读了大学。他说这张照片是表哥用借来的相机拍的，书是《钢铁是怎样炼成的》。',
          status: 'approved'
        }
      ]
    },
    {
      title: '照相馆里的结婚照',
      era: '1978 年国庆',
      location: '南京 · 新风照相馆',
      subject: '新郎林春生（二十六，机床厂技术员）、新娘许惠兰（二十四，纺织厂工人）。',
      source: '林、许两家共同捐赠',
      source_note: '原照挂在卧室四十余年，玻璃碎裂后划伤相纸。',
      description: `原照为手工着色结婚照，相框玻璃碎裂，相纸有三处平行划伤，红色褪色明显。\n修复时逐处去除划伤，恢复头纱层次与胸花红色，背景布幔的脏渍予以保留，未做“新拍”式磨皮。`,
      palette: 2,
      memories: []
    }
  ];

  let seq = 1;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const archiveNo = `JY-${year}-${String(seq++).padStart(3, '0')}`;
    const dup = db.prepare('SELECT id FROM photos WHERE archive_no = ?').get(archiveNo);
    if (dup) { console.log(`跳过已存在的 ${archiveNo}`); continue; }

    const pal = PALETTES[s.palette];
    const seedBefore = 11 + i * 7;
    const beforeSvg = await makeScene(pal.name, pal, seedBefore);
    const afterSvg = await makeScene(pal.name, pal, 0);

    const beforeFile = `seed-${i + 1}-before.jpg`;
    const afterFile = `seed-${i + 1}-after.jpg`;
    await sharp(beforeSvg).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(UPLOAD_DIR, beforeFile));
    await sharp(afterSvg).jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(UPLOAD_DIR, afterFile));

    const info = db.prepare(`
      INSERT INTO photos
        (archive_no, title, era, era_decade, location, subject, source, source_note,
         description, image_before, image_after, status, submitted_by, published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, 'published', 1, datetime('now','localtime'))
    `).run(
      archiveNo, s.title, s.era, extractDecade(s.era),
      s.location, s.subject, s.source, s.source_note,
      s.description, beforeFile, afterFile
    );

    const photoId = info.lastInsertRowid;
    for (const m of s.memories) {
      const reviewed = m.status === 'approved'
        ? ", reviewed_by=1, reviewed_at=datetime('now','localtime')" : '';
      db.prepare(`
        INSERT INTO memories (photo_id, author_name, relation, contact, content, status)
        VALUES (?,?,?,?,?,?)
      `).run(photoId, m.name, m.relation, m.contact, m.content, m.status);
      if (reviewed) {
        db.prepare(`UPDATE memories SET reviewed_by=1, reviewed_at=datetime('now','localtime') WHERE photo_id=? AND author_name=?`)
          .run(photoId, m.name);
      }
    }
    console.log(`已入藏示例档案：${archiveNo} 《${s.title}》`);
  }

  console.log('\n初始化完成。启动：npm start');
}

main().catch(e => { console.error(e); process.exit(1); });
