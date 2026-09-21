// 简化Footer：只保留版权和底部链接
function renderFooter() {
  var html = '<footer class="site-footer"><div class="container">' +
    '<p>Copyright &copy; 2026 <a href="/" style="color:#94a3b8;text-decoration:none;">实用资源整理站</a> All Rights Reserved</p>' +
    '<p style="margin-top:6px;font-size:12px;color:#94a3b8;">本站工具由 <a href="/about.html#author" style="color:#94a3b8;text-decoration:none;">实用资源整理站</a> 独立开发 · 数据本地处理不上传</p>' +
    '<p style="margin-top:10px;">' +
    '<a href="/tools/" style="color:#94a3b8;text-decoration:none;margin:0 8px;">全部工具</a>' +
    '<a href="/about.html" style="color:#94a3b8;text-decoration:none;margin:0 8px;">关于本站</a>' +
    '<a href="/privacy.html" style="color:#94a3b8;text-decoration:none;margin:0 8px;">隐私政策</a>' +
    '<a href="/contact.html" style="color:#94a3b8;text-decoration:none;margin:0 8px;">联系我们</a>' +
    '</p></div></footer>';

  var existing = document.querySelector('footer.site-footer');
  if (existing) {
    existing.outerHTML = html;
  }
}
