/* 违禁词检测工具 - 前端逻辑 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TABS = ['ai', 'xianyu', 'douyin', 'xiaohongshu'];
  var currentTab = 'ai';
  var automata = {};      // tab -> AhoCorasick
  var CUSTOM_KEY = 'checkword_custom_v1';

  var input = $('input');
  var result = $('result');
  var resultPanel = $('resultPanel');
  var hitSummary = $('hitSummary');
  var customWords = $('customWords');

  /* ---------- 词库加载 ---------- */
  function getWords(tab) {
    var data = (window.WORD_DATA && window.WORD_DATA[tab]) || [];
    var custom = getCustomWords();
    return data.concat(custom);
  }

  function getAutomaton(tab) {
    if (!automata[tab]) {
      automata[tab] = new window.AhoCorasick(getWords(tab));
    }
    return automata[tab];
  }

  function getCustomWords() {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      if (!raw) return [];
      return raw.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    } catch (e) { return []; }
  }

  function saveCustomWords() {
    var raw = customWords.value.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    var seen = {};
    var list = [];
    for (var i = 0; i < raw.length; i++) {
      if (!seen.hasOwnProperty(raw[i])) { seen[raw[i]] = true; list.push(raw[i]); }
    }
    try {
      localStorage.setItem(CUSTOM_KEY, list.join('\n'));
    } catch (e) {}
    customWords.value = list.join('\n');
    automata = {}; // 使自定义词立即生效
    updateCustomBadge();
    rerunCheck();
    showTip('已保存 ' + list.length + ' 个自定义词并生效');
  }

  function clearCustomWords() {
    customWords.value = '';
    try { localStorage.removeItem(CUSTOM_KEY); } catch (e) {}
    automata = {};
    updateCustomBadge();
    rerunCheck();
    showTip('已清空自定义词库');
  }

  function rerunCheck() {
    if (resultPanel.style.display !== 'none') { $('btnCheck').click(); }
  }

  function updateCustomBadge() {
    var words = getCustomWords();
    var badge = $('customBadge');
    var count = $('customCount');
    if (words.length) {
      badge.textContent = words.length;
      badge.hidden = false;
      count.textContent = '当前 ' + words.length + ' 个词';
    } else {
      badge.hidden = true;
      count.textContent = '暂无自定义词';
    }
    return words.length;
  }

  /* ---------- Tab 切换 ---------- */
  var tabsEl = $('tabs');
  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.tab');
    if (!btn) return;
    currentTab = btn.getAttribute('data-tab');
    Array.prototype.forEach.call(tabsEl.children, function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    updateCount();
  });

  function updateCount() {
    $('charCount').textContent = input.value.length + ' 字';
  }

  /* ---------- 检测 ---------- */
  $('btnCheck').addEventListener('click', function () {
    var text = input.value;
    if (!text.trim()) {
      showToast('请先输入要检测的文本');
      return;
    }
    var ac = getAutomaton(currentTab);
    var found = ac.findAll(text);
    var words = found.words;

    result.innerHTML = ac.highlight(text);
    result.setAttribute('data-placeholder', '');
    resultPanel.style.display = 'block';

    if (words.length) {
      hitSummary.textContent = '发现 ' + words.length + ' 个疑似违规词：' + words.slice(0, 10).join('、') + (words.length > 10 ? ' 等' : '');
      hitSummary.className = 'hit-summary';
    } else {
      hitSummary.textContent = '未发现违规词 ✓';
      hitSummary.className = 'hit-summary clean';
    }
  });

  /* ---------- 复制结果 ---------- */
  $('btnCopyResult').addEventListener('click', function () {
    var text = result.innerText;
    if (!text) { showToast('暂无检测结果'); return; }
    copyText(text);
  });

  /* ---------- 清空 ---------- */
  $('btnReset').addEventListener('click', function () {
    input.value = '';
    result.innerHTML = '';
    result.setAttribute('data-placeholder', '检测结果将显示在这里');
    resultPanel.style.display = 'none';
    hitSummary.textContent = '';
    updateCount();
  });

  /* ---------- 复制链接（带当前文本） ---------- */
  $('btnCopyLink').addEventListener('click', function () {
    var url = location.origin + location.pathname;
    var text = input.value;
    if (text) {
      url += '?text=' + encodeURIComponent(text.slice(0, 5000));
    }
    copyText(url);
  });

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('已复制');
      }, function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('已复制'); } catch (e) { showToast('复制失败'); }
    document.body.removeChild(ta);
  }

  /* ---------- 二维码 ---------- */
  $('btnQr').addEventListener('click', function () {
    var box = $('qrModal');
    var qr = $('qrcode');
    qr.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qr, { text: location.href, width: 180, height: 180 });
    } else {
      qr.textContent = '二维码组件加载失败，请复制链接使用';
    }
    box.classList.add('show');
  });

  /* ---------- 打赏 ---------- */
  $('btnDonate').addEventListener('click', function () {
    $('donateModal').classList.add('show');
  });

  /* ---------- 弹窗关闭 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.close-modal'), function (btn) {
    btn.addEventListener('click', function () {
      $(btn.getAttribute('data-close')).classList.remove('show');
    });
  });
  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('modal')) {
      e.target.classList.remove('show');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      Array.prototype.forEach.call(document.querySelectorAll('.modal.show'), function (m) { m.classList.remove('show'); });
    }
  });

  /* ---------- 自定义词 ---------- */
  var customPanel = $('customPanel');
  $('btnCustom').addEventListener('click', function () {
    var willOpen = customPanel.hasAttribute('hidden');
    if (willOpen) {
      customPanel.removeAttribute('hidden');
    } else {
      customPanel.setAttribute('hidden', '');
    }
    $('btnCustom').classList.toggle('active', willOpen);
    if (willOpen) customWords.focus();
  });
  $('btnSaveCustom').addEventListener('click', saveCustomWords);
  $('btnClearCustom').addEventListener('click', clearCustomWords);
  customWords.value = getCustomWords().join('\n');
  updateCustomBadge();

  /* ---------- 输入计数 ---------- */
  input.addEventListener('input', updateCount);

  /* ---------- URL 参数预填 ---------- */
  (function () {
    var params = new URLSearchParams(location.search);
    var t = params.get('text');
    if (t) {
      input.value = t;
      updateCount();
      $('btnCheck').click();
    }
  })();

  /* ---------- Toast ---------- */
  var toastEl = null;
  var toastTimer = null;
  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }

  function showTip(msg) {
    var tip = $('customTip');
    tip.textContent = msg;
    clearTimeout(tip._t);
    tip._t = setTimeout(function () { tip.textContent = ''; }, 2000);
  }

  /* ---------- 页脚链接 ---------- */
  (function () {
    var link = $('footerLink');
    if (!link) return;
    var fallback = link.getAttribute('href');
    fetch('https://weiyingjun.top/link_config.json', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.link_url) {
          link.href = data.link_url;
          link.target = '_blank';
        }
      })
      .catch(function () { link.href = fallback; });
  })();
})();
