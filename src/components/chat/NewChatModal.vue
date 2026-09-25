<script setup lang="ts">
import { ref } from 'vue'
import { Bot, Check } from 'lucide-vue-next'
import { chatApi } from '@/api/chat'

interface Agent {
  id: string
  name: string
  description: string
  model?: string
  modelType?: string
  modelName?: string
  systemPrompt: string
}

interface Conversation {
  id: string
  agentId: string
  title: string
  createdAt: string
}

const props = defineProps<{
  show: boolean
  agents: Agent[]
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'conversation-created', conv: Conversation): void
  (e: 'goCreateAgent'): void
}>()

const selectedAgentId = ref('')
const creating = ref(false)

async function startNewChat() {
  if (!selectedAgentId.value) return
  creating.value = true
  try {
    const agent = props.agents.find(a => a.id === selectedAgentId.value)
    const res = await chatApi.createConversation({
      agentId: selectedAgentId.value,
      title: `与 ${agent?.name ?? 'Agent'} 的对话`
    })
    emit('conversation-created', res.data)
    emit('update:show', false)
    selectedAgentId.value = ''
  } catch (e) {
    console.error(e)
  } finally {
    creating.value = false
  }
}

function goCreateAgent() {
  emit('update:show', false)
  emit('goCreateAgent')
}
</script>

<template>
  <el-dialog
    :model-value="show"
    title="新建对话"
    width="480px"
    align-center
    @update:model-value="emit('update:show', $event)"
  >
    <div class="field-label">选择智能体</div>
    <el-empty v-if="agents.length === 0" description="还没有智能体" :image-size="64">
      <el-button type="primary" @click="goCreateAgent">创建智能体</el-button>
    </el-empty>
    <div v-else class="agent-list" role="radiogroup" aria-label="选择智能体">
      <button
        v-for="agent in agents"
        :key="agent.id"
        type="button"
        role="radio"
        :aria-checked="selectedAgentId === agent.id"
        :class="['agent-option', { selected: selectedAgentId === agent.id }]"
        @click="selectedAgentId = agent.id"
      >
        <span class="agent-avatar" aria-hidden="true"><Bot :size="16" :stroke-width="1.75" /></span>
        <span class="agent-text">
          <span class="agent-name">{{ agent.name }}</span>
          <span class="agent-desc">{{ agent.description || agent.modelName || agent.model }}</span>
        </span>
        <Check v-if="selectedAgentId === agent.id" class="agent-check" :size="16" :stroke-width="2" />
      </button>
    </div>
    <template #footer>
      <el-button @click="emit('update:show', false)">取消</el-button>
      <el-button type="primary" :disabled="!selectedAgentId" :loading="creating" @click="startNewChat">开始对话</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.field-label {
  margin-bottom: 8px;
  font-size: var(--app-font-size-sm);
  font-weight: 500;
  color: var(--app-text-regular);
}
.agent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}
.agent-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.agent-option:hover {
  border-color: var(--app-border-strong);
}
.agent-option.selected {
  border-color: var(--app-primary);
  background: var(--app-primary-soft);
}
.agent-avatar {
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
.agent-option.selected .agent-avatar {
  background: var(--app-bg-surface);
  color: var(--app-primary);
}
.agent-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.agent-name {
  font-size: var(--app-font-size-base);
  font-weight: 500;
  color: var(--app-text-primary);
}
.agent-desc {
  margin-top: 2px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-check {
  flex-shrink: 0;
  color: var(--app-primary);
}
</style>
