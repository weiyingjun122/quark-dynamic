param(
    [string]$Message = ""
)

$ErrorActionPreference = 'Stop'

# 1. 清理 WPS/Excel 临时锁文件
Get-ChildItem -Path . -Filter '~$*' -File -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# 2. 拉取（rebase + autostash，自动处理本地未提交改动）
Write-Host "==> git pull --rebase --autostash"
git pull --rebase --autostash
if ($LASTEXITCODE -ne 0) {
    Write-Host "==> 自动拉取失败，尝试普通 pull..."
    git pull
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 拉取失败，可能有冲突，请手动处理（git status 查看）。" -ForegroundColor Red
        exit 1
    }
}

# 3. 暂存全部改动
git add -A
$files = @(git diff --cached --name-only)
if ($files.Count -eq 0) {
    Write-Host "无任何改动，无需提交。" -ForegroundColor Green
    exit 0
}

# 4. 生成提交信息
if (-not $Message) {
    $short = ($files | Select-Object -First 3) -join ", "
    if ($files.Count -gt 3) { $short += " 等 $($files.Count) 个文件" }
    $Message = "更新: $short"
}
Write-Host "==> git commit -m `"$Message`""
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 提交失败。" -ForegroundColor Red
    exit 1
}

# 5. 推送
Write-Host "==> git push"
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 推送失败。" -ForegroundColor Red
    exit 1
}

Write-Host "完成: $Message" -ForegroundColor Green
