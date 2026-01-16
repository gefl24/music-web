// backend/src/routes/music.routes.js
const express = require('express');
const SourceParser = require('../utils/source-parser');

module.exports = (db) => {
  const router = express.Router();

  // 搜索音乐
  router.post('/search', async (req, res, next) => {
    try {
      const { keyword, sourceIds, page = 1, limit = 30 } = req.body;

      if (!keyword) {
        return res.status(400).json({ error: 'Keyword is required' });
      }

      // 获取要搜索的源
      let sources;
      if (sourceIds && sourceIds.length > 0) {
        const placeholders = sourceIds.map(() => '?').join(',');
        sources = await db.all(
          `SELECT * FROM sources WHERE id IN (${placeholders}) AND enabled = 1`,
          sourceIds
        );
      } else {
        sources = await db.all(
          'SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC'
        );
      }

      if (sources.length === 0) {
        return res.json({ results: [] });
      }

      // 并发搜索所有源
      const searchPromises = sources.map(async (source) => {
        try {
          const parser = new SourceParser(source.script);
          const result = await parser.search(keyword, page, limit);
          
          return {
            sourceId: source.id,
            sourceName: source.name,
            success: true,
            data: result
          };
        } catch (err) {
          console.error(`Search error in source ${source.name}:`, err);
          return {
            sourceId: source.id,
            sourceName: source.name,
            success: false,
            error: err.message
          };
        }
      });

      const results = await Promise.all(searchPromises);

      res.json({
        keyword,
        page,
        limit,
        results: results.filter(r => r.success)
      });
    } catch (err) {
      next(err);
    }
  });

  // 获取排行榜列表
  router.get('/ranking/list', async (req, res, next) => {
    try {
      const { sourceId } = req.query;

      if (sourceId) {
        // 获取指定源的排行榜
        const source = await db.get(
          'SELECT * FROM sources WHERE id = ? AND enabled = 1',
          sourceId
        );

        if (!source) {
          return res.status(404).json({ error: 'Source not found or disabled' });
        }

        const parser = new SourceParser(source.script);
        const topList = await parser.getTopList();

        res.json({
          sourceId: source.id,
          sourceName: source.name,
          list: topList
        });
      } else {
        // 获取所有启用源的排行榜
        const sources = await db.all(
          'SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC'
        );

        const rankingPromises = sources.map(async (source) => {
          try {
            const parser = new SourceParser(source.script);
            const topList = await parser.getTopList();
            
            return {
              sourceId: source.id,
              sourceName: source.name,
              success: true,
              list: topList
            };
          } catch (err) {
            console.error(`Ranking list error in source ${source.name}:`, err);
            return {
              sourceId: source.id,
              sourceName: source.name,
              success: false,
              error: err.message
            };
          }
        });

        const results = await Promise.all(rankingPromises);

        res.json({
          sources: results.filter(r => r.success)
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // 获取排行榜详情
  router.get('/ranking/:sourceId/:topListId', async (req, res, next) => {
    try {
      const { sourceId, topListId } = req.params;
      const { page = 1, limit = 100 } = req.query;

      const source = await db.get(
        'SELECT * FROM sources WHERE id = ? AND enabled = 1',
        sourceId
      );

      if (!source) {
        return res.status(404).json({ error: 'Source not found or disabled' });
      }

      const parser = new SourceParser(source.script);
      const result = await parser.getTopListDetail(topListId, parseInt(page), parseInt(limit));

      res.json({
        sourceId: source.id,
        sourceName: source.name,
        topListId,
        page: parseInt(page),
        limit: parseInt(limit),
        ...result
      });
    } catch (err) {
      next(err);
    }
  });

  // 获取音乐播放地址
  router.post('/url', async (req, res, next) => {
    try {
      const { sourceId, musicInfo, quality = '128k' } = req.body;

      if (!sourceId || !musicInfo) {
        return res.status(400).json({ error: 'sourceId and musicInfo are required' });
      }

      const source = await db.get(
        'SELECT * FROM sources WHERE id = ? AND enabled = 1',
        sourceId
      );

      if (!source) {
        return res.status(404).json({ error: 'Source not found or disabled' });
      }

      const parser = new SourceParser(source.script);
      const urlInfo = await parser.getMusicUrl(musicInfo, quality);

      res.json({
        sourceId: source.id,
        ...urlInfo
      });
    } catch (err) {
      next(err);
    }
  });

  // 获取歌词
  router.post('/lyric', async (req, res, next) => {
    try {
      const { sourceId, musicInfo } = req.body;

      if (!sourceId || !musicInfo) {
        return res.status(400).json({ error: 'sourceId and musicInfo are required' });
      }

      const source = await db.get(
        'SELECT * FROM sources WHERE id = ? AND enabled = 1',
        sourceId
      );

      if (!source) {
        return res.status(404).json({ error: 'Source not found or disabled' });
      }

      const parser = new SourceParser(source.script);
      const lyric = await parser.getLyric(musicInfo);

      res.json({
        sourceId: source.id,
        lyric
      });
    } catch (err) {
      // 歌词获取失败不是致命错误
      console.error('Lyric fetch error:', err);
      res.json({
        sourceId: req.body.sourceId,
        lyric: null,
        error: err.message
      });
    }
  });

  // 获取音乐图片
  router.post('/pic', async (req, res, next) => {
    try {
      const { sourceId, musicInfo } = req.body;

      if (!sourceId || !musicInfo) {
        return res.status(400).json({ error: 'sourceId and musicInfo are required' });
      }

      const source = await db.get(
        'SELECT * FROM sources WHERE id = ? AND enabled = 1',
        sourceId
      );

      if (!source) {
        return res.status(404).json({ error: 'Source not found or disabled' });
      }

      const parser = new SourceParser(source.script);
      const pic = await parser.getPic(musicInfo);

      res.json({
        sourceId: source.id,
        pic
      });
    } catch (err) {
      console.error('Picture fetch error:', err);
      res.json({
        sourceId: req.body.sourceId,
        pic: null,
        error: err.message
      });
    }
  });

  // 批量获取音乐详情
  router.post('/batch', async (req, res, next) => {
    try {
      const { items } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'items array is required' });
      }

      const results = await Promise.all(
        items.map(async (item) => {
          try {
            const { sourceId, musicInfo, quality } = item;

            const source = await db.get(
              'SELECT * FROM sources WHERE id = ? AND enabled = 1',
              sourceId
            );

            if (!source) {
              return { ...item, success: false, error: 'Source not found' };
            }

            const parser = new SourceParser(source.script);
            const urlInfo = await parser.getMusicUrl(musicInfo, quality || '128k');

            return {
              ...item,
              success: true,
              ...urlInfo
            };
          } catch (err) {
            return {
              ...item,
              success: false,
              error: err.message
            };
          }
        })
      );

      res.json({ results });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
