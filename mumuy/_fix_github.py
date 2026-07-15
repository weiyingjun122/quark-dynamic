import os, re

root = r'D:\Download\github\SoftwareTools'
skip_dirs = {'_main-site', 'node_modules', '.git', '__pycache__'}

# === 1. Update projects.js - keep only remaining 11 projects ===
js_path = os.path.join(root, 'static', 'script', 'projects.js')
with open(js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the entire list with only remaining projects
new_list = '''\tlet list = [{
\t\t'url':'/mumuy/relationship/',
\t\t'name':'亲戚关系计算器'
\t},{
\t\t'url':'/mumuy/pacman/',
\t\t'name':'吃豆人游戏'
\t},{
\t\t'url':'/mumuy/gobang/',
\t\t'name':'五子棋人机对战'
\t},{
\t\t'url':'/mumuy/data_location/',
\t\t'name':'行政区划数据'
\t},{
\t\t'url':'/mumuy/idcard/',
\t\t'name':'身份证号码解析'
\t},{
\t\t'url':'/mumuy/calendar/',
\t\t'name':'万年历'
\t},{
\t\t'url':'/mumuy/browser/',
\t\t'name':'浏览器判断'
\t},{
\t\t'url':'/mumuy/widget-qrcode/',
\t\t'name':'二维码美化组件'
\t},{
\t\t'url':'/mumuy/blackjack/',
\t\t'name':'21点纸牌'
\t},{
\t\t'url':'/mumuy/calc24/',
\t\t'name':'24点游戏'
\t},{
\t\t'url':'/mumuy/chinese-transverter/',
\t\t'name':'简繁转换'
\t}];'''

content = re.sub(r'\tlet list = \[.*?\];', new_list, content, flags=re.DOTALL)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated: static/script/projects.js')

# === 2. Remove GitHub buttons from all HTML files ===
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in skip_dirs]
    if any(ex in dirpath for ex in skip_dirs):
        continue
    
    for f in filenames:
        if not f.endswith('.html'):
            continue
        
        filepath = os.path.join(dirpath, f)
        try:
            with open(filepath, 'r', encoding='utf-8') as fh:
                content = fh.read()
        except:
            continue
        
        original = content
        
        # Remove all github-button anchor tags (Follow, Fork, Star, Download)
        content = re.sub(
            r'\s*<a class="github-button".*?</a>\s*',
            '',
            content,
            flags=re.DOTALL
        )
        
        # Remove empty .buttons or .mod-button containers left behind
        content = re.sub(
            r'<div class="buttons">\s*</div>\s*',
            '',
            content,
            flags=re.DOTALL
        )
        content = re.sub(
            r'<div class="mod-button">\s*<div class="inner">\s*</div>\s*</div>\s*',
            '',
            content,
            flags=re.DOTALL
        )
        
        # Remove GitHub buttons JS loader
        content = content.replace(
            '<script async defer src="https://cdn.bootcdn.net/ajax/libs/github-buttons/2.21.1/buttons.min.js"></script>',
            ''
        )
        
        # Clean up empty lines
        content = re.sub(r'\n\s*\n\s*\n+', '\n\n', content)
        
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as fh:
                fh.write(content)
            print(f'Cleaned: {os.path.relpath(filepath, root)}')

print('\nAll done!')
