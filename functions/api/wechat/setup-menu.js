// functions/api/wechat/setup-menu.js
// 临时接口：创建公众号自定义菜单（view型按钮），带 IP 白名单引导。配完即删。
// 用法：GET /api/wechat/setup-menu?k=wx2026menu
// 若微信返回 40164，接口会回显我方出口IP，将该IP加入「API IP白名单」后重试

const MENU = {
  button: [
    { type: 'view', name: '找资源', url: 'https://www.weiyingjun.top/search/?ch=wechat-menu' },
    { type: 'view', name: '热门考研', url: 'https://www.weiyingjun.top/search/?q=%E8%80%83%E7%A0%94&ch=wechat-menu' },
    { type: 'view', name: '关于', url: 'https://www.weiyingjun.top/' }
  ]
};

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  if (url.searchParams.get('k') !== 'wx2026menu') {
    return new Response('forbidden', { status: 403 });
  }
  if (!env.WECHAT_APPID || !env.WECHAT_APP_SECRET) {
    return json({ error: 'missing WECHAT_APPID / WECHAT_APP_SECRET' });
  }

  const tokenUrl = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential' +
    '&appid=' + env.WECHAT_APPID + '&secret=' + env.WECHAT_APP_SECRET;
  const tr = await fetch(tokenUrl);
  const tj = await tr.json();

  if (tj.errcode) {
    if (tj.errcode === 40164) {
      const m = (tj.errmsg || '').match(/invalid ip ([0-9.]+)/);
      return json({
        step: 'need-whitelist',
        ourEgressIp: m ? m[1] : tj.errmsg,
        errmsg: tj.errmsg,
        todo: '把这个IP加入 API IP白名单（微信开发者平台→我的业务→公众号→基础信息→开发密钥→API IP白名单），然后重新访问本页；若再次出现新IP，重复添加'
      });
    }
    return json({ step: 'token-failed', errcode: tj.errcode, errmsg: tj.errmsg });
  }

  const token = tj.access_token;
  const mr = await fetch('https://api.weixin.qq.com/cgi-bin/menu/create?access_token=' + token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(MENU)
  });
  const mj = await mr.json();

  if (mj.errcode === 0) {
    return json({ step: 'menu-created', result: mj, menu: MENU, note: '菜单已创建，手机端稍等几分钟查看；可删除本接口' });
  }
  if (mj.errcode === 40164) {
    const m = (mj.errmsg || '').match(/invalid ip ([0-9.]+)/);
    return json({ step: 'need-whitelist', ourEgressIp: m ? m[1] : mj.errmsg, errmsg: mj.errmsg });
  }
  return json({ step: 'menu-failed', errcode: mj.errcode, errmsg: mj.errmsg });
}
