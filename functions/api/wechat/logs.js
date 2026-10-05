// functions/api/wechat/logs.js
// 查询机器人收发记录（含回复内容），返回解析好的中文字段
// GET /api/wechat/logs?q=关键词&kind=post&from=openid&limit=50&page=1

function checkAuth(request) {
  const authHeader = request.headers.get('Authorization');
  const adminToken = 'wyj122731';
  return authHeader === `Bearer ${adminToken}`;
}

function getXmlTag(xml, tag) {
  let m = xml.match(new RegExp('<' + tag + '><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></' + tag + '>'));
  if (!m) m = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1] : '';
}

function noteLabel(note, kind) {
  const n = note || '';
  if (n === 'verify ok') return '服务器验证通过';
  if (n === 'bad signature') return '签名错误';
  if (n === 'reply welcome') return '关注欢迎语';
  let m = n.match(/^reply news=1 hits=(\d+)$/);
  if (m) return '图文卡片（候选' + m[1] + '条）';
  if (n === 'reply text miss') return '未命中·文字引导';
  if (n.startsWith('query error')) return '查询失败';
  if (n.startsWith('empty event=')) {
    const ev = n.slice('empty event='.length);
    if (ev === 'subscribe') return '事件·关注';
    if (ev === 'unsubscribe') return '事件·取消关注';
    return '事件·' + ev;
  }
  if (n === 'empty non-text') return '非文本消息·无回复';
  if (n === 'empty q') return '空内容·无回复';
  if (n === 'no db binding') return '数据库未配置';
  if (kind === 'get') return '服务器验证';
  return n || '-';
}

function userMsgOf(body, note) {
  if (!body) return '';
  const content = getXmlTag(body, 'Content');
  if (content) return content;
  const ev = getXmlTag(body, 'Event');
  if (ev) return '[' + ev + ']';
  return noteLabel(note);
}

function bjTime(s) {
  if (!s) return '';
  const t = Date.parse(String(s).replace(' ', 'T') + 'Z');
  if (isNaN(t)) return s;
  const d = new Date(t + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
    ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
}

function shape(r) {
  return {
    id: r.id,
    time: bjTime(r.created_at),
    from_user: r.from_user || '',
    user_msg: userMsgOf(r.body || '', r.note),
    reply_type: noteLabel(r.note, r.kind),
    reply: r.reply || '',
    sig_ok: r.sig_ok,
    kind: r.kind
  };
}

export async function onRequestGet(context) {
  const { env, request } = context;

  if (!checkAuth(request)) {
    return Response.json({ success: false, error: '未授权' }, { status: 401 });
  }

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置' });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const kind = (url.searchParams.get('kind') || '').trim().slice(0, 20);
  const from = (url.searchParams.get('from') || '').trim().slice(0, 64);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (kind) { where.push('kind = ?'); params.push(kind); }
  if (from) { where.push('from_user = ?'); params.push(from); }
  if (q) {
    where.push('(from_user LIKE ? OR body LIKE ? OR note LIKE ? OR reply LIKE ?)');
    params.push('%' + q + '%', '%' + q + '%', '%' + q + '%', '%' + q + '%');
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

  try {
    const rows = await env.RESOURCES_DB.prepare(
      'SELECT * FROM wechat_logs' + whereSql + ' ORDER BY id DESC LIMIT ? OFFSET ?'
    ).bind(...params, limit, offset).all();
    const countRow = await env.RESOURCES_DB.prepare(
      'SELECT COUNT(*) as total FROM wechat_logs' + whereSql
    ).bind(...params).first();
    return Response.json({
      success: true,
      results: (rows.results || []).map(shape),
      total: countRow?.total || 0,
      page,
      limit
    });
  } catch (err) {
    return Response.json({ success: false, error: '查询失败（旧表缺 reply 列时请执行 schema-logs.sql 中的 ALTER）' });
  }
}
