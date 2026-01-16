// backend/src/routes/music.routes.js
const express = require('express');
const SourceParser = require('../utils/source-parser');

// 内置榜单结构 (ID 必须与 LX 源协议一致: wy, tx, kg, kw, mg)
const BUILT_IN_RANKINGS = [
  {
    sourceId: 'wy', 
    sourceName: '网易云音乐',
    list: [
      { id: '19723756', name: '云音乐飙升榜' },
      { id: '3779629', name: '云音乐新歌榜' },
      { id: '3778678', name: '云音乐热歌榜' }
    ]
  },
  {
    sourceId: 'tx', 
    sourceName: 'QQ音乐',
    list: [
      { id: '62', name: '飙升榜' },
      { id: '26', name: '热歌榜' },
      { id: '27', name: '新歌榜' }
    ]
  },
  // ... 其他榜单保持不变
];

module.exports = (db) => {
  const router = express.Router();

  // 1. 获取排行榜列表
  router.get('/ranking/list', (req, res) => {
    res.json({ sources: BUILT_IN_RANKINGS });
  });

  // 2. 获取榜单详情 (动态解析)
  router.get('/ranking/:sourceId/:topListId', async (req, res, next) => {
    try {
      const { sourceId, topListId } = req.params;
      const { page = 1, limit = 30 } = req.query;

      // 获取所有启用的源，按优先级排序
      const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
      
      if (sources.length === 0) {
        return res.json({ list: [], total: 0, error: '请先添加并启用自定义源' });
      }

      let result = null;
      let errors = [];

      // 遍历所有源，直到找到能解析的源
      for (const source of sources) {
        try {
          const parser = new SourceParser(source.script);
          // 调用 board 动作
          const data = await parser.getTopListDetail(sourceId, topListId, parseInt(page), parseInt(limit));
          
          // 只有当返回了包含 list 的数据时，才视为成功
          if (data && data.list && data.list.length > 0) {
            result = data;
            break; // 成功！跳出循环
          }
        } catch (err) {
          // 记录错误但不中断循环，继续尝试下一个源
          // console.log(`源 ${source.name} 解析失败: ${err.message}`);
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
        // 所有源都失败了，返回空列表和错误信息
        res.json({
          list: [],
          total: 0,
          error: `获取失败。已尝试 ${sources.length} 个源。可能原因：IP受限或源脚本失效。详情: ${errors[0] || '未知错误'}`
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // 3. 搜索接口 (保持原有逻辑，已自动适配新的 Parser)
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

  // ... url, lyric, pic 接口保持不变 ...
  // (只需保留文件中的 url, lyric, pic 部分逻辑即可)
  
  // 这里为了完整性补全 url 接口的简化版示例，你只需确保使用 db 和 new SourceParser 即可
  router.post('/url', async (req, res) => {
      try {
          const { musicInfo } = req.body;
          // 确保 source 字段存在
          if (!musicInfo.source && req.body.sourceId) musicInfo.source = req.body.sourceId;
          
          const sources = await db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
          let urlInfo = null;
          
          for (const source of sources) {
              try {
                  const parser = new SourceParser(source.script);
                  const result = await parser.getMusicUrl(musicInfo);
                  if (result && result.url) {
                      urlInfo = result;
                      break;
                  }
              } catch(e) {}
          }
          if(!urlInfo) throw new Error('无法获取播放地址');
          res.json({ url: urlInfo.url, type: urlInfo.type });
      } catch(err) {
          res.json({ error: err.message });
      }
  });

  return router;
};
