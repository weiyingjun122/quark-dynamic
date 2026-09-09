import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import json

d = json.load(open('data.json', 'r', encoding='utf-8'))
js = [i for i in d if i.get('type') == '剧本杀']
missing = [i for i in js if not i.get('juben_type')]
print(f'剧本杀总数: {len(js)}')
print(f'已匹配: {len(js)-len(missing)}')
print(f'未匹配: {len(missing)}')
if missing:
    print('---未匹配---')
    for i in missing:
        print(f'  {i["title"]}')
