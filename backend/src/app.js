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

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// 数据库
let db;

// 数据库初始化（改进版，增加错误处理）
async function initDatabase() {
  const dbPath = process.env.DATABASE_PATH || '/app/data/database.sqlite';
  const dataDir = path.dirname(dbPath);

  console.log('==========================================');
  console.log('Database Initialization');
  console.log('==========================================');
  console.log('Database path:', dbPath);
  console.log('Data directory:', dataDir);
  
  // 检查数据目录
  if (!fs.existsSync(dataDir)) {
    console.log(`Creating data directory: ${dataDir}`);
    try {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
      console.log('✓ Data directory created');
    } catch (err) {
      console.error('✗ Failed to create data directory:', err);
      throw err;
    }
  } else {
    console.log('✓ Data directory exists');
  }

  // 检查目录权限
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
    console.log('✓ Data directory is writable');
  } catch (err) {
    console.error('✗ Data directory is NOT writable!');
    console.error('  Path:', dataDir);
    console.error('  Error:', err.message);
    
    // 显示目录信息
    try {
      const stats = fs.statSync(dataDir);
      console.error('  Directory stats:', {
        mode: stats.mode.toString(8),
        uid: stats.uid,
        gid: stats.gid,
        isDirectory: stats.isDirectory()
      });
    } catch (statErr) {
      console.error('  Cannot stat directory:', statErr.message);
    }
    
    throw new Error(`Data directory is not writable: ${dataDir}`);
  }

  // 检查数据库文件（如果存在）
  if (fs.existsSync(dbPath)) {
    console.log('✓ Database file exists');
    try {
      const stats = fs.statSync(dbPath);
      console.log('  File size:', stats.size, 'bytes');
    } catch (err) {
      console.error('  Warning: Cannot stat database file:', err.message);
    }
  } else {
    console.log('  Database file will be created');
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
    console.error('  Error code:', err.code);
    console.error('  Error number:', err.errno);
    throw err;
  }

  // 创建表
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
    console.log('✓ Database tables created/verified');
  } catch (err) {
    console.error('✗ Failed to create tables:', err);
    throw err;
  }

  console.log('✓ Database initialized successfully');
  console.log('==========================================');
  console.log('');
}

// WebSocket 连接管理
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log('WebSocket client connected. Total clients:', wsClients.size);

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log('WebSocket client disconnected. Total clients:', wsClients.size);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
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
      try {
        client.send(message);
      } catch (err) {
        console.error('Failed to send WebSocket message:', err);
      }
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
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: db ? 'connected' : 'disconnected'
  });
});

// 根路径（用于测试）
app.get('/', (req, res) => {
  res.json({
    name: 'LX Music Web API',
    version: '1.0.0',
    status: 'running'
  });
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
  try {
    await initDatabase();
    
    server.listen(PORT, () => {
      console.log('==========================================');
      console.log('🎵 LX Music Web Server Started');
      console.log('==========================================');
      console.log(`HTTP Server: http://localhost:${PORT}`);
      console.log(`WebSocket Server: ws://localhost:${PORT}/ws/download`);
      console.log('Health Check: http://localhost:${PORT}/health');
      console.log('==========================================');
      console.log('');
    });
  } catch (error) {
    console.error('==========================================');
    console.error('Failed to start server:', error);
    console.error('==========================================');
    process.exit(1);
  }
}

start().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

// 优雅退出
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  if (db) {
    await db.close();
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  if (db) {
    await db.close();
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, db, broadcastDownloadProgress };
