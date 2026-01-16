// backend/src/routes/music.routes.js
const express = require('express');
const SourceParser = require('../utils/source-parser');

// 内置榜单结构 (ID 必须与 LX 源协议一致: wy, tx, kg, kw, mg)
const BUILT_IN_RANKINGS = [
  {
    sourceId: 'wy', // 网易云
    sourceName: '网易云音乐',
    list: [
      { id: '19723756', name: '云音乐飙升榜' },
      { id: '3779629', name: '云音乐新歌榜' },
      { id: '3778678', name: '云音乐热歌榜' },
      { id: '2884035', name: '网易原创歌曲榜' }
    ]
  },
  {
    sourceId: 'tx', // 修正：必须是 tx (Tencent)，不能是 qq
    sourceName: 'QQ音乐',
    list: [
      { id: '62', name: '飙升榜' },
      { id: '26', name: '热歌榜' },
      { id: '27', name: '新歌榜' },
      { id: '4', name: '流行指数榜' }
    ]
  },
  {
    sourceId: 'kg', // 酷狗
    sourceName: '酷狗音乐',
    list: [
      { id: '8888', name: 'TOP500' },
      { id: '6666', name: '飙升榜' }
    ]
  },
  {
    sourceId: 'kw', // 酷我
    sourceName: '酷我音乐',
    list: [
      { id: '93', name: '酷我酷音乐' },
      { id: '17', name: '酷我新歌' }
    ]
  }
];

// backend/src/routes/music.routes.js
// ... (保留顶部的 BUILT_IN_RANKINGS 定义)

module.exports = (db) => {
  const router = express.Router();

  // 1. 获取排行榜列表
  router.get('/ranking/list', (req, res) => {
    res.json({ sources: BUILT_IN_RANKINGS });
  });

  // 2. 获取榜单详情
  router.get('/ranking/:sourceId/:topListId', async (req, res, next) => {
    try {
      const { sourceId, topListId } = req.params;
      const { page = 1, limit = 30 } = req.query;

      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      
      if (sources.length === 0) {
        return res.json({ list: [], total: 0, error: '请先添加并启用自定义源' });
      }

      let result = null;
      let errors = [];

      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          const data = await parser.getTopListDetail(sourceId, topListId, parseInt(page), parseInt(limit));
          
          // 只有当返回了有效的列表数据时，才认为是成功
          if (data && data.list && data.list.length > 0) {
            result = data;
            break; // 找到数据，退出循环
          }
        } catch (err) {
          // 记录错误但继续尝试下一个源
          // console.error(`Source ${source.name} failed:`, err.message);
          errors.push(`${source.name}: ${err.message}`);
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
          error: `获取失败，已尝试 ${sources.length} 个源。错误详情: ${errors.join('; ')}`
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // 3. 搜索接口
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

  // 4. 获取播放地址
  router.post('/url', async (req, res, next) => {
    try {
      const { musicInfo, quality = '128k' } = req.body;
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      
      if (sources.length === 0) return res.status(404).json({ error: 'No enabled sources' });

      // 修正：确保传递正确的 sourceId (比如 'wy', 'tx')
      if (!musicInfo.source && req.body.sourceId) {
        musicInfo.source = req.body.sourceId;
      }

      let urlInfo = null;
      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          const result = await parser.getMusicUrl(musicInfo, quality);
          if (result && result.url) {
            urlInfo = result;
            break;
          }
        } catch (e) {}
      }

      if (!urlInfo) throw new Error('无法解析播放地址');
      
      res.json({ sourceId: 'custom', ...urlInfo });
    } catch (err) {
      res.json({ url: null, error: err.message });
    }
  });

  // 歌词接口
  router.post('/lyric', async (req, res, next) => {
    try {
      const { musicInfo } = req.body;
      if (!musicInfo.source && req.body.sourceId) musicInfo.source = req.body.sourceId;
      
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      let lyricInfo = null;
      
      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          const result = await parser.getLyric(musicInfo);
          if (result) { lyricInfo = result; break; }
        } catch (e) {}
      }
      res.json({ sourceId: 'custom', lyric: lyricInfo?.lyric || lyricInfo?.lrc || '', tlyric: lyricInfo?.tlyric || '' });
    } catch(err) { next(err); }
  });

  // 图片接口
  router.post('/pic', async (req, res, next) => {
    try {
      const { musicInfo } = req.body;
      if (!musicInfo.source && req.body.sourceId) musicInfo.source = req.body.sourceId;
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      let picUrl = null;
      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          const result = await parser.getPic(musicInfo);
          if (result) { picUrl = result; break; }
        } catch (e) {}
      }
      res.json({ sourceId: 'custom', pic: picUrl });
    } catch(err) { next(err); }
  });

  return router;
};
