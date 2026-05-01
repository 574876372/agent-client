
<script setup lang="ts">
import { ref, reactive, nextTick, onMounted } from 'vue'
import { agentApi, chatApi } from '@/api/chat'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Agent {
  id: string
  name: string
  description: string
  model: string
  systemPrompt: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface Conversation {
  conversationId: string
  agentId: string
  title: string
  createdAt: string
}

// ─── State ───────────────────────────────────────────────────────────────────
const sidebarTab = ref<'agents' | 'conversations'>('conversations')
const agents = ref<Agent[]>([])
const conversations = ref<Conversation[]>([])
const messages = ref<Message[]>([])

const selectedAgent = ref<Agent | null>(null)
const selectedConversation = ref<Conversation | null>(null)

const inputText = ref('')
const isLoading = ref(false)
const messagesEndRef = ref<HTMLElement | null>(null)

// ─── Dialogs ─────────────────────────────────────────────────────────────────
const showCreateAgent = ref(false)
const showNewChat = ref(false)

const newAgent = reactive({
  name: '',
  description: '',
  modelType: 'deepseek',
  modelName: 'deepseek-chat',
  systemPrompt: ''
})

const newChatAgentId = ref('')

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

async function loadHistory(conversationId: string) {
  try {
    const res = await chatApi.getHistory(conversationId)
    messages.value = res.data
    scrollToBottom()
  } catch (e) {
    console.error(e)
  }
}

async function createAgent() {
  if (!newAgent.name.trim()) return
  try {
    await agentApi.createAgent({
      name: newAgent.name,
      modelType: newAgent.modelType,
      modelName: newAgent.modelName
    })
    showCreateAgent.value = false
    Object.assign(newAgent, {
      name: '',
      description: '',
      modelType: 'deepseek',
      modelName: 'deepseek-chat',
      systemPrompt: ''
    })
    await loadAgents()
  } catch (e) {
    console.error(e)
  }
}

async function deleteAgent(id: string) {
  try {
    await agentApi.deleteAgent(id)
    if (selectedAgent.value?.id === id) selectedAgent.value = null
    await loadAgents()
  } catch (e) {
    console.error(e)
  }
}

async function startNewChat() {
  if (!newChatAgentId.value) return
  try {
    const agent = agents.value.find(a => a.id === newChatAgentId.value)
    const res = await chatApi.createConversation({
      agentId: newChatAgentId.value,
      title: `与 ${agent?.name ?? 'Agent'} 的对话`
    })
    showNewChat.value = false
    newChatAgentId.value = ''
    await loadConversations()
    await selectConversation(res.data)
    sidebarTab.value = 'conversations'
  } catch (e) {
    console.error(e)
  }
}

async function selectConversation(conv: Conversation) {
  selectedConversation.value = conv
  selectedAgent.value = agents.value.find(a => a.id === conv.agentId) ?? null
  await loadHistory(conv.conversationId)
}

async function deleteConversation(id: string) {
  try {
    await chatApi.deleteConversation(id)
    if (selectedConversation.value?.conversationId === id) {
      selectedConversation.value = null
      messages.value = []
    }
    await loadConversations()
  } catch (e) {
    console.error(e)
  }
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || !selectedConversation.value || isLoading.value) return

  messages.value.push({ role: 'user', content: text, timestamp: new Date().toISOString() })
  inputText.value = ''
  isLoading.value = true
  scrollToBottom()

  try {
    const res = await chatApi.sendMessage({
      conversationId: selectedConversation.value.conversationId,
      content: text
    })
    messages.value.push({ role: 'assistant', content: res.data.content, timestamp: new Date().toISOString() })
  } catch (e) {
    messages.value.push({ role: 'assistant', content: '请求失败，请稍后重试。', timestamp: new Date().toISOString() })
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function scrollToBottom() {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  loadAgents()
  loadConversations()
})
</script>

<template>
  <div class="app-layout">

    <!-- ══════════════ SIDEBAR ══════════════ -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="logo-text">🤖 AgentChat</span>
      </div>

      <!-- New Chat Button -->
      <button class="btn-new-chat" @click="showNewChat = true">
        <span class="icon">✏️</span> 新建对话
      </button>

      <!-- Tabs -->
      <div class="sidebar-tabs">
        <button :class="['tab', sidebarTab === 'conversations' && 'active']" @click="sidebarTab = 'conversations'">对话</button>
        <button :class="['tab', sidebarTab === 'agents' && 'active']" @click="sidebarTab = 'agents'">Agent</button>
      </div>

      <!-- Conversations List -->
      <div v-if="sidebarTab === 'conversations'" class="list-container">
        <div v-if="conversations.length === 0" class="empty-hint">暂无对话，点击「新建对话」开始</div>
        <div
          v-for="conv in conversations"
          :key="conv.conversationId"
          :class="['list-item', selectedConversation?.conversationId === conv.conversationId && 'active']"
          @click="selectConversation(conv)"
        >
          <span class="item-icon">💬</span>
          <span class="item-title">{{ conv.title }}</span>
          <button class="item-delete" @click.stop="deleteConversation(conv.conversationId)" title="删除">✕</button>
        </div>
      </div>

      <!-- Agents List -->
      <div v-if="sidebarTab === 'agents'" class="list-container">
        <button class="btn-create-agent" @click="showCreateAgent = true">+ 创建 Agent</button>
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
    </aside>

    <!-- ══════════════ MAIN CHAT AREA ══════════════ -->
    <main class="chat-main">

      <!-- Empty state -->
      <div v-if="!selectedConversation" class="welcome-screen">
        <div class="welcome-logo">🤖</div>
        <h1 class="welcome-title">AgentChat</h1>
        <p class="welcome-sub">选择一个对话，或新建对话开始聊天</p>
        <div class="welcome-actions">
          <button class="btn-primary" @click="showNewChat = true">✏️ 新建对话</button>
          <button class="btn-secondary" @click="showCreateAgent = true; sidebarTab = 'agents'">🧠 创建 Agent</button>
        </div>
      </div>

      <!-- Chat view -->
      <template v-else>
        <!-- Chat header -->
        <div class="chat-header">
          <div class="chat-header-info">
            <span class="chat-header-icon">💬</span>
            <div>
              <div class="chat-header-title">{{ selectedConversation.title }}</div>
              <div class="chat-header-agent" v-if="selectedAgent">{{ selectedAgent.name }} · {{ selectedAgent.model }}</div>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <div class="messages-area">
          <div v-if="messages.length === 0" class="messages-empty">
            <p>发送消息开始对话 👋</p>
          </div>

          <div v-for="(msg, idx) in messages" :key="idx" :class="['message-row', msg.role]">
            <div class="avatar">
              <span v-if="msg.role === 'user'">👤</span>
              <span v-else>🤖</span>
            </div>
            <div class="bubble-wrap">
              <div class="bubble">{{ msg.content }}</div>
              <div class="msg-time">{{ formatTime(msg.timestamp) }}</div>
            </div>
          </div>

          <!-- Loading indicator -->
          <div v-if="isLoading" class="message-row assistant">
            <div class="avatar"><span>🤖</span></div>
            <div class="bubble-wrap">
              <div class="bubble loading-bubble">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
            </div>
          </div>

          <div ref="messagesEndRef"></div>
        </div>

        <!-- Input area -->
        <div class="input-area">
          <div class="input-box">
            <textarea
              v-model="inputText"
              class="input-textarea"
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              rows="1"
              @keydown="handleKeydown"
            ></textarea>
            <button
              class="send-btn"
              :disabled="!inputText.trim() || isLoading"
              @click="sendMessage"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
          <p class="input-hint">AgentChat 可能会出错，请核实重要信息</p>
        </div>
      </template>
    </main>

    <!-- ══════════════ CREATE AGENT DIALOG ══════════════ -->
    <div v-if="showCreateAgent" class="modal-overlay" @click.self="showCreateAgent = false">
      <div class="modal">
        <div class="modal-header">
          <h2>创建 Agent</h2>
          <button class="modal-close" @click="showCreateAgent = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称 <span class="required">*</span></label>
            <input v-model="newAgent.name" placeholder="给 Agent 起个名字" class="form-input" />
          </div>
          <div class="form-group">
            <label>描述</label>
            <input v-model="newAgent.description" placeholder="简单描述 Agent 的用途" class="form-input" />
          </div>
          <div class="form-group">
            <label>模型厂商 <span class="required">*</span></label>
            <select v-model="newAgent.modelType" class="form-input">
              <option value="qwen">通义千问 (Qwen)</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>
          <div class="form-group">
            <label>模型名称 <span class="required">*</span></label>
            <input v-model="newAgent.modelName" placeholder="如 deepseek-chat / Qwen3.5-27B" class="form-input" />
          </div>
          <div class="form-group">
            <label>系统提示词</label>
            <textarea v-model="newAgent.systemPrompt" placeholder="设定 Agent 的角色和行为..." class="form-input form-textarea" rows="4"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showCreateAgent = false">取消</button>
          <button class="btn-primary" :disabled="!newAgent.name.trim() || !newAgent.modelName.trim()" @click="createAgent">创建</button>
        </div>
      </div>
    </div>

    <!-- ══════════════ NEW CHAT DIALOG ══════════════ -->
    <div v-if="showNewChat" class="modal-overlay" @click.self="showNewChat = false">
      <div class="modal">
        <div class="modal-header">
          <h2>新建对话</h2>
          <button class="modal-close" @click="showNewChat = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>选择 Agent <span class="required">*</span></label>
            <div v-if="agents.length === 0" class="empty-hint" style="margin-top:8px">
              还没有 Agent，请先
              <a href="#" @click.prevent="showNewChat=false; showCreateAgent=true">创建一个</a>
            </div>
            <div v-else class="agent-select-list">
              <div
                v-for="agent in agents"
                :key="agent.id"
                :class="['agent-select-item', newChatAgentId === agent.id && 'selected']"
                @click="newChatAgentId = agent.id"
              >
                <span class="agent-select-icon">🧠</span>
                <div>
                  <div class="agent-select-name">{{ agent.name }}</div>
                  <div class="agent-select-desc">{{ agent.description || agent.model }}</div>
                </div>
                <span v-if="newChatAgentId === agent.id" class="check">✓</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showNewChat = false">取消</button>
          <button class="btn-primary" :disabled="!newChatAgentId" @click="startNewChat">开始对话</button>
        </div>
      </div>
    </div>

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

/* ── Sidebar ────────────────────────────────────────────────────────────── */
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

/* ── Main Chat ──────────────────────────────────────────────────────────── */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0f0f0f;
}

