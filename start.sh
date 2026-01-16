#!/bin/sh
set -e

echo "=========================================="
echo "Starting LX Music Web Application"
echo "=========================================="

# 显示环境信息
echo "User: $(whoami)"
echo "Node version: $(node --version)"
echo "Working directory: $(pwd)"
echo ""

# 检查数据目录
if [ ! -d "/app/data" ]; then
    echo "Creating data directory..."
    mkdir -p /app/data/sources /app/data/downloads
fi

# 测试 Nginx 配置
echo "Testing Nginx configuration..."
nginx -t

# 启动 Nginx
echo "Starting Nginx..."
nginx

# 等待 Nginx 启动
sleep 2

# 检查 Nginx 状态
if ! pgrep nginx > /dev/null; then
    echo "ERROR: Nginx failed to start"
    cat /var/log/nginx/error.log || true
    exit 1
fi

echo "✓ Nginx started successfully"

# 进入后端目录
cd /app/backend

# 检查文件
echo "Checking backend files..."
ls -la src/app.js || exit 1

# 启动 Node.js 应用
echo "Starting Node.js application..."
exec node src/app.js
