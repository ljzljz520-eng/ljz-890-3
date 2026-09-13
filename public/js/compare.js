'use strict';

/* 修复前后对比滑杆：仅控制裁切位置，无任何动效 */
(function () {
  document.querySelectorAll('.compare').forEach(function (box) {
    var range = box.querySelector('input[type="range"]');
    if (!range) return;

    function apply() {
      var v = Math.min(100, Math.max(0, parseFloat(range.value)));
      box.style.setProperty('--pos', v + '%');
    }
    range.addEventListener('input', apply);
    apply();
  });
})();
