<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { agentApi, knowledgeApi } from '@/api/chat'
import { modelApi, type ModelInfoResponse } from '@/api/model'
import { History, Layers, Sparkles, Database, Wrench, Check } from 'lucide-vue-next'

const props = defineProps<{
  show: boolean
  /** 编辑模式下的智能体 ID；为空时为创建模式 */
  agentId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'agent-created'): void
  (e: 'agent-updated'): void
}>()

interface ToolInfo {
  toolName: string
  displayName: string
  description: string
  icon: string
  category: string
  enabled: boolean
  /** 创建时是否默认勾选（后端按 agent.tool.default-enabled 标记） */
  defaultSelected?: boolean
}

/** 是否为编辑模式 */
const isEdit = computed(() => !!props.agentId)
/** 编辑模式下正在加载智能体详情 */
const loadingDetail = ref(false)
/** 提交中，防止重复点击 */
const submitting = ref(false)

const modelProviders = ref<{ type: string; models: string[] }[]>([])
const availableTools = ref<ToolInfo[]>([])
const kbs = ref<{ id: string; name: string }[]>([])
const newAgent = reactive({
  name: '',
  description: '',
  modelType: '',
  modelName: '',
  systemPrompt: '',
  toolNames: [] as string[],
  memoryMode: 'SUMMARY' as 'FULL' | 'WINDOW' | 'SUMMARY',
  maxTurns: null as number | null,
  useCustomTurns: false,
  customTurns: 10,
  
  // RAG configurations
  kbIds: [] as string[],
  ragMode: 'GENERIC' as 'DISABLED' | 'GENERIC' | 'AGENTIC',
  /** 最终交给模型的段数 Top-K */
  recallLimit: 5,
  /** 向量召回预过滤阈值 */
  scoreThreshold: 0.3,
  /** 是否结合对话历史改写检索词 */
  queryRewrite: true,
  /** 注入上下文总长上限（字） */
  contextMaxChars: 20000,
  /** 重排模型 ID，空串表示使用全局默认（未配置则不重排） */
  rerankModelId: ''
})

/** 与后端 agent.rag.retrieval.* 默认值保持一致 */
const DEFAULT_FINAL_TOP_K = 5
const DEFAULT_SCORE_THRESHOLD = 0.3
const DEFAULT_CONTEXT_MAX_CHARS = 20000

const promptTemplates = [
  { name: '自定义', prompt: '' },
  { name: '翻译官', prompt: '你是一个专业的翻译官，能够精准地将用户输入的文本翻译成多种语言，并提供相关的语言建议。' },
  { name: '代码专家', prompt: '你是一个资深的软件工程师，擅长编写高质量、可维护的代码，并能对代码进行深度审计和优化。' },
  { name: '心理医生', prompt: '你是一个温暖、耐心的心理医生，能够倾听用户的烦恼，并提供专业、科学的心理疏导和建议。' }
]

const memoryModes = [
  {
    value: 'FULL',
    icon: History,
    name: '全量记忆',
    desc: '加载全部历史，不压缩'
  },
  {
    value: 'WINDOW',
    icon: Layers,
    name: '滑动窗口',
    desc: '仅保留最近 N 轮'
  },
  {
    value: 'SUMMARY',
    icon: Sparkles,
    name: '摘要压缩',
    desc: '超限自动摘要（推荐）'
  }
]


const availableModels = computed(() => {
  const provider = modelProviders.value.find(
    p => p.type.toLowerCase() === newAgent.modelType.toLowerCase()
  )
  return provider ? provider.models : []
})

/** SQL Agent 三件套工具名，用于前端分组展示 */
const SQL_TOOL_NAMES = new Set(['list_datasources', 'get_table_schema', 'query_database'])

/** 按 category=sql 或工具名归入「数据库问答能力」分组 */
const sqlTools = computed(() =>
  availableTools.value.filter(t => t.category === 'sql' || SQL_TOOL_NAMES.has(t.toolName))
)

/** 其余工具（builtin / custom） */
const otherTools = computed(() =>
  availableTools.value.filter(t => !sqlTools.value.includes(t))
)

function update(field: keyof typeof newAgent, value: string) {
  ;(newAgent as any)[field] = value
}

function applyTemplate(prompt: string) {
  update('systemPrompt', prompt)
}

function onModelTypeChange(type: string) {
  const provider = modelProviders.value.find(p => p.type === type)
  newAgent.modelType = type
  newAgent.modelName = provider?.models[0] || ''
}

