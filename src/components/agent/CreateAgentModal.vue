<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { agentApi } from '@/api/chat'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'agent-created'): void
}>()

interface ToolInfo {
  toolName: string
  displayName: string
  description: string
  icon: string
  category: string
  enabled: boolean
}

const modelProviders = ref<{ type: string; models: string[] }[]>([])
const availableTools = ref<ToolInfo[]>([])
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
  customTurns: 10
})

const promptTemplates = [
  { name: '自定义', prompt: '' },
  { name: '翻译官', prompt: '你是一个专业的翻译官，能够精准地将用户输入的文本翻译成多种语言，并提供相关的语言建议。' },
  { name: '代码专家', prompt: '你是一个资深的软件工程师，擅长编写高质量、可维护的代码，并能对代码进行深度审计和优化。' },
  { name: '心理医生', prompt: '你是一个温暖、耐心的心理医生，能够倾听用户的烦恼，并提供专业、科学的心理疏导和建议。' }
]

const memoryModes = [
  {
    value: 'FULL',
    icon: '📜',
    name: '全量记忆',
    desc: '加载全部历史，不压缩'
  },
  {
    value: 'WINDOW',
    icon: '🪟',
    name: '滑动窗口',
    desc: '仅保留最近 N 轮'
  },
  {
    value: 'SUMMARY',
    icon: '✨',
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
    if (modelProviders.value.length > 0) {
      newAgent.modelType = modelProviders.value[0].type
      newAgent.modelName = modelProviders.value[0].models[0]
    }
  } catch (e) {
    console.error('加载模型列表失败:', e)
  }
}

async function loadAvailableTools() {
  try {
    const res = await agentApi.getTools()
    availableTools.value = res.data || []
    // 默认全选所有可用工具
    newAgent.toolNames = availableTools.value.map(t => t.toolName)
  } catch (e) {
    console.error('加载工具列表失败:', e)
  }
}

async function createAgent() {
  if (!newAgent.name.trim()) return
  try {
    await agentApi.createAgent({
      name: newAgent.name,
      description: newAgent.description,
      modelType: newAgent.modelType,
      modelName: newAgent.modelName,
      systemPrompt: newAgent.systemPrompt,
      toolNames: newAgent.toolNames,
      memoryMode: newAgent.memoryMode,
      maxTurns: newAgent.memoryMode === 'FULL' ? null : (newAgent.useCustomTurns ? newAgent.customTurns : null)
    })
    emit('agent-created')
    emit('update:show', false)
    // 重置表单
    Object.assign(newAgent, {
      name: '',
      description: '',
      modelType: modelProviders.value[0]?.type || '',
      modelName: modelProviders.value[0]?.models[0] || '',
      systemPrompt: '',
      toolNames: availableTools.value.map(t => t.toolName),
      memoryMode: 'SUMMARY',
      maxTurns: null,
      useCustomTurns: false,
      customTurns: 10
    })
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  loadModelProviders()
  loadAvailableTools()
})
</script>