/* Welcome screen */
.welcome-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
}
.welcome-logo { font-size: 64px; }
.welcome-title { font-size: 32px; font-weight: 700; color: #fff; }
.welcome-sub { font-size: 15px; color: #666; }
.welcome-actions { display: flex; gap: 12px; margin-top: 8px; }

/* Chat header */
.chat-header {
  padding: 14px 24px;
  border-bottom: 1px solid #1e1e1e;
  background: #0f0f0f;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.chat-header-info { display: flex; align-items: center; gap: 12px; }
.chat-header-icon { font-size: 20px; }
.chat-header-title { font-size: 15px; font-weight: 600; color: #fff; }
.chat-header-agent { font-size: 12px; color: #555; margin-top: 2px; }

/* Messages */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.messages-area::-webkit-scrollbar { width: 4px; }
.messages-area::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }

.messages-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #444;
  font-size: 15px;
}

.message-row {
  display: flex;
  gap: 12px;
  max-width: 800px;
  width: 100%;
}
.message-row.user {
  flex-direction: row-reverse;
  align-self: flex-end;
}
.message-row.assistant { align-self: flex-start; }

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #1e1e1e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.message-row.user .avatar { background: #1e2a4a; }

.bubble-wrap { display: flex; flex-direction: column; gap: 4px; max-width: calc(100% - 46px); }
.message-row.user .bubble-wrap { align-items: flex-end; }

.bubble {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.message-row.user .bubble {
  background: #4d6bfe;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.message-row.assistant .bubble {
  background: #1a1a1a;
  color: #e0e0e0;
  border-bottom-left-radius: 4px;
  border: 1px solid #252525;
}

.msg-time { font-size: 11px; color: #444; padding: 0 4px; }

/* Loading dots */
.loading-bubble {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 14px 18px;
}
.dot {
  width: 7px;
  height: 7px;
  background: #555;
  border-radius: 50%;
  animation: bounce 1.2s infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-6px); opacity: 1; }
}

/* Input area */
.input-area {
  padding: 16px 24px 20px;
  border-top: 1px solid #1e1e1e;
  background: #0f0f0f;
}
.input-box {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 14px;
  padding: 10px 12px;
  transition: border-color 0.2s;
}
.input-box:focus-within { border-color: #4d6bfe; }

.input-textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e0e0e0;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  max-height: 160px;
  overflow-y: auto;
  font-family: inherit;
}
.input-textarea::placeholder { color: #444; }

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #4d6bfe;
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.2s, opacity 0.2s;
}
.send-btn:hover:not(:disabled) { background: #3a56e8; }
.send-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.input-hint {
  text-align: center;
  font-size: 11px;
  color: #333;
  margin-top: 8px;
}

/* ── Buttons ────────────────────────────────────────────────────────────── */
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

/* ── Modal ──────────────────────────────────────────────────────────────── */
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

/* Agent select list */
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
</style>
