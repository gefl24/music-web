<template>
  <div class="settings-view">
    <el-card>
      <template #header>
        <div class="header">
          <span>自定义音乐源管理</span>
          <el-button type="primary" @click="showAddDialog = true">
            添加源
          </el-button>
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

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="editingSource ? '编辑源' : '添加源'"
      width="800px"
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
            placeholder="请输入源脚本代码"
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

const sourceStore = useSourceStore()

const showAddDialog = ref(false)
const editingSource = ref<any>(null)

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
</style>
