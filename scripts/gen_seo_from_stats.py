#!/usr/bin/env python3
"""
SEO椤甸潰鐢熸垚鍣?- 鐢佃剳鍙樉绀轰簩缁寸爜鐗堟湰
纭繚鎵嬫満鐢ㄦ埛鍙湅鍒伴摼鎺ワ紝鐢佃剳鐢ㄦ埛鍙湅鍒颁簩缁寸爜锛堜笉鏄剧ず澶囩敤閾炬帴锛?
"""

import json
import os
import re
import requests
from datetime import datetime
from urllib.parse import quote
from pypinyin import lazy_pinyin, Style

# ==================== 閰嶇疆 ====================
# 鑾峰彇褰撳墠鑴氭湰鎵€鍦ㄧ洰褰曞拰椤圭洰鏍圭洰褰?
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

CONFIG = {
    "cloudflare": {
        "site_url": "https://www.weiyingjun.top",
        "sync_key": "my_secret_sync_key",
        "timeout": 15
    },
    "local": {
        "data_file": os.path.join(PROJECT_ROOT, "data.json"),  # 淇璺緞
        "output_dir": os.path.join(PROJECT_ROOT, "search"),    # 淇璺緞
        "min_count": 10,
        "qrcode_dir": os.path.join(PROJECT_ROOT, "static/qrcode")  # 淇璺緞
    },
    "seo": {
        "site_name": "瀹炵敤璧勬簮鏁寸悊绔?,
        "site_url": "https://www.weiyingjun.top",
        "max_resources": 20
    }
}

# ==================== 鑾峰彇缁熻鍑芥暟 ====================

def get_stats_from_api():
    """浠嶤loudflare API鑾峰彇缁熻淇℃伅"""
    
    try:
        sync_url = f"{CONFIG['cloudflare']['site_url']}/api/sync"
        params = {"key": CONFIG['cloudflare']['sync_key']}
        
        response = requests.get(sync_url, params=params, timeout=CONFIG['cloudflare']['timeout'])
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success') and 'stats' in data:
                stats = data['stats']
                print(f"鉁?鑾峰彇鍒?{len(stats)} 涓叧閿瘝缁熻")
                return stats
    
    except Exception as e:
        print(f"鉂?鑾峰彇缁熻澶辫触: {e}")
    
    return {}

# ==================== 椤甸潰鐢熸垚鍑芥暟 ====================

def get_qrcode_url(resource):
    """鑾峰彇浜岀淮鐮佸浘鐗嘦RL"""
    qrcode = resource.get('qrcode', '')
    if qrcode:
        if qrcode.startswith('static/'):
            return f"/{qrcode}"
        elif qrcode.startswith('/'):
            return qrcode
        else:
            return f"/static/qrcode/{qrcode}"
    return ""

