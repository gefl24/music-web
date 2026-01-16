// backend/src/routes/source.routes.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const SourceParser = require('../utils/source-parser');

module.exports = (db) => {
  const router = express.Router();

  // 获取所有自定义源
  router.get('/', async (req, res, next) => {
    try {
      const sources = await db.all(
        'SELECT * FROM sources ORDER BY priority DESC, name ASC'
      );
      res.json(sources);
    } catch (err) {
      next(err);
    }
  });

  // 获取单个源
  router.get('/:id', async (req, res, next) => {
    try {
      const source = await db.get(
        'SELECT * FROM sources WHERE id = ?',
        req.params.id
      );
      
      if (!source) {
        return res.status(404).json({ error: 'Source not found' });
      }
      
      res.json(source);
    } catch (err) {
      next(err);
    }
  });

  // 添加自定义源
  router.post('/', async (req, res, next) => {
    try {
      const { name, type, script, enabled = true, priority = 0 } = req.body;

      if (!name || !script) {
        return res.status(400).json({ error: 'Name and script are required' });
      }

      // 验证脚本
      try {
        const parser = new SourceParser(script);
        await parser.validate();
      } catch (err) {
        return res.status(400).json({ 
          error: 'Invalid script', 
          details: err.message 
        });
      }

      const id = uuidv4();
      await db.run(
        `INSERT INTO sources (id, name, type, script, enabled, priority)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, type || 'music', script, enabled ? 1 : 0, priority]
      );

      const source = await db.get('SELECT * FROM sources WHERE id = ?', id);
      res.status(201).json(source);
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
      if (!source) {
        return res.status(404).json({ error: 'Source not found' });
      }

      // 如果更新了脚本,进行验证
      if (script && script !== source.script) {
        try {
          const parser = new SourceParser(script);
          await parser.validate();
        } catch (err) {
          return res.status(400).json({ 
            error: 'Invalid script', 
            details: err.message 
          });
        }
      }

      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      if (type !== undefined) {
        updates.push('type = ?');
        params.push(type);
      }
      if (script !== undefined) {
        updates.push('script = ?');
        params.push(script);
      }
      if (enabled !== undefined) {
        updates.push('enabled = ?');
        params.push(enabled ? 1 : 0);
      }
      if (priority !== undefined) {
        updates.push('priority = ?');
        params.push(priority);
      }

      if (updates.length === 0) {
        return res.json(source);
      }

      updates.push('update_time = CURRENT_TIMESTAMP');
      params.push(id);

      await db.run(
        `UPDATE sources SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      const updatedSource = await db.get('SELECT * FROM sources WHERE id = ?', id);
      res.json(updatedSource);
    } catch (err) {
      next(err);
    }
  });

  // 删除自定义源
  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await db.run(
        'DELETE FROM sources WHERE id = ?',
        req.params.id
      );

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Source not found' });
      }

      res.json({ message: 'Source deleted successfully' });
    } catch (err) {
      next(err);
    }
  });

  // 测试自定义源
  router.post('/:id/test', async (req, res, next) => {
    try {
      const source = await db.get(
        'SELECT * FROM sources WHERE id = ?',
        req.params.id
      );

      if (!source) {
        return res.status(404).json({ error: 'Source not found' });
      }

      const parser = new SourceParser(source.script);
      
      // 测试基本方法
      const testResults = {
        search: false,
        getTopList: false,
        getMusicUrl: false
      };

      try {
        await parser.execute('search', { keyword: 'test', page: 1 });
        testResults.search = true;
      } catch (err) {
        testResults.searchError = err.message;
      }

      try {
        await parser.execute('getTopList');
        testResults.getTopList = true;
      } catch (err) {
        testResults.getTopListError = err.message;
      }

      res.json({
        success: testResults.search || testResults.getTopList,
        results: testResults
      });
    } catch (err) {
      next(err);
    }
  });

  // 启用/禁用源
  router.patch('/:id/toggle', async (req, res, next) => {
    try {
      const source = await db.get(
        'SELECT * FROM sources WHERE id = ?',
        req.params.id
      );

      if (!source) {
        return res.status(404).json({ error: 'Source not found' });
      }

      await db.run(
        'UPDATE sources SET enabled = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?',
        [source.enabled ? 0 : 1, req.params.id]
      );

      const updatedSource = await db.get('SELECT * FROM sources WHERE id = ?', req.params.id);
      res.json(updatedSource);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
