import pandas as pd
from difflib import SequenceMatcher

# 读取两个文件
resources = pd.read_excel('resources.xlsx')
yuan = pd.read_excel('yuan.xlsx')

# 重命名 yuan.xlsx 的列
yuan.columns = ['序号', '剧本杀名称', '网盘地址', '提取码', '剧本类型', '人数', '资源类型']

# 获取 resources 的 title 列表
resource_titles = resources['title'].fillna('').tolist()

# 模糊匹配函数
def is_match(yuan_name, resource_titles, threshold=0.6):
    yuan_name = str(yuan_name).strip()
    if not yuan_name:
        return False
    for title in resource_titles:
        title = str(title).strip()
        if not title:
            continue
        # 计算相似度
        ratio = SequenceMatcher(None, yuan_name, title).ratio()
        if ratio >= threshold:
            return True
        # 检查是否包含
        if yuan_name in title or title in yuan_name:
            return True
    return False

# 找出 yuan.xlsx 中有而 resources.xlsx 没有的
missing = []
for idx, row in yuan.iterrows():
    name = row['剧本杀名称']
    if not is_match(name, resource_titles):
        missing.append(row)

print(f"找到 {len(missing)} 条缺失记录")

# 保存到 missing.xlsx
if missing:
    df_missing = pd.DataFrame(missing)
    df_missing.to_excel('missing.xlsx', index=False)
    print(f"已保存到 missing.xlsx")
else:
    print("没有缺失记录")
