# 多阶段构建 Dockerfile

# --- 前端构建阶段 ---
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
# 修复 1: 改用 npm install，安装所有依赖（包括 vite 等开发依赖）
RUN npm install
COPY frontend/ ./
# 修复 2: 确保构建成功（需配合 vite.config.ts 修改）
RUN npm run build

# --- 后端构建阶段 ---
FROM node:18-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
# 修复 3: 改用 npm install --omit=dev 替代 npm ci
RUN npm install --omit=dev
COPY backend/ ./

# --- 最终运行阶段 ---
FROM node:18-alpine
RUN apk add --no-cache nginx wget tini

WORKDIR /app

COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY --from=backend-builder /app/backend /app/backend
COPY nginx.conf /etc/nginx/nginx.conf

# 创建目录并修正权限
RUN mkdir -p /app/data/sources /app/data/downloads /app/logs /run/nginx /var/log/nginx && \
    chown -R node:node /app /var/log/nginx /run/nginx

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# 修复 4: 暴露 8080 端口（配合 nginx.conf 修改）
EXPOSE 8080

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
