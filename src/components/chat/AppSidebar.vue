<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Plus, Search, Trash2, Bot, MessageSquare, Pencil } from 'lucide-vue-next'
import { agentApi, chatApi } from '@/api/chat'

/**
 * 工作台左侧面板：对话列表 / 智能体列表（页签由路由决定），支持本地搜索过滤。
 */

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
  sidebarTab: 'agents' | 'conversations'
  agents: Agent[]
  conversations: Conversation[]
  selectedConversationId: string | null
  isLoggedIn: boolean
}>()

const emit = defineEmits<{
  (e: 'update:sidebarTab', tab: 'agents' | 'conversations'): void
  (e: 'selectConversation', conv: Conversation): void
  (e: 'conversation-deleted', id: string): void
  (e: 'agent-deleted', id: string): void
  (e: 'editAgent', agent: Agent): void
  (e: 'newChat'): void
  (e: 'createAgent'): void
}>()

const keyword = ref('')

const agentById = computed(() => new Map(props.agents.map(a => [a.id, a])))

const filteredConversations = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return k ? props.conversations.filter(c => c.title.toLowerCase().includes(k)) : props.conversations
})

const filteredAgents = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return k ? props.agents.filter(a => a.name.toLowerCase().includes(k)) : props.agents
})

async function deleteAgent(agent: Agent) {
  try {
    await ElMessageBox.confirm(`确认删除智能体「${agent.name}」？与它的全部对话也会一并删除。`, '删除智能体', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await agentApi.deleteAgent(agent.id)
    emit('agent-deleted', agent.id)
  } catch (e) {
    console.error(e)
  }
}

async function deleteConversation(conv: Conversation) {
  try {
    await ElMessageBox.confirm(`确认删除对话「${conv.title}」？删除后历史消息不可恢复。`, '删除对话', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await chatApi.deleteConversation(conv.id)
    emit('conversation-deleted', conv.id)
  } catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <aside class="panel" :aria-label="sidebarTab === 'conversations' ? '对话列表' : '智能体列表'">
    <div class="panel-header">
      <el-segmented
        :model-value="sidebarTab"
        :options="[
          { label: '对话', value: 'conversations' },
          { label: '智能体', value: 'agents' },
        ]"
        size="small"
        @change="(v: any) => emit('update:sidebarTab', v)"
      />
      <el-button
        v-if="sidebarTab === 'conversations'"
        type="primary"
        size="small"
        @click="emit('newChat')"
      >
        <Plus :size="14" :stroke-width="2" /><span class="btn-label">新建</span>
      </el-button>
      <el-button v-else type="primary" size="small" @click="emit('createAgent')">
        <Plus :size="14" :stroke-width="2" /><span class="btn-label">创建</span>
      </el-button>
    </div>

    <div class="panel-search">
      <el-input
        v-model="keyword"
        :placeholder="sidebarTab === 'conversations' ? '搜索对话' : '搜索智能体'"
        clearable
        aria-label="搜索"
      >
        <template #prefix><Search :size="16" :stroke-width="1.75" /></template>
      </el-input>
    </div>

    <div class="panel-list">
      <!-- 未登录 -->
      <div v-if="!isLoggedIn" class="panel-empty">登录后查看你的对话与智能体</div>

      <!-- 对话列表 -->
      <template v-else-if="sidebarTab === 'conversations'">
        <div v-if="filteredConversations.length === 0" class="panel-empty">
          {{ keyword ? '没有匹配的对话' : '暂无对话，点击「新建」开始' }}
        </div>
        <div
          v-for="conv in filteredConversations"
          :key="conv.id"
          :class="['list-item', { active: selectedConversationId === conv.id }]"
          role="button"
          tabindex="0"
          @click="emit('selectConversation', conv)"
          @keydown.enter="emit('selectConversation', conv)"
        >
          <MessageSquare class="item-icon" :size="16" :stroke-width="1.75" />
          <div class="item-text">
            <div class="item-title">{{ conv.title }}</div>
            <div v-if="agentById.get(conv.agentId)" class="item-sub">
              {{ agentById.get(conv.agentId)?.name }} · {{ agentById.get(conv.agentId)?.model }}
            </div>
          </div>
          <button type="button" class="item-delete" aria-label="删除对话" @click.stop="deleteConversation(conv)">
            <Trash2 :size="15" :stroke-width="1.75" />
          </button>
        </div>
      </template>

      <!-- 智能体列表 -->
      <template v-else>
        <div v-if="filteredAgents.length === 0" class="panel-empty">
          {{ keyword ? '没有匹配的智能体' : '暂无智能体，点击「创建」开始' }}
        </div>
        <div v-for="agent in filteredAgents" :key="agent.id" class="list-item agent-item">
          <div class="agent-avatar" aria-hidden="true"><Bot :size="16" :stroke-width="1.75" /></div>
          <div class="item-text">
            <div class="item-title">{{ agent.name }}</div>
            <div class="item-sub">{{ [agent.modelType, agent.modelName || agent.model].filter(Boolean).join(" · ") }}</div>
          </div>
          <button type="button" class="item-delete item-edit" aria-label="编辑智能体" @click.stop="emit('editAgent', agent)">
            <Pencil :size="15" :stroke-width="1.75" />
          </button>
          <button type="button" class="item-delete" aria-label="删除智能体" @click.stop="deleteAgent(agent)">
            <Trash2 :size="15" :stroke-width="1.75" />
          </button>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  width: var(--app-panel-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--app-bg-surface);
  border-right: 1px solid var(--app-border);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 16px 12px;
}
.panel-header .el-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.panel-search {
  padding: 0 16px 12px;
}

.panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 12px;
}

.panel-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: var(--app-font-size-sm);
  color: var(--app-text-tertiary);
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 2px;
  border-radius: var(--app-radius);
  cursor: pointer;
  outline: none;
}
.list-item:hover,
.list-item:focus-visible {
  background: var(--app-bg-hover);
}
.list-item.active {
  background: var(--app-primary-soft);
}
.list-item.active .item-icon {
  color: var(--app-primary);
}
.agent-item {
  cursor: default;
}

.item-icon {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}
.agent-avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: var(--app-radius);
  background: var(--app-bg-muted);
  color: var(--app-text-regular);
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-text {
  flex: 1;
  min-width: 0;
}
.item-title {
  font-size: var(--app-font-size-base);
  color: var(--app-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-item.active .item-title {
  font-weight: 500;
}
.item-sub {
  margin-top: 2px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-delete {
  visibility: hidden;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: var(--app-radius-sm);
  color: var(--app-text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.list-item:hover .item-delete,
.list-item:focus-within .item-delete {
  visibility: visible;
}
.item-delete:hover {
  color: var(--app-danger);
  background: var(--app-danger-soft);
}
.item-edit:hover {
  color: var(--app-primary);
  background: var(--app-primary-soft);
}
</style>
