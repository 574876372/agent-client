<script setup lang="ts">
import { ref } from 'vue'
import { chatApi } from '@/api/chat'

interface Agent {
  id: string
  name: string
  description: string
  model: string
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

async function startNewChat() {
  if (!selectedAgentId.value) return
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
  }
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('update:show', false)">
    <div class="modal">
      <div class="modal-header">
        <h2>新建对话</h2>
        <button class="modal-close" @click="emit('update:show', false)">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>选择 Agent <span class="required">*</span></label>
          <div v-if="agents.length === 0" class="empty-hint" style="margin-top:8px">
            还没有 Agent，请先
            <a href="#" @click.prevent="emit('update:show', false); emit('goCreateAgent')">创建一个</a>
          </div>
          <div v-else class="agent-select-list">
            <div
              v-for="agent in agents"
              :key="agent.id"
              :class="['agent-select-item', selectedAgentId === agent.id && 'selected']"
              @click="selectedAgentId = agent.id"
            >
              <span class="agent-select-icon">🧠</span>
              <div>
                <div class="agent-select-name">{{ agent.name }}</div>
                <div class="agent-select-desc">{{ agent.description || agent.model }}</div>
              </div>
              <span v-if="selectedAgentId === agent.id" class="check">✓</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" @click="emit('update:show', false)">取消</button>
        <button class="btn-primary" :disabled="!selectedAgentId" @click="startNewChat">开始对话</button>
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
  width: 480px;
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
.empty-hint {
  color: #555;
  font-size: 13px;
  line-height: 1.6;
}
.empty-hint a { color: #4d6bfe; text-decoration: none; }
.agent-select-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.agent-select-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #252525;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.agent-select-item:hover { border-color: #4d6bfe; background: #151525; }
.agent-select-item.selected { border-color: #4d6bfe; background: #151525; }
.agent-select-icon { font-size: 20px; }
.agent-select-name { font-size: 14px; color: #fff; font-weight: 500; }
.agent-select-desc { font-size: 12px; color: #555; margin-top: 2px; }
.check { margin-left: auto; color: #4d6bfe; font-weight: 700; font-size: 16px; }
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
