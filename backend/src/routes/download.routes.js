// backend/src/routes/download.routes.js
const express = require('express');
const DownloadService = require('../services/download.service');

module.exports = (db, broadcastProgress) => {
  const router = express.Router();
  const downloadService = new DownloadService(db, broadcastProgress);

  // 添加下载任务
  router.post('/', async (req, res, next) => {
    try {
      const { name, singer, source, musicId, quality, url } = req.body;

      if (!name || !url) {
        return res.status(400).json({ error: 'name and url are required' });
      }

      const result = await downloadService.addDownload({
        name,
        singer: singer || 'Unknown',
        source: source || 'unknown',
        musicId: musicId || '',
        quality: quality || '128k',
        url
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // 批量添加下载任务
  router.post('/batch', async (req, res, next) => {
    try {
      const { items } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'items array is required' });
      }

      const results = await Promise.all(
        items.map(item => downloadService.addDownload(item))
      );

      res.status(201).json({ results });
    } catch (err) {
      next(err);
    }
  });

  // 获取下载列表
  router.get('/', async (req, res, next) => {
    try {
      const { status, page = 1, limit = 50 } = req.query;

      const result = await downloadService.getDownloadList(
        status,
        parseInt(page),
        parseInt(limit)
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 获取单个下载任务
  router.get('/:id', async (req, res, next) => {
    try {
      const download = await db.get(
        'SELECT * FROM downloads WHERE id = ?',
        req.params.id
      );

      if (!download) {
        return res.status(404).json({ error: 'Download not found' });
      }

      res.json(download);
    } catch (err) {
      next(err);
    }
  });

  // 删除下载任务
  router.delete('/:id', async (req, res, next) => {
    try {
      await downloadService.deleteDownload(req.params.id);
      res.json({ message: 'Download deleted successfully' });
    } catch (err) {
      next(err);
    }
  });

  // 批量删除
  router.post('/batch-delete', async (req, res, next) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'ids array is required' });
      }

      await Promise.all(ids.map(id => downloadService.deleteDownload(id)));

      res.json({ message: 'Downloads deleted successfully', count: ids.length });
    } catch (err) {
      next(err);
    }
  });

  // 重试下载
  router.post('/:id/retry', async (req, res, next) => {
    try {
      await downloadService.retryDownload(req.params.id);
      res.json({ message: 'Download queued for retry' });
    } catch (err) {
      next(err);
    }
  });

  // 清理已完成的下载
  router.post('/clear-completed', async (req, res, next) => {
    try {
      await downloadService.clearCompleted();
      res.json({ message: 'Completed downloads cleared' });
    } catch (err) {
      next(err);
    }
  });

  // 暂停下载（预留接口）
  router.post('/:id/pause', async (req, res, next) => {
    try {
      // TODO: 实现暂停功能
      res.json({ message: 'Pause feature coming soon' });
    } catch (err) {
      next(err);
    }
  });

  // 恢复下载（预留接口）
  router.post('/:id/resume', async (req, res, next) => {
    try {
      // TODO: 实现恢复功能
      res.json({ message: 'Resume feature coming soon' });
    } catch (err) {
      next(err);
    }
  });

  // 获取下载统计
  router.get('/stats/summary', async (req, res, next) => {
    try {
      const stats = await db.all(`
        SELECT 
          status,
          COUNT(*) as count,
          SUM(file_size) as total_size
        FROM downloads
        GROUP BY status
      `);

      const summary = {
        total: 0,
        pending: 0,
        downloading: 0,
        completed: 0,
        failed: 0,
        totalSize: 0
      };

      stats.forEach(stat => {
        summary.total += stat.count;
        summary[stat.status] = stat.count;
        summary.totalSize += stat.total_size || 0;
      });

      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
