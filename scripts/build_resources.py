import pandas as pd
import qrcode
import json
import os
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

# 使用 pandas 读取 Excel
df = pd.read_excel(xlsx_file, engine='openpyxl')

data = []
for idx, row in df.iterrows():
    item_id = str(row.get("id", idx + 1) or idx + 1)
    title = str(row.get("title", "") or "")
    keywords_str = str(row.get("keywords", "") or "")
    search_aliases_str = str(row.get("search_aliases", "") or "")
    share_link = str(row.get("share_link", "") or "")
    resource_type = str(row.get("type", "") or "")
    count = row.get("count")
    # 读取已有的剧本杀类型（如果Excel中有）
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
    
    # 匹配剧本杀类型：优先用Excel中的值，否则从模板匹配
    if resource_type == '剧本杀':
        juben_type = ""
        if juben_type_from_xlsx and juben_type_from_xlsx.lower() != 'nan':
            juben_type = juben_type_from_xlsx
        else:
            # 去掉书名号后匹配
            clean_title = title.replace("《", "").replace("》", "").strip()
            juben_type = muban_types.get(clean_title, "")
        if juben_type:
            item_data["juben_type"] = juben_type
    
    data.append(item_data)

# 写入 JSON
with open(output_json, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Generated data.json with {len(data)} resources")
