# 🎵 LX Music Web

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.4-brightgreen.svg" alt="Vue 3.4">
  <img src="https://img.shields.io/badge/Node-18+-green.svg" alt="Node 18+">
  <img src="https://img.shields.io/badge/Docker-Ready-blue.svg" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License">
</p>

基于 Docker 的现代化 Web 音乐应用，支持自定义音乐源、排行榜浏览和音乐下载管理。

## ✨ 特性

- 🎼 **自定义音乐源** - 通过 Web 界面导入和管理音乐源脚本
- 📊 **排行榜** - 浏览各大平台的音乐排行榜
- 🔍 **搜索功能** - 跨源搜索音乐
- 📥 **下载管理** - 支持队列、断点续传、实时进度显示
- 🎨 **现代化界面** - 基于 Vue 3 的响应式设计
- 🐳 **容器化部署** - 一键 Docker 部署
- 🔒 **安全沙箱** - VM2 隔离执行自定义源脚本

## 🚀 快速开始

### 使用 Docker Compose

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 访问应用
# http://localhost:8080
```

### 本地开发

```bash
# 后端
cd backend
npm install
npm run dev

# 前端
cd frontend
npm install
npm run dev
```

## 📖 文档

- [使用指南](./docs/usage.md)
- [自定义源开发](./docs/custom-source.md)
- [API 文档](./docs/api.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT License

## ⚠️ 免责声明

本项目仅供个人学习和研究使用，请勿用于商业用途。
