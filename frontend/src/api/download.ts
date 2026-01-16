// frontend/src/api/download.ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const downloadApi = {
  // 添加下载
  add(musicInfo: any) {
    return api.post('/downloads', musicInfo).then(res => res.data)
  },

  // 批量添加
  addBatch(items: any[]) {
    return api.post('/downloads/batch', { items }).then(res => res.data)
  },

  // 获取下载列表
  list(status?: string, page = 1, limit = 50) {
    return api.get('/downloads', {
      params: { status, page, limit }
    }).then(res => res.data)
  },

  // 获取单个下载
  get(id: string) {
    return api.get(`/downloads/${id}`).then(res => res.data)
  },

  // 删除下载
  delete(id: string) {
    return api.delete(`/downloads/${id}`).then(res => res.data)
  },

  // 批量删除
  deleteBatch(ids: string[]) {
    return api.post('/downloads/batch-delete', { ids }).then(res => res.data)
  },

  // 重试下载
  retry(id: string) {
    return api.post(`/downloads/${id}/retry`).then(res => res.data)
  },

  // 清理已完成
  clearCompleted() {
    return api.post('/downloads/clear-completed').then(res => res.data)
  },

  // 暂停下载
  pause(id: string) {
    return api.post(`/downloads/${id}/pause`).then(res => res.data)
  },

  // 恢复下载
  resume(id: string) {
    return api.post(`/downloads/${id}/resume`).then(res => res.data)
  },

  // 获取统计
  getStats() {
    return api.get('/downloads/stats/summary').then(res => res.data)
  }
}
