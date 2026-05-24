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
  toolNames: [] as string[]
})

const promptTemplates = [
  { name: '自定义', prompt: '' },
  { name: '翻译官', prompt: '你是一个专业的翻译官，能够精准地将用户输入的文本翻译成多种语言，并提供相关的语言建议。' },
  { name: '代码专家', prompt: '你是一个资深的软件工程师，擅长编写高质量、可维护的代码，并能对代码进行深度审计和优化。' },
  { name: '心理医生', prompt: '你是一个温暖、耐心的心理医生，能够倾听用户的烦恼，并提供专业、科学的心理疏导和建议。' }
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
      toolNames: newAgent.toolNames
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
      toolNames: availableTools.value.map(t => t.toolName)
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
  <div v-if="show" class="modal-overlay" @click.self="emit('update:show', false)">
    <div class="modal">
      <div class="modal-header">
        <h2>创建 Agent</h2>
        <button class="modal-close" @click="emit('update:show', false)">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>名称 <span class="required">*</span></label>
          <input :value="newAgent.name" @input="update('name', ($event.target as HTMLInputElement).value)" placeholder="给 Agent 起个名字" class="form-input" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <input :value="newAgent.description" @input="update('description', ($event.target as HTMLInputElement).value)" placeholder="简单描述 Agent 的用途" class="form-input" />
        </div>
        <div class="form-group">
          <label>模型厂商 <span class="required">*</span></label>
          <select :value="newAgent.modelType" @change="onModelTypeChange(($event.target as HTMLSelectElement).value)" class="form-input">
            <option v-for="p in modelProviders" :key="p.type" :value="p.type">{{ p.type }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>模型名称 <span class="required">*</span></label>
          <select :value="newAgent.modelName" @change="update('modelName', ($event.target as HTMLSelectElement).value)" class="form-input">
            <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>提示词模板</label>
          <div class="template-tags">
            <span
              v-for="t in promptTemplates"
              :key="t.name"
              class="tag"
              @click="applyTemplate(t.prompt)"
            >
              {{ t.name }}
            </span>
          </div>
        </div>

        <div class="form-group">
          <label>系统提示词</label>
          <textarea
            :value="newAgent.systemPrompt"
            @input="update('systemPrompt', ($event.target as HTMLTextAreaElement).value)"
            placeholder="设定 Agent 的角色 and 行为..."
            class="form-input form-textarea"
            rows="4"
          ></textarea>
        </div>

        <!-- 工具选择区域 -->
        <div class="form-group" v-if="availableTools.length > 0">
          <label>🛠️ 工具选择</label>
          <p class="tool-hint">为此 Agent 分配可调用的工具能力</p>
          <div class="tool-grid">
            <div
              v-for="tool in availableTools"
              :key="tool.toolName"
              :class="['tool-card', { selected: isToolSelected(tool.toolName) }]"
              @click="toggleTool(tool.toolName)"
            >
              <div class="tool-card-header">
                <span class="tool-icon">{{ tool.icon }}</span>
                <span class="tool-check">
                  <svg v-if="isToolSelected(tool.toolName)" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor" opacity="0.3">
                    <path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                </span>
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
        >创建</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}
.modal {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  width: 540px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #252525;
}
.modal-header h2 { font-size: 16px; font-weight: 600; color: #fff; }
.modal-close {
  background: transparent;
  border: none;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.modal-close:hover { color: #fff; background: #2a2a2a; }
.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #252525;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 13px; color: #aaa; font-weight: 500; }
.required { color: #ff5555; }
.form-input {
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 14px;
  padding: 9px 12px;
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;
  width: 100%;
}
.form-input:focus { border-color: #4d6bfe; }
.form-textarea { resize: vertical; min-height: 90px; }
.template-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.tag {
  padding: 4px 10px;
  background: #252525;
  border: 1px solid #333;
  border-radius: 6px;
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
  transition: all 0.2s;
}
.tag:hover { border-color: #4d6bfe; color: #4d6bfe; background: #1a1a2e; }

/* ── 工具选择区域 ────────────────────────────────────── */
.tool-hint {
  font-size: 12px;
  color: #555;
  margin: 0;
}
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-top: 4px;
}
.tool-card {
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-card:hover {
  border-color: #444;
  background: #161616;
  transform: translateY(-1px);
}
.tool-card.selected {
  border-color: #4d6bfe;
  background: rgba(77, 107, 254, 0.08);
  box-shadow: 0 0 0 1px rgba(77, 107, 254, 0.15), 0 4px 16px rgba(77, 107, 254, 0.08);
}
.tool-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tool-icon {
  font-size: 22px;
}
.tool-check {
  color: #4d6bfe;
  display: flex;
  align-items: center;
}
.tool-card-name {
  font-size: 13px;
  font-weight: 600;
  color: #e0e0e0;
  margin-top: 2px;
}
.tool-card-id {
  font-size: 11px;
  color: #555;
  font-family: 'Fira Code', monospace;
}
.tool-card-desc {
  font-size: 11px;
  color: #777;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.btn-primary {
  padding: 9px 20px;
  background: #4d6bfe;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover:not(:disabled) { background: #3a56e8; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-secondary {
  padding: 9px 20px;
  background: transparent;
  color: #aaa;
  border: 1px solid #333;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-secondary:hover { border-color: #555; color: #fff; }
</style>
