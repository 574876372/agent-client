<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadRequestOptions } from 'element-plus'
import { Plus, BookOpen, Trash2, RefreshCw, UploadCloud, FileText, Search, Cpu } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import { knowledgeApi } from '@/api/chat'
import { modelApi, type ModelInfoResponse } from '@/api/model'

interface KbResponse {
  id: string
  name: string
  description?: string
  avatar?: string
  userId: string
  embeddingModelId?: string
  embeddingModelName?: string
  createTime: string
}

interface UploadDocResponse {
  id: string
  kbId: string
  name: string
  type: string
  sizeBytes: number
  status: 'uploading' | 'parsing' | 'indexed' | 'failed'
  charCount?: number
  chunkCount?: number
  errorMessage?: string
  createTime: string
}

interface SearchChunkResponse {
  chunkId: string
  content: string
  score: number
  docId: string
  docName: string
  chunkIndex: number
}

const ACCEPT_TYPES = '.pdf,.txt,.md,.docx,.doc,.xlsx,.xls,.xml,.pptx,.ppt'

/** 文档处于上传 / 解析中时，每隔该间隔自动刷新一次列表 */
const POLL_INTERVAL_MS = 3000

const kbs = ref<KbResponse[]>([])
const selectedKb = ref<KbResponse | null>(null)
const docs = ref<UploadDocResponse[]>([])

// Loading states
const kbsLoading = ref(false)
const docsLoading = ref(false)
const searchLoading = ref(false)
const uploadingCount = ref(0)

// Tab state
const activeTab = ref<'docs' | 'playground'>('docs')

// Playground search states
const searchQuery = ref('')
const searchLimit = ref(3)
const searchResults = ref<SearchChunkResponse[]>([])
const searched = ref(false)

function errMsg(e: any) {
  return e?.response?.data?.message ?? e?.message ?? '未知错误'
}

// ─── 创建知识库 ─────────────────────────────────────────────────────────────

const showCreateModal = ref(false)
const createFormRef = ref<FormInstance>()
const creating = ref(false)
const newKb = reactive({
  name: '',
  description: '',
  embeddingModelId: ''
})
const createRules: FormRules = {
  name: [{ required: true, message: '请输入知识库名称', trigger: 'blur' }],
  embeddingModelId: [{ required: true, message: '请选择向量模型', trigger: 'change' }],
}

// 可绑定的向量模型（已启用），打开创建弹窗时加载，默认选中默认模型
const embeddingModels = ref<ModelInfoResponse[]>([])

async function openCreateModal() {
  newKb.name = ''
  newKb.description = ''
  newKb.embeddingModelId = ''
  showCreateModal.value = true
  createFormRef.value?.clearValidate()
  try {
    const res = await modelApi.listModels('EMBEDDING')
    embeddingModels.value = (res.data ?? []).filter(m => m.enabled === 1)
    const preferred = embeddingModels.value.find(m => m.isDefault === 1) ?? embeddingModels.value[0]
    newKb.embeddingModelId = preferred?.id ?? ''
  } catch (e) {
    console.error('加载向量模型失败:', e)
  }
}

async function handleCreateKb() {
  if (!(await createFormRef.value?.validate().catch(() => false))) return
  creating.value = true
  try {
    const res = await knowledgeApi.createKb({
      name: newKb.name.trim(),
      description: newKb.description.trim(),
      embeddingModelId: newKb.embeddingModelId || undefined
    })
    showCreateModal.value = false
    ElMessage.success('知识库已创建')
    await loadKbs()
    if (res.data) {
      const created = kbs.value.find(k => k.id === res.data.id)
      if (created) selectKb(created)
    }
  } catch (e: any) {
    ElMessage.error('创建知识库失败：' + errMsg(e))
  } finally {
    creating.value = false
  }
}

// ─── 知识库与文档 ───────────────────────────────────────────────────────────

async function loadKbs() {
  kbsLoading.value = true
  try {
    const res = await knowledgeApi.listKbs()
    kbs.value = res.data ?? []
    if (kbs.value.length > 0 && !selectedKb.value) {
      selectKb(kbs.value[0])
    }
  } catch (e: any) {
    ElMessage.error('加载知识库失败：' + errMsg(e))
  } finally {
    kbsLoading.value = false
  }
}

async function selectKb(kb: KbResponse) {
  selectedKb.value = kb
  searchResults.value = []
  searchQuery.value = ''
  searched.value = false
  await loadDocs()
}

async function loadDocs(silent = false) {
  if (!selectedKb.value) return
  if (!silent) docsLoading.value = true
  try {
    const res = await knowledgeApi.listDocs(selectedKb.value.id)
    docs.value = res.data ?? []
  } catch (e) {
    console.error('加载文档列表失败:', e)
  } finally {
    docsLoading.value = false
  }
}

