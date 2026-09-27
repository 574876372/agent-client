<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Lock } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import {
  modelApi,
  type ModelType,
  type ModelInfoRequest,
  type ModelInfoResponse,
  type ModelProviderRequest,
  type ModelProviderResponse,
} from '@/api/model'

const providers = ref<ModelProviderResponse[]>([])
const models = ref<ModelInfoResponse[]>([])
const loading = ref(false)
const modelFilter = ref<'ALL' | ModelType>('ALL')

const modelFilterOptions = [
  { label: '全部', value: 'ALL' },
  { label: '对话模型', value: 'CHAT' },
  { label: '向量模型', value: 'EMBEDDING' },
  { label: '重排模型', value: 'RERANK' },
]

/** 模型类型在列表中的简称 */
const MODEL_TYPE_SHORT: Record<string, string> = { CHAT: '对话', EMBEDDING: '向量', RERANK: '重排' }

/** 模型名称输入框的示例 */
const MODEL_NAME_PLACEHOLDER: Record<string, string> = {
  CHAT: '例如：qwen-plus',
  EMBEDDING: '例如：text-embedding-v3',
  RERANK: '例如：BAAI/bge-reranker-v2-m3（Cohere / Jina 兼容 /rerank 接口）'
}

const filteredModels = computed(() =>
  modelFilter.value === 'ALL' ? models.value : models.value.filter(m => m.modelType === modelFilter.value),
)

function errMsg(e: any) {
  return e?.response?.data?.message ?? e?.message ?? '未知错误'
}

async function confirmDanger(message: string, title: string) {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
    return true
  } catch {
    return false
  }
}

async function loadAll() {
  loading.value = true
  try {
    const [p, m] = await Promise.all([modelApi.listProviders(), modelApi.listModels()])
    providers.value = p.data ?? []
    models.value = m.data ?? []
  } catch (e: any) {
    ElMessage.error('加载失败：' + errMsg(e))
  } finally {
    loading.value = false
  }
}

// ─── 厂商编辑 ───────────────────────────────────────────────────────────────

const providerDialog = ref(false)
const editingProvider = ref<ModelProviderResponse | null>(null)
const providerFormRef = ref<FormInstance>()
const providerSaving = ref(false)
const providerForm = reactive<ModelProviderRequest>({
  code: '',
  name: '',
  protocol: 'OPENAI',
  baseUrl: '',
  apiKeyPlain: '',
  enabled: 1,
})
const providerRules: FormRules = {
  code: [{ required: true, message: '请输入厂商编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入厂商名称', trigger: 'blur' }],
  baseUrl: [{ required: true, message: '请输入接口地址', trigger: 'blur' }],
}

function openCreateProvider() {
  editingProvider.value = null
  Object.assign(providerForm, { code: '', name: '', protocol: 'OPENAI', baseUrl: '', apiKeyPlain: '', enabled: 1 })
  providerDialog.value = true
  providerFormRef.value?.clearValidate()
}

function openEditProvider(p: ModelProviderResponse) {
  editingProvider.value = p
  Object.assign(providerForm, {
    code: p.code,
    name: p.name,
    protocol: p.protocol,
    baseUrl: p.baseUrl,
    apiKeyPlain: '',
    enabled: p.enabled,
  })
  providerDialog.value = true
  providerFormRef.value?.clearValidate()
}

async function submitProvider() {
  if (!(await providerFormRef.value?.validate().catch(() => false))) return
  providerSaving.value = true
  try {
    if (editingProvider.value) {
      await modelApi.updateProvider(editingProvider.value.id, providerForm)
    } else {
      await modelApi.createProvider(providerForm)
    }
    ElMessage.success('已保存')
    providerDialog.value = false
    await loadAll()
  } catch (e: any) {
    ElMessage.error('保存失败：' + errMsg(e))
  } finally {
    providerSaving.value = false
  }
}

async function removeProvider(p: ModelProviderResponse) {
  if (!(await confirmDanger(`确认删除厂商「${p.name}」？`, '删除厂商'))) return
  try {
    await modelApi.removeProvider(p.id)
    ElMessage.success('已删除')
    await loadAll()
  } catch (e: any) {
    ElMessage.error('删除失败：' + errMsg(e))
  }
}

