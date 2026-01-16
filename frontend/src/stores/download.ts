// frontend/src/stores/download.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { downloadApi } from '../api/download'

interface Download {
  id: string
  name: string
  singer: string
  source: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number
  downloadedSize: number
  totalSize: number
  error?: string
}

export const useDownloadStore = defineStore('download', () => {
  const downloads = ref<Download[]>([])
  const loading = ref(false)

  async function fetchDownloads() {
    loading.value = true
    try {
      const response = await downloadApi.list()
      downloads.value = response.list
    } catch (error) {
      console.error('Failed to fetch downloads:', error)
    } finally {
      loading.value = false
    }
  }

  async function addDownload(musicInfo: any) {
    try {
      const result = await downloadApi.add(musicInfo)
      downloads.value.unshift(result)
      return result
    } catch (error) {
      console.error('Failed to add download:', error)
      throw error
    }
  }

  async function deleteDownload(id: string) {
    try {
      await downloadApi.delete(id)
      const index = downloads.value.findIndex(d => d.id === id)
      if (index !== -1) {
        downloads.value.splice(index, 1)
      }
    } catch (error) {
      console.error('Failed to delete download:', error)
      throw error
    }
  }

  async function retryDownload(id: string) {
    try {
      await downloadApi.retry(id)
      const download = downloads.value.find(d => d.id === id)
      if (download) {
        download.status = 'pending'
        download.progress = 0
        download.error = undefined
      }
    } catch (error) {
      console.error('Failed to retry download:', error)
      throw error
    }
  }

  async function clearCompleted() {
    try {
      await downloadApi.clearCompleted()
      downloads.value = downloads.value.filter(d => d.status !== 'completed')
    } catch (error) {
      console.error('Failed to clear completed:', error)
      throw error
    }
  }

  function updateDownloadProgress(id: string, data: any) {
    const download = downloads.value.find(d => d.id === id)
    if (download) {
      Object.assign(download, data)
    }
  }

  return {
    downloads,
    loading,
    fetchDownloads,
    addDownload,
    deleteDownload,
    retryDownload,
    clearCompleted,
    updateDownloadProgress
  }
})
