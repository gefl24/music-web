# 多阶段构建 Dockerfile - 修复版本

# ============ 阶段 1: 构建前端 ============
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# 复制依赖文件
COPY frontend/package*.json ./

# 安装依赖（使用 npm install 作为备选方案）
RUN npm ci --only=production || npm install

# 复制源码
COPY frontend/ ./

# 构建
RUN npm run build

# ============ 阶段 2: 准备后端 ============
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend

# 复制依赖文件
COPY backend/package*.json ./

# 安装依赖
RUN npm ci --only=production || npm install

# 复制源码
COPY backend/ ./

# ============ 阶段 3: 最终镜像 ============
FROM node:18-alpine

# 安装运行时依赖（添加 bash 用于脚本调试）
RUN apk add --no-cache \
    nginx \
    wget \
    tini \
    bash

WORKDIR /app

# 从构建阶段复制文件
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY --from=backend-builder /app/backend /app/backend

# 复制配置文件
COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh /app/start.sh

# 创建必要的目录并设置权限
RUN mkdir -p \
    /app/data/sources \
    /app/data/downloads \
    /app/logs \
    /run/nginx \
    /var/log/nginx && \
    chmod +x /app/start.sh && \
    chown -R node:node /app /var/log/nginx /run/nginx

# 暴露端口
EXPOSE 80

# 切换到 node 用户
USER node

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# 使用 tini 作为 init 进程
ENTRYPOINT ["/sbin/tini", "--"]

# 启动命令（使用 bash 而不是 sh）
CMD ["/bin/bash", "/app/start.sh"]