function toggleTool(toolName: string) {
  const idx = newAgent.toolNames.indexOf(toolName)
  if (idx >= 0) {
    newAgent.toolNames.splice(idx, 1)
  } else {
    newAgent.toolNames.push(toolName)
  }
}

function isToolSelected(toolName: string): boolean {
  return newAgent.toolNames.includes(toolName)
}

async function loadModelProviders() {
  try {
    const res = await agentApi.getModelProviders()
    modelProviders.value = res.data
    // 编辑模式下详情可能先于模型列表返回，已有选择时不覆盖
    if (modelProviders.value.length > 0 && !newAgent.modelType) {
      newAgent.modelType = modelProviders.value[0].type
      newAgent.modelName = modelProviders.value[0].models[0]
    }
  } catch (e) {
    console.error('加载模型列表失败:', e)
  }
}

/** 创建时默认勾选的工具：仅后端标记为 defaultSelected 的工具 */
function defaultToolNames(): string[] {
  return availableTools.value.filter(t => t.defaultSelected).map(t => t.toolName)
}

async function loadAvailableTools() {
  try {
    const res = await agentApi.getTools()
    availableTools.value = res.data || []
    if (!isEdit.value) {
      newAgent.toolNames = defaultToolNames()
    }
  } catch (e) {
    console.error('加载工具列表失败:', e)
  }
}

/** 可选的重排模型（已启用的 RERANK 类型） */
const rerankModels = ref<ModelInfoResponse[]>([])

async function loadRerankModels() {
  try {
    const res = await modelApi.listModels('RERANK')
    rerankModels.value = (res.data ?? []).filter(m => m.enabled === 1)
  } catch (e) {
    console.error('加载重排模型失败:', e)
  }
}

async function loadKnowledgeBases() {
  try {
    const res = await knowledgeApi.listKbs()
    kbs.value = res.data ?? []
  } catch (e) {
    console.error('加载知识库列表失败:', e)
  }
}

/** 重置为创建模式的默认表单 */
function resetForm() {
  Object.assign(newAgent, {
    name: '',
    description: '',
    modelType: modelProviders.value[0]?.type || '',
    modelName: modelProviders.value[0]?.models[0] || '',
    systemPrompt: '',
    toolNames: defaultToolNames(),
    memoryMode: 'SUMMARY',
    maxTurns: null,
    useCustomTurns: false,
    customTurns: 10,
    kbIds: [],
    ragMode: 'GENERIC',
    recallLimit: DEFAULT_FINAL_TOP_K,
    scoreThreshold: DEFAULT_SCORE_THRESHOLD,
    queryRewrite: true,
    contextMaxChars: DEFAULT_CONTEXT_MAX_CHARS,
    rerankModelId: ''
  })
}

/** 编辑模式：拉取智能体详情并回填表单 */
async function fillFromAgent(id: string) {
  loadingDetail.value = true
  try {
    const { data } = await agentApi.getAgent(id)
    Object.assign(newAgent, {
      name: data.name ?? '',
      description: data.description ?? '',
      modelType: data.modelType ?? '',
      modelName: data.modelName ?? '',
      systemPrompt: data.systemPrompt ?? '',
      toolNames: [...(data.toolNames ?? [])],
      memoryMode: data.memoryMode || 'SUMMARY',
      maxTurns: data.maxTurns ?? null,
      useCustomTurns: data.maxTurns != null,
      customTurns: data.maxTurns ?? 10,
      kbIds: [...(data.kbIds ?? [])],
      ragMode: data.ragMode && data.ragMode !== 'DISABLED' ? data.ragMode : 'GENERIC',
      recallLimit: data.recallLimit ?? DEFAULT_FINAL_TOP_K,
      scoreThreshold: data.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD,
      queryRewrite: data.queryRewrite ?? true,
      contextMaxChars: data.contextMaxChars ?? DEFAULT_CONTEXT_MAX_CHARS,
      rerankModelId: data.rerankModelId ?? ''
    })
  } catch (e) {
    console.error('加载智能体详情失败:', e)
    ElMessage.error('加载智能体详情失败')
    emit('update:show', false)
  } finally {
    loadingDetail.value = false
  }
}