// ─── 模型编辑 ───────────────────────────────────────────────────────────────

const modelDialog = ref(false)
const editingModel = ref<ModelInfoResponse | null>(null)
const modelFormRef = ref<FormInstance>()
const modelSaving = ref(false)
const modelForm = reactive<ModelInfoRequest>({
  providerId: '',
  modelType: 'CHAT',
  modelName: '',
  dimensions: undefined,
  sendDimensions: 0,
  isDefault: 0,
  enabled: 1,
})
const modelRules: FormRules = {
  providerId: [{ required: true, message: '请选择厂商', trigger: 'change' }],
  modelName: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
  dimensions: [
    {
      validator: (_rule, value, callback) => {
        if (modelForm.modelType === 'EMBEDDING' && !(Number(value) > 0)) {
          callback(new Error('向量模型必须填写正整数维度'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

/** 已被知识库绑定的向量模型：锁定影响向量空间的字段 */
const modelLocked = computed(() => (editingModel.value?.boundKbCount ?? 0) > 0)

/** el-switch 使用 1/0 数值 */
const switchValues = { activeValue: 1, inactiveValue: 0 }

function openCreateModel() {
  editingModel.value = null
  Object.assign(modelForm, {
    providerId: providers.value[0]?.id ?? '',
    modelType: modelFilter.value === 'ALL' ? 'CHAT' : modelFilter.value,
    modelName: '',
    dimensions: undefined,
    sendDimensions: 0,
    isDefault: 0,
    enabled: 1,
  })
  modelDialog.value = true
  modelFormRef.value?.clearValidate()
}

function openEditModel(m: ModelInfoResponse) {
  editingModel.value = m
  Object.assign(modelForm, {
    providerId: m.providerId,
    modelType: m.modelType,
    modelName: m.modelName,
    dimensions: m.dimensions,
    sendDimensions: m.sendDimensions ?? 0,
    isDefault: m.isDefault,
    enabled: m.enabled,
  })
  modelDialog.value = true
  modelFormRef.value?.clearValidate()
}

async function submitModel() {
  if (!(await modelFormRef.value?.validate().catch(() => false))) return
  const payload: ModelInfoRequest = {
    ...modelForm,
    dimensions: modelForm.modelType === 'EMBEDDING' ? Number(modelForm.dimensions) : undefined,
  }
  modelSaving.value = true
  try {
    if (editingModel.value) {
      await modelApi.updateModel(editingModel.value.id, payload)
    } else {
      await modelApi.createModel(payload)
    }
    ElMessage.success('已保存')
    modelDialog.value = false
    await loadAll()
  } catch (e: any) {
    ElMessage.error('保存失败：' + errMsg(e))
  } finally {
    modelSaving.value = false
  }
}

async function removeModel(m: ModelInfoResponse) {
  if (!(await confirmDanger(`确认删除模型「${m.modelName}」？`, '删除模型'))) return
  try {
    await modelApi.removeModel(m.id)
    ElMessage.success('已删除')
    await loadAll()
  } catch (e: any) {
    ElMessage.error('删除失败：' + errMsg(e))
  }
}

async function setDefault(m: ModelInfoResponse) {
  try {
    await modelApi.updateModel(m.id, {
      providerId: m.providerId,
      modelType: m.modelType,
      modelName: m.modelName,
      dimensions: m.dimensions,
      sendDimensions: m.sendDimensions,
      enabled: m.enabled,
      isDefault: 1,
    })
    ElMessage.success(`已将「${m.modelName}」设为默认`)
    await loadAll()
  } catch (e: any) {
    ElMessage.error('设置默认失败：' + errMsg(e))
  }
}

const testingId = ref<string | null>(null)

async function testModel(m: ModelInfoResponse) {
  testingId.value = m.id
  try {
    const res = await modelApi.testModel(m.id)
    const text = `「${m.modelName}」${res.data?.message ?? ''}`
    if (res.data?.success) {
      ElMessage.success({ message: text, duration: 4000 })
    } else {
      ElMessage.error({ message: text, duration: 6000 })
    }
  } catch (e: any) {
    ElMessage.error('测试失败：' + errMsg(e))
  } finally {
    testingId.value = null
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="page">
    <PageHeader group="管理" title="模型管理" />

    <div class="page-body" v-loading="loading">
      <div class="page-title-row">
        <div class="page-title-text">
          <h1 class="page-title">模型管理</h1>
          <p class="page-desc">维护模型厂商的接口地址与密钥，以及对话模型、向量模型、重排模型。修改后立即生效，无需重启。设为默认的重排模型会用于所有未单独指定的智能体。</p>
        </div>
      </div>

      <!-- ══════════════ 厂商 ══════════════ -->
      <section class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <div class="card-title">模型厂商</div>
            <div class="card-subtitle">API Key 加密存储，保存后不再显示</div>
          </div>
          <el-button @click="openCreateProvider"><Plus :size="16" :stroke-width="2" /><span>新增厂商</span></el-button>
        </div>
        <el-table :data="providers" row-key="id" empty-text="暂无厂商">
          <el-table-column label="名称" prop="name" min-width="120">
            <template #default="{ row }"><span class="cell-strong">{{ row.name }}</span></template>
          </el-table-column>
          <el-table-column label="编码" min-width="110">
            <template #default="{ row }"><span class="mono">{{ row.code }}</span></template>
          </el-table-column>
          <el-table-column label="接口地址" min-width="300" show-overflow-tooltip>
            <template #default="{ row }"><span class="mono text-secondary">{{ row.baseUrl }}</span></template>
          </el-table-column>
          <el-table-column label="API Key" width="110">
            <template #default="{ row }">
              <el-tag :type="row.apiKeyConfigured ? 'success' : 'warning'" size="small">
                {{ row.apiKeyConfigured ? '已配置' : '未配置' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enabled === 1 ? 'success' : 'danger'" size="small">{{ row.enabled === 1 ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" align="right" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openEditProvider(row as ModelProviderResponse)">编辑</el-button>
              <el-button link type="danger" @click="removeProvider(row as ModelProviderResponse)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <!-- ══════════════ 模型 ══════════════ -->
      <section class="card">
        <div class="card-header">
          <div class="card-title">模型</div>
          <el-segmented v-model="modelFilter" :options="modelFilterOptions" size="small" class="filter" />
          <span class="card-title-wrap" />
          <el-button type="primary" :disabled="providers.length === 0" @click="openCreateModel">
            <Plus :size="16" :stroke-width="2" /><span>新增模型</span>
          </el-button>
        </div>
        <el-table :data="filteredModels" row-key="id" empty-text="暂无模型">
          <el-table-column label="模型名称" min-width="200">
            <template #default="{ row }">
              <div class="name-cell">
                <span class="mono cell-strong">{{ row.modelName }}</span>
                <el-tag v-if="row.isDefault === 1" size="small" effect="plain">默认</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{ row }">{{ MODEL_TYPE_SHORT[row.modelType] ?? row.modelType }}</template>
          </el-table-column>
          <el-table-column label="厂商" prop="providerName" min-width="110" />
          <el-table-column label="维度" width="90">
            <template #default="{ row }"><span class="mono">{{ row.modelType === 'EMBEDDING' ? row.dimensions : '—' }}</span></template>
          </el-table-column>
          <el-table-column label="绑定知识库" width="130">
            <template #default="{ row }">
              <span v-if="row.modelType === 'EMBEDDING' && row.boundKbCount > 0" class="icon-text text-secondary">
                <Lock :size="14" :stroke-width="1.75" />{{ row.boundKbCount }} 个 · 已锁定
              </span>
              <span v-else class="text-tertiary">—</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enabled === 1 ? 'success' : 'danger'" size="small">{{ row.enabled === 1 ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="230" align="right" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" :loading="testingId === row.id" @click="testModel(row as ModelInfoResponse)">测试</el-button>
              <el-button v-if="row.isDefault !== 1" link type="primary" @click="setDefault(row as ModelInfoResponse)">设为默认</el-button>
              <el-button link type="primary" @click="openEditModel(row as ModelInfoResponse)">编辑</el-button>
              <el-button
                link
                type="danger"
                :disabled="row.modelType === 'EMBEDDING' && row.boundKbCount > 0"
                @click="removeModel(row as ModelInfoResponse)"
              >删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <!-- 厂商弹窗 -->
    <el-dialog v-model="providerDialog" :title="editingProvider ? '编辑厂商' : '新增厂商'" width="520px" align-center>
      <el-form ref="providerFormRef" :model="providerForm" :rules="providerRules" label-position="top">
        <el-form-item label="编码" prop="code">
          <el-input v-model="providerForm.code" :disabled="!!editingProvider" placeholder="例如：Qwen" />
          <div class="field-hint">{{ editingProvider ? '编码创建后不可修改' : '智能体通过编码引用厂商，创建后不可修改' }}</div>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="providerForm.name" placeholder="例如：通义千问" />
        </el-form-item>
        <el-form-item label="接口协议">
          <el-select v-model="providerForm.protocol">
            <el-option label="OpenAI 兼容协议" value="OPENAI" />
          </el-select>
        </el-form-item>
        <el-form-item label="接口地址" prop="baseUrl">
          <el-input v-model="providerForm.baseUrl" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="providerForm.apiKeyPlain"
            type="password"
            show-password
            autocomplete="off"
            :placeholder="editingProvider ? '留空表示保留原密钥' : '可稍后补充'"
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="providerForm.enabled" v-bind="switchValues" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="providerDialog = false">取消</el-button>
        <el-button type="primary" :loading="providerSaving" @click="submitProvider">保存</el-button>
      </template>
    </el-dialog>

    <!-- 模型弹窗 -->
    <el-dialog v-model="modelDialog" :title="editingModel ? '编辑模型' : '新增模型'" width="520px" align-center>
      <el-alert
        v-if="modelLocked"
        class="lock-alert"
        type="warning"
        :closable="false"
        show-icon
        :title="`该向量模型已被 ${editingModel?.boundKbCount} 个知识库绑定：厂商、类型、模型名与维度不可修改，也不可停用。`"
      />
      <el-form ref="modelFormRef" :model="modelForm" :rules="modelRules" label-position="top">
        <el-form-item label="厂商" prop="providerId">
          <el-select v-model="modelForm.providerId" :disabled="modelLocked">
            <el-option v-for="p in providers" :key="p.id" :label="`${p.name}（${p.code}）`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="modelForm.modelType" :disabled="modelLocked">
            <el-radio-button value="CHAT">对话模型</el-radio-button>
            <el-radio-button value="EMBEDDING">向量模型</el-radio-button>
            <el-radio-button value="RERANK">重排模型</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="模型名称" prop="modelName">
          <el-input
            v-model="modelForm.modelName"
            :disabled="modelLocked"
            :placeholder="MODEL_NAME_PLACEHOLDER[modelForm.modelType]"
          />
        </el-form-item>
        <template v-if="modelForm.modelType === 'EMBEDDING'">
          <el-form-item label="向量维度" prop="dimensions">
            <el-input-number
              v-model="modelForm.dimensions"
              :min="1"
              :disabled="modelLocked"
              controls-position="right"
              placeholder="例如：1536"
              class="full-width"
            />
            <div class="field-hint">须与模型实际输出一致，可在保存后点击「测试」校验</div>
          </el-form-item>
          <el-form-item label="将维度作为请求参数发送">
            <el-switch v-model="modelForm.sendDimensions" v-bind="switchValues" :disabled="modelLocked" />
            <div class="field-hint">仅支持自定义维度的模型需要开启，如 OpenAI text-embedding-3</div>
          </el-form-item>
        </template>
        <div class="switch-row">
          <el-form-item label="设为同类型默认模型">
            <el-switch v-model="modelForm.isDefault" v-bind="switchValues" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="modelForm.enabled" v-bind="switchValues" :disabled="modelLocked" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="modelDialog = false">取消</el-button>
        <el-button type="primary" :loading="modelSaving" @click="submitModel">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.card :deep(.el-button > span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.card-header .filter {
  margin-left: 8px;
}
.card :deep(.el-table) {
  border-radius: 0 0 var(--app-radius-lg) var(--app-radius-lg);
}
.cell-strong {
  font-weight: 500;
  color: var(--app-text-primary);
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field-hint {
  width: 100%;
  margin-top: 4px;
  font-size: var(--app-font-size-xs);
  line-height: 1.5;
  color: var(--app-text-tertiary);
}
.lock-alert {
  margin-bottom: 16px;
}
.switch-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.full-width {
  width: 100%;
}
:deep(.el-select) {
  width: 100%;
}
</style>
