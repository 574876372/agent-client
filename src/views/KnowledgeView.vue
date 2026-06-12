<script setup lang="ts">
import { ref, onMounted, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { knowledgeApi } from '@/api/chat'

interface KbResponse {
  id: string
  name: string
  description?: string
  avatar?: string
  userId: string
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

const router = useRouter()

const kbs = ref<KbResponse[]>([])
const selectedKb = ref<KbResponse | null>(null)
const docs = ref<UploadDocResponse[]>([])

// Loading states
const kbsLoading = ref(false)
const docsLoading = ref(false)
const searchLoading = ref(false)
const isUploading = ref(false)

// Tab state
const activeTab = ref<'docs' | 'playground'>('docs')

// Playground search states
const searchQuery = ref('')
const searchLimit = ref(3)
const searchResults = ref<SearchChunkResponse[]>([])

// Dialog control
const showCreateModal = ref(false)
const newKb = reactive({
  name: '',
  description: '',
  avatar: '📚'
})

const avatars = ['📚', '🧠', '🗄️', '📁', '💡', '🧪', '🤖', '🔍', '⚙️', '📊']

// ─── API Methods ─────────────────────────────────────────────────────────────

async function loadKbs() {
  kbsLoading.value = true
  try {
    const res = await knowledgeApi.listKbs()
    kbs.value = res.data ?? []
    // Auto select first KB if nothing is selected and list is not empty
    if (kbs.value.length > 0 && !selectedKb.value) {
      selectKb(kbs.value[0])
    }
  } catch (e: any) {
    console.error('加载知识库失败:', e)
  } finally {
    kbsLoading.value = false
  }
}

async function selectKb(kb: KbResponse) {
  selectedKb.value = kb
  searchResults.value = []
  searchQuery.value = ''
  await loadDocs()
}

async function loadDocs() {
  if (!selectedKb.value) return
  docsLoading.value = true
  try {
    const res = await knowledgeApi.listDocs(selectedKb.value.id)
    docs.value = res.data ?? []
  } catch (e) {
    console.error('加载文档列表失败:', e)
  } finally {
    docsLoading.value = false
  }
}

async function handleCreateKb() {
  if (!newKb.name.trim()) return
  try {
    const res = await knowledgeApi.createKb({
      name: newKb.name.trim(),
      description: newKb.description.trim(),
      avatar: newKb.avatar
    })
    showCreateModal.value = false
    newKb.name = ''
    newKb.description = ''
    newKb.avatar = '📚'
    
    await loadKbs()
    if (res.data) {
      const created = kbs.value.find(k => k.id === res.data.id)
      if (created) selectKb(created)
    }
  } catch (e: any) {
    alert('创建知识库失败: ' + (e.response?.data?.message || e.message))
  }
}

async function handleDeleteKb(kb: KbResponse) {
  if (!confirm(`警告：确认删除知识库「${kb.name}」？这将会永久级联删除其下的所有物理文档、分片段落及向量数据库索引！`)) return
  try {
    await knowledgeApi.deleteKb(kb.id)
    if (selectedKb.value?.id === kb.id) {
      selectedKb.value = null
      docs.value = []
    }
    await loadKbs()
  } catch (e: any) {
    alert('删除知识库失败: ' + (e.response?.data?.message || e.message))
  }
}

// File Upload Handler
async function triggerFileUpload(event: Event) {
  if (!selectedKb.value) return
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  isUploading.value = true
  try {
    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i]
      await knowledgeApi.uploadDoc(selectedKb.value.id, file)
    }
    await loadDocs()
  } catch (e: any) {
    alert('上传解析文档失败: ' + (e.response?.data?.message || e.message))
  } finally {
    isUploading.value = false
    // Clear input
    input.value = ''
  }
}

async function handleDeleteDoc(doc: UploadDocResponse) {
  if (!confirm(`确认删除文档「${doc.name}」？这将会清理其在 MySQL 的切片数据及向量检索库中的对应索引。`)) return
  try {
    await knowledgeApi.deleteDoc(doc.id)
    await loadDocs()
  } catch (e: any) {
    alert('删除文档失败: ' + (e.response?.data?.message || e.message))
  }
}