<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click.self="emit('update:show', false)">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title-wrapper">
            <span class="modal-title-icon">🤖</span>
            <h2>创建 AI Agent</h2>
          </div>
          <button class="modal-close" @click="emit('update:show', false)">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <!-- 1. 基础信息 Section -->
          <div class="form-section">
            <div class="section-title">基本信息</div>
            <div class="form-row">
              <div class="form-group flex-1">
                <label>名称 <span class="required">*</span></label>
                <input
                  :value="newAgent.name"
                  @input="update('name', ($event.target as HTMLInputElement).value)"
                  placeholder="给 Agent 起个响亮的名字"
                  class="form-input"
                />
              </div>
              <div class="form-group flex-1">
                <label>描述</label>
                <input
                  :value="newAgent.description"
                  @input="update('description', ($event.target as HTMLInputElement).value)"
                  placeholder="一句话介绍它的定位"
                  class="form-input"
                />
              </div>
            </div>
          </div>

          <!-- 2. 模型配置 Section -->
          <div class="form-section">
            <div class="section-title">基座模型</div>
            <div class="form-row">
              <div class="form-group flex-1">
                <label>厂商厂商 <span class="required">*</span></label>
                <div class="select-wrapper">
                  <select
                    :value="newAgent.modelType"
                    @change="onModelTypeChange(($event.target as HTMLSelectElement).value)"
                    class="form-input"
                  >
                    <option v-for="p in modelProviders" :key="p.type" :value="p.type">{{ p.type }}</option>
                  </select>
                </div>
              </div>
              <div class="form-group flex-1">
                <label>选择模型 <span class="required">*</span></label>
                <div class="select-wrapper">
                  <select
                    :value="newAgent.modelName"
                    @change="update('modelName', ($event.target as HTMLSelectElement).value)"
                    class="form-input"
                  >
                    <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. 人设设定 Section -->
          <div class="form-section">
            <div class="section-title">提示词与设定</div>
            <div class="form-group">
              <label>快捷模板</label>
              <div class="template-tags">
                <span
                  v-for="t in promptTemplates"
                  :key="t.name"
                  :class="['tag', { active: newAgent.systemPrompt === t.prompt }]"
                  @click="applyTemplate(t.prompt)"
                >
                  {{ t.name }}
                </span>
              </div>
            </div>

            <div class="form-group">
              <label>系统提示词 (System Prompt)</label>
              <textarea
                :value="newAgent.systemPrompt"
                @input="update('systemPrompt', ($event.target as HTMLTextAreaElement).value)"
                placeholder="在此设定 Agent 的角色扮演、工作流程、回复风格或强制约束。设置优秀的提示词，能大大提高 Agent 的输出表现。"
                class="form-input form-textarea"
                rows="4"
              ></textarea>
            </div>
          </div>

          <!-- 4. 记忆设定 Section -->
          <div class="form-section">
            <div class="section-title">记忆机制</div>
            <div class="form-group">
              <div class="memory-mode-grid">
                <div
                  v-for="mode in memoryModes"
                  :key="mode.value"
                  :class="['memory-mode-card', { active: newAgent.memoryMode === mode.value }]"
                  @click="newAgent.memoryMode = mode.value as 'FULL' | 'WINDOW' | 'SUMMARY'"
                >
                  <div class="memory-mode-icon">{{ mode.icon }}</div>
                  <div class="memory-mode-name">{{ mode.name }}</div>
                  <div class="memory-mode-desc">{{ mode.desc }}</div>
                  <div class="memory-mode-indicator" v-if="newAgent.memoryMode === mode.value">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- FULL 模式警告 -->
              <div v-if="newAgent.memoryMode === 'FULL'" class="memory-warning">
                <span class="warning-icon">⚠️</span>
                <div class="warning-text">
                  <strong>全量模式已启用</strong>：历史消息会不做筛选全量发送。当对话较长时会消耗大量 Token 甚至导致上下文超出限制。
                </div>
              </div>

              <!-- 窗口轮数设置 -->
              <div v-if="newAgent.memoryMode !== 'FULL'" class="turns-config">
                <div class="turns-config-header">
                  <span class="turns-label">上下文保留深度</span>
                  <div class="turns-options">
                    <label class="turns-radio">
                      <input type="radio" :value="false" v-model="newAgent.useCustomTurns" />
                      <span class="radio-custom"></span>
                      <span>默认 (10 轮)</span>
                    </label>
                    <label class="turns-radio">
                      <input type="radio" :value="true" v-model="newAgent.useCustomTurns" />
                      <span class="radio-custom"></span>
                      <span>自定义</span>
                    </label>
                  </div>
                </div>

                <Transition name="slide-fade">
                  <div v-if="newAgent.useCustomTurns" class="turns-quick-wrapper">
                    <div class="turns-quick">
                      <button
                        v-for="n in [5, 10, 20, 50]"
                        :key="n"
                        type="button"
                        :class="['turns-btn', { active: newAgent.customTurns === n }]"
                        @click="newAgent.customTurns = n"
                      >{{ n }} 轮</button>
                      <div class="turns-input-wrapper">
                        <input
                          type="number"
                          v-model.number="newAgent.customTurns"
                          min="1" max="200"
                          class="turns-input"
                        />
                        <span class="turns-unit">轮</span>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </div>

          <!-- 5. 工具箱 Section -->
          <div class="form-section border-none" v-if="availableTools.length > 0">
            <div class="section-title">插件工具库</div>
            <p class="tool-hint">为 Agent 注入外接组件功能，使其拥有执行计算、信息查询、网络搜索等主动技能。</p>
            <div class="tool-grid">
              <div
                v-for="tool in availableTools"
                :key="tool.toolName"
                :class="['tool-card', { selected: isToolSelected(tool.toolName) }]"
                @click="toggleTool(tool.toolName)"
              >
                <div class="tool-card-header">
                  <span class="tool-icon">{{ tool.icon }}</span>
                  <div :class="['custom-checkbox', { checked: isToolSelected(tool.toolName) }]">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                </div>
                <div class="tool-card-name">{{ tool.displayName }}</div>
                <div class="tool-card-id">{{ tool.toolName }}</div>
                <div class="tool-card-desc">{{ tool.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="emit('update:show', false)">取消</button>
          <button
            class="btn-primary"
            :disabled="!newAgent.name.trim() || !newAgent.modelName.trim()"
            @click="createAgent"
          >
            创建 Agent
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── Vue Transition 动画 ────────────────────────────────── */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.28s ease-out;
}

.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.28s ease-out;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 80px;
  overflow: hidden;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-8px);
  opacity: 0;
  max-height: 0;
}

