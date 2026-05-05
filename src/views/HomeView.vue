
<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed } from 'vue'
import { agentApi, chatApi } from '@/api/chat'
import { userApi } from '@/api/user'

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

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
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
const messages = ref<Message[]>([])

const selectedAgent = ref<Agent | null>(null)
const selectedConversation = ref<Conversation | null>(null)

const inputText = ref('')
const isLoading = ref(false)
const messagesEndRef = ref<HTMLElement | null>(null)

// ─── Auth State ──────────────────────────────────────────────────────────────
const currentUser = ref<User | null>(null)
const isLoggedIn = computed(() => !!currentUser.value)
const showLoginModal = ref(false)
const loginForm = reactive({ username: '', password: '' })
const isLoggingIn = ref(false)

// ─── Dialogs ─────────────────────────────────────────────────────────────────
const showCreateAgent = ref(false)
const showNewChat = ref(false)

const newAgent = reactive({
  name: '',
  description: '',
  modelType: '',
  modelName: '',
  systemPrompt: ''
})

const modelProviders = ref<{type: string, models: string[]}[]>([])
const availableModels = computed(() => {
  const provider = modelProviders.value.find(p => p.type.toLowerCase() === newAgent.modelType.toLowerCase())
  return provider ? provider.models : []
})

const newChatAgentId = ref('')

const promptTemplates = [
  { name: '自定义', prompt: '' },
  { name: '翻译官', prompt: '你是一个专业的翻译官，能够精准地将用户输入的文本翻译成多种语言，并提供相关的语言建议。' },
  { name: '代码专家', prompt: '你是一个资深的软件工程师，擅长编写高质量、可维护的代码，并能对代码进行深度审计和优化。' },
  { name: '心理医生', prompt: '你是一个温暖、耐心的心理医生，能够倾听用户的烦恼，并提供专业、科学的心理疏导和建议。' }
]

function applyTemplate(template: any) {
  newAgent.systemPrompt = template.prompt
}


// ─── Auth Methods ────────────────────────────────────────────────────────────
async function handleLogin() {
  if (!loginForm.username || !loginForm.password) return
  isLoggingIn.value = true
  try {
    const res = await userApi.login(loginForm)
    if (res.status === 200) {
      const user = res.data
      currentUser.value = user
      localStorage.setItem('agent_user_id', user.id)
      localStorage.setItem('agent_username', user.username)
      showLoginModal.value = false
      // 清空表单
      loginForm.username = ''
      loginForm.password = ''
      // 登录成功后刷新数据
      await loadAgents()
      await loadConversations()
    }
  } catch (e) {
    alert('登录失败，请检查用户名或密码')
  } finally {
    isLoggingIn.value = false
  }
}

function handleLogout() {
  currentUser.value = null
  localStorage.removeItem('agent_user_id')
  localStorage.removeItem('agent_username')
  agents.value = []
  conversations.value = []
  selectedConversation.value = null
  messages.value = []
}

