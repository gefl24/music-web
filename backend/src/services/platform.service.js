const SourceParser = require('../utils/source-parser');

// 静态定义的榜单 ID 列表（这些 ID 是各大平台固定的）
const BUILT_IN_RANKINGS = [
  { sourceId: 'tx', sourceName: 'QQ音乐', list: [ { id: '26', name: '热歌榜' }, { id: '27', name: '新歌榜' }, { id: '62', name: '飙升榜' } ] },
  { sourceId: 'wy', sourceName: '网易云音乐', list: [ { id: '3778678', name: '热歌榜' }, { id: '3779629', name: '新歌榜' }, { id: '19723756', name: '飙升榜' } ] },
  { sourceId: 'kg', sourceName: '酷狗音乐', list: [ { id: '8888', name: 'TOP500' }, { id: '6666', name: '飙升榜' } ] }
];

class PlatformService {
  constructor(db) {
    this.db = db;
  }

  // 1. 获取排行榜菜单 (静态返回)
  async getRankingList() {
    return BUILT_IN_RANKINGS;
  }

  // 2. 获取排行榜真实详情 (调用自定义源)
  async getRankingDetail(sourceId, rankingId, page = 1, limit = 30) {
    // 从数据库获取所有启用的源
    const sources = await this.db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
    
    if (sources.length === 0) {
      throw new Error('未检测到可用源，请先在设置页导入自定义源（如六音源）');
    }

    let result = null;
    let lastError = null;

    // 遍历源，尝试解析
    for (const source of sources) {
      try {
        const parser = new SourceParser(source.script);
        // 尝试调用脚本获取榜单
        // 注意：sourceId 必须匹配 (如 tx)，如果脚本不支持该平台，通常会返回空或报错
        const data = await parser.getTopListDetail(sourceId, rankingId, page, limit);
        
        if (data && data.list && data.list.length > 0) {
          result = data;
          break; // 成功获取，退出循环
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    if (!result) {
      throw new Error(`获取失败，已尝试 ${sources.length} 个源。请检查源脚本是否支持该平台。错误: ${lastError}`);
    }

    return {
      sourceId,
      rankingId,
      page,
      limit,
      total: result.total || result.list.length,
      list: result.list // 这里就是真实的歌曲列表
    };
  }

  // 3. 真实聚合搜索
  async search(keyword, page = 1, limit = 30) {
    const sources = await this.db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
    if (sources.length === 0) return [];

    // 通常使用优先级最高的源进行聚合搜索
    const bestSource = sources[0];
    try {
      const parser = new SourceParser(bestSource.script);
      const result = await parser.search(keyword, page, limit);
      return [{
        sourceId: 'all',
        sourceName: '聚合搜索',
        data: result
      }];
    } catch (err) {
      throw new Error(`搜索失败: ${err.message}`);
    }
  }
}

module.exports = PlatformService;