async function performPlaygroundSearch() {
  if (!selectedKb.value || !searchQuery.value.trim()) return
  searchLoading.value = true
  try {
    const res = await knowledgeApi.search(selectedKb.value.id, searchQuery.value.trim(), searchLimit.value)
    searchResults.value = res.data ?? []
  } catch (e: any) {
    alert('向量匹配检索失败: ' + (e.response?.data?.message || e.message))
  } finally {
    searchLoading.value = false
  }
}

// Format utilities
function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'uploading': return '上传中'
    case 'parsing': return '解析分片中'
    case 'indexed': return '已向量入库'
    case 'failed': return '解析失败'
    default: return status
  }
}

onMounted(loadKbs)
</script>

<template>
  <div class="kb-container">
    <!-- ══════════════ LEFT PANE: KB LIST ══════════════ -->
    <div class="kb-sidebar">
      <div class="sidebar-header">
        <button class="btn-back" @click="router.push('/')">← 返回对话</button>
        <div class="sidebar-title">
          <span>📚 我的知识库</span>
          <button class="btn-add-kb" @click="showCreateModal = true" title="创建知识库">+</button>
        </div>
      </div>

      <div class="kb-list">
        <div v-if="kbsLoading" class="list-empty">加载中...</div>
        <div v-else-if="kbs.length === 0" class="list-empty">暂无私有知识库，点击右上角 "+" 开始创建</div>
        <div
          v-for="kb in kbs"
          :key="kb.id"
          :class="['kb-item', { active: selectedKb?.id === kb.id }]"
          @click="selectKb(kb)"
        >
          <div class="kb-avatar">{{ kb.avatar || '📚' }}</div>
          <div class="kb-item-info">
            <div class="kb-item-name">{{ kb.name }}</div>
            <div class="kb-item-desc">{{ kb.description || '暂无描述' }}</div>
          </div>
          <button class="btn-item-delete" @click.stop="handleDeleteKb(kb)" title="级联删除知识库">✕</button>
        </div>
      </div>
    </div>

    <!-- ══════════════ RIGHT PANE: DETAIL AREA ══════════════ -->
    <div class="kb-main">
      <div v-if="!selectedKb" class="kb-empty-state">
        <div class="empty-icon">📚</div>
        <h2>私有知识库 (RAG) 中心</h2>
        <p>引入本地私有知识库，赋予 AI Agent 检索垂直文档的能力。</p>
        <p class="sub-hint">点击左上角按钮新建知识库，或从列表中选择已创建的知识库进行管理。</p>
        <button class="btn-primary mt-4" @click="showCreateModal = true">+ 新建私有知识库</button>
      </div>

      <div v-else class="kb-content">
        <!-- Selected KB Header -->
        <div class="kb-content-header">
          <div class="kb-header-avatar">{{ selectedKb.avatar || '📚' }}</div>
          <div class="kb-header-info">
            <h2>{{ selectedKb.name }}</h2>
            <p>{{ selectedKb.description || '暂无详细描述...' }}</p>
          </div>
          <div class="kb-header-actions">
            <button class="btn-secondary" @click="loadDocs" :disabled="docsLoading">
              <span class="refresh-icon" :class="{ spinning: docsLoading }">🔄</span> 刷新状态
            </button>
            <button class="btn-danger" @click="handleDeleteKb(selectedKb)">删除知识库</button>
          </div>
        </div>

        <!-- Tabs Container -->
        <div class="kb-tabs">
          <button
            :class="['kb-tab-btn', { active: activeTab === 'docs' }]"
            @click="activeTab = 'docs'"
          >📁 文档管理 ({{ docs.length }})</button>
          <button
            :class="['kb-tab-btn', { active: activeTab === 'playground' }]"
            @click="activeTab = 'playground'"
          >🔍 检索演练场 (Playground)</button>
        </div>

        <!-- 📁 Tab Content: Document Manager -->
        <div v-if="activeTab === 'docs'" class="kb-tab-panel">
          <!-- File Uploader Zone -->
          <div class="uploader-zone">
            <input
              type="file"
              id="file-upload-input"
              multiple
              accept=".pdf,.txt,.md,.docx,.doc,.xlsx,.xls,.xml,.pptx,.ppt"
              @change="triggerFileUpload"
              class="hidden-input"
            />
            <label for="file-upload-input" class="uploader-label">
              <div class="uploader-icon">📤</div>
              <div class="uploader-text">
                <span class="highlight">点击上传</span> 或拖拽文件到这里
              </div>
              <div class="uploader-hint">
                支持格式：PDF, TXT, MD, Word (docx/doc), Excel (xlsx/xls), XML, PPTX
              </div>
              <div v-if="isUploading" class="uploading-progress">
                <span class="progress-spinner">⏳</span> 正在上传并计算向量索引，请稍候...
              </div>
            </label>
          </div>

          <!-- Document List Table -->
          <div class="docs-table-wrap">
            <table class="docs-table">
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>大小</th>
                  <th>解析状态</th>
                  <th>字数</th>
                  <th>切片数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="docsLoading && docs.length === 0">
                  <td colspan="6" class="table-empty">加载中...</td>
                </tr>
                <tr v-else-if="docs.length === 0">
                  <td colspan="6" class="table-empty">暂无绑定文档，请在上方区域上传文件</td>
                </tr>
                <tr v-for="doc in docs" :key="doc.id">
                  <td>
                    <div class="doc-title-row">
                      <span class="doc-type-icon">{{ doc.type.toLowerCase() === 'pdf' ? '📕' : '📄' }}</span>
                      <span class="doc-name" :title="doc.name">{{ doc.name }}</span>
                    </div>
                  </td>
                  <td>{{ formatBytes(doc.sizeBytes) }}</td>
                  <td>
                    <span :class="['status-badge', doc.status]" :title="doc.errorMessage || ''">
                      {{ getStatusLabel(doc.status) }}
                      <span v-if="doc.status === 'failed'" class="error-ex">ⓘ</span>
                    </span>
                  </td>
                  <td>{{ doc.charCount != null ? doc.charCount : '—' }} 字</td>
                  <td>{{ doc.chunkCount != null ? doc.chunkCount : '—' }} 片</td>
                  <td>
                    <button class="btn-table-action danger" @click="handleDeleteDoc(doc)">删除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 🔍 Tab Content: Retrieval Playground -->
        <div v-if="activeTab === 'playground'" class="kb-tab-panel playground-panel">
          <div class="playground-header-hint">
            <p>💡 检索演练场是调优知识库的最佳工具。在这里直接输入自然语言，系统会调用配置好的 Embedding 嵌入引擎进行高维向量计算，并在库内进行语义相似度检索，召回 Top-K 最匹配的分段文本与匹配度得分（Score）。</p>
          </div>

          <div class="search-bar-row">
            <div class="search-input-wrap">
              <input
                v-model="searchQuery"
                @keyup.enter="performPlaygroundSearch"
                placeholder="在此输入您的测试提问，如：系统支持哪几种数据源的 Text-to-SQL？"
                class="search-input"
              />
              <button
                class="btn-primary btn-search-trigger"
                :disabled="searchLoading || !searchQuery.trim()"
                @click="performPlaygroundSearch"
              >
                {{ searchLoading ? '检索中...' : '开始演练' }}
              </button>
            </div>
            
            <div class="search-config">
              <span class="config-label">召回数量 (Top-K):</span>
              <select v-model="searchLimit" class="config-select">
                <option :value="1">1 片</option>
                <option :value="3">3 片</option>
                <option :value="5">5 片</option>
                <option :value="10">10 片</option>
              </select>
            </div>
          </div>

          <div class="search-results-container">
            <div v-if="searchLoading" class="results-empty">正在进行语义检索向量比对，请稍后...</div>
            <div v-else-if="searchResults.length === 0" class="results-empty">
              输入问题并点击“开始演练”，右侧或下方会实时回显模型检索的知识点匹配结果
            </div>
            
            <div v-else class="results-grid">
              <div v-for="(chunk, idx) in searchResults" :key="chunk.chunkId" class="chunk-card">
                <div class="chunk-card-header">
                  <span class="chunk-badge">TOP {{ idx + 1 }}</span>
                  <span class="chunk-score">🎯 相似度评分: <strong class="score-text">{{ chunk.score.toFixed(4) }}</strong></span>
                  <span class="chunk-index">分片序号: #{{ chunk.chunkIndex }}</span>
                </div>
                <div class="chunk-card-body">
                  <p class="chunk-text">{{ chunk.content }}</p>
                </div>
                <div class="chunk-card-footer">
                  <span class="doc-badge">📄 溯源文档: {{ chunk.docName }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════ CREATE KB MODAL ══════════════ -->
    <div v-if="showCreateModal" class="modal-mask" @click.self="showCreateModal = false">
      <div class="modal">
        <header class="modal-header">
          <h2>📚 创建私有知识库</h2>
          <button class="btn-close" @click="showCreateModal = false">×</button>
        </header>
        <div class="modal-body">
          <label>
            <span>名称 *</span>
            <input v-model="newKb.name" placeholder="请输入知识库名称，例如：产品使用指南" />
          </label>
          <label>
            <span>描述</span>
            <textarea
              v-model="newKb.description"
              rows="3"
              placeholder="请输入对此知识库的描述，例如：包含平台的核心功能、常见操作与故障排查知识"
            />
          </label>
          <label>
            <span>选择代表头像图标</span>
            <div class="avatar-select-grid">
              <button
                v-for="a in avatars"
                :key="a"
                type="button"
                :class="['avatar-select-btn', { active: newKb.avatar === a }]"
                @click="newKb.avatar = a"
              >{{ a }}</button>
            </div>
          </label>
        </div>
        <footer class="modal-footer">
          <button class="btn-secondary" @click="showCreateModal = false">取消</button>
          <button class="btn-primary" :disabled="!newKb.name.trim()" @click="handleCreateKb">确认创建</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-container {
  display: flex;
  height: 100vh;
  background: #0f0f0f;
  color: #e8e8e8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

/* ── Left Pane Sidebar ─────────────────────────────────────────────────── */
.kb-sidebar {
  width: 280px;
  min-width: 280px;
  background: #141416;
  border-right: 1px solid #232328;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #232328;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn-back {
  background: #1f1f23;
  border: 1px solid #2d2d34;
  color: #c4c4c6;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.btn-back:hover { background: #2a2a32; color: #fff; }

.sidebar-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #888896;
}

.btn-add-kb {
  background: #4f46e5;
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
}
.btn-add-kb:hover { background: #6366f1; }

.kb-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.kb-list::-webkit-scrollbar { width: 4px; }
.kb-list::-webkit-scrollbar-thumb { background: #2d2d34; border-radius: 2px; }

.list-empty {
  text-align: center;
  color: #555;
  font-size: 13px;
  padding: 40px 12px;
  line-height: 1.6;
}

.kb-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 4px;
  position: relative;
  transition: all 0.2s;
}
.kb-item:hover { background: #1c1c1f; }
.kb-item.active { background: #252535; }

.kb-avatar {
  font-size: 22px;
  width: 36px;
  height: 36px;
  background: #1b1b22;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.kb-item.active .kb-avatar { background: #141416; }

.kb-item-info {
  flex: 1;
  overflow: hidden;
}
.kb-item-name {
  font-size: 13.5px;
  font-weight: 600;
  color: #e4e4e6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kb-item.active .kb-item-name { color: #fff; }

.kb-item-desc {
  font-size: 11.5px;
  color: #6c6c74;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 3px;
}

.btn-item-delete {
  display: none;
  background: transparent;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
}
.kb-item:hover .btn-item-delete { display: block; }
.btn-item-delete:hover { color: #ff5555; background: #2d1616; }

/* ── Right Pane Detail Area ───────────────────────────────────────────── */
.kb-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0d0d0f;
}

.kb-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}
.empty-icon { font-size: 60px; margin-bottom: 16px; }
.kb-empty-state h2 { font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #fff; }
.kb-empty-state p { font-size: 14px; color: #aaa; max-width: 440px; line-height: 1.5; }
.sub-hint { font-size: 12px !important; color: #555 !important; margin-top: 6px; }
.mt-4 { margin-top: 16px; }

.kb-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kb-content-header {
  padding: 20px 24px;
  border-bottom: 1px solid #1e1e24;
  display: flex;
  align-items: center;
  gap: 16px;
}

.kb-header-avatar {
  font-size: 36px;
  width: 56px;
  height: 56px;
  background: #141416;
  border: 1px solid #232328;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kb-header-info {
  flex: 1;
}
.kb-header-info h2 { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 4px; }
.kb-header-info p { font-size: 13px; color: #888; line-height: 1.4; }

.kb-header-actions {
  display: flex;
  gap: 8px;
}

.btn-danger {
  background: #4a1c1c;
  border: 1px solid #632222;
  color: #ff8888;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.btn-danger:hover { background: #632222; color: #ffaaaa; }

.refresh-icon { display: inline-block; transition: transform 0.3s; }
.refresh-icon.spinning { animation: spin 1s infinite linear; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Tabs ──────────────────────────────────────────────────────────────── */
.kb-tabs {
  display: flex;
  padding: 0 24px;
  border-bottom: 1px solid #1e1e24;
  background: #0f0f12;
}

.kb-tab-btn {
  padding: 14px 20px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #888;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.kb-tab-btn:hover { color: #ccc; }
.kb-tab-btn.active { color: #4f46e5; border-bottom-color: #4f46e5; font-weight: 600; }

.kb-tab-panel {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.kb-tab-panel::-webkit-scrollbar { width: 6px; }
.kb-tab-panel::-webkit-scrollbar-track { background: transparent; }
.kb-tab-panel::-webkit-scrollbar-thumb { background: #232328; border-radius: 3px; }

/* ── Document Management Tab ───────────────────────────────────────────── */
.uploader-zone {
  background: #101013;
  border: 2px dashed #232328;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s;
}
.uploader-zone:hover { border-color: #4f46e5; background: #131318; }

.hidden-input { display: none; }
.uploader-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 20px;
  cursor: pointer;
  text-align: center;
}

.uploader-icon { font-size: 32px; margin-bottom: 8px; }
.uploader-text { font-size: 14px; color: #ccc; margin-bottom: 4px; }
.uploader-text .highlight { color: #6366f1; font-weight: 600; }
.uploader-hint { font-size: 12px; color: #555; }

.uploading-progress {
  margin-top: 14px;
  font-size: 13px;
  color: #6366f1;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}
.progress-spinner { display: inline-block; animation: spin 1s infinite linear; }

.docs-table-wrap {
  background: #141416;
  border: 1px solid #232328;
  border-radius: 10px;
  overflow: hidden;
}

.docs-table {
  width: 100%;
  border-collapse: collapse;
}

.docs-table th {
  background: #18181c;
  text-align: left;
  padding: 12px 16px;
  font-size: 12.5px;
  color: #888;
  font-weight: 600;
  border-bottom: 1px solid #232328;
}

.docs-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #1c1c1f;
  font-size: 13.5px;
  vertical-align: middle;
}

.docs-table tr:last-child td { border-bottom: none; }

.doc-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 280px;
}
.doc-type-icon { font-size: 16px; flex-shrink: 0; }
.doc-name {
  color: #e4e4e6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.table-empty {
  text-align: center;
  color: #555;
  padding: 36px 0 !important;
}

/* Status Badges */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11.5px;
  font-weight: 500;
}
.status-badge.uploading { background: #132d3d; color: #86d5ff; }
.status-badge.parsing { background: #3d2d13; color: #ffd586; }
.status-badge.indexed { background: #133d1c; color: #86ff95; }
.status-badge.failed { background: #3d1313; color: #ff8686; cursor: help; }
.error-ex { font-size: 10px; font-weight: bold; border-radius: 50%; border: 1px solid currentColor; width: 12px; height: 12px; display: inline-flex; align-items: center; justify-content: center; }

.btn-table-action {
  background: transparent;
  border: none;
  color: #ff8888;
  cursor: pointer;
  font-size: 12.5px;
}
.btn-table-action:hover { color: #ffaaaa; text-decoration: underline; }

/* ── Playground Tab ────────────────────────────────────────────────────── */
.playground-panel {
  gap: 16px;
}

.playground-header-hint {
  padding: 12px 16px;
  background: #14141a;
  border-left: 4px solid #4f46e5;
  border-radius: 0 8px 8px 0;
}
.playground-header-hint p { font-size: 12.5px; color: #aaa; line-height: 1.5; }

.search-bar-row {
  display: flex;
  gap: 16px;
  align-items: center;
}

.search-input-wrap {
  flex: 1;
  display: flex;
  background: #08080a;
  border: 1px solid #232328;
  border-radius: 10px;
  overflow: hidden;
}
.search-input-wrap:focus-within { border-color: #6366f1; }

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  padding: 10px 14px;
  font-size: 14px;
}
.search-input::placeholder { color: #52525b; }

.btn-search-trigger {
  border-radius: 0 8px 8px 0 !important;
  box-shadow: none !important;
  padding: 0 20px !important;
}

.search-config {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.config-label { font-size: 12.5px; color: #888; }
.config-select {
  background: #08080a;
  border: 1px solid #232328;
  color: #ccc;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
}

.search-results-container {
  flex: 1;
  min-height: 200px;
}

.results-empty {
  text-align: center;
  color: #444;
  font-size: 13px;
  padding: 60px 20px;
  line-height: 1.6;
}

.results-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.chunk-card {
  background: #141417;
  border: 1px solid #232329;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.chunk-card-header {
  background: #1b1b20;
  padding: 10px 16px;
  border-bottom: 1px solid #232329;
  display: flex;
  align-items: center;
  gap: 12px;
}

.chunk-badge {
  background: #4f46e5;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.chunk-score { font-size: 12.5px; color: #a1a1aa; flex: 1; }
.score-text { color: #22c55e; }
.chunk-index { font-size: 12px; color: #52525b; font-family: monospace; }

.chunk-card-body {
  padding: 14px 16px;
}
.chunk-text {
  font-size: 13.5px;
  color: #e4e4e6;
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
}

.chunk-card-footer {
  background: #0f0f11;
  padding: 8px 16px;
  border-top: 1px dashed #232329;
}
.doc-badge { font-size: 12px; color: #71717a; }

/* ── Modals & Dialogs ──────────────────────────────────────────────────── */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.modal {
  background: #141416;
  border: 1px solid #232328;
  border-radius: 16px;
  width: 500px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0,0,0,0.8);
}

.modal-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #232328;
}
.modal-header h2 { flex: 1; font-size: 16px; font-weight: 600; color: #fff; }
.btn-close {
  background: transparent;
  border: none;
  color: #888;
  font-size: 22px;
  cursor: pointer;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-body label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal-body span { font-size: 13px; color: #a1a1aa; font-weight: 500; }

.modal-body input, .modal-body textarea {
  background: #08080a;
  border: 1px solid #232328;
  border-radius: 8px;
  color: #e4e4e6;
  padding: 8px 12px;
  font-size: 13.5px;
  outline: none;
  font-family: inherit;
}
.modal-body input:focus, .modal-body textarea:focus { border-color: #6366f1; }

/* Avatar Select Grid */
.avatar-select-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 4px;
}

.avatar-select-btn {
  font-size: 22px;
  padding: 8px;
  background: #08080a;
  border: 1px solid #232328;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-select-btn:hover { background: #1c1c22; border-color: #52525b; }
.avatar-select-btn.active { border-color: #6366f1; background: rgba(99, 102, 241, 0.1); }

.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid #232328;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  border: none;
  color: white;
  padding: 8px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13.5px;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
  transition: all 0.2s;
}
.btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: #1c1c1f;
  border: 1px solid #2d2d34;
  color: #a1a1aa;
  padding: 8px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  font-size: 13.5px;
  transition: all 0.2s;
}
.btn-secondary:hover { border-color: #3f3f46; color: #fff; background: #232327; }
</style>
