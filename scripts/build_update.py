import pandas as pd
import json
import os

os.makedirs(".", exist_ok=True)

df = pd.read_excel("../update.xlsx", engine="openpyxl")

data = []
for _, row in df.iterrows():
    name = str(row.get("update_name", "")).strip()
    type_val = str(row.get("type", "")).strip()
    date = str(row.get("update_date", "")).strip()
    if name and name.lower() != 'nan':
        data.append({"name": name, "type": type_val, "date": date})

with open("../update.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"update.json generated: {len(data)} items")
