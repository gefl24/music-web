// backend/src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/download' });

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// 数据库初始化
let db;

async function initDatabase() {
  db = await open({
    filename: path.join(__dirname, '../data/database.sqlite'),
    driver: sqlite3.Database
  });

  // 创建表
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      script TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 0,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      singer TEXT,
      source TEXT NOT NULL,
      music_id TEXT NOT NULL,
      quality TEXT,
      url TEXT,
      file_path TEXT,
      file_size INTEGER,
      downloaded_size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0,
      error TEXT,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
    CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);
  `);

  console.log('Database initialized');
}

// WebSocket 连接管理
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log('WebSocket client connected');

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log('WebSocket client disconnected');
  });
});

// 广播下载进度
function broadcastDownloadProgress(downloadId, data) {
  const message = JSON.stringify({
    type: 'download_progress',
    downloadId,
    data
  });

  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 路由
const sourceRoutes = require('./routes/source.routes');
const musicRoutes = require('./routes/music.routes');
const downloadRoutes = require('./routes/download.routes');

app.use('/api/sources', sourceRoutes(db));
app.use('/api/music', musicRoutes(db));
app.use('/api/downloads', downloadRoutes(db, broadcastDownloadProgress));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    status: err.status || 500
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// 启动服务器
const PORT = process.env.API_PORT || 3000;

async function start() {
  await initDatabase();
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}/ws/download`);
  });
}

start().catch(console.error);

// 优雅退出
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await db.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, db, broadcastDownloadProgress };