/* ── 遮罩与弹窗 ────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 8, 10, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.modal {
  background: #141417;
  border: 1px solid #232329;
  border-radius: 20px;
  width: 640px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
}

/* ── 头部与标题 ────────────────────────────────────────── */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #1e1e24;
}

.modal-title-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title-icon {
  font-size: 20px;
}

.modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #f4f4f7;
  margin: 0;
}

.modal-close {
  background: transparent;
  border: none;
  color: #71717a;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.modal-close:hover {
  color: #fff;
  background: #232329;
}

/* ── 内容体 ────────────────────────────────────────────── */
.modal-body {
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 滚动条美化 */
.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.modal-body::-webkit-scrollbar-thumb {
  background: #2a2a32;
  border-radius: 4px;
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: #363640;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #1e1e24;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* ── 表单排版 ─────────────────────────────────────────── */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-bottom: 1px solid #1c1c21;
  padding-bottom: 20px;
}

.border-none {
  border-bottom: none;
  padding-bottom: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  color: #888899;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  position: relative;
  display: flex;
  align-items: center;
}

.form-row {
  display: flex;
  gap: 16px;
}

.flex-1 {
  flex: 1;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 13px;
  color: #a1a1aa;
  font-weight: 500;
}

.required {
  color: #ef4444;
  margin-left: 2px;
}

/* 输入框 & 选择框 */
.form-input {
  background: #0d0d0f;
  border: 1px solid #232329;
  border-radius: 10px;
  color: #e4e4e7;
  font-size: 14px;
  padding: 10px 14px;
  outline: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  width: 100%;
}

.form-input::placeholder {
  color: #52525b;
}

.form-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16);
  background: #101014;
}

.form-textarea {
  resize: vertical;
  min-height: 90px;
  line-height: 1.5;
}

/* 下拉菜单包裹层（加自定义箭头） */
.select-wrapper {
  position: relative;
  width: 100%;
}

.select-wrapper select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding-right: 36px;
  cursor: pointer;
}

.select-wrapper::after {
  content: "";
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-20%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #71717a;
  pointer-events: none;
  transition: border-color 0.2s;
}

.select-wrapper:hover::after {
  border-top-color: #a1a1aa;
}

/* ── 提示词快捷模板标签 ─────────────────────────────── */
.template-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.tag {
  padding: 6px 14px;
  background: #1b1b22;
  border: 1px solid #25252e;
  border-radius: 20px;
  font-size: 12px;
  color: #a1a1aa;
  cursor: pointer;
  transition: all 0.22s ease;
}

.tag:hover {
  border-color: #6366f1;
  color: #818cf8;
  background: rgba(99, 102, 241, 0.05);
}

.tag.active {
  border-color: #6366f1;
  color: #e0e7ff;
  background: rgba(99, 102, 241, 0.12);
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.05);
}

/* ── 记忆模式选择卡片 ───────────────────────────────── */
.memory-mode-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.memory-mode-card {
  position: relative;
  background: #0d0d0f;
  border: 1px solid #232329;
  border-radius: 14px;
  padding: 16px 12px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.memory-mode-card:hover {
  border-color: #3f3f46;
  background: #141419;
  transform: translateY(-2px);
}

.memory-mode-card.active {
  border-color: #6366f1;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(79, 70, 229, 0.04) 100%);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.08), 0 0 0 1px rgba(99, 102, 241, 0.15) inset;
}

.memory-mode-icon {
  font-size: 26px;
  margin-bottom: 8px;
  transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.memory-mode-card:hover .memory-mode-icon {
  transform: scale(1.1);
}

.memory-mode-name {
  font-size: 13px;
  font-weight: 600;
  color: #e4e4e7;
}

.memory-mode-desc {
  font-size: 11px;
  color: #71717a;
  margin-top: 4px;
  line-height: 1.4;
}

.memory-mode-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #6366f1;
  color: #fff;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 5px rgba(99, 102, 241, 0.4);
}

/* 记忆模式警告提示 */
.memory-warning {
  margin-top: 12px;
  padding: 12px 16px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.16);
  border-radius: 12px;
  font-size: 12.5px;
  color: #f59e0b;
  line-height: 1.5;
  display: flex;
  gap: 8px;
}

