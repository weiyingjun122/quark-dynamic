/* Aho-Corasick 多模式匹配引擎
 * 用于在文本中同时查找大量违禁词，支持重叠命中，性能远优于逐词遍历。
 */
(function (global) {
  'use strict';

  function AhoCorasick(words) {
    this.build(words);
  }

  AhoCorasick.prototype.build = function (words) {
    this.trie = {};
    this.fail = [];
    this.nums = [];
    // root = 0
    this.trie[0] = {};
    this.fail[0] = 0;
    this.nums[0] = [];

    var maxLen = 0;
    words = words || [];

    // 1) 构建 Trie
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w || typeof w !== 'string') continue;
      w = w.trim();
      if (!w) continue;
      if (w.length > maxLen) maxLen = w.length;

      var node = 0;
      for (var j = 0; j < w.length; j++) {
        var ch = w[j];
        var next = this.trie[node][ch];
        if (next === undefined) {
          next = Object.keys(this.trie).length;
          this.trie[next] = {};
          this.fail[next] = 0;
          this.nums[next] = [];
          this.trie[node][ch] = next;
        }
        node = next;
      }
      this.nums[node].push(w);
    }
    this.maxLen = maxLen;

    // 2) BFS 构建失败指针
    var queue = [];
    for (var c in this.trie[0]) {
      var child = this.trie[0][c];
      queue.push(child);
    }
    while (queue.length) {
      var cur = queue.shift();
      var fnode = this.fail[cur];
      // 继承失败指针节点的输出
      for (var k = 0; k < this.nums[fnode].length; k++) {
        if (this.nums[cur].indexOf(this.nums[fnode][k]) === -1) {
          this.nums[cur].push(this.nums[fnode][k]);
        }
      }
      for (var ch2 in this.trie[cur]) {
        var child2 = this.trie[cur][ch2];
        var fall = fnode;
        while (fall !== 0 && this.trie[fall][ch2] === undefined) {
          fall = this.fail[fall];
        }
        var cand = this.trie[fall][ch2];
        this.fail[child2] = (cand === child2 || cand === undefined) ? 0 : cand;
        queue.push(child2);
      }
    }
  };

  /* 返回所有命中词（去重），以及命中次数统计 */
  AhoCorasick.prototype.findAll = function (text) {
    if (!text) return { words: [], count: 0, positions: [] };
    var node = 0;
    var foundSet = {};
    var positions = [];
    var count = 0;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      while (node !== 0 && this.trie[node][ch] === undefined) {
        node = this.fail[node];
      }
      var nxt = this.trie[node][ch];
      if (nxt !== undefined) {
        node = nxt;
        if (this.nums[node].length) {
          for (var j = 0; j < this.nums[node].length; j++) {
            var w = this.nums[node][j];
            if (!foundSet.hasOwnProperty(w)) {
              foundSet[w] = true;
              count++;
            }
            positions.push({ word: w, index: i - w.length + 1 });
          }
        }
      } else {
        node = 0;
      }
    }

    // 合并相邻/重叠命中，避免标红时嵌套破坏
    positions.sort(function (a, b) { return a.index - b.index; });

    return { words: Object.keys(foundSet), count: count, positions: positions };
  };

  /* 将文本中的命中词用 <mark class="hit"> 包裹，返回 HTML */
  AhoCorasick.prototype.highlight = function (text) {
    if (!text) return '';
    var found = this.findAll(text);
    if (!found.positions.length) return escapeHtml(text);

    // 按起止区间合并，重叠时取更长命中
    var merged = [];
    for (var i = 0; i < found.positions.length; i++) {
      var p = found.positions[i];
      var start = p.index;
      var end = start + p.word.length;
      var last = merged[merged.length - 1];
      if (last && start < last.end) {
        // 重叠：保留覆盖范围更大的
        if (end > last.end) {
          last.end = end;
          last.word = p.word;
        }
      } else {
        merged.push({ start: start, end: end, word: p.word });
      }
    }

    var out = '';
    var pos = 0;
    for (var m = 0; m < merged.length; m++) {
      var seg = merged[m];
      if (seg.start < pos) continue;
      out += escapeHtml(text.slice(pos, seg.start));
      out += '<mark class="hit">' + escapeHtml(text.slice(seg.start, seg.end)) + '</mark>';
      pos = seg.end;
    }
    out += escapeHtml(text.slice(pos));
    return out;
  };

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
  }

  global.AhoCorasick = AhoCorasick;
})(window);