/** 组装提交给后端的请求体（创建与更新共用） */
function buildPayload() {
  const hasKb = newAgent.kbIds.length > 0
  return {
    name: newAgent.name,
    description: newAgent.description,
    modelType: newAgent.modelType,
    modelName: newAgent.modelName,
    systemPrompt: newAgent.systemPrompt,
    toolNames: newAgent.toolNames,
    memoryMode: newAgent.memoryMode,
    maxTurns: newAgent.memoryMode === 'FULL' ? null : (newAgent.useCustomTurns ? newAgent.customTurns : null),
    kbIds: newAgent.kbIds,
    ragMode: hasKb ? newAgent.ragMode : 'DISABLED',
    recallLimit: hasKb ? newAgent.recallLimit : null,
    scoreThreshold: hasKb ? newAgent.scoreThreshold : null,
    queryRewrite: hasKb ? newAgent.queryRewrite : null,
    contextMaxChars: hasKb ? newAgent.contextMaxChars : null,
    rerankModelId: hasKb ? newAgent.rerankModelId : null
  }
}

async function submit() {
  if (!newAgent.name.trim() || submitting.value) return
  submitting.value = true
  try {
    if (isEdit.value) {
      await agentApi.updateAgent(props.agentId!, buildPayload())
      ElMessage.success('已保存，下次对话生效')
      emit('agent-updated')
    } else {
      await agentApi.createAgent(buildPayload())
      emit('agent-created')
      resetForm()
    }
    emit('update:show', false)
  } catch (e: any) {
    console.error(e)
    ElMessage.error((isEdit.value ? '保存失败：' : '创建失败：') + (e?.response?.data?.message ?? e?.message ?? '未知错误'))
  } finally {
    submitting.value = false
  }
}

// 每次打开弹窗：编辑模式回填详情，创建模式重置表单；同时刷新知识库列表
watch(
  () => props.show,
  (visible) => {
    if (!visible) return
    loadKnowledgeBases()
    if (props.agentId) {
      fillFromAgent(props.agentId)
    } else {
      resetForm()
    }
  }
)

onMounted(() => {
  loadModelProviders()
  loadAvailableTools()
  loadKnowledgeBases()
  loadRerankModels()
})
</script>