.warning-icon {
  font-size: 16px;
  flex-shrink: 0;
}

/* ── 记忆轮数设置 ───────────────────────────────────── */
.turns-config {
  margin-top: 12px;
  padding: 16px;
  background: #0d0d0f;
  border: 1px solid #232329;
  border-radius: 12px;
}

.turns-config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.turns-label {
  font-size: 13px;
  color: #a1a1aa;
  font-weight: 500;
}

.turns-options {
  display: flex;
  gap: 16px;
}

.turns-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #71717a;
  cursor: pointer;
  user-select: none;
}

.turns-radio input[type="radio"] {
  display: none;
}

.radio-custom {
  width: 16px;
  height: 16px;
  border: 1.5px solid #3f3f46;
  border-radius: 50%;
  display: inline-block;
  position: relative;
  background: #141417;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.turns-radio input[type="radio"]:checked + .radio-custom {
  border-color: #6366f1;
  background: #6366f1;
}

.turns-radio input[type="radio"]:checked + .radio-custom::after {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.turns-radio:hover .radio-custom {
  border-color: #52525b;
}

.turns-radio input[type="radio"]:checked:hover + .radio-custom {
  border-color: #4f46e5;
  background: #4f46e5;
}

.turns-quick-wrapper {
  margin-top: 14px;
}

.turns-quick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.turns-btn {
  padding: 6px 12px;
  background: #1b1b22;
  border: 1px solid #25252e;
  border-radius: 8px;
  font-size: 12px;
  color: #a1a1aa;
  cursor: pointer;
  transition: all 0.2s;
}

.turns-btn:hover {
  border-color: #3f3f46;
  color: #fff;
}

.turns-btn.active {
  border-color: #6366f1;
  color: #e0e7ff;
  background: rgba(99, 102, 241, 0.12);
}

.turns-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.turns-input {
  width: 80px;
  padding: 6px 24px 6px 10px;
  background: #08080a;
  border: 1px solid #232329;
  border-radius: 8px;
  color: #e4e4e7;
  font-size: 13px;
  outline: none;
  text-align: center;
}

.turns-input:focus {
  border-color: #6366f1;
}

.turns-unit {
  position: absolute;
  right: 10px;
  font-size: 12px;
  color: #52525b;
  pointer-events: none;
}

/* ── 插件工具选择 ───────────────────────────────────── */
.tool-hint {
  font-size: 12.5px;
  color: #71717a;
  margin: -4px 0 2px 0;
  line-height: 1.5;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
  margin-top: 4px;
}

.tool-card {
  background: #0d0d0f;
  border: 1px solid #232329;
  border-radius: 14px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-card:hover {
  border-color: #3f3f46;
  background: #141419;
  transform: translateY(-2px);
}

.tool-card.selected {
  border-color: #6366f1;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(79, 70, 229, 0.04) 100%);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.08), 0 0 0 1px rgba(99, 102, 241, 0.15) inset;
}

.tool-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.tool-icon {
  font-size: 24px;
  transition: transform 0.25s;
}

.tool-card:hover .tool-icon {
  transform: scale(1.15);
}

/* 自定义复选框 */
.custom-checkbox {
  width: 16px;
  height: 16px;
  border: 1.5px solid #3f3f46;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #141417;
  color: #fff;
  transition: all 0.2s;
}

.tool-card:hover .custom-checkbox {
  border-color: #52525b;
}

.custom-checkbox.checked {
  border-color: #6366f1;
  background: #6366f1;
}

.custom-checkbox svg {
  opacity: 0;
  transition: opacity 0.15s;
}

.custom-checkbox.checked svg {
  opacity: 1;
}

.tool-card-name {
  font-size: 13px;
  font-weight: 600;
  color: #e4e4e7;
}

.tool-card-id {
  font-size: 10px;
  color: #52525b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.tool-card-desc {
  font-size: 11px;
  color: #71717a;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── 底部操作按钮 ────────────────────────────────────── */
.btn-primary {
  padding: 10px 24px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.3);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-primary:disabled {
  background: #232329;
  color: #52525b;
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-secondary {
  padding: 10px 24px;
  background: transparent;
  color: #a1a1aa;
  border: 1px solid #232329;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  border-color: #3f3f46;
  color: #fff;
  background: #18181c;
}
</style>

