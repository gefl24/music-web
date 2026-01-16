// frontend/src/api/source.ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const sourceApi = {
  // 获取所有源
  list() {
    return api.get('/sources').then(res => res.data)
  },

  // 获取单个源
  get(id: string) {
    return api.get(`/sources/${id}`).then(res => res.data)
  },

  // 创建源
  create(data: any) {
    return api.post('/sources', data).then(res => res.data)
  },

  // 更新源
  update(id: string, data: any) {
    return api.put(`/sources/${id}`, data).then(res => res.data)
  },

  // 删除源
  delete(id: string) {
    return api.delete(`/sources/${id}`).then(res => res.data)
  },

  // 切换启用/禁用
  toggle(id: string) {
    return api.patch(`/sources/${id}/toggle`).then(res => res.data)
  },

  // 测试源
  test(id: string) {
    return api.post(`/sources/${id}/test`).then(res => res.data)
  }
}
