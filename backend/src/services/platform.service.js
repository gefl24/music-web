// backend/src/services/platform.service.js
const { v4: uuidv4 } = require('uuid');

class PlatformService {
  constructor() {
    // 模拟数据：排行榜列表
    this.rankings = {
      tx: [
        { id: '26', name: '热歌榜' },
        { id: '27', name: '新歌榜' },
        { id: '62', name: '飙升榜' }
      ],
      wy: [
        { id: '3778678', name: '热歌榜' },
        { id: '3779629', name: '新歌榜' },
        { id: '19723756', name: '飙升榜' }
      ],
      kg: [
        { id: '8888', name: 'TOP500' },
        { id: '6666', name: '飙升榜' }
      ]
    };
  }

  // 获取排行榜列表
  async getRankingList() {
    return [
      { sourceId: 'tx', sourceName: 'QQ音乐', list: this.rankings.tx },
      { sourceId: 'wy', sourceName: '网易云音乐', list: this.rankings.wy },
      { sourceId: 'kg', sourceName: '酷狗音乐', list: this.rankings.kg }
    ];
  }

  // 获取排行榜详情 (模拟数据)
  async getRankingDetail(platform, rankingId, page = 1, limit = 30) {
    // 这里产生模拟歌曲数据，用于验证架构
    // 在实际场景中，这里应该请求真实的平台接口
    const list = [];
    for (let i = 0; i < limit; i++) {
      const num = (page - 1) * limit + i + 1;
      list.push({
        id: `${platform}_song_${rankingId}_${num}`,
        name: `模拟歌曲 - ${platform.toUpperCase()} 榜单${rankingId} - No.${num}`,
        singer: `模拟歌手 ${num}`,
        album: `模拟专辑 ${num}`,
        source: platform, // 关键：标记来源平台
        interval: 200 + i // 随机时长
      });
    }

    return {
      sourceId: platform,
      rankingId,
      page,
      limit,
      total: 100,
      list
    };
  }

  // 搜索歌曲 (模拟数据)
  async search(keyword, platforms = ['tx', 'wy', 'kg'], page = 1, limit = 30) {
    const results = [];
    
    for (const p of platforms) {
      const list = [];
      // 每个平台生成 5 条模拟结果
      for (let i = 0; i < 5; i++) {
        list.push({
          id: `${p}_search_${i}`,
          name: `${keyword} - 搜索结果 ${i + 1}`,
          singer: `歌手 ${p}`,
          album: `专辑 ${p}`,
          source: p
        });
      }
      
      results.push({
        sourceId: p,
        sourceName: p.toUpperCase(),
        data: {
          list,
          total: 50,
          page,
          limit
        }
      });
    }

    return results;
  }
}

module.exports = new PlatformService();
