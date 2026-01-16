<template>
  <div class="settings-view">
    <el-card>
      <template #header>
        <div class="header">
          <span>自定义音乐源管理</span>
          <div class="header-actions">
            <input
              type="file"
              ref="fileInput"
              style="display: none"
              accept=".js,.json,.txt"
              @change="handleFileChange"
            >
            <el-button @click="showUrlDialog = true">
              网络导入
            </el-button>
            <el-button @click="triggerLocalImport">
              本地导入
            </el-button>
            <el-button type="primary" @click="openAddDialog">
              添加源
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="sourceStore.sources" v-loading="sourceStore.loading">
        <el-table-column prop="name" label="名称" width="200" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              @change="handleToggle(row)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="100" />
        <el-table-column prop="create_time" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.create_time) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250">
          <template #default="{ row }">
            <el-button size="small" @click="handleTest(row)">测试</el-button>
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showUrlDialog" title="从网络导入" width="500px">
      <el-form @submit.prevent="handleUrlImport">
        <el-form-item label="脚本链接">
          <el-input 
            v-model="importUrl" 
            placeholder="请输入 .js 或 .json 的链接 (如 GitHub Raw 链接)" 
            clearable
          />
        </el-form-item>
        <div class="url-tip">
          提示：将使用服务器代理请求以解决跨域问题
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showUrlDialog = false">取消</el-button>
        <el-button 
          type="primary" 
          :loading="importing" 
          @click="handleUrlImport"
          :disabled="!importUrl"
        >
          导入
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showAddDialog"
      :title="editingSource ? '编辑源' : '添加源'"
      width="800px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="源名称">
          <el-input v-model="form.name" placeholder="请输入源名称" />
        </el-form-item>
        <el-form-item label="类型">
          <el-input v-model="form.type" placeholder="music" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="源脚本">
          <el-input
            v-model="form.script"
            type="textarea"
            :rows="15"
            placeholder="请输入源脚本代码，或使用上方导入功能"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSourceStore } from '../stores/source'
import { sourceApi } from '../api/source'

const sourceStore = useSourceStore()

const showAddDialog = ref(false)
const showUrlDialog = ref(false)
const importing = ref(false)
const importUrl = ref('')
const editingSource = ref<any>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const form = reactive({
  name: '',
  type: 'music',
  priority: 0,
  script: ''
})

onMounted(() => {
  sourceStore.fetchSources()
})

function resetForm() {
  form.name = ''
  form.type = 'music'
  form.priority = 0
  form.script = ''
  editingSource.value = null
}

function openAddDialog() {
  resetForm()
  showAddDialog.value = true
}

// ---------------- 导入逻辑开始 ----------------

// 通用：处理脚本内容并填充表单
function processScriptContent(content: string, filenameHint?: string) {
  resetForm()
  
  let importedName = ''
  let importedScript = content
  
  // 1. 尝试解析 JSON
  try {
    // 只有当内容看起来像 JSON 时才尝试解析
    if (content.trim().startsWith('{')) {
      const json = JSON.parse(content)
      // 兼容常见 JSON 结构
      if (json.name || json.sourceName) {
        importedName = json.name || json.sourceName
        importedScript = json.script || (typeof json.source === 'string' ? json.source : content)
        if (json.type) form.type = json.type
      }
    }
  } catch (e) {
    // 忽略 JSON 解析错误，视为普通 JS
  }

  // 2. 如果没找到名字，尝试从 JS 注释提取 (@name MySource)
  if (!importedName) {
    const nameMatch = importedScript.match(/@name\s+([^\n\r*]+)/)
    if (nameMatch && nameMatch[1]) {
      importedName = nameMatch[1].trim()
    }
  }

  // 3. 最后使用文件名作为后备
  if (!importedName && filenameHint) {
    importedName = filenameHint.replace(/\.[^/.]+$/, "") // 去除后缀
  }

  form.name = importedName || 'New Source'
  form.script = importedScript
  
  showAddDialog.value = true
}

// 本地文件导入
function triggerLocalImport() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  
  if (!files || files.length === 0) return

  const file = files[0]
  try {
    const content = await file.text()
    processScriptContent(content, file.name)
    ElMessage.success(`已加载文件: ${file.name}`)
  } catch (error) {
    console.error('File read error:', error)
    ElMessage.error('读取文件失败')
  } finally {
    input.value = ''
  }
}

// 网络链接导入
async function handleUrlImport() {
  if (!importUrl.value) return
  
  importing.value = true
  try {
    const result = await sourceApi.importFromUrl(importUrl.value)
    
    // 从 URL 中提取文件名作为提示
    const urlFilename = importUrl.value.split('/').pop() || 'network-source'
    
    showUrlDialog.value = false
    importUrl.value = '' // 清空输入
    processScriptContent(result.content, urlFilename)
    
    ElMessage.success('脚本下载成功，请确认信息后保存')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || '导入失败，请检查链接或网络')
  } finally {
    importing.value = false
  }
}

// ---------------- 导入逻辑结束 ----------------

function handleEdit(source: any) {
  editingSource.value = source
  form.name = source.name
  form.type = source.type
  form.priority = source.priority
  form.script = source.script
  showAddDialog.value = true
}

async function handleSave() {
  if (!form.name || !form.script) {
    ElMessage.error('请填写完整信息')
    return
  }

  try {
    if (editingSource.value) {
      await sourceStore.updateSource(editingSource.value.id, form)
      ElMessage.success('更新成功')
    } else {
      await sourceStore.addSource(form)
      ElMessage.success('添加成功')
    }
    showAddDialog.value = false
    resetForm()
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  }
}

async function handleToggle(source: any) {
  try {
    await sourceStore.toggleSource(source.id)
    ElMessage.success(source.enabled ? '已启用' : '已禁用')
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
    source.enabled = !source.enabled
  }
}

async function handleTest(source: any) {
  try {
    const result = await sourceStore.testSource(source.id)
    if (result.success) {
      ElMessage.success('测试通过')
    } else {
      ElMessage.warning('测试部分失败，请查看详情')
    }
    console.log('Test result:', result)
  } catch (error: any) {
    ElMessage.error(error.message || '测试失败')
  }
}

async function handleDelete(source: any) {
  try {
    await ElMessageBox.confirm('确定要删除此源吗？', '警告', {
      type: 'warning'
    })
    await sourceStore.deleteSource(source.id)
    ElMessage.success('删除成功')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString()
}
</script>

<style scoped>
.settings-view {
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.url-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}
</style>
