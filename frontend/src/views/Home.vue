<template>
  <div class="home-view">
    <div class="welcome-section">
      <h1>🎵 欢迎使用 LX Music Web</h1>
      <p>基于 Docker 的现代化音乐应用</p>
    </div>

    <div class="features-grid">
      <div class="feature-card" @click="$router.push('/ranking')">
        <div class="icon">📊</div>
        <h3>排行榜</h3>
        <p>浏览各平台热门音乐</p>
      </div>

      <div class="feature-card" @click="$router.push('/search')">
        <div class="icon">🔍</div>
        <h3>搜索</h3>
        <p>跨源搜索你喜欢的音乐</p>
      </div>

      <div class="feature-card" @click="$router.push('/download')">
        <div class="icon">📥</div>
        <h3>下载管理</h3>
        <p>管理你的下载任务</p>
      </div>

      <div class="feature-card" @click="$router.push('/settings')">
        <div class="icon">⚙️</div>
        <h3>自定义源</h3>
        <p>添加和管理音乐源</p>
      </div>
    </div>

    <div class="stats-section">
      <el-card>
        <template #header>
          <span>快速统计</span>
        </template>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-statistic title="可用音乐源" :value="sourcesCount" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="下载中" :value="downloadingCount" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="已完成" :value="completedCount" />
          </el-col>
        </el-row>
      </el-card>
    </div>

    <div class="quick-start">
      <el-card>
        <template #header>
          <span>快速开始</span>
        </template>
        <el-steps direction="vertical" :active="0">
          <el-step title="添加音乐源" description="在设置中添加自定义音乐源" />
          <el-step title="搜索音乐" description="使用搜索功能查找喜欢的歌曲" />
          <el-step title="下载音乐" description="将音乐下载到本地" />
        </el-steps>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSourceStore } from '../stores/source'
import { useDownloadStore } from '../stores/download'

const sourceStore = useSourceStore()
const downloadStore = useDownloadStore()

const sourcesCount = ref(0)
const downloadingCount = ref(0)
const completedCount = ref(0)

onMounted(async () => {
  await sourceStore.fetchSources()
  await downloadStore.fetchDownloads()
  
  sourcesCount.value = sourceStore.sources.filter(s => s.enabled).length
  downloadingCount.value = downloadStore.downloads.filter(d => d.status === 'downloading').length
  completedCount.value = downloadStore.downloads.filter(d => d.status === 'completed').length
})
</script>

<style scoped>
.home-view {
  max-width: 1200px;
  margin: 0 auto;
}

.welcome-section {
  text-align: center;
  margin-bottom: 3rem;
}

.welcome-section h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.welcome-section p {
  font-size: 1.2rem;
  opacity: 0.8;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
}

.feature-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}

.feature-card:hover {
  transform: translateY(-5px);
  background: rgba(255, 255, 255, 0.15);
}

.feature-card .icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.feature-card h3 {
  margin-bottom: 0.5rem;
}

.feature-card p {
  opacity: 0.8;
  font-size: 0.9rem;
}

.stats-section {
  margin-bottom: 2rem;
}

.quick-start {
  margin-top: 2rem;
}
</style>
