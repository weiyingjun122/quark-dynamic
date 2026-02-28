import requests
import json

def test_api():
    """测试Cloudflare API"""
    
    # 测试不同端点
    endpoints = [
        ("/api/health", "健康检查"),
        ("/api/ping", "Ping测试"),
        ("/api/hot", "热门关键词"),
        ("/api/debug", "调试信息"),
        ("/api/sync?key=my_secret_sync_key", "同步数据")
    ]
    
    base_url = "https://www.weiyingjun.top"  # 你的域名
    
    for endpoint, description in endpoints:
        print(f"\n🔍 测试 {description} ({endpoint})")
        url = base_url + endpoint
        
        try:
            response = requests.get(url, timeout=10)
            print(f"  状态码: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    print(f"  响应: {json.dumps(data, ensure_ascii=False)[:100]}...")
                except:
                    print(f"  响应: {response.text[:100]}...")
            else:
                print(f"  错误: {response.text[:200]}")
                
        except requests.exceptions.RequestException as e:
            print(f"  ❌ 请求失败: {e}")

def test_record_api():
    """测试记录搜索API"""
    print("\n📝 测试记录搜索API")
    
    base_url = "https://www.weiyingjun.top"
    
    # 测试GET方式
    print("1. GET方式测试:")
    keyword = "测试关键词"
    url = f"{base_url}/api/record?q={keyword}"
    response = requests.get(url)
    print(f"  状态码: {response.status_code}")
    if response.status_code == 200:
        print(f"  响应: {response.json()}")
    
    # 测试POST方式
    print("\n2. POST方式测试:")
    url = f"{base_url}/api/record"
    data = {"keyword": "另一个测试"}
    response = requests.post(url, json=data)
    print(f"  状态码: {response.status_code}")
    if response.status_code == 200:
        print(f"  响应: {response.json()}")

if __name__ == "__main__":
    print("=" * 60)
    print("Cloudflare API 调试工具")
    print("=" * 60)
    
    test_api()
    test_record_api()