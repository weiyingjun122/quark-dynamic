#!/usr/bin/env python3
"""
SEO页面生成器 - 电脑只显示二维码版本
确保手机用户只看到链接，电脑用户只看到二维码（不显示备用链接）
"""

import json
import os
import re
import requests
from datetime import datetime
from urllib.parse import quote

# ==================== 配置 ====================
# 获取当前脚本所在目录和项目根目录
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

CONFIG = {
    "cloudflare": {
        "site_url": "https://www.weiyingjun.top",
        "sync_key": "my_secret_sync_key",
        "timeout": 15
    },
    "local": {
        "data_file": os.path.join(PROJECT_ROOT, "data.json"),  # 修复路径
        "output_dir": os.path.join(PROJECT_ROOT, "search"),    # 修复路径
        "min_count": 10,
        "qrcode_dir": os.path.join(PROJECT_ROOT, "static/qrcode")  # 修复路径
    },
    "seo": {
        "site_name": "夸克网盘资源搜索",
        "site_url": "https://www.weiyingjun.top",
        "max_resources": 20
    }
}

# ==================== 获取统计函数 ====================

def get_stats_from_api():
    """从Cloudflare API获取统计信息"""
    
    try:
        sync_url = f"{CONFIG['cloudflare']['site_url']}/api/sync"
        params = {"key": CONFIG['cloudflare']['sync_key']}
        
        response = requests.get(sync_url, params=params, timeout=CONFIG['cloudflare']['timeout'])
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success') and 'stats' in data:
                stats = data['stats']
                print(f"✅ 获取到 {len(stats)} 个关键词统计")
                return stats
    
    except Exception as e:
        print(f"❌ 获取统计失败: {e}")
    
    return {}

# ==================== 页面生成函数 ====================

def get_qrcode_url(resource):
    """获取二维码图片URL"""
    qrcode = resource.get('qrcode', '')
    if qrcode:
        if qrcode.startswith('static/'):
            return f"/{qrcode}"
        elif qrcode.startswith('/'):
            return qrcode
        else:
            return f"/static/qrcode/{qrcode}"
    return ""

