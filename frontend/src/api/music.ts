// frontend/src/api/music.ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const musicApi = {
  // 搜索音乐
  search(keyword: string, sourceIds?: string[], page = 1, limit = 30) {
    return api.post('/music/search', {
      keyword,
      sourceIds,
      page,
      limit
    }).then(res => res.data)
  },

  // 获取排行榜列表
  getRankingList(sourceId?: string) {
    return api.get('/music/ranking/list', {
      params: { sourceId }
    }).then(res => res.data)
  },

  // 获取排行榜详情
  getRankingDetail(sourceId: string, topListId: string, page = 1, limit = 100) {
    return api.get(`/music/ranking/${sourceId}/${topListId}`, {
      params: { page, limit }
    }).then(res => res.data)
  },

  // 获取音乐播放地址
  getMusicUrl(sourceId: string, musicInfo: any, quality = '128k') {
    return api.post('/music/url', {
      sourceId,
      musicInfo,
      quality
    }).then(res => res.data)
  },

  // 获取歌词
  getLyric(sourceId: string, musicInfo: any) {
    return api.post('/music/lyric', {
      sourceId,
      musicInfo
    }).then(res => res.data)
  },

  // 获取封面
  getPic(sourceId: string, musicInfo: any) {
    return api.post('/music/pic', {
      sourceId,
      musicInfo
    }).then(res => res.data)
  },

  // 批量获取音乐信息
  batchGet(items: any[]) {
    return api.post('/music/batch', { items }).then(res => res.data)
  }
}
