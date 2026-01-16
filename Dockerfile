# 多阶段构建 Dockerfile

FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production
COPY frontend/ ./
RUN npm run build

FROM node:18-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ ./

FROM node:18-alpine
RUN apk add --no-cache nginx wget tini

WORKDIR /app

COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY --from=backend-builder /app/backend /app/backend
COPY nginx.conf /etc/nginx/nginx.conf

RUN mkdir -p /app/data/sources /app/data/downloads /app/logs /run/nginx /var/log/nginx && \
    chown -R node:node /app /var/log/nginx /run/nginx

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 80

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