def generate_seo_page(keyword, count, resources):
    """生成单个关键词的SEO页面"""
    # 生成安全的文件名
    safe_filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', keyword)
    safe_filename = re.sub(r'\s+', '_', safe_filename.strip())
    if not safe_filename:
        safe_filename = f"keyword_{hash(keyword) % 10000}"
    safe_filename += ".html"
    
    # 生成资源列表
    resource_items = ""
    for i, resource in enumerate(resources[:CONFIG['seo']['max_resources']], 1):
        title = resource.get('title', '未命名资源')
        link = resource.get('share_link', '#')
        qrcode_url = get_qrcode_url(resource)
        
        # 高亮关键词
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
            
            <!-- 手机端内容（默认显示，电脑隐藏） -->
            <div class="resource-content mobile-content">
                <div class="mobile-download">
                    <p class="device-tip">📱 手机用户可直接下载</p>
                    <a href="{link}" class="download-link" target="_blank" rel="nofollow">
                        打开夸克APP保存
                    </a>
                    <div class="link-info">
                        <small>下载链接: {link[:50]}...</small>
                    </div>
                </div>
            </div>
            
            <!-- 电脑端内容（默认隐藏，手机隐藏） -->
            <div class="resource-content desktop-content">
                <div class="desktop-download">
                    <p class="device-tip">💻 电脑用户请使用夸克或微信扫描二维码下载</p>
                    <div class="qrcode-container">
                        <img src="{qrcode_url}" alt="下载二维码" class="qrcode-img">
                    </div>
                </div>
            </div>
        </div>
        """
    
    # 生成完整HTML
    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{keyword}资源下载 - {CONFIG['seo']['site_name']}</title>
    <meta name="description" content="免费提供{keyword}相关资源下载，共{len(resources)}个{keyword}相关资源。">
    <meta name="keywords" content="{keyword},夸克网盘,{keyword}下载,{keyword}资源">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{CONFIG['seo']['site_url']}/search/{safe_filename}">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6726656035929687" crossorigin="anonymous"></script>
    
    <style>
        /* 基础样式 */
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
        
        /* 头部样式 */
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
        
        /* 资源项样式 */
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
        
        /* 内容区域样式 - 关键修改 */
        .resource-content {{
            display: none; /* 默认都隐藏 */
        }}
        
        /* 设备检测后的显示控制 */
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
        
        /* 手机端内容 */
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
        
        /* 电脑端内容 */
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
        
        /* 操作按钮 */
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
        
        /* 页脚 */
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
        
        /* 设备指示器 */
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
            display: none; /* 开发环境可显示 */
        }}
    </style>
    
    <script>
        // 设备检测函数
        function detectDevice() {{
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent.toLowerCase());
            
            // 在body上添加设备类名
            if (isMobile) {{
                document.body.classList.add('mobile');
                document.body.classList.remove('desktop');
            }} else {{
                document.body.classList.add('desktop');
                document.body.classList.remove('mobile');
            }}
            
            // 显示设备指示器（仅开发环境）
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {{
                const indicator = document.getElementById('device-indicator');
                if (indicator) {{
                    indicator.textContent = isMobile ? '📱 手机模式' : '💻 电脑模式';
                    indicator.style.display = 'block';
                }}
            }}
            
            console.log('设备检测:', isMobile ? '手机' : '电脑');
        }}
        
        // 页面加载完成后执行
        document.addEventListener('DOMContentLoaded', function() {{
            // 检测设备并设置对应类名
            detectDevice();
            
            // 监听窗口大小变化（处理设备旋转等）
            window.addEventListener('resize', detectDevice);
            
            // 二维码图片加载失败处理
            const qrcodeImages = document.querySelectorAll('.qrcode-img');
            qrcodeImages.forEach(img => {{
                img.onerror = function() {{
                    this.onerror = null;
                    // 替换为默认二维码或显示错误信息
                    const container = this.parentNode;
                    container.innerHTML = '<div style="padding:20px;color:#999;">二维码加载失败，请尝试其他资源</div>';
                }};
            }});
            
            // 添加手动切换按钮（仅开发环境）
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {{
                const switchBtn = document.createElement('button');
                switchBtn.innerHTML = '🔄 切换设备';
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
                    
                    // 更新指示器
                    const indicator = document.getElementById('device-indicator');
                    if (indicator) {{
                        indicator.textContent = !isMobile ? '📱 手机模式' : '💻 电脑模式';
                    }}
                }};
                document.body.appendChild(switchBtn);
            }}
        }});
    </script>
</head>
<body>
    <!-- 设备指示器（开发环境显示） -->
    <div class="device-indicator" id="device-indicator"></div>
    
    <!-- 头部信息 -->
    <div class="header">
        <h1 class="keyword-title">"{keyword}" 资源免费下载</h1>
        <div class="stats">
            🔥 搜索热度: {count}次 | 📁 相关资源: {len(resources)}个
        </div>
    </div>
    
    <!-- 资源列表 -->
    <div class="resources-container">
        <h2 style="text-align: center; margin: 20px 0; color: #444;">📚 相关资源列表</h2>
        {resource_items}
    </div>
    
    <!-- 操作按钮 -->
    <div class="action-buttons">
        <a href="/?q={quote(keyword)}" class="action-btn">
            🔍 搜索更多"{keyword}"资源
        </a>
        <a href="/search/" class="action-btn secondary">
            📊 查看所有热门关键词
        </a>
        <a href="/" class="action-btn secondary">
            🏠 返回首页
        </a>
    </div>
    
    <!-- 页脚 -->
    <div class="footer">
        <p>© {datetime.now().year} {CONFIG['seo']['site_name']} | 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
        <div class="footer-links">
            <a href="/search/">所有热门关键词</a>
            <a href="/">返回首页</a>
        </div>
        <p style="margin-top: 10px; font-size: 12px; color: #999;">
            自动适配设备类型，手机显示下载链接，电脑显示二维码
        </p>
    </div>
</body>
</html>"""
    
    # 保存文件
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

# ==================== 索引和站点地图函数 ====================

def generate_index_page(generated_pages):
    """生成关键词索引页面"""
    index_content = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>热门搜索关键词 - 夸克网盘资源</title>
    <meta name="description" content="根据用户搜索热度自动生成的热门关键词资源页面。">
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
        <h1 class="title">🔥 热门搜索关键词</h1>
        <p>根据用户搜索热度自动生成</p>
    </div>
    
    <div class="keyword-grid">
'''
    
    # 按搜索次数排序
    sorted_pages = sorted(generated_pages, key=lambda x: x['count'], reverse=True)
    
    for page in sorted_pages:
        index_content += f'''
        <div class="keyword-card">
            <h3 class="keyword-title">
                <a href="{page['file']}">{page['keyword']}</a>
            </h3>
            <div class="keyword-meta">
                <span class="search-count">🔥 {page['count']}次搜索</span>
                <span class="resource-count">📁 {page['resource_count']}个资源</span>
            </div>
        </div>'''
    
    index_content += f'''
    </div>
    
    <div class="footer">
        <p>© {datetime.now().year} {CONFIG['seo']['site_name']}</p>
        <p>生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        <p>共 {len(generated_pages)} 个热门关键词</p>
    </div>
