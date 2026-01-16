// backend/src/routes/music.routes.js
const express = require('express');
const UnifiedMusicService = require('../services/unified-music.service');

module.exports = (db) => {
  const router = express.Router();
  const unifiedService = new UnifiedMusicService(db);

  // 解析播放地址 (核心接口)
  // 接收: { musicInfo: { name, singer, source, id ... }, quality }
  router.post('/url', async (req, res, next) => {
    try {
      const { musicInfo, quality } = req.body;
      if (!musicInfo) throw new Error('缺少 musicInfo 参数');

      const result = await unifiedService.resolveUrl(musicInfo, quality);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 歌词和图片接口逻辑类似，可以使用 UnifiedService 扩展实现
  // 这里暂时为了简洁，仅展示 URL 部分，实际应补充 lyric/pic

  return router;
};
