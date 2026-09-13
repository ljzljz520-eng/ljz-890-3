'use strict';

/**
 * 从自由填写的年代文本中尽力提取一个年代锚点（十年），
 * 用于前台的年代分组筛选。提取不到时返回 null（归入“年代待考”）。
 * 例：「1937 年」「1930年代」「1956 年春」「约 1978」→ 1930 / 1930 / 1950 / 1970
 */
function extractDecade(text) {
  if (!text) return null;
  const m = String(text).match(/(1[6-9]\d{2}|20\d{2})/);
  if (m) {
    const year = parseInt(m[1], 10);
    return Math.floor(year / 10) * 10;
  }
  return null;
}

function decadeLabel(decade) {
  if (decade == null) return '年代待考';
  return `${decade} 年代`;
}

function formatDate(d) {
  if (!d) return '';
  return String(d).replace(/:\d\d$/, m => m); // datetime 原样已足够
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

module.exports = { extractDecade, decadeLabel, formatDate, truncate };