def chinese_to_pinyin_slug(text):
    """灏嗕腑鏂囪浆鎹负鎷奸煶slug浣滀负鏂囦欢鍚?""
    # 鎻愬彇鎷奸煶棣栧瓧姣嶅ぇ鍐?
    pinyin_list = lazy_pinyin(text, style=Style.NORMAL)
    # 杩囨护闈炲瓧姣嶆暟瀛楀瓧绗︼紝鐢?杩炴帴
    slug = '-'.join([p for p in pinyin_list if p.strip()])
    # 鍙繚鐣欏瓧姣嶆暟瀛楀拰杩炲瓧绗?
    slug = re.sub(r'[^a-z0-9-]', '', slug.lower())
    # 鍘婚櫎澶氫綑杩炲瓧绗?
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug if slug else 'page'

def generate_seo_page(keyword, count, resources, used_slugs=None):
    """鐢熸垚鍗曚釜鍏抽敭璇嶇殑SEO椤甸潰"""
    # 浣跨敤鎷奸煶鐢熸垚ASCII鏂囦欢鍚?
    slug = chinese_to_pinyin_slug(keyword)
    # 澶勭悊閲嶅悕锛氬姞鏁板瓧鍚庣紑
    if used_slugs is not None:
        original_slug = slug
        counter = 2
        while slug in used_slugs:
            slug = f"{original_slug}-{counter}"
            counter += 1
        used_slugs.add(slug)
    safe_filename = slug + ".html"
    
    # 鐢熸垚璧勬簮鍒楄〃
    resource_items = ""
    for i, resource in enumerate(resources[:CONFIG['seo']['max_resources']], 1):
        title = resource.get('title', '鏈懡鍚嶈祫婧?)
        link = resource.get('share_link', '#')
        qrcode_url = get_qrcode_url(resource)
        
        # 楂樹寒鍏抽敭璇?
        highlighted_title = re.sub(
            f'({re.escape(keyword)})',
            r'<span class="highlight">\1</span>',
            title,
            flags=re.IGNORECASE
        )
        
        resource_items += f"""
        <div class="resource-item">
            <div class="resource-header">
                <span class="resource-index">{i}.</span>
                <h3 class="resource-title">{highlighted_title}</h3>
            </div>
            
            <!-- 鎵嬫満绔唴瀹癸紙榛樿鏄剧ず锛岀數鑴戦殣钘忥級 -->
            <div class="resource-content mobile-content">
                <div class="mobile-download">
                    <p class="device-tip">馃摫 鎵嬫満鐢ㄦ埛鍙洿鎺ヤ笅杞?/p>
                    <a href="{link}" class="download-link" target="_blank" rel="nofollow">
                        鎵撳紑閾炬帴
                    </a>
                    <div class="link-info">
                        <small>涓嬭浇閾炬帴: {link[:50]}...</small>
                    </div>
                </div>
            </div>
            
            <!-- 鐢佃剳绔唴瀹癸紙榛樿闅愯棌锛屾墜鏈洪殣钘忥級 -->
            <div class="resource-content desktop-content">
                <div class="desktop-download">
                    <p class="device-tip">馃捇 鐢佃剳鐢ㄦ埛璇蜂娇鐢ㄥ井淇℃垨娴忚鍣ㄦ壂鎻忎簩缁寸爜涓嬭浇</p>
                    <div class="qrcode-container">
                        <img src="{qrcode_url}" alt="涓嬭浇浜岀淮鐮? class="qrcode-img">
                    </div>
                </div>
            </div>
        </div>
        """
    
    # 鐢熸垚瀹屾暣HTML
    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{keyword}璧勬簮涓嬭浇 - {CONFIG['seo']['site_name']}</title>
    <meta name="description" content="鍏嶈垂鎻愪緵{keyword}鐩稿叧璧勬簮涓嬭浇锛屽叡{len(resources)}涓獅keyword}鐩稿叧璧勬簮銆?>
    <meta name="keywords" content="{keyword},璧勬簮涓嬭浇,{keyword}涓嬭浇,{keyword}璧勬簮">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{CONFIG['seo']['site_url']}/search/{safe_filename}">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6726656035929687" crossorigin="anonymous"></script>
    
    <style>
        /* 鍩虹鏍峰紡 */
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            background: #f8f9fa;
            line-height: 1.6;
            color: #333;
        }}
        
        /* 澶撮儴鏍峰紡 */
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 30px;
            text-align: center;
        }}
        
        .keyword-title {{
            font-size: 28px;
            margin-bottom: 10px;
        }}
        
        .stats {{
            font-size: 16px;
            opacity: 0.9;
        }}
        
        /* 璧勬簮椤规牱寮?*/
        .resource-item {{
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            box-shadow: 0 3px 10px rgba(0,0,0,0.08);
        }}
        
        .resource-header {{
            display: flex;
            align-items: flex-start;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #eee;
        }}
        
        .resource-index {{
            background: #667eea;
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            margin-right: 15px;
            flex-shrink: 0;
        }}
        
        .resource-title {{
            font-size: 20px;
            color: #333;
            flex-grow: 1;
        }}
        
        .highlight {{
            color: #e74c3c;
            font-weight: bold;
            background: #ffebee;
            padding: 2px 6px;
            border-radius: 3px;
        }}
        
        /* 鍐呭鍖哄煙鏍峰紡 - 鍏抽敭淇敼 */
        .resource-content {{
            display: none; /* 榛樿閮介殣钘?*/
        }}
        
        /* 璁惧妫€娴嬪悗鐨勬樉绀烘帶鍒?*/
        .mobile .mobile-content {{
            display: block !important;
        }}
        
        .mobile .desktop-content {{
            display: none !important;
        }}
        
        .desktop .mobile-content {{
            display: none !important;
        }}
        
        .desktop .desktop-content {{
            display: block !important;
        }}
        
        /* 鎵嬫満绔唴瀹?*/
        .mobile-download {{
            text-align: center;
            padding: 20px 0;
        }}
        
        .device-tip {{
            color: #666;
            margin-bottom: 15px;
            font-size: 16px;
        }}
        
        .download-link {{
            display: inline-block;
            background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
            color: white;
            text-decoration: none;
            padding: 12px 30px;
            border-radius: 50px;
            font-size: 16px;
            font-weight: bold;
            margin: 10px 0;
            transition: all 0.3s;
        }}
        
        .download-link:hover {{
            transform: scale(1.05);
            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
        }}
        
        .link-info {{
            background: #f5f5f5;
            padding: 10px;
            border-radius: 6px;
            margin-top: 15px;
            font-size: 13px;
            color: #666;
            word-break: break-all;
        }}
        
        /* 鐢佃剳绔唴瀹?*/
        .desktop-download {{
            text-align: center;
            padding: 20px 0;
        }}
        
        .qrcode-container {{
            background: white;
            padding: 15px;
            border-radius: 8px;
            display: inline-block;
            box-shadow: 0 3px 10px rgba(0,0,0,0.1);
            margin: 10px 0;
        }}
        
        .qrcode-img {{
            width: 200px;
            height: 200px;
            object-fit: contain;
        }}
        
        /* 鎿嶄綔鎸夐挳 */
        .action-buttons {{
            display: flex;
            justify-content: center;
            gap: 15px;
            margin: 30px 0;
            flex-wrap: wrap;
        }}
        
        .action-btn {{
            background: #007bff;
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 50px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.3s;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }}
        
        .action-btn:hover {{
            background: #0056b3;
            transform: translateY(-2px);
        }}
        
        .action-btn.secondary {{
            background: #6c757d;
        }}
        
        .action-btn.secondary:hover {{
            background: #545b62;
        }}
        
        /* 椤佃剼 */
        .footer {{
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
        }}
        
        .footer-links {{
            margin-top: 10px;
        }}
        
        .footer-links a {{
            color: #667eea;
            text-decoration: none;
            margin: 0 10px;
        }}
        
        .footer-links a:hover {{
            text-decoration: underline;
        }}
        
        /* 璁惧鎸囩ず鍣?*/
        .device-indicator {{
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 12px;
            z-index: 1000;
            display: none; /* 寮€鍙戠幆澧冨彲鏄剧ず */
        }}
    </style>
    
    <script>
        // 璁惧妫€娴嬪嚱鏁?
        function detectDevice() {{
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent.toLowerCase());
            
            // 鍦╞ody涓婃坊鍔犺澶囩被鍚?
            if (isMobile) {{
                document.body.classList.add('mobile');
                document.body.classList.remove('desktop');
            }} else {{
                document.body.classList.add('desktop');
                document.body.classList.remove('mobile');
            }}
            
            // 鏄剧ず璁惧鎸囩ず鍣紙浠呭紑鍙戠幆澧冿級
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {{
                const indicator = document.getElementById('device-indicator');
                if (indicator) {{
                    indicator.textContent = isMobile ? '馃摫 鎵嬫満妯″紡' : '馃捇 鐢佃剳妯″紡';
                    indicator.style.display = 'block';
                }}
            }}
            
            console.log('璁惧妫€娴?', isMobile ? '鎵嬫満' : '鐢佃剳');
        }}
        
        // 椤甸潰鍔犺浇瀹屾垚鍚庢墽琛?
        document.addEventListener('DOMContentLoaded', function() {{
            // 妫€娴嬭澶囧苟璁剧疆瀵瑰簲绫诲悕
            detectDevice();
            
            // 鐩戝惉绐楀彛澶у皬鍙樺寲锛堝鐞嗚澶囨棆杞瓑锛?
            window.addEventListener('resize', detectDevice);
            
            // 浜岀淮鐮佸浘鐗囧姞杞藉け璐ュ鐞?
            const qrcodeImages = document.querySelectorAll('.qrcode-img');
            qrcodeImages.forEach(img => {{
                img.onerror = function() {{
                    this.onerror = null;
                    // 鏇挎崲涓洪粯璁や簩缁寸爜鎴栨樉绀洪敊璇俊鎭?
                    const container = this.parentNode;
                    container.innerHTML = '<div style="padding:20px;color:#999;">浜岀淮鐮佸姞杞藉け璐ワ紝璇峰皾璇曞叾浠栬祫婧?/div>';
                }};
            }});
            
            // 娣诲姞鎵嬪姩鍒囨崲鎸夐挳锛堜粎寮€鍙戠幆澧冿級
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {{
                const switchBtn = document.createElement('button');
                switchBtn.innerHTML = '馃攧 鍒囨崲璁惧';
                switchBtn.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 20px;
                    font-size: 12px;
                    cursor: pointer;
                    z-index: 1000;
                    opacity: 0.8;
                `;
                switchBtn.onclick = function() {{
                    const isMobile = document.body.classList.contains('mobile');
                    if (isMobile) {{
                        document.body.classList.remove('mobile');
                        document.body.classList.add('desktop');
                    }} else {{
                        document.body.classList.remove('desktop');
                        document.body.classList.add('mobile');
                    }}
                    
                    // 鏇存柊鎸囩ず鍣?
                    const indicator = document.getElementById('device-indicator');
                    if (indicator) {{
                        indicator.textContent = !isMobile ? '馃摫 鎵嬫満妯″紡' : '馃捇 鐢佃剳妯″紡';
                    }}
                }};
                document.body.appendChild(switchBtn);
            }}
        }});
    </script>
</head>
<body>
    <!-- 璁惧鎸囩ず鍣紙寮€鍙戠幆澧冩樉绀猴級 -->
    <div class="device-indicator" id="device-indicator"></div>
    
    <!-- 澶撮儴淇℃伅 -->
    <div class="header">
        <h1 class="keyword-title">"{keyword}" 璧勬簮鍏嶈垂涓嬭浇</h1>
        <div class="stats">
            馃敟 鎼滅储鐑害: {count}娆?| 馃搧 鐩稿叧璧勬簮: {len(resources)}涓?
        </div>
    </div>
    
    <!-- 璧勬簮鍒楄〃 -->
    <div class="resources-container">
        <h2 style="text-align: center; margin: 20px 0; color: #444;">馃摎 鐩稿叧璧勬簮鍒楄〃</h2>
        {resource_items}
    </div>
    
    <!-- 鎿嶄綔鎸夐挳 -->
    <div class="action-buttons">
        <a href="/?q={quote(keyword)}" class="action-btn">
            馃攳 鎼滅储鏇村"{keyword}"璧勬簮
        </a>
        <a href="/search/" class="action-btn secondary">
            馃搳 鏌ョ湅鎵€鏈夌儹闂ㄥ叧閿瘝
        </a>
        <a href="/" class="action-btn secondary">
            馃彔 杩斿洖棣栭〉
        </a>
    </div>
    
    <!-- 椤佃剼 -->
    <div class="footer">
        <p>漏 {datetime.now().year} {CONFIG['seo']['site_name']} | 鐢熸垚鏃堕棿: {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
        <div class="footer-links">
            <a href="/search/">鎵€鏈夌儹闂ㄥ叧閿瘝</a>
            <a href="/">杩斿洖棣栭〉</a>
        </div>
        <p style="margin-top: 10px; font-size: 12px; color: #999;">
            鑷姩閫傞厤璁惧绫诲瀷锛屾墜鏈烘樉绀轰笅杞介摼鎺ワ紝鐢佃剳鏄剧ず浜岀淮鐮?
        </p>
    </div>
</body>
</html>"""
    
    # 淇濆瓨鏂囦欢
    output_path = os.path.join(CONFIG['local']['output_dir'], safe_filename)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    return {
        'keyword': keyword,
        'count': count,
        'resource_count': len(resources),
        'file': safe_filename,
        'url': f"/search/{safe_filename}"
    }

