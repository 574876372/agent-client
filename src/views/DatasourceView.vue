<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import { datasourceApi, type DatasourceRequest, type DatasourceResponse } from '@/api/datasource'

const list = ref<DatasourceResponse[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref<DatasourceResponse | null>(null)
const formRef = ref<FormInstance>()
const saving = ref(false)
const testing = ref(false)
const testingId = ref<string | null>(null)

const form = reactive<DatasourceRequest>({
  id: undefined,
  name: '',
  description: '',
  dbType: 'mysql',
  jdbcUrl: '',
  username: '',
  passwordPlain: '',
  enabled: 1,
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  jdbcUrl: [{ required: true, message: '请输入 JDBC URL', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  passwordPlain: [
    {
      validator: (_rule, value, callback) => {
        if (!editing.value && !value) callback(new Error('新增时密码必填'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

const testResult = ref<{ ok: boolean; message: string } | null>(null)

function errMsg(e: any) {
  return e?.response?.data?.message ?? e?.message ?? '未知错误'
}

async function loadList() {
  loading.value = true
  try {
    const res = await datasourceApi.list()
    list.value = res.data ?? []
  } catch (e: any) {
    ElMessage.error('加载失败：' + errMsg(e))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, {
    id: undefined,
    name: '',
    description: '',
    dbType: 'mysql',
    jdbcUrl: '',
    username: '',
    passwordPlain: '',
    enabled: 1,
  })
  testResult.value = null
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function openEdit(ds: DatasourceResponse) {
  editing.value = ds
  Object.assign(form, {
    id: ds.id,
    name: ds.name,
    description: ds.description ?? '',
    dbType: ds.dbType,
    jdbcUrl: ds.jdbcUrl,
    username: ds.username,
    passwordPlain: '',
    enabled: ds.enabled,
  })
  testResult.value = null
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  saving.value = true
  try {
    if (editing.value) {
      await datasourceApi.update(editing.value.id, form)
    } else {
      await datasourceApi.create(form)
    }
    ElMessage.success('已保存')
    dialogVisible.value = false
    await loadList()
  } catch (e: any) {
    ElMessage.error('保存失败：' + errMsg(e))
  } finally {
    saving.value = false
  }
}

async function remove(ds: DatasourceResponse) {
  try {
    await ElMessageBox.confirm(`确认删除数据源「${ds.name}」？`, '删除数据源', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await datasourceApi.remove(ds.id)
    ElMessage.success('已删除')
    await loadList()
  } catch (e: any) {
    ElMessage.error('删除失败：' + errMsg(e))
  }
}

async function testInEditor() {
  testResult.value = null
  testing.value = true
  try {
    const res = editing.value
      ? await datasourceApi.testExisting(editing.value.id, form)
      : await datasourceApi.testNew(form)
    testResult.value = res.data?.success
      ? { ok: true, message: '连接成功' }
      : { ok: false, message: '连接失败：请检查用户名、密码、网络或数据库是否可达' }
  } catch (e: any) {
    testResult.value = { ok: false, message: errMsg(e) }
  } finally {
    testing.value = false
  }
}

async function quickTest(ds: DatasourceResponse) {
  testingId.value = ds.id
  try {
    // 后端仅从库中回填密码，连接参数需随请求提交
    const res = await datasourceApi.testExisting(ds.id, { jdbcUrl: ds.jdbcUrl, username: ds.username, dbType: ds.dbType })
    if (res.data?.success) ElMessage.success(`「${ds.name}」连接成功`)
    else ElMessage.error(`「${ds.name}」连接失败`)
  } catch (e: any) {
    ElMessage.error('测试失败：' + errMsg(e))
  } finally {
    testingId.value = null
  }
}

onMounted(loadList)
</script>

<template>
  <div class="page">
    <PageHeader group="管理" title="数据源" />

    <div class="page-body">
      <div class="page-title-row">
        <div class="page-title-text">
          <h1 class="page-title">数据源</h1>
          <p class="page-desc">注册业务数据库，供智能体的 SQL 查询工具使用。密码加密存储，查询前需人工审批。</p>
        </div>
        <el-button type="primary" @click="openCreate"><Plus :size="16" :stroke-width="2" /><span>新增数据源</span></el-button>
      </div>

      <section class="card">
        <el-table :data="list" v-loading="loading" row-key="id" empty-text="暂无数据源，点击右上角「新增数据源」开始注册">
          <el-table-column label="名称" min-width="200">
            <template #default="{ row }">
              <div class="cell-strong">{{ row.name }}</div>
              <div class="cell-sub">{{ row.description || '—' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{ row }"><span class="mono">{{ row.dbType }}</span></template>
          </el-table-column>
          <el-table-column label="JDBC URL" min-width="320" show-overflow-tooltip>
            <template #default="{ row }"><span class="mono text-secondary">{{ row.jdbcUrl }}</span></template>
          </el-table-column>
          <el-table-column label="用户名" prop="username" width="120" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enabled === 1 ? 'success' : 'danger'" size="small">{{ row.enabled === 1 ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" align="right" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" :loading="testingId === row.id" @click="quickTest(row as DatasourceResponse)">测试</el-button>
              <el-button link type="primary" @click="openEdit(row as DatasourceResponse)">编辑</el-button>
              <el-button link type="danger" @click="remove(row as DatasourceResponse)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑数据源' : '新增数据源'" width="560px" align-center>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：线上订单库" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="例如：包含 t_order / t_customer，存储线上正式交易数据"
          />
          <div class="field-hint">智能体会根据描述判断何时查询这个库，请写清楚库里有什么数据</div>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="数据库类型">
            <el-select v-model="form.dbType">
              <el-option label="MySQL" value="mysql" />
            </el-select>
          </el-form-item>
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" placeholder="强烈建议使用只读账号" />
          </el-form-item>
        </div>
        <el-form-item label="JDBC URL" prop="jdbcUrl">
          <el-input v-model="form.jdbcUrl" placeholder="jdbc:mysql://host:3306/db?useSSL=false&characterEncoding=utf8" />
        </el-form-item>
        <el-form-item label="密码" prop="passwordPlain">
          <el-input
            v-model="form.passwordPlain"
            type="password"
            show-password
            autocomplete="off"
            :placeholder="editing ? '留空表示保留原密码' : ''"
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-alert v-if="testResult" :type="testResult.ok ? 'success' : 'error'" :title="testResult.message" :closable="false" show-icon />
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button :loading="testing" @click="testInEditor">测试连接</el-button>
          <span class="spacer" />
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-title-row :deep(.el-button > span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.card :deep(.el-table) {
  border-radius: var(--app-radius-lg);
}
.cell-strong {
  font-weight: 500;
  color: var(--app-text-primary);
}
.cell-sub {
  margin-top: 2px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.field-hint {
  width: 100%;
  margin-top: 4px;
  font-size: var(--app-font-size-xs);
  line-height: 1.5;
  color: var(--app-text-tertiary);
}
.dialog-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.spacer {
  flex: 1;
}
:deep(.el-select) {
  width: 100%;
}
</style>
