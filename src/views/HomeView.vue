<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { agentApi, chatApi } from '@/api/chat'
import { useUserStore } from '@/stores/user'

import CreateAgentModal from '@/components/agent/CreateAgentModal.vue'
import AppSidebar from '@/components/chat/AppSidebar.vue'
import ChatMain from '@/components/chat/ChatMain.vue'
import NewChatModal from '@/components/chat/NewChatModal.vue'

// ─── Types ───────────────────────────────────────────────────────────────────
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

const route = useRoute()
const router = useRouter()
const user = useUserStore()

// ─── State ───────────────────────────────────────────────────────────────────
/** 左侧面板页签由路由决定：/ 为对话，/agents 为智能体 */
const sidebarTab = computed<'agents' | 'conversations'>(() => (route.name === 'agents' ? 'agents' : 'conversations'))
const agents = ref<Agent[]>([])
const conversations = ref<Conversation[]>([])

const selectedAgent = ref<Agent | null>(null)
const selectedConversation = ref<Conversation | null>(null)

// ─── Dialogs ─────────────────────────────────────────────────────────────────
const showCreateAgent = ref(false)
const showNewChat = ref(false)

function switchTab(tab: 'agents' | 'conversations') {
  router.push(tab === 'agents' ? '/agents' : '/')
}

function openCreateAgent() {
  user.requireLogin(() => {
    showCreateAgent.value = true
    switchTab('agents')
  })
}

function openNewChat() {
  user.requireLogin(() => {
    showNewChat.value = true
  })
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
  switchTab('conversations')
}

// 登录后加载数据，退出后清空
watch(
  () => user.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      loadAgents()
      loadConversations()
    } else {
      agents.value = []
      conversations.value = []
      selectedConversation.value = null
      selectedAgent.value = null
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="workspace">
    <AppSidebar
      :sidebarTab="sidebarTab"
      :agents="agents"
      :conversations="conversations"
      :selectedConversationId="selectedConversation?.id ?? null"
      :isLoggedIn="user.isLoggedIn"
      @update:sidebarTab="switchTab"
      @selectConversation="selectConversation"
      @conversation-deleted="handleConversationDeleted"
      @agent-deleted="handleAgentDeleted"
      @newChat="openNewChat"
      @createAgent="openCreateAgent"
    />

    <ChatMain
      :selectedConversation="selectedConversation"
      :selectedAgent="selectedAgent"
      :isLoggedIn="user.isLoggedIn"
      @newChat="openNewChat"
      @login="user.loginVisible = true"
      @createAgent="openCreateAgent"
    />

    <CreateAgentModal v-model:show="showCreateAgent" @agent-created="loadAgents" />

    <NewChatModal
      v-model:show="showNewChat"
      :agents="agents"
      @conversation-created="handleConversationCreated"
      @goCreateAgent="openCreateAgent"
    />
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  height: 100%;
  overflow: hidden;
}
</style>
