// backend/src/services/download.service.js
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const stream = require('stream');
const { promisify } = require('util');

const pipeline = promisify(stream.pipeline);

class DownloadService {
  constructor(db, broadcastProgress) {
    this.db = db;
    this.broadcastProgress = broadcastProgress;
    this.activeDownloads = new Map();
    this.maxConcurrent = parseInt(process.env.MAX_DOWNLOAD_CONCURRENT) || 3;
    this.downloadQueue = [];
    this.downloading = 0;
  }

  // 添加下载任务
  async addDownload(musicInfo) {
    const { name, singer, source, musicId, quality, url } = musicInfo;
    
    if (!name || !url) {
      throw new Error('Missing required fields: name and url');
    }

    const id = uuidv4();
    const fileName = this.sanitizeFileName(`${singer} - ${name}.${this.getExtension(url)}`);
    const filePath = path.join('/app/data/downloads', fileName);

    await this.db.run(
      `INSERT INTO downloads (id, name, singer, source, music_id, quality, url, file_path, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, name, singer, source, musicId, quality, url, filePath]
    );

    // 加入队列
    this.downloadQueue.push(id);
    this.processQueue();

    return { id, fileName, status: 'pending' };
  }

  // 处理下载队列
  async processQueue() {
    while (this.downloading < this.maxConcurrent && this.downloadQueue.length > 0) {
      const downloadId = this.downloadQueue.shift();
      this.downloading++;
      
      this.startDownload(downloadId)
        .then(() => this.downloading--)
        .catch(err => {
          console.error(`Download ${downloadId} failed:`, err);
          this.downloading--;
        })
        .finally(() => this.processQueue());
    }
  }

  // 开始下载
  async startDownload(downloadId) {
    const download = await this.db.get(
      'SELECT * FROM downloads WHERE id = ?',
      downloadId
    );

    if (!download || download.status !== 'pending') {
      return;
    }

    try {
      await this.updateDownloadStatus(downloadId, 'downloading');

      const response = await axios({
        method: 'GET',
        url: download.url,
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const totalSize = parseInt(response.headers['content-length'] || '0');
      let downloadedSize = 0;

      // 创建写入流
      const writer = require('fs').createWriteStream(download.file_path);

      // 监听下载进度
      response.data.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;

        // 更新进度
        this.updateProgress(downloadId, {
          downloadedSize,
          totalSize,
          progress: progress.toFixed(2)
        });
      });

      // 保存文件
      await pipeline(response.data, writer);

      // 完成下载
      await this.updateDownloadStatus(downloadId, 'completed', {
        file_size: totalSize,
        downloaded_size: totalSize,
        progress: 100
      });

      this.broadcastProgress(downloadId, {
        status: 'completed',
        progress: 100
      });

    } catch (error) {
      console.error(`Download error for ${downloadId}:`, error);
      
      await this.updateDownloadStatus(downloadId, 'failed', {
        error: error.message
      });

      this.broadcastProgress(downloadId, {
        status: 'failed',
        error: error.message
      });
    }
  }

  // 更新下载状态
  async updateDownloadStatus(downloadId, status, extra = {}) {
    const fields = ['status = ?', 'update_time = CURRENT_TIMESTAMP'];
    const params = [status];

    if (extra.file_size !== undefined) {
      fields.push('file_size = ?');
      params.push(extra.file_size);
    }
    if (extra.downloaded_size !== undefined) {
      fields.push('downloaded_size = ?');
      params.push(extra.downloaded_size);
    }
    if (extra.progress !== undefined) {
      fields.push('progress = ?');
      params.push(extra.progress);
    }
    if (extra.error !== undefined) {
      fields.push('error = ?');
      params.push(extra.error);
    }

    params.push(downloadId);

    await this.db.run(
      `UPDATE downloads SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  }

  // 更新进度(内存中)
  updateProgress(downloadId, data) {
    // 节流:每 500ms 更新一次数据库和广播
    if (!this.activeDownloads.has(downloadId)) {
      this.activeDownloads.set(downloadId, { lastUpdate: 0 });
    }

    const now = Date.now();
    const downloadData = this.activeDownloads.get(downloadId);

    if (now - downloadData.lastUpdate >= 500) {
      this.updateDownloadStatus(downloadId, 'downloading', {
        downloaded_size: data.downloadedSize,
        file_size: data.totalSize,
        progress: data.progress
      });

      this.broadcastProgress(downloadId, {
        status: 'downloading',
        downloadedSize: data.downloadedSize,
        totalSize: data.totalSize,
        progress: data.progress
      });

      downloadData.lastUpdate = now;
    }
  }

  // 获取下载列表
  async getDownloadList(status = null, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM downloads';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY create_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const downloads = await this.db.all(query, params);

    const countQuery = status 
      ? 'SELECT COUNT(*) as total FROM downloads WHERE status = ?'
      : 'SELECT COUNT(*) as total FROM downloads';
    
    const { total } = await this.db.get(
      countQuery,
      status ? [status] : []
    );

    return {
      list: downloads,
      total,
      page,
      limit
    };
  }

  // 删除下载任务
  async deleteDownload(downloadId) {
    const download = await this.db.get(
      'SELECT * FROM downloads WHERE id = ?',
      downloadId
    );

    if (!download) {
      throw new Error('Download not found');
    }

    // 删除文件
    if (download.file_path) {
      try {
        await fs.unlink(download.file_path);
      } catch (err) {
        console.warn(`Failed to delete file ${download.file_path}:`, err.message);
      }
    }

    // 从数据库删除
    await this.db.run('DELETE FROM downloads WHERE id = ?', downloadId);
  }

  // 清理已完成的下载记录
  async clearCompleted() {
    await this.db.run('DELETE FROM downloads WHERE status = "completed"');
  }

  // 重试失败的下载
  async retryDownload(downloadId) {
    const download = await this.db.get(
      'SELECT * FROM downloads WHERE id = ?',
      downloadId
    );

    if (!download) {
      throw new Error('Download not found');
    }

    await this.updateDownloadStatus(downloadId, 'pending', {
      error: null,
      progress: 0,
      downloaded_size: 0
    });

    this.downloadQueue.push(downloadId);
    this.processQueue();
  }

  // 清理文件名
  sanitizeFileName(fileName) {
    return fileName
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 255);
  }

  // 获取文件扩展名
  getExtension(url) {
    const match = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
    return match ? match[1] : 'mp3';
  }
}

module.exports = DownloadService;
