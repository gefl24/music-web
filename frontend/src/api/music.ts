// frontend/src/api/music.ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const musicApi = {
  // 1. 获取排行榜列表 (走 Platform API)
  // 对应后端: /api/platform/ranking/list
  getRankingList() {
    return api.get('/platform/ranking/list').then(res => res.data)
  },

  // 2. 获取排行榜详情 (走 Platform API)
  // 对应后端: /api/platform/ranking/:platform/:rankingId
  getRankingDetail(platform: string, rankingId: string, page = 1, limit = 30) {
    return api.get(`/platform/ranking/${platform}/${rankingId}`, {
      params: { page, limit }
    }).then(res => res.data)
  },

  // 3. 搜索 (走 Platform API)
  // 对应后端: /api/platform/search
  // 参数调整：新架构下搜索由后端聚合，不再强制需要 sourceIds，但保留参数位置以防报错
  search(keyword: string, sourceIds?: string[], page = 1, limit = 30) {
    // sourceIds在此处可能被忽略，取决于后端实现，主要依赖 keyword
    return api.post('/platform/search', {
      keyword,
      page,
      limit
    }).then(res => res.data)
  },

  // 4. 获取播放地址 (走 Music API -> Custom Source)
  // 对应后端: /api/music/url
  // 统一音乐服务会根据 musicInfo 中的信息尝试所有可用源
  getMusicUrl(sourceId: string, musicInfo: any, quality = '128k') {
    // 构造 payload，确保 source 字段正确
    // 在 Views 中调用通常是: handlePlay(music, sourceId)
    const payloadInfo = { ...musicInfo };
    
    // 强制将传入的 sourceId (如 'tx', 'wy') 写入 info，供后端脚本识别目标平台
    if (sourceId) {
        payloadInfo.source = sourceId;
    }

    return api.post('/music/url', {
      musicInfo: payloadInfo,
      quality
    }).then(res => res.data)
  },

  // 5. 获取歌词 (可选，预留)
  getLyric(sourceId: string, musicInfo: any) {
    const payloadInfo = { ...musicInfo };
    if (sourceId) payloadInfo.source = sourceId;
    
    return api.post('/music/lyric', {
      musicInfo: payloadInfo
    }).then(res => res.data)
  },

  // 6. 获取图片 (可选，预留)
  getPic(sourceId: string, musicInfo: any) {
    const payloadInfo = { ...musicInfo };
    if (sourceId) payloadInfo.source = sourceId;

    return api.post('/music/pic', {
      musicInfo: payloadInfo
    }).then(res => res.data)
  },

  // 7. 批量获取 (保留)
  batchGet(items: any[]) {
    return api.post('/music/batch', { items }).then(res => res.data)
  }
}
