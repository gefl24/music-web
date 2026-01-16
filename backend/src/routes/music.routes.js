// backend/src/routes/music.routes.js
const express = require('express');
const SourceParser = require('../utils/source-parser');

// 内置的榜单结构 (模拟 LX Desktop 的内置源)
const BUILT_IN_RANKINGS = [
  {
    sourceId: 'wy',
    sourceName: '网易云音乐',
    list: [
      { id: '19723756', name: '云音乐飙升榜' },
      { id: '3779629', name: '云音乐新歌榜' },
      { id: '3778678', name: '云音乐热歌榜' },
      { id: '2884035', name: '网易原创歌曲榜' }
    ]
  },
  {
    sourceId: 'qq',
    sourceName: 'QQ音乐',
    list: [
      { id: '4', name: '流行指数榜' },
      { id: '26', name: '热歌榜' },
      { id: '27', name: '新歌榜' },
      { id: '62', name: '飙升榜' }
    ]
  },
  {
    sourceId: 'kg',
    sourceName: '酷狗音乐',
    list: [
      { id: '8888', name: 'TOP500' },
      { id: '6666', name: '飙升榜' }
    ]
  },
  {
    sourceId: 'kw',
    sourceName: '酷我音乐',
    list: [
      { id: '93', name: '酷我酷音乐' },
      { id: '17', name: '酷我新歌' }
    ]
  }
];

module.exports = (db) => {
  const router = express.Router();

  // 1. 获取排行榜列表：直接返回内置列表 (无需自定义源也显示)
  router.get('/ranking/list', (req, res) => {
    res.json({ sources: BUILT_IN_RANKINGS });
  });

  // 2. 获取排行榜详情
  router.get('/ranking/:sourceId/:topListId', async (req, res, next) => {
    try {
      const { sourceId, topListId } = req.params;
      const { page = 1, limit = 30 } = req.query;

      // 寻找可用的自定义源来解析数据
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      
      if (sources.length === 0) {
        return res.json({ 
          list: [], 
          total: 0, 
          sourceId, 
          error: '请先添加并启用自定义源以获取榜单数据' 
        });
      }

      let result = null;
      let lastError = null;

      // 遍历所有源，尝试解析
      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          // 告诉源：我要获取 sourceId (比如 wy) 平台的 topListId 榜单
          const data = await parser.getTopListDetail(sourceId, topListId, parseInt(page), parseInt(limit));
          
          if (data && data.list && data.list.length > 0) {
            result = data;
            break; // 成功获取，跳出循环
          }
        } catch (err) {
          lastError = err.message;
          // 继续尝试下一个源
        }
      }

      if (result) {
        res.json({
          sourceId,
          topListId,
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.total || result.list.length,
          list: result.list
        });
      } else {
        res.json({
          list: [],
          total: 0,
          error: `获取失败，请检查自定义源是否支持。最后错误: ${lastError}`
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // 3. 搜索音乐 (逻辑保持不变，但优化错误处理)
  router.post('/search', async (req, res, next) => {
    try {
      const { keyword, page = 1, limit = 30 } = req.body;
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');

      if (sources.length === 0) return res.json({ results: [] });

      // 只使用优先级最高的一个源进行搜索 (聚合源通常只需要一个)
      // 也可以改为并发搜索，但为了稳定性，建议先试第一个
      const bestSource = sources[0];
      try {
        const parser = new SourceParser(bestSource.script);
        const result = await parser.search(keyword, page, limit);
        
        res.json({
          keyword,
          page,
          limit,
          results: [{
            sourceId: 'all', // 聚合搜索通常返回混合结果
            sourceName: '聚合搜索结果',
            data: result
          }]
        });
      } catch (err) {
        res.json({ results: [], error: err.message });
      }
    } catch (err) {
      next(err);
    }
  });

  // 4. 获取播放地址 (使用自定义源解析)
  router.post('/url', async (req, res, next) => {
    try {
      const { musicInfo, quality = '128k' } = req.body;
      // 优先使用数据库里优先级最高的源
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      
      if (sources.length === 0) return res.status(404).json({ error: 'No enabled sources' });

      let urlInfo = null;
      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          const result = await parser.getMusicUrl(musicInfo, quality);
          if (result && result.url) {
            urlInfo = result;
            break;
          }
        } catch (e) { console.error('Url parse failed:', e.message); }
      }

      if (!urlInfo) throw new Error('无法解析播放地址');
      
      res.json({ sourceId: 'custom', ...urlInfo });
    } catch (err) {
      // 返回特定结构以避免前端报错
      res.json({ url: null, error: err.message }); 
    }
  });

  return router;
};
