import pandas as pd
import qrcode
import json
import os
import re
import openpyxl

# 文件路径
xlsx_file = "../resources.xlsx"
muban_file = "D:/Download/智能体/剧本杀模板.xlsx"
output_json = "../data.json"
qrcode_dir = "../static/qrcode"

# 创建二维码目录
os.makedirs(qrcode_dir, exist_ok=True)

# 读取剧本杀模板，建立名称->类型映射
muban_types = {}
try:
    muban_wb = openpyxl.load_workbook(muban_file, read_only=True)
    muban_ws = muban_wb['Sheet1']
    for row in muban_ws.iter_rows(min_row=2, values_only=True):
        name = str(row[0] or "").strip()
        juben_type = str(row[4] or "").strip()
        if name and juben_type and juben_type.lower() != 'nan':
            muban_types[name] = juben_type
    muban_wb.close()
    print(f"Loaded {len(muban_types)} 剧本杀 types from template")
except Exception as e:
    print(f"Warning: Could not load 剧本杀 template: {e}")

# 关键词->类型映射（兜底匹配）
KEYWORD_TYPE_MAP = {
    '恐怖': '恐怖', '惊悚': '惊悚', '悬疑': '悬疑', '推理': '推理',
    '情感': '情感', '欢乐': '欢乐', '机制': '机制', '古风': '古风',
    '仙侠': '仙侠', '科幻': '科幻', '武侠': '武侠', '民国': '民国',
    '现代': '现代', '硬核': '硬核', '还原': '还原', '沉浸': '沉浸',
    '治愈': '治愈', '反转': '反转', '玄幻': '玄幻', '欧式': '欧式',
    '日式': '日式', '谍战': '谍战', '豪门': '豪门', '本格': '本格',
    '微恐': '微恐', '剧情': '剧情', '动作': '动作',
    '谋杀': '推理', '凶杀': '推理', '案件': '推理', '侦探': '推理',
    '密室': '推理', '杀人': '推理', '死亡': '恐怖',
    '鬼': '恐怖', '灵异': '恐怖', '诅咒': '恐怖', '怪谈': '恐怖',
    '搞笑': '欢乐', '喜剧': '欢乐', '撕逼': '欢乐', '沙雕': '欢乐',
    '江湖': '武侠', '修仙': '仙侠', '宫廷': '古风', '宫斗': '古风',
    '末日': '科幻', '未来': '科幻', '太空': '科幻',
    '战争': '剧情', '革命': '剧情', '历史': '剧情',
    '盗墓': '探险', '探险': '探险', '解谜': '推理', '烧脑': '推理',
    '催泪': '情感', '虐心': '情感', '感人': '情感',
    '阵营': '机制', '对抗': '机制', '策略': '机制', '权谋': '机制',
    '精神病院': '恐怖', '庄园': '推理', '城堡': '推理',
    '游轮': '推理', '列车': '推理',
}

def clean_title(title):
    """去除人数后缀和括号内容"""
    t = title.strip()
    t = re.sub(r'\s*\d+[-~]\d*人?\s*(开放|封闭|半开放)?\s*$', '', t)
    t = re.sub(r'\s*\d+人?\s*(开放|封闭|半开放)?\s*$', '', t)
    t = t.replace("《", "").replace("》", "").strip()
    return t

def match_juben_type(title):
    """匹配剧本杀类型：模板 > 关键词"""
    ct = clean_title(title)
    # 1. 模板精确匹配
    if ct in muban_types:
        return muban_types[ct]
    # 2. 关键词匹配
    for kw, jtype in KEYWORD_TYPE_MAP.items():
        if kw in title:
            return jtype
    return ""

# 使用 pandas 读取 Excel
df = pd.read_excel(xlsx_file, engine='openpyxl')

data = []
unmatched = []
for idx, row in df.iterrows():
    item_id = str(row.get("id", idx + 1) or idx + 1)
    title = str(row.get("title", "") or "")
    keywords_str = str(row.get("keywords", "") or "")
    search_aliases_str = str(row.get("search_aliases", "") or "")
    share_link = str(row.get("share_link", "") or "")
    resource_type = str(row.get("type", "") or "")
    count = row.get("count")
    juben_type_from_xlsx = str(row.get("juben_type", "") or "")

    keywords = [k.strip() for k in keywords_str.split(",") if k.strip() and k.strip().lower() != 'nan']
    search_aliases = [alias.strip() for alias in search_aliases_str.split(",") if alias.strip() and alias.strip().lower() != 'nan']

    # 生成二维码
    qr_path = os.path.join(qrcode_dir, f"{item_id}.png")
    img = qrcode.make(share_link)
    img.save(qr_path)

    item_data = {
        "id": item_id,
        "title": title,
        "keywords": keywords,
        "search_aliases": search_aliases,
        "share_link": share_link,
        "qrcode": f"static/qrcode/{item_id}.png"
    }
    
    if resource_type and resource_type.lower() != 'nan':
        item_data["type"] = resource_type
    
    if pd.notna(count):
        item_data["count"] = int(count)
    
    # 匹配剧本杀类型
    if resource_type == '剧本杀':
        juben_type = ""
        if juben_type_from_xlsx and juben_type_from_xlsx.lower() != 'nan':
            juben_type = juben_type_from_xlsx
        else:
            juben_type = match_juben_type(title)
        if juben_type:
            item_data["juben_type"] = juben_type
        else:
            unmatched.append(title)
    
    data.append(item_data)

# 写入 JSON
with open(output_json, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Generated data.json with {len(data)} resources")
if unmatched:
    print(f"Unmatched 剧本杀 ({len(unmatched)}): {', '.join(unmatched[:10])}...")
