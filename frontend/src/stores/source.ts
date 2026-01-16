// frontend/src/stores/source.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sourceApi } from '../api/source'

interface Source {
  id: string
  name: string
  type: string
  script: string
  enabled: boolean
  priority: number
  create_time: string
  update_time: string
}

export const useSourceStore = defineStore('source', () => {
  const sources = ref<Source[]>([])
  const loading = ref(false)

  async function fetchSources() {
    loading.value = true
    try {
      sources.value = await sourceApi.list()
    } catch (error) {
      console.error('Failed to fetch sources:', error)
    } finally {
      loading.value = false
    }
  }

  async function addSource(data: Partial<Source>) {
    try {
      const newSource = await sourceApi.create(data)
      sources.value.push(newSource)
      return newSource
    } catch (error) {
      console.error('Failed to add source:', error)
      throw error
    }
  }

  async function updateSource(id: string, data: Partial<Source>) {
    try {
      const updatedSource = await sourceApi.update(id, data)
      const index = sources.value.findIndex(s => s.id === id)
      if (index !== -1) {
        sources.value[index] = updatedSource
      }
      return updatedSource
    } catch (error) {
      console.error('Failed to update source:', error)
      throw error
    }
  }

  async function deleteSource(id: string) {
    try {
      await sourceApi.delete(id)
      const index = sources.value.findIndex(s => s.id === id)
      if (index !== -1) {
        sources.value.splice(index, 1)
      }
    } catch (error) {
      console.error('Failed to delete source:', error)
      throw error
    }
  }

  async function toggleSource(id: string) {
    try {
      const updatedSource = await sourceApi.toggle(id)
      const index = sources.value.findIndex(s => s.id === id)
      if (index !== -1) {
        sources.value[index] = updatedSource
      }
    } catch (error) {
      console.error('Failed to toggle source:', error)
      throw error
    }
  }

  async function testSource(id: string) {
    try {
      const result = await sourceApi.test(id)
      return result
    } catch (error) {
      console.error('Failed to test source:', error)
      throw error
    }
  }

  return {
    sources,
    loading,
    fetchSources,
    addSource,
    updateSource,
    deleteSource,
    toggleSource,
    testSource
  }
})
