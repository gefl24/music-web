// backend/src/routes/source.routes.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const SourceParser = require('../utils/source-parser');

// 辅助函数：转换数据库对象 (0/1 -> boolean)
const formatSource = (source) => {
  if (!source) return null;
  return {
    ...source,
    enabled: !!source.enabled // 强制转换为 boolean
  };
};

module.exports = (db) => {
  const router = express.Router();

  // 获取 URL 内容
  router.get('/import-url', async (req, res, next) => {
    try {
      const { url } = req.query;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      
      const response = await axios.get(url, {
        timeout: 15000,
        responseType: 'text',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      res.json({ content: response.data });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch url', details: err.message });
    }
  });

  // 获取所有自定义源
  router.get('/', async (req, res, next) => {
    try {
      const sources = await db.all('SELECT * FROM sources ORDER BY priority DESC, name ASC');
      res.json(sources.map(formatSource));
    } catch (err) {
      next(err);
    }
  });

  // 获取单个源
  router.get('/:id', async (req, res, next) => {
    try {
      const source = await db.get('SELECT * FROM sources WHERE id = ?', req.params.id);
      if (!source) return res.status(404).json({ error: 'Source not found' });
      res.json(formatSource(source));
    } catch (err) {
      next(err);
    }
  });

  // 添加自定义源
  router.post('/', async (req, res, next) => {
    try {
      const { name, type, script, enabled = true, priority = 0 } = req.body;
      if (!name || !script) return res.status(400).json({ error: 'Name and script required' });

      try {
        const parser = new SourceParser(script);
        await parser.validate();
      } catch (err) {
        return res.status(400).json({ error: 'Invalid script', details: err.message });
      }

      const id = uuidv4();
      await db.run(
        `INSERT INTO sources (id, name, type, script, enabled, priority) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, type || 'music', script, enabled ? 1 : 0, priority]
      );

      const source = await db.get('SELECT * FROM sources WHERE id = ?', id);
      res.status(201).json(formatSource(source));
    } catch (err) {
      next(err);
    }
  });

  // 更新自定义源
  router.put('/:id', async (req, res, next) => {
    try {
      const { name, type, script, enabled, priority } = req.body;
      const { id } = req.params;

      const source = await db.get('SELECT * FROM sources WHERE id = ?', id);
      if (!source) return res.status(404).json({ error: 'Source not found' });

      if (script && script !== source.script) {
        try {
          const parser = new SourceParser(script);
          await parser.validate();
        } catch (err) {
          return res.status(400).json({ error: 'Invalid script', details: err.message });
        }
      }

      const updates = [];
      const params = [];

      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (type !== undefined) { updates.push('type = ?'); params.push(type); }
      if (script !== undefined) { updates.push('script = ?'); params.push(script); }
      if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
      if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }

      if (updates.length > 0) {
        updates.push('update_time = CURRENT_TIMESTAMP');
        params.push(id);
        await db.run(`UPDATE sources SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      const updatedSource = await db.get('SELECT * FROM sources WHERE id = ?', id);
      res.json(formatSource(updatedSource));
    } catch (err) {
      next(err);
    }
  });

  // 删除自定义源
  router.delete('/:id', async (req, res, next) => {
    try {
      await db.run('DELETE FROM sources WHERE id = ?', req.params.id);
      res.json({ message: 'Deleted successfully' });
    } catch (err) {
      next(err);
    }
  });

  // 启用/禁用源 (修复开关问题)
  router.patch('/:id/toggle', async (req, res, next) => {
    try {
      const source = await db.get('SELECT * FROM sources WHERE id = ?', req.params.id);
      if (!source) return res.status(404).json({ error: 'Source not found' });

      // 切换状态 (0 -> 1, 1 -> 0)
      const newValue = source.enabled ? 0 : 1;
      
      await db.run(
        'UPDATE sources SET enabled = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?',
        [newValue, req.params.id]
      );

      const updatedSource = await db.get('SELECT * FROM sources WHERE id = ?', req.params.id);
      res.json(formatSource(updatedSource)); // 返回 boolean 类型
    } catch (err) {
      next(err);
    }
  });

  // 测试自定义源 (优化反馈)
  router.post('/:id/test', async (req, res, next) => {
    try {
      const source = await db.get('SELECT * FROM sources WHERE id = ?', req.params.id);
      if (!source) return res.status(404).json({ error: 'Source not found' });

      const parser = new SourceParser(source.script);
      const testResults = { search: false, getTopList: false };

      try {
        // 搜索测试 (添加 limit 参数)
        const searchRes = await parser.execute('search', { keyword: 'test', page: 1, limit: 30 });
        // 只要返回了对象，且没有错误，就视为成功
        if (searchRes && !searchRes.error) {
            testResults.search = true;
        } else {
            testResults.searchError = searchRes?.error || 'Unknown error';
        }
      } catch (err) {
        testResults.searchError = err.message;
      }

      try {
        const topRes = await parser.execute('getTopList');
        if (topRes && !topRes.error) {
             testResults.getTopList = true;
        }
      } catch (err) {
        testResults.getTopListError = err.message;
      }

      res.json({
        success: testResults.search, // 只要搜索成功就算测试通过
        results: testResults
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