async function handleDeleteKb(kb: KbResponse) {
  try {
    await ElMessageBox.confirm(
      `确认删除知识库「${kb.name}」？其下所有文档、切片及向量索引都将被永久删除。`,
      '删除知识库',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  try {
    await knowledgeApi.deleteKb(kb.id)
    if (selectedKb.value?.id === kb.id) {
      selectedKb.value = null
      docs.value = []
    }
    ElMessage.success('已删除')
    await loadKbs()
  } catch (e: any) {
    ElMessage.error('删除知识库失败：' + errMsg(e))
  }
}

/** el-upload 自定义上传：逐个文件调用后端，完成后刷新列表 */
async function uploadRequest(options: UploadRequestOptions) {
  if (!selectedKb.value) return
  uploadingCount.value++
  try {
    await knowledgeApi.uploadDoc(selectedKb.value.id, options.file)
    await loadDocs(true)
  } catch (e: any) {
    ElMessage.error(`上传「${options.file.name}」失败：` + errMsg(e))
  } finally {
    uploadingCount.value--
  }
}

async function handleDeleteDoc(doc: UploadDocResponse) {
  try {
    await ElMessageBox.confirm(`确认删除文档「${doc.name}」？其切片数据与向量索引将一并清理。`, '删除文档', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await knowledgeApi.deleteDoc(doc.id)
    ElMessage.success('已删除')
    await loadDocs(true)
  } catch (e: any) {
    ElMessage.error('删除文档失败：' + errMsg(e))
  }
}

async function performPlaygroundSearch() {
  if (!selectedKb.value || !searchQuery.value.trim()) return
  searchLoading.value = true
  try {
    const res = await knowledgeApi.search(selectedKb.value.id, searchQuery.value.trim(), searchLimit.value)
    searchResults.value = res.data ?? []
    searched.value = true
  } catch (e: any) {
    ElMessage.error('检索失败：' + errMsg(e))
  } finally {
    searchLoading.value = false
  }
}

// ─── 解析中文档自动刷新 ─────────────────────────────────────────────────────

const hasPendingDocs = computed(() => docs.value.some(d => d.status === 'uploading' || d.status === 'parsing'))
let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(hasPendingDocs, (pending) => {
  stopPolling()
  if (pending) {
    pollTimer = setInterval(() => loadDocs(true), POLL_INTERVAL_MS)
  }
})

onBeforeUnmount(stopPolling)

// ─── 展示辅助 ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const STATUS_META: Record<string, { label: string; type: 'info' | 'warning' | 'success' | 'danger' }> = {
  uploading: { label: '上传中', type: 'info' },
  parsing: { label: '解析中', type: 'warning' },
  indexed: { label: '已入库', type: 'success' },
  failed: { label: '失败', type: 'danger' },
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, type: 'info' as const }
}

onMounted(loadKbs)
</script>

<template>
  <div class="page">
    <PageHeader group="管理" title="知识库" />

    <div class="kb-layout">
      <!-- ══════════════ 左侧：知识库列表 ══════════════ -->
      <aside class="card kb-list-card" aria-label="知识库列表">
        <div class="card-header">
          <div class="card-title-wrap">
            <div class="card-title">知识库</div>
          </div>
          <el-button type="primary" size="small" @click="openCreateModal">
            <Plus :size="14" :stroke-width="2" /><span>新建</span>
          </el-button>
        </div>
        <div class="kb-list" v-loading="kbsLoading">
          <div v-if="!kbsLoading && kbs.length === 0" class="list-empty">暂无知识库，点击「新建」开始</div>
          <div
            v-for="kb in kbs"
            :key="kb.id"
            :class="['kb-item', { active: selectedKb?.id === kb.id }]"
            role="button"
            tabindex="0"
            @click="selectKb(kb)"
            @keydown.enter="selectKb(kb)"
          >
            <span class="kb-icon" aria-hidden="true"><BookOpen :size="16" :stroke-width="1.75" /></span>
            <span class="kb-item-text">
              <span class="kb-item-name">{{ kb.name }}</span>
              <span class="kb-item-desc">{{ kb.description || '暂无描述' }}</span>
            </span>
          </div>
        </div>
      </aside>

      <!-- ══════════════ 右侧：详情 ══════════════ -->
      <section class="card kb-detail-card">
        <el-empty v-if="!selectedKb" class="kb-empty" description="选择或新建一个知识库，为智能体提供私有文档检索能力">
          <el-button type="primary" @click="openCreateModal">新建知识库</el-button>
        </el-empty>

        <template v-else>
          <div class="kb-detail-header">
            <div class="kb-detail-info">
              <h1 class="kb-detail-name">{{ selectedKb.name }}</h1>
              <p class="kb-detail-desc">{{ selectedKb.description || '暂无描述' }}</p>
              <div v-if="selectedKb.embeddingModelName" class="kb-detail-meta">
                <Cpu :size="14" :stroke-width="1.75" />
                <span>向量模型</span>
                <span class="mono">{{ selectedKb.embeddingModelName }}</span>
              </div>
            </div>
            <div class="kb-detail-actions">
              <el-button :loading="docsLoading" @click="loadDocs()">
                <RefreshCw v-if="!docsLoading" :size="14" :stroke-width="1.75" /><span>刷新</span>
              </el-button>
              <el-button type="danger" plain @click="handleDeleteKb(selectedKb)">
                <Trash2 :size="14" :stroke-width="1.75" /><span>删除知识库</span>
              </el-button>
            </div>
          </div>

          <el-tabs v-model="activeTab" class="kb-tabs">
            <!-- 文档管理 -->
            <el-tab-pane :label="`文档（${docs.length}）`" name="docs">
              <el-upload
                drag
                multiple
                :accept="ACCEPT_TYPES"
                :show-file-list="false"
                :http-request="uploadRequest"
                class="kb-uploader"
              >
                <div class="uploader-inner">
                  <UploadCloud class="uploader-icon" :size="28" :stroke-width="1.5" />
                  <div class="uploader-text">拖拽文件到此处，或 <em>点击上传</em></div>
                  <div class="uploader-hint">支持 PDF、TXT、MD、Word、Excel、XML、PPT</div>
                  <div v-if="uploadingCount > 0" class="uploader-progress">正在上传 {{ uploadingCount }} 个文件…</div>
                </div>
              </el-upload>

              <el-table :data="docs" v-loading="docsLoading" row-key="id" empty-text="暂无文档，请在上方上传" class="docs-table">
                <el-table-column label="文件名" min-width="240">
                  <template #default="{ row }">
                    <span class="doc-name">
                      <FileText :size="16" :stroke-width="1.75" class="doc-icon" />
                      <span class="doc-name-text" :title="row.name">{{ row.name }}</span>
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="大小" width="110">
                  <template #default="{ row }">{{ formatBytes(row.sizeBytes) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="110">
                  <template #default="{ row }">
                    <el-tooltip v-if="row.status === 'failed' && row.errorMessage" :content="row.errorMessage" placement="top">
                      <el-tag :type="statusMeta(row.status).type" size="small">{{ statusMeta(row.status).label }}</el-tag>
                    </el-tooltip>
                    <el-tag v-else :type="statusMeta(row.status).type" size="small">{{ statusMeta(row.status).label }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="字数" width="100">
                  <template #default="{ row }">{{ row.charCount ?? '—' }}</template>
                </el-table-column>
                <el-table-column label="切片数" width="90">
                  <template #default="{ row }">{{ row.chunkCount ?? '—' }}</template>
                </el-table-column>
                <el-table-column label="操作" width="80" align="right">
                  <template #default="{ row }">
                    <el-button link type="danger" @click="handleDeleteDoc(row as UploadDocResponse)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <!-- 检索演练场 -->
            <el-tab-pane label="检索演练" name="playground">
              <p class="playground-hint">
                输入一个问题，系统会用该知识库绑定的向量模型计算相似度，返回最匹配的切片与得分，用于检验切片与召回效果。
              </p>
              <div class="search-row">
                <el-input
                  v-model="searchQuery"
                  placeholder="输入测试问题，例如：系统支持哪些数据源？"
                  clearable
                  @keyup.enter="performPlaygroundSearch"
                >
                  <template #prefix><Search :size="16" :stroke-width="1.75" /></template>
                </el-input>
                <el-select v-model="searchLimit" class="limit-select" aria-label="召回数量">
                  <el-option v-for="n in [1, 3, 5, 10]" :key="n" :label="`Top ${n}`" :value="n" />
                </el-select>
                <el-button type="primary" :loading="searchLoading" :disabled="!searchQuery.trim()" @click="performPlaygroundSearch">
                  检索
                </el-button>
              </div>

              <el-empty v-if="!searchLoading && searchResults.length === 0" :image-size="64"
                :description="searched ? '没有召回到相关切片' : '检索结果将显示在这里'" />

              <div v-else class="results" v-loading="searchLoading">
                <article v-for="(chunk, idx) in searchResults" :key="chunk.chunkId" class="result-card">
                  <header class="result-head">
                    <el-tag size="small" effect="plain">Top {{ idx + 1 }}</el-tag>
                    <span class="result-score">相似度 <strong class="mono">{{ chunk.score.toFixed(4) }}</strong></span>
                    <span class="result-spacer" />
                    <span class="result-source">
                      <FileText :size="14" :stroke-width="1.75" />
                      {{ chunk.docName }} · 切片 #{{ chunk.chunkIndex }}
                    </span>
                  </header>
                  <p class="result-text">{{ chunk.content }}</p>
                </article>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
      </section>
    </div>

    <!-- 创建知识库 -->
    <el-dialog v-model="showCreateModal" title="新建知识库" width="520px" align-center>
      <el-form ref="createFormRef" :model="newKb" :rules="createRules" label-position="top">
        <el-form-item label="名称" prop="name">
          <el-input v-model="newKb.name" placeholder="例如：产品使用指南" maxlength="50" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="newKb.description"
            type="textarea"
            :rows="3"
            placeholder="例如：包含平台的核心功能、常见操作与故障排查"
          />
        </el-form-item>
        <el-form-item label="向量模型" prop="embeddingModelId">
          <el-select
            v-model="newKb.embeddingModelId"
            :placeholder="embeddingModels.length === 0 ? '暂无可用向量模型，请先在「模型管理」中添加' : '选择向量模型'"
            :disabled="embeddingModels.length === 0"
          >
            <el-option
              v-for="m in embeddingModels"
              :key="m.id"
              :value="m.id"
              :label="`${m.modelName}（${m.providerName}，${m.dimensions} 维${m.isDefault === 1 ? '，默认' : ''}）`"
            />
          </el-select>
          <div class="field-hint">创建后不可更换：已入库的向量与检索时的向量必须来自同一模型</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateModal = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreateKb">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page :deep(.el-button > span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.kb-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: var(--app-space-5);
  padding: var(--app-space-6) var(--app-space-8);
}

/* ── 左侧列表 ─────────────────────────────────── */
.kb-list-card {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.kb-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 120px;
}
.list-empty {
  padding: 32px 12px;
  text-align: center;
  font-size: var(--app-font-size-sm);
  color: var(--app-text-tertiary);
}
.kb-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  margin-bottom: 2px;
  border-radius: var(--app-radius);
  cursor: pointer;
  outline: none;
}
.kb-item:hover,
.kb-item:focus-visible {
  background: var(--app-bg-hover);
}
.kb-item.active {
  background: var(--app-primary-soft);
}
.kb-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--app-radius);
  background: var(--app-bg-muted);
  color: var(--app-text-regular);
  display: flex;
  align-items: center;
  justify-content: center;
}
.kb-item.active .kb-icon {
  background: var(--app-bg-surface);
  color: var(--app-primary);
}
.kb-item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.kb-item-name {
  font-size: var(--app-font-size-base);
  font-weight: 500;
  color: var(--app-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kb-item-desc {
  margin-top: 2px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 右侧详情 ─────────────────────────────────── */
.kb-detail-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.kb-empty {
  flex: 1;
}
.kb-detail-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 24px 8px;
}
.kb-detail-info {
  flex: 1;
  min-width: 0;
}
.kb-detail-name {
  font-size: var(--app-font-size-lg);
  font-weight: 600;
}
.kb-detail-desc {
  margin-top: 4px;
  font-size: var(--app-font-size-base);
  color: var(--app-text-secondary);
}
.kb-detail-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 3px 8px;
  border-radius: var(--app-radius);
  background: var(--app-bg-muted);
  font-size: var(--app-font-size-xs);
  color: var(--app-text-secondary);
}
.kb-detail-actions {
  display: flex;
  gap: 8px;
}

.kb-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 24px;
}
.kb-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 24px;
}

