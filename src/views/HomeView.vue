
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { agentApi, chatApi } from '@/api/chat'

import LoginModal from '@/components/auth/LoginModal.vue'
import CreateAgentModal from '@/components/agent/CreateAgentModal.vue'
import AppSidebar from '@/components/chat/AppSidebar.vue'
import ChatMain from '@/components/chat/ChatMain.vue'
import NewChatModal from '@/components/chat/NewChatModal.vue'

// ─── Types ───────────────────────────────────────────────────────────────────
interface User {
  id: string
  username: string
}
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

// ─── State ───────────────────────────────────────────────────────────────────
const sidebarTab = ref<'agents' | 'conversations'>('conversations')
const agents = ref<Agent[]>([])
const conversations = ref<Conversation[]>([])

const selectedAgent = ref<Agent | null>(null)
const selectedConversation = ref<Conversation | null>(null)

// ─── Auth State ──────────────────────────────────────────────────────────────
const currentUser = ref<User | null>(null)
const isLoggedIn = computed(() => !!currentUser.value)
const showLoginModal = ref(false)

// ─── Dialogs ─────────────────────────────────────────────────────────────────
const showCreateAgent = ref(false)
const showNewChat = ref(false)

// ─── Auth Methods ────────────────────────────────────────────────────────────
function handleLoginSuccess(user: User) {
  currentUser.value = user
  localStorage.setItem('agent_user_id', user.id)
  localStorage.setItem('agent_username', user.username)
  showLoginModal.value = false
  loadAgents()
  loadConversations()
}

function handleLogout() {
  currentUser.value = null
  localStorage.removeItem('agent_user_id')
  localStorage.removeItem('agent_username')
  agents.value = []
  conversations.value = []
  selectedConversation.value = null
  selectedAgent.value = null
}

function checkAuth(callback: () => void) {
  if (!isLoggedIn.value) {
    showLoginModal.value = true
  } else {
    callback()
  }
}

// ─── API calls ───────────────────────────────────────────────────────────────
async function loadAgents() {
  try {
    const res = await agentApi.getAgents()
    agents.value = res.data
  } catch (e) {
    console.error(e)
  }
}

async function loadConversations() {
  try {
    const res = await chatApi.listConversations()
    conversations.value = res.data
  } catch (e) {
    console.error(e)
  }
}

// ─── Selection & Action Handlers ─────────────────────────────────────────────
async function selectConversation(conv: Conversation) {
  selectedConversation.value = conv
  selectedAgent.value = agents.value.find(a => a.id === conv.agentId) ?? null
}

function handleAgentDeleted(id: string) {
  if (selectedAgent.value?.id === id) selectedAgent.value = null
  loadAgents()
}

function handleConversationDeleted(id: string) {
  if (selectedConversation.value?.id === id) {
    selectedConversation.value = null
  }
  loadConversations()
}

async function handleConversationCreated(conv: Conversation) {
  await loadConversations()
  await selectConversation(conv)
  sidebarTab.value = 'conversations'
}

onMounted(() => {
  const userId = localStorage.getItem('agent_user_id')
  const username = localStorage.getItem('agent_username')
  if (userId && username) {
    currentUser.value = { id: userId, username }
    loadAgents()
    loadConversations()
  }
})
</script>

<template>
  <div class="app-layout">

    <!-- ══════════════ SIDEBAR ══════════════ -->
    <AppSidebar
      :sidebarTab="sidebarTab"
      :agents="agents"
      :conversations="conversations"
      :selectedConversationId="selectedConversation?.id ?? null"
      :isLoggedIn="isLoggedIn"
      :username="currentUser?.username ?? null"
      @update:sidebarTab="sidebarTab = $event"
      @selectConversation="selectConversation"
      @conversation-deleted="handleConversationDeleted"
      @agent-deleted="handleAgentDeleted"
      @newChat="checkAuth(() => showNewChat = true)"
      @createAgent="checkAuth(() => { showCreateAgent = true; sidebarTab = 'agents' })"
      @login="showLoginModal = true"
      @logout="handleLogout"
    />

    <!-- ══════════════ MAIN CHAT AREA ══════════════ -->
    <ChatMain
      :selectedConversation="selectedConversation"
      :selectedAgent="selectedAgent"
      :isLoggedIn="isLoggedIn"
      @newChat="checkAuth(() => showNewChat = true)"
      @login="showLoginModal = true"
      @createAgent="checkAuth(() => { showCreateAgent = true; sidebarTab = 'agents' })"
    />

    <!-- ══════════════ CREATE AGENT DIALOG ══════════════ -->
    <CreateAgentModal
      v-model:show="showCreateAgent"
      @agent-created="loadAgents"
    />

    <!-- ══════════════ NEW CHAT DIALOG ══════════════ -->
    <NewChatModal
      v-model:show="showNewChat"
      :agents="agents"
      @conversation-created="handleConversationCreated"
      @goCreateAgent="showCreateAgent = true; sidebarTab = 'agents'"
    />

    <!-- ══════════════ LOGIN DIALOG ══════════════ -->
    <LoginModal
      v-model:show="showLoginModal"
      @login-success="handleLoginSuccess"
    />

  </div>
</template>

<style scoped>
/* ── Reset & Layout ─────────────────────────────────────────────────────── */
* { box-sizing: border-box; margin: 0; padding: 0; }

.app-layout {
  display: flex;
  height: 100vh;
  background: #0f0f0f;
  color: #e8e8e8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}
</style>
