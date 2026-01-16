// backend/src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/download' });

// 中间件配置
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// 数据库变量
let db;

// 数据库初始化
async function initDatabase() {
  const dbPath = process.env.DATABASE_PATH || '/app/data/database.sqlite';
  const dataDir = path.dirname(dbPath);

  console.log('==========================================');
  console.log('Database Initialization');
  console.log('==========================================');
  console.log('Database path:', dbPath);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
  }

  // 打开数据库
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    console.log('✓ Database connection opened');
  } catch (err) {
    console.error('✗ Failed to open database:', err);
    throw err;
  }

  // 创建表结构
  try {
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
    console.log('✓ Database tables verified');
  } catch (err) {
    console.error('✗ Failed to create tables:', err);
    throw err;
  }
}

// WebSocket 连接管理
const wsClients = new Set();
wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

function broadcastDownloadProgress(downloadId, data) {
  const message = JSON.stringify({
    type: 'download_progress',
    downloadId,
    data
  });
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

// 导入路由模块
const sourceRoutes = require('./routes/source.routes');
const platformRoutes = require('./routes/platform.routes'); // 【新增】导入平台路由
const musicRoutes = require('./routes/music.routes');
const downloadRoutes = require('./routes/download.routes');

// 启动流程
const PORT = process.env.API_PORT || 3000;

async function start() {
  try {
    // 1. 先初始化数据库
    await initDatabase();
    
    // 2. 数据库就绪后，再注册路由，传入有效的 db 对象
    console.log('Mounting routes...');
    
    // 源管理 API
    app.use('/api/sources', sourceRoutes(db));
    
    // 【新增】平台 API (排行榜/搜索) - 负责获取列表数据
    app.use('/api/platform', platformRoutes(db));
    
    // 音乐操作 API (播放/图片/歌词) - 负责解析具体 URL
    app.use('/api/music', musicRoutes(db));
    
    // 下载管理 API
    app.use('/api/downloads', downloadRoutes(db, broadcastDownloadProgress));

    // 3. 注册其他基础路由
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: db ? 'connected' : 'disconnected'
      });
    });

    app.get('/', (req, res) => {
      res.json({
        name: 'LX Music Web API',
        version: '1.0.0',
        status: 'running'
      });
    });

    // 4. 注册错误处理中间件 (必须放在所有路由之后)
    app.use((err, req, res, next) => {
      console.error('Error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        status: err.status || 500
      });
    });

    // 5. 注册 404 处理 (兜底)
    app.use((req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    
    // 6. 启动监听
    server.listen(PORT, () => {
      console.log('==========================================');
      console.log('🎵 LX Music Web Server Started');
      console.log(`HTTP Server: http://localhost:${PORT}`);
      console.log('==========================================');
    });
  } catch (error) {
    console.error('Fatal Error:', error);
    process.exit(1);
  }
}

start();

// 优雅退出
process.on('SIGTERM', async () => {
  if (db) await db.close();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  if (db) await db.close();
  server.close(() => process.exit(0));
});

module.exports = { app, db, broadcastDownloadProgress };
