// backend/src/routes/platform.routes.js
const express = require('express');
const platformService = require('../services/platform.service');

const router = express.Router();

// 获取所有平台的排行榜列表
router.get('/ranking/list', async (req, res, next) => {
  try {
    const list = await platformService.getRankingList();
    res.json({ sources: list });
  } catch (err) {
    next(err);
  }
});

// 获取排行榜详情
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

// 聚合搜索
router.post('/search', async (req, res, next) => {
  try {
    const { keyword, page, limit } = req.body;
    const results = await platformService.search(keyword, null, parseInt(page), parseInt(limit));
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

module.exports = router;
