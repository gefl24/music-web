// backend/src/routes/platform.routes.js
const express = require('express');
const PlatformService = require('../services/platform.service');

module.exports = (db) => {
  const router = express.Router();
  // 实例化 PlatformService 并注入 db
  const platformService = new PlatformService(db);

  // 1. 获取所有平台的排行榜列表
  // 对应前端: musicApi.getRankingList()
  router.get('/ranking/list', async (req, res, next) => {
    try {
      const list = await platformService.getRankingList();
      // 保持数据结构与前端预期一致: { sources: [...] }
      res.json({ sources: list });
    } catch (err) {
      next(err);
    }
  });

  // 2. 获取排行榜详情 (真实数据)
  // 对应前端: musicApi.getRankingDetail(platform, rankingId)
  router.get('/ranking/:platform/:rankingId', async (req, res, next) => {
    try {
      const { platform, rankingId } = req.params;
      const { page, limit } = req.query;
      
      const result = await platformService.getRankingDetail(
        platform, 
        rankingId, 
        parseInt(page) || 1, 
        parseInt(limit) || 30
      );
      
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 3. 聚合搜索
  // 对应前端: musicApi.search(keyword)
  router.post('/search', async (req, res, next) => {
    try {
      const { keyword, page, limit } = req.body;
      
      const results = await platformService.search(
        keyword, 
        parseInt(page) || 1, 
        parseInt(limit) || 30
      );
      
      res.json({
        keyword,
        page,
        limit,
        results
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
