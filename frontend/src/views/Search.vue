<template>
  <div class="search-view">
    <el-card>
      <template #header>
        <span>搜索音乐</span>
      </template>

      <div class="search-section">
        <el-input
          v-model="keyword"
          placeholder="输入歌曲名或歌手名"
          size="large"
          @keyup.enter="handleSearch"
        >
          <template #append>
            <el-button :icon="Search" @click="handleSearch">搜索</el-button>
          </template>
        </el-input>

        <div class="source-selector">
          <span>选择音乐源：</span>
          <el-checkbox-group v-model="selectedSources">
            <el-checkbox
              v-for="source in sourceStore.sources.filter(s => s.enabled)"
              :key="source.id"
              :label="source.id"
            >
              {{ source.name }}
            </el-checkbox>
          </el-checkbox-group>
          <el-button size="small" @click="selectAllSources">全选</el-button>
        </div>
      </div>

      <el-divider />

      <div v-loading="loading">
        <el-tabs v-model="activeSource">
          <el-tab-pane
            v-for="result in searchResults"
            :key="result.sourceId"
            :label="`${result.sourceName} (${result.data?.list?.length || 0})`"
            :name="result.sourceId"
          >
            <el-table :data="result.data?.list || []">
              <el-table-column prop="name" label="歌曲" width="300" />
              <el-table-column prop="singer" label="歌手" width="200" />
              <el-table-column prop="album" label="专辑" />
              <el-table-column label="操作" width="200">
                <template #default="{ row }">
                  <el-button size="small" @click="handlePlay(row, result.sourceId)">
                    播放
                  </el-button>
                  <el-button size="small" @click="handleDownload(row, result.sourceId)">
                    下载
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <el-pagination
              v-if="result.data?.total"
              :current-page="currentPage"
              :page-size="pageSize"
              :total="result.data.total"
              layout="prev, pager, next"
              @current-change="(page) => handlePageChange(page, result.sourceId)"
            />
          </el-tab-pane>
        </el-tabs>

        <el-empty v-if="searchResults.length === 0 && !loading" description="暂无搜索结果" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { musicApi } from '../api/music'
import { useSourceStore } from '../stores/source'
import { usePlayerStore } from '../stores/player'
import { useDownloadStore } from '../stores/download'

const sourceStore = useSourceStore()
const playerStore = usePlayerStore()
const downloadStore = useDownloadStore()

const keyword = ref('')
const selectedSources = ref<string[]>([])
const searchResults = ref<any[]>([])
const loading = ref(false)
const activeSource = ref('')
const currentPage = ref(1)
const pageSize = ref(30)

onMounted(async () => {
  await sourceStore.fetchSources()
  selectAllSources()
})

function selectAllSources() {
  selectedSources.value = sourceStore.sources
    .filter(s => s.enabled)
    .map(s => s.id)
}

async function handleSearch() {
  if (!keyword.value.trim()) {
    ElMessage.warning('请输入搜索关键词')
    return
  }

  if (selectedSources.value.length === 0) {
    ElMessage.warning('请至少选择一个音乐源')
    return
  }

  loading.value = true
  try {
    const result = await musicApi.search(
      keyword.value,
      selectedSources.value,
      currentPage.value,
      pageSize.value
    )
    
    searchResults.value = result.results || []
    
    if (searchResults.value.length > 0) {
      activeSource.value = searchResults.value[0].sourceId
    }
  } catch (error: any) {
    ElMessage.error(error.message || '搜索失败')
  } finally {
    loading.value = false
  }
}

async function handlePageChange(page: number, sourceId: string) {
  currentPage.value = page
  await handleSearch()
}

async function handlePlay(music: any, sourceId: string) {
  try {
    ElMessage.info('正在获取播放地址...')
    const result = await musicApi.getMusicUrl(sourceId, music)
    
    playerStore.play({
      id: music.id,
      name: music.name,
      singer: music.singer,
      album: music.album,
      url: result.url,
      source: sourceId
    })
    
    ElMessage.success('开始播放')
  } catch (error: any) {
    ElMessage.error(error.message || '获取播放地址失败')
  }
}

async function handleDownload(music: any, sourceId: string) {
  try {
    ElMessage.info('正在获取下载地址...')
    const result = await musicApi.getMusicUrl(sourceId, music, '320k')
    
    await downloadStore.addDownload({
      name: music.name,
      singer: music.singer,
      source: sourceId,
      musicId: music.id,
      quality: '320k',
      url: result.url
    })
    
    ElMessage.success('已添加到下载队列')
  } catch (error: any) {
    ElMessage.error(error.message || '添加下载失败')
  }
}
</script>

<style scoped>
.search-view {
  max-width: 1400px;
  margin: 0 auto;
}

.search-section {
  margin-bottom: 1rem;
}

.source-selector {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.el-pagination {
  margin-top: 1rem;
  justify-content: center;
}
</style>
