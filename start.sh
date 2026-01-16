#!/bin/sh
set -e

echo "=========================================="
echo "Starting LX Music Web Application"
echo "=========================================="

# 显示环境信息
echo "User: $(whoami)"
echo "Node version: $(node --version)"
echo "Working directory: $(pwd)"
echo "Environment variables:"
echo "  DATABASE_PATH=${DATABASE_PATH:-/app/data/database.sqlite}"
echo "  NODE_ENV=${NODE_ENV:-production}"
echo ""

# 检查并创建数据目录
echo "🔍 Checking data directories..."
if [ ! -d "/app/data" ]; then
    echo "  Creating /app/data..."
    mkdir -p /app/data
fi

# 设置权限
chmod 755 /app/data 2>/dev/null || echo "  Warning: Cannot chmod /app/data"

# 创建子目录
mkdir -p /app/data/sources 2>/dev/null || true
mkdir -p /app/data/downloads 2>/dev/null || true

# 显示目录状态
echo "  Directory status:"
ls -la /app/data/ 2>/dev/null || echo "  Cannot list /app/data"

# 检查挂载信息
echo "  Mount info:"
mount | grep /app/data || echo "  /app/data is not a mount point"

# 检查磁盘空间
echo "  Disk space:"
df -h /app/data/ 2>/dev/null || echo "  Cannot check disk space"

# 测试写入权限
echo "  Testing write permissions..."
if echo "test" > /app/data/.test 2>/dev/null; then
    rm -f /app/data/.test
    echo "  ✓ /app/data is writable"
else
    echo "  ✗ ERROR: Cannot write to /app/data!"
    echo "  Attempting to fix permissions..."
    chmod 777 /app/data 2>/dev/null || true
    
    # 再次测试
    if echo "test" > /app/data/.test 2>/dev/null; then
        rm -f /app/data/.test
        echo "  ✓ Fixed! /app/data is now writable"
    else
        echo "  ✗ FATAL: /app/data is still not writable"
        echo "  This will cause database errors!"
    fi
fi
echo ""

# 测试 Nginx 配置
echo "🔧 Testing Nginx configuration..."
if nginx -t 2>&1; then
    echo "  ✓ Nginx configuration valid"
else
    echo "  ✗ Nginx configuration invalid"
    exit 1
fi
echo ""

# 启动 Nginx
echo "🚀 Starting Nginx..."
nginx

# 等待 Nginx 启动
sleep 2

# 检查 Nginx 状态
if pgrep nginx > /dev/null 2>&1; then
    echo "  ✓ Nginx started successfully"
    echo "  Nginx processes:"
    ps aux | grep nginx | grep -v grep || true
else
    echo "  ✗ ERROR: Nginx failed to start"
    if [ -f /var/log/nginx/error.log ]; then
        echo "  Nginx error log:"
        cat /var/log/nginx/error.log
    fi
    exit 1
fi
echo ""

# 进入后端目录
echo "📂 Entering backend directory..."
cd /app/backend || {
    echo "  ✗ Cannot enter /app/backend"
    exit 1
}
echo "  ✓ Current directory: $(pwd)"
echo ""

# 检查后端文件
echo "📋 Checking backend files..."
if [ -f "src/app.js" ]; then
    echo "  ✓ src/app.js exists"
    ls -la src/app.js
else
    echo "  ✗ src/app.js not found!"
    echo "  Directory contents:"
    ls -la
    exit 1
fi
echo ""

# 检查 node_modules
if [ -d "node_modules" ]; then
    echo "  ✓ node_modules exists"
else
    echo "  ⚠️  node_modules not found (this might be OK if in image)"
fi
echo ""

# 最后的状态检查
echo "=========================================="
echo "✅ Pre-flight checks complete"
echo "=========================================="
echo "Starting Node.js application..."
echo ""

# 启动 Node.js 应用
exec node src/app.js
