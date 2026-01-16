<template>
  <div class="ranking-view">
    <el-row :gutter="20">
      <!-- 左侧排行榜列表 -->
      <el-col :span="6">
        <el-card>
          <template #header>
            <span>排行榜</span>
          </template>
          <el-menu :default-active="activeRanking" @select="handleSelectRanking">
            <el-sub-menu
              v-for="source in rankingSources"
              :key="source.sourceId"
              :index="source.sourceId"
            >
              <template #title>{{ source.sourceName }}</template>
              <el-menu-item
                v-for="ranking in source.list"
                :key="ranking.id"
                :index="`${source.sourceId}-${ranking.id}`"
              >
                {{ ranking.name }}
              </el-menu-item>
            </el-sub-menu>
          </el-menu>
        </el-card>
      </el-col>

      <!-- 右侧排行榜详情 -->
      <el-col :span="18">
        <el-card v-loading="loading">
          <template #header>
            <span>{{ currentRankingName || '请选择排行榜' }}</span>
          </template>

          <el-table :data="rankingDetail" v-if="rankingDetail.length > 0">
            <el-table-column prop="rank" label="排名" width="80" />
            <el-table-column prop="name" label="歌曲" width="300" />
            <el-table-column prop="singer" label="歌手" width="200" />
            <el-table-column prop="album" label="专辑" />
            <el-table-column label="操作" width="200">
              <template #default="{ row }">
                <el-button size="small" @click="handlePlay(row)">
                  播放
                </el-button>
                <el-button size="small" @click="handleDownload(row)">
                  下载
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-empty v-else description="请从左侧选择排行榜" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { musicApi } from '../api/music'
import { usePlayerStore } from '../stores/player'
import { useDownloadStore } from '../stores/download'

const playerStore = usePlayerStore()
const downloadStore = useDownloadStore()

const loading = ref(false)
const rankingSources = ref<any[]>([])
const rankingDetail = ref<any[]>([])
const activeRanking = ref('')
const currentRankingName = ref('')
const currentSourceId = ref('')
const currentTopListId = ref('')

onMounted(async () => {
  await loadRankingList()
})

async function loadRankingList() {
  loading.value = true
  try {
    const result = await musicApi.getRankingList()
    rankingSources.value = result.sources || []
  } catch (error: any) {
    ElMessage.error(error.message || '加载排行榜失败')
  } finally {
    loading.value = false
  }
}

async function handleSelectRanking(index: string) {
  const [sourceId, topListId] = index.split('-')
  if (!topListId) return

  activeRanking.value = index
  currentSourceId.value = sourceId
  currentTopListId.value = topListId

  // 找到当前排行榜名称
  const source = rankingSources.value.find(s => s.sourceId === sourceId)
  const ranking = source?.list.find((r: any) => r.id === topListId)
  currentRankingName.value = ranking?.name || ''

  await loadRankingDetail(sourceId, topListId)
}

async function loadRankingDetail(sourceId: string, topListId: string) {
  loading.value = true
  try {
    const result = await musicApi.getRankingDetail(sourceId, topListId)
    // 添加排名
    rankingDetail.value = (result.list || []).map((item: any, index: number) => ({
      ...item,
      rank: index + 1,
      sourceId,
      topListId
    }))
  } catch (error: any) {
    ElMessage.error(error.message || '加载排行榜详情失败')
    rankingDetail.value = []
  } finally {
    loading.value = false
  }
}

async function handlePlay(music: any) {
  try {
    ElMessage.info('正在获取播放地址...')
    const result = await musicApi.getMusicUrl(music.sourceId, music)
    
    playerStore.play({
      id: music.id,
      name: music.name,
      singer: music.singer,
      album: music.album,
      url: result.url,
      source: music.sourceId
    })
    
    ElMessage.success('开始播放')
  } catch (error: any) {
    ElMessage.error(error.message || '获取播放地址失败')
  }
}

async function handleDownload(music: any) {
  try {
    ElMessage.info('正在获取下载地址...')
    const result = await musicApi.getMusicUrl(music.sourceId, music, '320k')
    
    await downloadStore.addDownload({
      name: music.name,
      singer: music.singer,
      source: music.sourceId,
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
.ranking-view {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
