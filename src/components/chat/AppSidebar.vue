<script setup lang="ts">
import { agentApi, chatApi } from '@/api/chat'

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
  sidebarTab: 'agents' | 'conversations'
  agents: Agent[]
  conversations: Conversation[]
  selectedConversationId: string | null
  isLoggedIn: boolean
  username: string | null
}>()

const emit = defineEmits<{
  (e: 'update:sidebarTab', tab: 'agents' | 'conversations'): void
  (e: 'selectConversation', conv: Conversation): void
  (e: 'conversation-deleted', id: string): void
  (e: 'agent-deleted', id: string): void
  (e: 'newChat'): void
  (e: 'createAgent'): void
  (e: 'login'): void
  (e: 'logout'): void
}>()

async function deleteAgent(id: string) {
  try {
    await agentApi.deleteAgent(id)
    emit('agent-deleted', id)
  } catch (e) {
    console.error(e)
  }
}

async function deleteConversation(id: string) {
  try {
    await chatApi.deleteConversation(id)
    emit('conversation-deleted', id)
  } catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="logo-text">🤖 AgentChat</span>
    </div>

    <!-- New Chat Button -->
    <button class="btn-new-chat" @click="emit('newChat')">
      <span class="icon">✏️</span> 新建对话
    </button>

    <!-- Tabs -->
    <div class="sidebar-tabs">
      <button
        :class="['tab', sidebarTab === 'conversations' && 'active']"
        @click="emit('update:sidebarTab', 'conversations')"
      >对话</button>
      <button
        :class="['tab', sidebarTab === 'agents' && 'active']"
        @click="emit('update:sidebarTab', 'agents')"
      >Agent</button>
    </div>

    <!-- Conversations List -->
    <div v-if="sidebarTab === 'conversations'" class="list-container">
      <div v-if="conversations.length === 0" class="empty-hint">暂无对话，点击「新建对话」开始</div>
      <div
        v-for="conv in conversations"
        :key="conv.id"
        :class="['list-item', selectedConversationId === conv.id && 'active']"
        @click="emit('selectConversation', conv)"
      >
        <span class="item-icon">💬</span>
        <span class="item-title">{{ conv.title }}</span>
        <button class="item-delete" @click.stop="deleteConversation(conv.id)" title="删除">✕</button>
      </div>
    </div>

    <!-- Agents List -->
    <div v-if="sidebarTab === 'agents'" class="list-container">
      <button class="btn-create-agent" @click="emit('createAgent')">+ 创建 Agent</button>
      <div v-if="agents.length === 0" class="empty-hint">暂无 Agent</div>
      <div
        v-for="agent in agents"
        :key="agent.id"
        class="list-item agent-item"
      >
        <span class="item-icon">🧠</span>
        <div class="agent-info">
          <span class="item-title">{{ agent.name }}</span>
          <span class="agent-model">{{ agent.model }}</span>
        </div>
        <button class="item-delete" @click.stop="deleteAgent(agent.id)" title="删除">✕</button>
      </div>
    </div>

    <!-- User Card -->
    <div class="sidebar-user">
      <div v-if="isLoggedIn" class="user-card">
        <div class="user-avatar">👤</div>
        <div class="user-info">
          <div class="username">{{ username }}</div>
          <div class="logout-link" @click="emit('logout')">退出登录</div>
        </div>
      </div>
      <button v-else class="btn-login-trigger" @click="emit('login')">
        登录以同步数据
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  background: #161616;
  border-right: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 20px 16px 12px;
  border-bottom: 1px solid #2a2a2a;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.3px;
}

.btn-new-chat {
  margin: 12px 12px 8px;
  padding: 10px 14px;
  background: #4d6bfe;
  color: #fff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.2s;
}
.btn-new-chat:hover { background: #3a56e8; }

.sidebar-tabs {
  display: flex;
  padding: 0 12px;
  gap: 4px;
  margin-bottom: 8px;
}
.tab {
  flex: 1;
  padding: 7px 0;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #888;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.tab.active {
  background: #252525;
  color: #fff;
  font-weight: 500;
}
.tab:hover:not(.active) { color: #ccc; }

.list-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}
.list-container::-webkit-scrollbar { width: 4px; }
.list-container::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

.empty-hint {
  color: #555;
  font-size: 13px;
  text-align: center;
  padding: 24px 12px;
  line-height: 1.6;
}
.empty-hint a { color: #4d6bfe; text-decoration: none; }

.btn-create-agent {
  width: 100%;
  padding: 9px;
  background: transparent;
  border: 1px dashed #333;
  border-radius: 8px;
  color: #888;
  font-size: 13px;
  cursor: pointer;
  margin-bottom: 8px;
  transition: all 0.2s;
}
.btn-create-agent:hover { border-color: #4d6bfe; color: #4d6bfe; }

.list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
  margin-bottom: 2px;
}
.list-item:hover { background: #1f1f1f; }
.list-item.active { background: #252535; }

.item-icon { font-size: 15px; flex-shrink: 0; }
.item-title {
  flex: 1;
  font-size: 13px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-item.active .item-title { color: #fff; }

.item-delete {
  display: none;
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
}
.list-item:hover .item-delete { display: block; }
.item-delete:hover { color: #ff5555; background: #2a1a1a; }

.agent-item { align-items: flex-start; }
.agent-info { flex: 1; overflow: hidden; }
.agent-model { font-size: 11px; color: #555; margin-top: 2px; }

/* User Card */
.sidebar-user {
  padding: 16px;
  border-top: 1px solid #2a2a2a;
  background: #161616;
}
.user-card {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-avatar {
  width: 36px;
  height: 36px;
  background: #4d6bfe;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.user-info { flex: 1; }
.username {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}
.logout-link {
  font-size: 12px;
  color: #666;
  cursor: pointer;
  margin-top: 2px;
  transition: color 0.2s;
}
.logout-link:hover { color: #ff5555; }
.btn-login-trigger {
  width: 100%;
  padding: 10px;
  background: #252525;
  border: 1px solid #333;
  border-radius: 8px;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-login-trigger:hover { background: #333; color: #fff; }
</style>
