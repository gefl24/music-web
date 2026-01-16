<template>
  <div class="download-view">
    <el-card>
      <template #header>
        <div class="header">
          <span>下载管理</span>
          <div>
            <el-button @click="downloadStore.clearCompleted()">
              清理已完成
            </el-button>
            <el-button type="primary" @click="downloadStore.fetchDownloads()">
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="下载中" name="downloading" />
        <el-tab-pane label="已完成" name="completed" />
        <el-tab-pane label="失败" name="failed" />
      </el-tabs>

      <el-table
        :data="filteredDownloads"
        v-loading="downloadStore.loading"
        style="width: 100%"
      >
        <el-table-column prop="name" label="歌曲名" width="300" />
        <el-table-column prop="singer" label="歌手" width="200" />
        <el-table-column label="进度" width="200">
          <template #default="{ row }">
            <el-progress
              :percentage="row.progress"
              :status="getProgressStatus(row.status)"
            />
          </template>
        </el-table-column>
        <el-table-column label="大小" width="120">
          <template #default="{ row }">
            {{ formatSize(row.downloadedSize) }} / {{ formatSize(row.totalSize) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'failed'"
              size="small"
              @click="handleRetry(row)"
            >
              重试
            </el-button>
            <el-button
              size="small"
              type="danger"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDownloadStore } from '../stores/download'

const downloadStore = useDownloadStore()
const activeTab = ref('all')

const filteredDownloads = computed(() => {
  if (activeTab.value === 'all') {
    return downloadStore.downloads
  }
  return downloadStore.downloads.filter(d => d.status === activeTab.value)
})

onMounted(() => {
  downloadStore.fetchDownloads()
})

function getProgressStatus(status: string) {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'exception'
    default:
      return undefined
  }
}

function getStatusType(status: string) {
  switch (status) {
    case 'pending':
      return 'info'
    case 'downloading':
      return 'warning'
    case 'completed':
      return 'success'
    case 'failed':
      return 'danger'
    default:
      return 'info'
  }
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    pending: '等待中',
    downloading: '下载中',
    completed: '已完成',
    failed: '失败'
  }
  return texts[status] || status
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
}

async function handleRetry(row: any) {
  try {
    await downloadStore.retryDownload(row.id)
    ElMessage.success('已重新加入下载队列')
  } catch (error: any) {
    ElMessage.error(error.message || '重试失败')
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定要删除此下载任务吗？', '警告', {
      type: 'warning'
    })
    await downloadStore.deleteDownload(row.id)
    ElMessage.success('删除成功')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}
</script>

<style scoped>
.download-view {
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