.kb-uploader :deep(.el-upload-dragger) {
  padding: 24px;
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-subtle);
}
.uploader-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.uploader-icon {
  color: var(--app-text-tertiary);
}
.uploader-text {
  font-size: var(--app-font-size-base);
  color: var(--app-text-regular);
}
.uploader-text em {
  font-style: normal;
  color: var(--app-primary);
  font-weight: 500;
}
.uploader-hint {
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}
.uploader-progress {
  margin-top: 4px;
  font-size: var(--app-font-size-xs);
  color: var(--app-primary);
}

.docs-table {
  margin-top: 16px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.doc-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}
.doc-icon {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}
.doc-name-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--app-text-primary);
}

/* ── 检索演练 ─────────────────────────────────── */
.playground-hint {
  margin-bottom: 12px;
  font-size: var(--app-font-size-sm);
  color: var(--app-text-secondary);
}
.search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.limit-select {
  width: 110px;
  flex-shrink: 0;
}
.results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.result-card {
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-surface);
}
.result-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-secondary);
}
.result-score strong {
  color: var(--app-text-primary);
}
.result-spacer {
  flex: 1;
}
.result-source {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--app-text-tertiary);
}
.result-text {
  font-size: var(--app-font-size-base);
  line-height: 1.7;
  color: var(--app-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.field-hint {
  width: 100%;
  margin-top: 4px;
  font-size: var(--app-font-size-xs);
  line-height: 1.5;
  color: var(--app-text-tertiary);
}
:deep(.el-select) {
  width: 100%;
}
.search-row :deep(.el-select) {
  width: 110px;
}
</style>