<template>
  <el-dialog
    :model-value="show"
    :title="isEdit ? '编辑智能体' : '创建智能体'"
    width="720px"
    top="6vh"
    class="create-agent-dialog"
    @update:model-value="emit('update:show', $event)"
  >
    <el-form v-loading="loadingDetail" label-position="top" class="agent-form" @submit.prevent>
      <!-- 1. 基本信息 -->
      <section class="form-section">
        <h3 class="section-title">基本信息</h3>
        <div class="form-grid">
          <el-form-item label="名称" required>
            <el-input v-model="newAgent.name" placeholder="例如：数据库管理员" maxlength="50" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="newAgent.description" placeholder="一句话说明它的用途" maxlength="200" />
          </el-form-item>
        </div>
      </section>

      <!-- 2. 基座模型 -->
      <section class="form-section">
        <h3 class="section-title">基座模型</h3>
        <el-empty
          v-if="modelProviders.length === 0"
          :image-size="48"
          description="暂无可用的对话模型，请先在「模型管理」中配置厂商与模型"
        />
        <div v-else class="form-grid">
          <el-form-item label="模型厂商" required>
            <el-select :model-value="newAgent.modelType" @change="onModelTypeChange">
              <el-option v-for="p in modelProviders" :key="p.type" :label="p.type" :value="p.type" />
            </el-select>
          </el-form-item>
          <el-form-item label="模型" required>
            <el-select v-model="newAgent.modelName">
              <el-option v-for="m in availableModels" :key="m" :label="m" :value="m" />
            </el-select>
          </el-form-item>
        </div>
      </section>

      <!-- 3. 提示词 -->
      <section class="form-section">
        <h3 class="section-title">提示词</h3>
        <el-form-item label="快捷模板">
          <div class="template-tags">
            <el-check-tag
              v-for="t in promptTemplates"
              :key="t.name"
              :checked="newAgent.systemPrompt === t.prompt"
              @change="applyTemplate(t.prompt)"
            >{{ t.name }}</el-check-tag>
          </div>
        </el-form-item>
        <el-form-item label="系统提示词（System Prompt）">
          <el-input
            v-model="newAgent.systemPrompt"
            type="textarea"
            :rows="4"
            placeholder="设定智能体的角色、工作流程、回复风格与约束条件"
          />
        </el-form-item>
      </section>

      <!-- 4. 记忆机制 -->
      <section class="form-section">
        <h3 class="section-title">记忆机制</h3>
        <div class="option-cards" role="radiogroup" aria-label="记忆模式">
          <button
            v-for="mode in memoryModes"
            :key="mode.value"
            type="button"
            role="radio"
            :aria-checked="newAgent.memoryMode === mode.value"
            :class="['option-card', { active: newAgent.memoryMode === mode.value }]"
            @click="newAgent.memoryMode = mode.value as 'FULL' | 'WINDOW' | 'SUMMARY'"
          >
            <span class="option-icon"><component :is="mode.icon" :size="18" :stroke-width="1.75" /></span>
            <span class="option-name">{{ mode.name }}</span>
            <span class="option-desc">{{ mode.desc }}</span>
          </button>
        </div>

        <el-alert
          v-if="newAgent.memoryMode === 'FULL'"
          class="section-alert"
          type="warning"
          :closable="false"
          show-icon
          title="全量模式会发送全部历史消息，对话较长时会消耗大量 Token，甚至超出上下文长度限制。"
        />

        <div v-else class="turns-row">
          <span class="inline-label">上下文保留轮数</span>
          <el-radio-group v-model="newAgent.useCustomTurns">
            <el-radio :value="false">默认（10 轮）</el-radio>
            <el-radio :value="true">自定义</el-radio>
          </el-radio-group>
          <el-input-number
            v-if="newAgent.useCustomTurns"
            v-model="newAgent.customTurns"
            :min="1"
            :max="200"
            controls-position="right"
            class="turns-input"
          />
        </div>
      </section>

      <!-- 5. 知识库 -->
      <section class="form-section">
        <h3 class="section-title">知识库（RAG）</h3>
        <p class="section-hint">关联私有知识库，让智能体基于你的文档回答问题。</p>
        <el-form-item label="关联知识库">
          <el-select
            v-model="newAgent.kbIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            :placeholder="kbs.length === 0 ? '暂无知识库' : '选择一个或多个知识库'"
            :disabled="kbs.length === 0"
          >
            <el-option v-for="kb in kbs" :key="kb.id" :label="kb.name" :value="kb.id" />
          </el-select>
          <div v-if="kbs.length === 0" class="field-hint">
            请先在 <RouterLink to="/knowledge" @click="emit('update:show', false)">知识库</RouterLink> 页面创建并导入文档。
          </div>
        </el-form-item>

        <template v-if="newAgent.kbIds.length > 0">
          <el-form-item label="检索模式">
            <el-radio-group v-model="newAgent.ragMode">
              <el-radio value="GENERIC">通用前置注入（推荐）</el-radio>
              <el-radio value="AGENTIC">智能体按需调用</el-radio>
            </el-radio-group>
          </el-form-item>
          <div class="form-grid">
            <el-form-item label="最终段数（Top-K）">
              <el-input-number v-model="newAgent.recallLimit" :min="1" :max="10" controls-position="right" />
              <div class="field-hint">交给模型的原文段数；每段会按知识库类型自动补全相邻内容</div>
            </el-form-item>
            <el-form-item label="上下文总长上限（字）">
              <el-input-number
                v-model="newAgent.contextMaxChars"
                :min="1000"
                :max="50000"
                :step="1000"
                controls-position="right"
              />
              <div class="field-hint">超出时按相关度从低到高舍弃段落</div>
            </el-form-item>
            <el-form-item label="向量预过滤阈值（0 ~ 1）">
              <el-input-number
                v-model="newAgent.scoreThreshold"
                :min="0"
                :max="1"
                :step="0.05"
                :precision="2"
                controls-position="right"
              />
              <div class="field-hint">低于该相似度的向量结果不参与融合；关键词结果不受影响</div>
            </el-form-item>
            <el-form-item label="重排模型">
              <el-select v-model="newAgent.rerankModelId" clearable placeholder="使用默认重排模型（未配置则不重排）">
                <el-option
                  v-for="m in rerankModels"
                  :key="m.id"
                  :value="m.id"
                  :label="`${m.modelName}（${m.providerName}）`"
                />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item label="结合对话历史改写检索词">
            <el-switch v-model="newAgent.queryRewrite" />
            <div class="field-hint">追问时（如「那响应参数呢？」）先结合上文改写为完整问题再检索；每次提问多一次模型调用</div>
          </el-form-item>
        </template>
      </section>

      <!-- 6. 工具 -->
      <section v-if="availableTools.length > 0" class="form-section last">
        <h3 class="section-title">工具</h3>
        <p class="section-hint">为智能体开启计算、查询、搜索等主动能力。</p>

        <template v-if="sqlTools.length > 0">
          <div class="tool-group-title">
            <Database :size="14" :stroke-width="1.75" /><span>数据库问答</span>
          </div>
          <p class="section-hint">需先在「数据源」中注册业务库；查询 SQL 会先进入人工审批，不会直接执行。</p>
          <div class="tool-grid">
            <button
              v-for="tool in sqlTools"
              :key="tool.toolName"
              type="button"
              role="checkbox"
              :aria-checked="isToolSelected(tool.toolName)"
              :class="['tool-card', { selected: isToolSelected(tool.toolName) }]"
              @click="toggleTool(tool.toolName)"
            >
              <span class="tool-card-head">
                <span class="tool-name">{{ tool.displayName }}</span>
                <span :class="['tool-check', { checked: isToolSelected(tool.toolName) }]" aria-hidden="true">
                  <Check v-if="isToolSelected(tool.toolName)" :size="12" :stroke-width="3" />
                </span>
              </span>
              <span class="tool-id mono">{{ tool.toolName }}</span>
              <span class="tool-desc">{{ tool.description }}</span>
            </button>
          </div>
        </template>

        <template v-if="otherTools.length > 0">
          <div class="tool-group-title" :class="{ spaced: sqlTools.length > 0 }">
            <Wrench :size="14" :stroke-width="1.75" /><span>通用工具</span>
          </div>
          <div class="tool-grid">
            <button
              v-for="tool in otherTools"
              :key="tool.toolName"
              type="button"
              role="checkbox"
              :aria-checked="isToolSelected(tool.toolName)"
              :class="['tool-card', { selected: isToolSelected(tool.toolName) }]"
              @click="toggleTool(tool.toolName)"
            >
              <span class="tool-card-head">
                <span class="tool-name">{{ tool.displayName }}</span>
                <span :class="['tool-check', { checked: isToolSelected(tool.toolName) }]" aria-hidden="true">
                  <Check v-if="isToolSelected(tool.toolName)" :size="12" :stroke-width="3" />
                </span>
              </span>
              <span class="tool-id mono">{{ tool.toolName }}</span>
              <span class="tool-desc">{{ tool.description }}</span>
            </button>
          </div>
        </template>
      </section>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:show', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!newAgent.name.trim() || !newAgent.modelName.trim()"
        @click="submit"
      >
        {{ isEdit ? '保存' : '创建智能体' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.agent-form {
  max-height: 68vh;
  overflow-y: auto;
  padding-right: 4px;
}

.form-section {
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--app-border);
}
.form-section.last {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.section-title {
  margin-bottom: 12px;
  font-size: var(--app-font-size-base);
  font-weight: 600;
  color: var(--app-text-primary);
}
.section-hint {
  margin: -4px 0 12px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}
.section-alert {
  margin-top: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.form-grid :deep(.el-select),
.form-grid :deep(.el-input-number) {
  width: 100%;
}
.agent-form :deep(.el-select) {
  width: 100%;
}

.template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 记忆模式选项卡 */
.option-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.option-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.option-card:hover {
  border-color: var(--app-border-strong);
}
.option-card.active {
  border-color: var(--app-primary);
  background: var(--app-primary-soft);
}
.option-icon {
  color: var(--app-text-secondary);
  margin-bottom: 2px;
}
.option-card.active .option-icon {
  color: var(--app-primary);
}
.option-name {
  font-size: var(--app-font-size-base);
  font-weight: 500;
  color: var(--app-text-primary);
}
.option-desc {
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}

.turns-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 14px;
}
.inline-label {
  font-size: var(--app-font-size-sm);
  font-weight: 500;
  color: var(--app-text-regular);
}
.turns-input {
  width: 140px;
}

.field-hint {
  margin-top: 6px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
  line-height: 1.5;
}

/* 工具选择卡片 */
.tool-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: var(--app-font-size-sm);
  font-weight: 500;
  color: var(--app-text-regular);
}
.tool-group-title.spaced {
  margin-top: 16px;
}
.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.tool-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.tool-card:hover {
  border-color: var(--app-border-strong);
}
.tool-card.selected {
  border-color: var(--app-primary);
  background: var(--app-primary-soft);
}
.tool-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tool-name {
  font-size: var(--app-font-size-base);
  font-weight: 500;
  color: var(--app-text-primary);
}
.tool-check {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: var(--app-bg-surface);
  color: var(--app-text-inverse);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tool-check.checked {
  border-color: var(--app-primary);
  background: var(--app-primary);
}
.tool-id {
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}
.tool-desc {
  margin-top: 2px;
  font-size: var(--app-font-size-xs);
  line-height: 1.5;
  color: var(--app-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
