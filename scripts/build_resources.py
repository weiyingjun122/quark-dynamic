import pandas as pd
import qrcode
import json
import os
import openpyxl

# 文件路径
xlsx_file = "../resources.xlsx"  # 根据你的目录调整
output_json = "../data.json"
qrcode_dir = "../static/qrcode"

# 创建二维码目录
os.makedirs(qrcode_dir, exist_ok=True)

# 使用 pandas 读取 Excel（更快）
df = pd.read_excel(xlsx_file, engine='openpyxl')

data = []
for idx, row in df.iterrows():
    item_id = str(row.get("id", idx + 1) or idx + 1)
    title = str(row.get("title", "") or "")
    keywords_str = str(row.get("keywords", "") or "")
    search_aliases_str = str(row.get("search_aliases", "") or "")
    share_link = str(row.get("share_link", "") or "")

    keywords = [k.strip() for k in keywords_str.split(",") if k.strip() and k.strip().lower() != 'nan']
    search_aliases = [alias.strip() for alias in search_aliases_str.split(",") if alias.strip() and alias.strip().lower() != 'nan']

    # 生成二维码
    qr_path = os.path.join(qrcode_dir, f"{item_id}.png")
    img = qrcode.make(share_link)
    img.save(qr_path)

    data.append({
        "id": item_id,
        "title": title,
        "keywords": keywords,
        "search_aliases": search_aliases,
        "share_link": share_link,
        "qrcode": f"static/qrcode/{item_id}.png"
    })

# 写入 JSON
with open(output_json, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("data.json & QR codes generated")
