// backend/src/routes/music.routes.js
const express = require('express');
const SourceParser = require('../utils/source-parser');

// ==========================================
// 1. 内置主流榜单列表 (静态数据)
// ==========================================
// 这些数据结构与 LX Music 客户端保持一致，ID 对应各平台的真实榜单 ID
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
      { id: '62', name: '飙升榜' },
      { id: '26', name: '热歌榜' },
      { id: '27', name: '新歌榜' },
      { id: '4', name: '流行指数榜' }
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

  // ==========================================
  // 接口 1: 获取排行榜列表
  // 逻辑: 直接返回内置列表，不依赖任何自定义源
  // ==========================================
  router.get('/ranking/list', (req, res) => {
    res.json({ sources: BUILT_IN_RANKINGS });
  });

  // ==========================================
  // 接口 2: 获取榜单内的歌曲详情
  // 逻辑: 遍历所有启用的源，找到能解析该平台(sourceId)的源
  // ==========================================
  router.get('/ranking/:sourceId/:topListId', async (req, res, next) => {
    try {
      const { sourceId, topListId } = req.params;
      const { page = 1, limit = 30 } = req.query;

      // 获取所有启用的自定义源
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      
      if (sources.length === 0) {
        return res.json({ 
          list: [], 
          total: 0, 
          sourceId, 
          error: '请先在设置中添加并启用自定义源' 
        });
      }

      let result = null;
      let lastError = null;

      // 遍历源进行尝试
      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          // 关键：告诉源我们要获取哪个平台(sourceId)的哪个榜单(topListId)
          const data = await parser.getTopListDetail(sourceId, topListId, parseInt(page), parseInt(limit));
          
          if (data && data.list && data.list.length > 0) {
            result = data;
            break; // 成功获取，停止遍历
          }
        } catch (err) {
          lastError = err.message;
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
          error: `获取失败 (最后错误: ${lastError})`
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 接口 3: 获取单一歌曲详情 (播放链接/歌词/封面)
  // 逻辑: 遍历源，解析 musicInfo
  // ==========================================
  router.post('/url', async (req, res, next) => {
    try {
      const { musicInfo, quality = '128k' } = req.body;
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      
      if (sources.length === 0) return res.status(404).json({ error: 'No enabled sources' });

      let urlInfo = null;

      // 确保 musicInfo 中包含 source 属性 (用于告诉脚本去哪个平台解析)
      if (!musicInfo.source && req.body.sourceId) {
        musicInfo.source = req.body.sourceId;
      }

      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          const result = await parser.getMusicUrl(musicInfo, quality);
          if (result && result.url) {
            urlInfo = result;
            break;
          }
        } catch (e) {
          // 忽略单个源的失败，继续尝试下一个
        }
      }

      if (!urlInfo) throw new Error('无法解析播放地址，请检查源是否支持该歌曲');
      
      res.json({ sourceId: 'custom', ...urlInfo });
    } catch (err) {
      // 返回特定格式以防前端崩溃
      res.json({ url: null, error: err.message });
    }
  });

  // 搜索接口 (保持逻辑: 使用第一个可用源)
  router.post('/search', async (req, res, next) => {
    try {
      const { keyword, page = 1, limit = 30 } = req.body;
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');

      if (sources.length === 0) return res.json({ results: [] });

      const bestSource = sources[0];
      try {
        const parser = new SourceParser(bestSource.script);
        const result = await parser.search(keyword, page, limit);
        
        res.json({
          keyword,
          page,
          limit,
          results: [{
            sourceId: 'all', 
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

  // 歌词接口
  router.post('/lyric', async (req, res, next) => {
    try {
      const { musicInfo } = req.body;
      if (!musicInfo.source && req.body.sourceId) musicInfo.source = req.body.sourceId;
      
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      if (sources.length === 0) return res.json({ lyric: '', tlyric: '' });

      let lyricInfo = null;
      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          const result = await parser.getLyric(musicInfo);
          if (result && (result.lyric || result.lrc)) {
            lyricInfo = result;
            break;
          }
        } catch (e) {}
      }
      res.json({ sourceId: 'custom', lyric: lyricInfo?.lyric || '', tlyric: lyricInfo?.tlyric || '' });
    } catch(err) { next(err); }
  });

  // 图片接口
  router.post('/pic', async (req, res, next) => {
    try {
      const { musicInfo } = req.body;
      if (!musicInfo.source && req.body.sourceId) musicInfo.source = req.body.sourceId;

      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      if (sources.length === 0) return res.json({ pic: null });

      let picUrl = null;
      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          const result = await parser.getPic(musicInfo);
          if (result) {
            picUrl = result;
            break;
          }
        } catch (e) {}
      }
      res.json({ sourceId: 'custom', pic: picUrl });
    } catch(err) { next(err); }
  });

  return router;
};
