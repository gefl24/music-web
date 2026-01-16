// backend/src/services/unified-music.service.js
const SourceParser = require('../utils/source-parser');

class UnifiedMusicService {
  constructor(db) {
    this.db = db;
  }

  // 核心功能：使用自定义源解析播放链接
  async resolveUrl(musicInfo, quality = '128k') {
    // 1. 获取所有启用的自定义源
    const sources = await this.db.all('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC');
    
    if (sources.length === 0) {
      throw new Error('无可用源，请先在设置中导入并启用自定义源');
    }

    let lastError = null;

    // 2. 尝试使用自定义源解析
    for (const source of sources) {
      try {
        console.log(`[Unified] 尝试使用源 "${source.name}" 解析: ${musicInfo.name}`);
        const parser = new SourceParser(source.script);
        
        // 传入歌曲的基本信息 (name, singer, id, source)
        // 注意：我们显式传递原始平台 source (如 'tx')，以便脚本判断
        const result = await parser.getMusicUrl(musicInfo, quality);
        
        if (result && result.url) {
          console.log(`[Unified] 解析成功: ${result.url.substring(0, 50)}...`);
          return {
            url: result.url,
            quality: quality,
            source: source.name // 记录是哪个自定义源解析出来的
          };
        }
      } catch (err) {
        // console.warn(`[Unified] 源 "${source.name}" 解析失败:`, err.message);
        lastError = err;
      }
    }

    throw new Error(`解析失败，已尝试 ${sources.length} 个源。最后错误: ${lastError?.message || '无结果'}`);
  }
}

module.exports = UnifiedMusicService;
