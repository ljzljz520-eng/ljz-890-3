'use strict';

/* 上传图片本地预览；图片本身由服务端 sharp 统一处理 */
(function () {
  ['before', 'after'].forEach(function (key) {
    var input = document.getElementById('file-' + key);
    var preview = document.getElementById('preview-' + key);
    if (!input || !preview) return;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) { preview.style.display = 'none'; return; }
      var url = URL.createObjectURL(file);
      preview.src = url;
      preview.style.display = 'block';
    });
  });
})();