</body>
</html>'''
    
    output_path = os.path.join(CONFIG['local']['output_dir'], "index.html")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(index_content)
    
    print(f"✅ 生成索引页: {output_path}")

def generate_sitemap(generated_pages):
    """生成站点地图 - 包含所有 HTML 文件"""
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
    
    # 扫描 search 目录下所有 HTML 文件，而非仅用 generated_pages
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
    
    print(f"✅ 生成站点地图: {sitemap_path} ({len(all_html_files)} 个页面)")

# ==================== 主函数 ====================

def main():
    """主函数"""
    print("🚀 SEO页面生成器 - 电脑只显示二维码版本")
    print("=" * 60)
    
    # 打印调试信息
    print(f"脚本目录: {SCRIPT_DIR}")
    print(f"项目根目录: {PROJECT_ROOT}")
    print(f"数据文件路径: {CONFIG['local']['data_file']}")
    print(f"输出目录: {CONFIG['local']['output_dir']}")
    
    # 检查文件是否存在
    if not os.path.exists(CONFIG['local']['data_file']):
        print(f"❌ 数据文件不存在: {CONFIG['local']['data_file']}")
        print(f"当前目录内容: {os.listdir(PROJECT_ROOT)}")
        return
    
    # 1. 获取统计
    print("\n1️⃣ 获取搜索统计...")
    stats = get_stats_from_api()
    
    if not stats:
        print("⚠️ 使用示例数据继续")
        stats = {"剧本杀": 23, "启蒙英语": 15}
    
    print(f"\n📊 找到 {len(stats)} 个关键词统计")
    
    # 2. 筛选热门关键词
    min_count = CONFIG['local']['min_count']
    print(f"\n2️⃣ 筛选热门关键词 (≥{min_count}次)...")
    
    hot_keywords = []
    for keyword, count in stats.items():
        if isinstance(count, (int, float)):
            count_int = int(count)
            if count_int >= min_count:
                hot_keywords.append((keyword, count_int))
    
    hot_keywords.sort(key=lambda x: x[1], reverse=True)
    
    if not hot_keywords:
        print(f"❌ 没有搜索次数≥{min_count}的关键词")
        return
    
    print(f"✅ 找到 {len(hot_keywords)} 个热门关键词:")
    for kw, cnt in hot_keywords:
        print(f"  {kw}: {cnt}次")
    
    # 3. 加载资源
    print(f"\n3️⃣ 加载资源数据...")
    data_file = CONFIG['local']['data_file']
    
    print(f"加载文件: {data_file}")
    print(f"文件是否存在: {os.path.exists(data_file)}")
    
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            resources = json.load(f)
        print(f"✅ 加载 {len(resources)} 个资源")
        
    except Exception as e:
        print(f"❌ 加载失败: {e}")
        print(f"错误详情: {e.__class__.__name__}: {str(e)}")
        return
    
    # 4. 生成页面
    print(f"\n4️⃣ 生成SEO页面...")
    output_dir = CONFIG['local']['output_dir']
    print(f"输出目录: {output_dir}")
    
    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)
    print(f"输出目录已创建: {os.path.exists(output_dir)}")
    
    generated_pages = []
    
    for keyword, count in hot_keywords:
        print(f"  处理: '{keyword}' ({count}次搜索)")
        
        # 查找匹配资源
        matched_resources = []
        keyword_lower = keyword.lower()
        
        for resource in resources:
            # 如果有 search_aliases，用别名匹配（双向匹配）
            search_aliases = resource.get('search_aliases', [])
            if isinstance(search_aliases, list) and search_aliases:
                if any(keyword_lower in str(alias).lower() or str(alias).lower() in keyword_lower for alias in search_aliases):
                    matched_resources.append(resource)
                    continue
            
            # 没有别名时，用 title 匹配
            title = resource.get('title', '').lower()
            if keyword_lower in title:
                matched_resources.append(resource)
                continue
            
            # 检查keywords
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
            print(f"    ⚠️  未找到相关资源，跳过")
            continue
        
        print(f"    ✅ 找到 {len(matched_resources)} 个相关资源")
        
        # 生成HTML页面
        page_info = generate_seo_page(keyword, count, matched_resources)
        if page_info:
            generated_pages.append(page_info)
    
    # 5. 生成索引和站点地图
    if generated_pages:
        print(f"\n5️⃣ 生成索引和站点地图...")
        generate_index_page(generated_pages)
        generate_sitemap(generated_pages)
        
        # 输出统计
        print(f"\n" + "=" * 60)
        print(f"🎉 生成完成！")
        print(f"📊 统计信息:")
        print(f"  • 生成页面: {len(generated_pages)} 个")
        print(f"  • 总搜索次数: {sum(p['count'] for p in generated_pages)} 次")
        print(f"  • 总资源数: {sum(p['resource_count'] for p in generated_pages)} 个")
        print(f"  • 设备适配: 手机显示下载链接，电脑只显示二维码")
    else:
        print(f"\n❌ 没有生成任何页面")

if __name__ == "__main__":
    main()