# ==================== 绱㈠紩鍜岀珯鐐瑰湴鍥惧嚱鏁?====================

def generate_index_page(generated_pages):
    """鐢熸垚鍏抽敭璇嶇储寮曢〉闈?""
    index_content = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>鐑棬鎼滅储鍏抽敭璇?- 瀹炵敤璧勬簮鏁寸悊绔?/title>
    <meta name="description" content="鏍规嵁鐢ㄦ埛鎼滅储鐑害鑷姩鐢熸垚鐨勭儹闂ㄥ叧閿瘝璧勬簮椤甸潰銆?>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6726656035929687" crossorigin="anonymous"></script>
    <style>
        body {
            font-family: 'Microsoft YaHei', sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f7fa;
        }
        .header {
            text-align: center;
            padding: 30px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 12px;
            margin-bottom: 30px;
        }
        .title {
            font-size: 28px;
            margin-bottom: 10px;
        }
        .keyword-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .keyword-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .keyword-title {
            font-size: 18px;
            margin-bottom: 10px;
        }
        .keyword-title a {
            color: #333;
            text-decoration: none;
        }
        .keyword-title a:hover {
            color: #667eea;
        }
        .keyword-meta {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #666;
        }
        .search-count {
            background: #ff6b6b;
            color: white;
            padding: 2px 8px;
            border-radius: 10px;
        }
        .resource-count {
            background: #4ecdc4;
            color: white;
            padding: 2px 8px;
            border-radius: 10px;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">馃敟 鐑棬鎼滅储鍏抽敭璇?/h1>
        <p>鏍规嵁鐢ㄦ埛鎼滅储鐑害鑷姩鐢熸垚</p>
    </div>
    
    <div class="keyword-grid">
'''
    
    # 鎸夋悳绱㈡鏁版帓搴?
    sorted_pages = sorted(generated_pages, key=lambda x: x['count'], reverse=True)
    
    for page in sorted_pages:
        index_content += f'''
        <div class="keyword-card">
            <h3 class="keyword-title">
                <a href="{page['file']}">{page['keyword']}</a>
            </h3>
            <div class="keyword-meta">
                <span class="search-count">馃敟 {page['count']}娆℃悳绱?/span>
                <span class="resource-count">馃搧 {page['resource_count']}涓祫婧?/span>
            </div>
        </div>'''
    
    index_content += f'''
    </div>
    
    <div class="footer">
        <p>漏 {datetime.now().year} {CONFIG['seo']['site_name']}</p>
        <p>鐢熸垚鏃堕棿: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        <p>鍏?{len(generated_pages)} 涓儹闂ㄥ叧閿瘝</p>
    </div>
</body>
</html>'''
    
    output_path = os.path.join(CONFIG['local']['output_dir'], "index.html")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(index_content)
    
    print(f"鉁?鐢熸垚绱㈠紩椤? {output_path}")

def generate_sitemap(generated_pages):
    """鐢熸垚绔欑偣鍦板浘 - 鍖呭惈鎵€鏈?HTML 鏂囦欢"""
    sitemap = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>{CONFIG['seo']['site_url']}/</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>{CONFIG['seo']['site_url']}/search/</loc>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>'''
    
    # 鎵弿 search 鐩綍涓嬫墍鏈?HTML 鏂囦欢锛岃€岄潪浠呯敤 generated_pages
    search_dir = CONFIG['local']['output_dir']
    all_html_files = sorted([f for f in os.listdir(search_dir) if f.endswith('.html')])
    
    for filename in all_html_files:
        sitemap += f'''
    <url>
        <loc>{CONFIG['seo']['site_url']}/search/{filename}</loc>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>'''
    
    sitemap += '''
</urlset>'''
    
    sitemap_path = os.path.join(search_dir, "sitemap.xml")
    with open(sitemap_path, 'w', encoding='utf-8') as f:
        f.write(sitemap)
    
    print(f"鉁?鐢熸垚绔欑偣鍦板浘: {sitemap_path} ({len(all_html_files)} 涓〉闈?")

# ==================== 涓诲嚱鏁?====================

def main():
    """涓诲嚱鏁?""
    print("馃殌 SEO椤甸潰鐢熸垚鍣?- 鐢佃剳鍙樉绀轰簩缁寸爜鐗堟湰")
    print("=" * 60)
    
    # 鎵撳嵃璋冭瘯淇℃伅
    print(f"鑴氭湰鐩綍: {SCRIPT_DIR}")
    print(f"椤圭洰鏍圭洰褰? {PROJECT_ROOT}")
    print(f"鏁版嵁鏂囦欢璺緞: {CONFIG['local']['data_file']}")
    print(f"杈撳嚭鐩綍: {CONFIG['local']['output_dir']}")
    
    # 妫€鏌ユ枃浠舵槸鍚﹀瓨鍦?
    if not os.path.exists(CONFIG['local']['data_file']):
        print(f"鉂?鏁版嵁鏂囦欢涓嶅瓨鍦? {CONFIG['local']['data_file']}")
        print(f"褰撳墠鐩綍鍐呭: {os.listdir(PROJECT_ROOT)}")
        return
    
    # 1. 鑾峰彇缁熻
    print("\n1锔忊儯 鑾峰彇鎼滅储缁熻...")
    stats = get_stats_from_api()
    
    if not stats:
        print("鈿狅笍 浣跨敤绀轰緥鏁版嵁缁х画")
        stats = {"鍓ф湰鏉€": 23, "鍚挋鑻辫": 15}
    
    print(f"\n馃搳 鎵惧埌 {len(stats)} 涓叧閿瘝缁熻")
    
    # 2. 绛涢€夌儹闂ㄥ叧閿瘝
    min_count = CONFIG['local']['min_count']
    print(f"\n2锔忊儯 绛涢€夌儹闂ㄥ叧閿瘝 (鈮min_count}娆?...")
    
    hot_keywords = []
    for keyword, count in stats.items():
        if isinstance(count, (int, float)):
            count_int = int(count)
            if count_int >= min_count:
                hot_keywords.append((keyword, count_int))
    
    hot_keywords.sort(key=lambda x: x[1], reverse=True)
    
    if not hot_keywords:
        print(f"鉂?娌℃湁鎼滅储娆℃暟鈮min_count}鐨勫叧閿瘝")
        return
    
    print(f"鉁?鎵惧埌 {len(hot_keywords)} 涓儹闂ㄥ叧閿瘝:")
    for kw, cnt in hot_keywords:
        print(f"  {kw}: {cnt}娆?)
    
    # 3. 鍔犺浇璧勬簮
    print(f"\n3锔忊儯 鍔犺浇璧勬簮鏁版嵁...")
    data_file = CONFIG['local']['data_file']
    
    print(f"鍔犺浇鏂囦欢: {data_file}")
    print(f"鏂囦欢鏄惁瀛樺湪: {os.path.exists(data_file)}")
    
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            resources = json.load(f)
        print(f"鉁?鍔犺浇 {len(resources)} 涓祫婧?)
        
    except Exception as e:
        print(f"鉂?鍔犺浇澶辫触: {e}")
        print(f"閿欒璇︽儏: {e.__class__.__name__}: {str(e)}")
        return
    
    # 4. 鐢熸垚椤甸潰
    print(f"\n4锔忊儯 鐢熸垚SEO椤甸潰...")
    output_dir = CONFIG['local']['output_dir']
    print(f"杈撳嚭鐩綍: {output_dir}")
    
    # 纭繚杈撳嚭鐩綍瀛樺湪
    os.makedirs(output_dir, exist_ok=True)
    print(f"杈撳嚭鐩綍宸插垱寤? {os.path.exists(output_dir)}")
    
    generated_pages = []
    used_slugs = set()
    
    for keyword, count in hot_keywords:
        print(f"  澶勭悊: '{keyword}' ({count}娆℃悳绱?")
        
        # 鏌ユ壘鍖归厤璧勬簮
        matched_resources = []
        keyword_lower = keyword.lower()
        
        for resource in resources:
            # 濡傛灉鏈?search_aliases锛岀敤鍒悕鍖归厤锛堝弻鍚戝尮閰嶏級
            search_aliases = resource.get('search_aliases', [])
            if isinstance(search_aliases, list) and search_aliases:
                if any(keyword_lower in str(alias).lower() or str(alias).lower() in keyword_lower for alias in search_aliases):
                    matched_resources.append(resource)
                    continue
            
            # 娌℃湁鍒悕鏃讹紝鐢?title 鍖归厤
            title = resource.get('title', '').lower()
            if keyword_lower in title:
                matched_resources.append(resource)
                continue
            
            # 妫€鏌eywords
            keywords = resource.get('keywords', [])
            if isinstance(keywords, list):
                if any(keyword_lower in str(k).lower() for k in keywords):
                    matched_resources.append(resource)
                    continue
            elif isinstance(keywords, str):
                if keyword_lower in keywords.lower():
                    matched_resources.append(resource)
                    continue
        
        if not matched_resources:
            print(f"    鈿狅笍  鏈壘鍒扮浉鍏宠祫婧愶紝璺宠繃")
            continue
        
        print(f"    鉁?鎵惧埌 {len(matched_resources)} 涓浉鍏宠祫婧?)
        
        # 鐢熸垚HTML椤甸潰
        page_info = generate_seo_page(keyword, count, matched_resources, used_slugs)
        if page_info:
            generated_pages.append(page_info)
    
    # 5. 鐢熸垚绱㈠紩鍜岀珯鐐瑰湴鍥?
    if generated_pages:
        print(f"\n5锔忊儯 鐢熸垚绱㈠紩鍜岀珯鐐瑰湴鍥?..")
        generate_index_page(generated_pages)
        generate_sitemap(generated_pages)
        
        # 杈撳嚭缁熻
        print(f"\n" + "=" * 60)
        print(f"馃帀 鐢熸垚瀹屾垚锛?)
        print(f"馃搳 缁熻淇℃伅:")
        print(f"  鈥?鐢熸垚椤甸潰: {len(generated_pages)} 涓?)
        print(f"  鈥?鎬绘悳绱㈡鏁? {sum(p['count'] for p in generated_pages)} 娆?)
        print(f"  鈥?鎬昏祫婧愭暟: {sum(p['resource_count'] for p in generated_pages)} 涓?)
        print(f"  鈥?璁惧閫傞厤: 鎵嬫満鏄剧ず涓嬭浇閾炬帴锛岀數鑴戝彧鏄剧ず浜岀淮鐮?)
    else:
        print(f"\n鉂?娌℃湁鐢熸垚浠讳綍椤甸潰")

if __name__ == "__main__":
    main()