function checkAuth(callback: Function) {
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

async function loadConversations() {

  try {
    const res = await chatApi.listConversations()
    conversations.value = res.data
  } catch (e) {
    console.error(e)
  }
}

async function loadHistory(id: string) {
  if (!id || id === 'undefined') return
  try {
    const res = await chatApi.getHistory(id)
    // 确保 res.data 是数组，如果是 ResponseEntity 结构则读取 body
    const data = res.data
    messages.value = Array.isArray(data) ? data : (data?.body || [])
    scrollToBottom()
  } catch (e) {
    console.error('加载历史记录失败:', e)
    messages.value = [] // 报错时清空，防止渲染错误
  }
}

async function createAgent() {
  if (!newAgent.name.trim()) return
  try {
    await agentApi.createAgent({
      name: newAgent.name,
      modelType: newAgent.modelType,
      modelName: newAgent.modelName,
      systemPrompt: newAgent.systemPrompt
    })
    showCreateAgent.value = false
    Object.assign(newAgent, {
      name: '',
      description: '',
      modelType: modelProviders.value[0]?.type || '',
      modelName: modelProviders.value[0]?.models[0] || '',
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
  // 1. 立即设置选中状态，让 UI 切换
  selectedConversation.value = conv
  selectedAgent.value = agents.value.find(a => a.id === conv.agentId) ?? null
  // 2. 先清空当前消息，显示加载状态（可选）或空记录
  messages.value = []
  // 3. 异步加载历史
  await loadHistory(conv.id)
}

async function deleteConversation(id: string) {
  try {
    await chatApi.deleteConversation(id)
    if (selectedConversation.value?.id === id) {
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
      conversationId: selectedConversation.value.id,
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
  loadModelProviders() // 无论是否登录都先加载模型配置
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
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="logo-text">🤖 AgentChat</span>
      </div>

      <!-- New Chat Button -->
      <button class="btn-new-chat" @click="checkAuth(() => showNewChat = true)">
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
          :key="conv.id"
          :class="['list-item', selectedConversation?.id === conv.id && 'active']"
          @click="selectConversation(conv)"
        >
          <span class="item-icon">💬</span>
          <span class="item-title">{{ conv.title }}</span>
          <button class="item-delete" @click.stop="deleteConversation(conv.id)" title="删除">✕</button>
        </div>
      </div>

      <!-- Agents List -->
      <div v-if="sidebarTab === 'agents'" class="list-container">
        <button class="btn-create-agent" @click="checkAuth(() => showCreateAgent = true)">+ 创建 Agent</button>
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
            <div class="username">{{ currentUser?.username }}</div>
            <div class="logout-link" @click="handleLogout">退出登录</div>
          </div>
        </div>
        <button v-else class="btn-login-trigger" @click="showLoginModal = true">
          登录以同步数据
        </button>
      </div>
    </aside>

    <!-- ══════════════ MAIN CHAT AREA ══════════════ -->
    <main class="chat-main">

      <!-- Empty state -->
      <div v-if="!selectedConversation" class="welcome-screen">
        <div class="welcome-logo">🤖</div>
        <h1 class="welcome-title">AgentChat</h1>
        <p class="welcome-sub">{{ isLoggedIn ? '选择一个对话，或新建对话开始聊天' : '登录以解锁 AI Agent 创作与对话功能' }}</p>
        <div class="welcome-actions">
          <button v-if="isLoggedIn" class="btn-primary" @click="showNewChat = true">✏️ 新建对话</button>
          <button v-else class="btn-primary" @click="showLoginModal = true">🚀 立即登录</button>
          <button class="btn-secondary" @click="checkAuth(() => { showCreateAgent = true; sidebarTab = 'agents' })">🧠 创建 Agent</button>
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

          <template v-for="(msg, idx) in messages" :key="idx">
            <div v-if="msg?.content?.trim()" :class="['message-row', msg.role]">
              <div class="avatar">
                <span v-if="msg.role === 'user'">👤</span>
                <span v-else>🤖</span>
              </div>
              <div class="bubble-wrap">
                <div class="bubble">{{ msg.content }}</div>
                <div class="msg-time">{{ formatTime(msg.timestamp) }}</div>
              </div>
            </div>
          </template>

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
            <select v-model="newAgent.modelType" class="form-input" @change="newAgent.modelName = availableModels[0] || ''">
              <option v-for="p in modelProviders" :key="p.type" :value="p.type">
                {{ p.type }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>模型名称 <span class="required">*</span></label>
            <select v-model="newAgent.modelName" class="form-input">
              <option v-for="m in availableModels" :key="m" :value="m">
                {{ m }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>提示词模板</label>
            <div class="template-tags">
              <span
                v-for="t in promptTemplates"
                :key="t.name"
                class="tag"
                @click="applyTemplate(t)"
              >
                {{ t.name }}
              </span>
            </div>
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

    <!-- ══════════════ LOGIN DIALOG ══════════════ -->
    <div v-if="showLoginModal" class="modal-overlay" @click.self="showLoginModal = false">
      <div class="modal login-modal">
        <div class="modal-header">
          <h2>欢迎回来</h2>
          <button class="modal-close" @click="showLoginModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-subtext">登录以管理您的 Agent 和对话记录</p>
          <div class="form-group">
            <label>用户名</label>
            <input v-model="loginForm.username" placeholder="请输入用户名" class="form-input" @keyup.enter="handleLogin" />
          </div>
          <div class="form-group">
            <label>密码</label>
            <input v-model="loginForm.password" type="password" placeholder="请输入密码" class="form-input" @keyup.enter="handleLogin" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-primary btn-block" :disabled="isLoggingIn" @click="handleLogin">
            {{ isLoggingIn ? '登录中...' : '立即登录' }}
          </button>
          <p class="modal-footer-hint">默认账户: admin / 123456 (新用户将自动注册)</p>
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

/* ── User & Login Styles ────────────────────────────────────────────────── */
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

.user-info {
  flex: 1;
}

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

.login-modal { width: 400px; }
.modal-subtext { color: #666; font-size: 13px; margin-bottom: 20px; }
.btn-block { width: 100%; margin-top: 10px; padding: 12px; }
.modal-footer-hint { font-size: 11px; color: #444; margin-top: 12px; text-align: center; width: 100%; }

.form-group label { display: block; margin-bottom: 6px; font-size: 13px; color: #888; }
.form-input {
  width: 100%;
  padding: 10px 12px;
  background: #0f0f0f;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.form-input:focus { border-color: #4d6bfe; }
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
.tag:hover {
  border-color: #4d6bfe;
  color: #4d6bfe;
  background: #1a1a2e;
}
</style>
