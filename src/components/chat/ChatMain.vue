<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { chatApi } from '@/api/chat'
import md from '@/utils/markdown'

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

const props = defineProps<{
  selectedConversation: Conversation | null
  selectedAgent: Agent | null
  isLoggedIn: boolean
}>()

const emit = defineEmits<{
  (e: 'newChat'): void
  (e: 'login'): void
  (e: 'createAgent'): void
}>()

const messages = ref<Message[]>([])
const isLoading = ref(false)
const inputText = ref('')
const messagesEndRef = ref<HTMLElement | null>(null)

async function loadHistory(id: string) {
  if (!id || id === 'undefined') return
  try {
    const res = await chatApi.getHistory(id)
    const data = res.data
    messages.value = Array.isArray(data) ? data : (data?.body || [])
    scrollToBottom()
  } catch (e) {
    console.error('加载历史记录失败:', e)
    messages.value = []
  }
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || !props.selectedConversation || isLoading.value) return

  messages.value.push({ role: 'user', content: text, timestamp: new Date().toISOString() })
  inputText.value = ''
  isLoading.value = true
  scrollToBottom()

  const assistantMsgIndex = messages.value.length
  messages.value.push({ role: 'assistant', content: '', timestamp: new Date().toISOString() })

  try {
    const userId = localStorage.getItem('agent_user_id') || ''
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
    const response = await fetch(`${baseUrl}/chat/message/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId
      },
      body: JSON.stringify({
        conversationId: props.selectedConversation.id,
        content: text
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP 错误！状态码: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('响应流不可读')
    }

    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    // 状态标记：用来判断当前行是否是同一个 SSE 事件中的第一行 data
    // 同一个 SSE 事件（以空行分隔）的多行 data 应以换行符 \n 拼接，从而保留原始文本的换行格式
    let isFirstDataLineInEvent = true

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      let lineEndIdx: number
      while ((lineEndIdx = buffer.indexOf('\n')) >= 0) {
        // 仅移除尾部的回车符 \r，以兼容不同的操作系统和网络环境，保留其他关键的空白和换行结构
        const line = buffer.slice(0, lineEndIdx).replace(/\r$/, '')
        buffer = buffer.slice(lineEndIdx + 1)

        // 空行代表当前事件（Event）结束，重置 data 行标记
        if (line === '') {
          isFirstDataLineInEvent = true
          continue
        }

        if (line.startsWith('data:')) {
          let dataStr = line.slice(5)
          // 移除标准的 SSE "data: " 之后的第一个空格
          if (dataStr.startsWith(' ')) {
            dataStr = dataStr.slice(1)
          }

          if (dataStr === '[DONE]') {
            break
          } else if (dataStr.startsWith('[CONV_ID]')) {
            const convId = dataStr.slice(9)
            console.log('当前流式会话 ID:', convId)
          } else {
            // 如果是当前事件的第一行 data，直接追加；若不是，说明原文本中此处是换行，追加前加 \n
            if (isFirstDataLineInEvent) {
              messages.value[assistantMsgIndex].content += dataStr
              isFirstDataLineInEvent = false
            } else {
              messages.value[assistantMsgIndex].content += '\n' + dataStr
            }
            scrollToBottom()
          }
        }
      }
    }

    // 处理流读取完毕后，缓冲区可能剩余的最后一行数据
    const remainingLine = buffer.replace(/\r$/, '')
    if (remainingLine) {
      if (remainingLine.startsWith('data:')) {
        let dataStr = remainingLine.slice(5)
        if (dataStr.startsWith(' ')) {
          dataStr = dataStr.slice(1)
        }
        if (dataStr !== '[DONE]' && !dataStr.startsWith('[CONV_ID]')) {
          if (isFirstDataLineInEvent) {
            messages.value[assistantMsgIndex].content += dataStr
          } else {
            messages.value[assistantMsgIndex].content += '\n' + dataStr
          }
          scrollToBottom()
        }
      }
    }

  } catch (e) {
    console.error('流式消息请求失败:', e)
    if (!messages.value[assistantMsgIndex].content) {
      messages.value[assistantMsgIndex].content = '请求失败，请稍后重试。'
    } else {
      messages.value[assistantMsgIndex].content += '\n\n[连接异常断开，请稍后重试。]'
    }
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

function renderMarkdown(content: string) {
  return md.render(content || '')
}

watch(() => props.selectedConversation?.id, async (newVal) => {
  if (newVal) {
    await loadHistory(newVal)
  } else {
    messages.value = []
  }
}, { immediate: true })
</script>

<template>
  <main class="chat-main">

    <!-- Empty state -->
    <div v-if="!selectedConversation" class="welcome-screen">
      <div class="welcome-logo">🤖</div>
      <h1 class="welcome-title">AgentChat</h1>
      <p class="welcome-sub">{{ isLoggedIn ? '选择一个对话，或新建对话开始聊天' : '登录以解锁 AI Agent 创作与对话功能' }}</p>
      <div class="welcome-actions">
        <button v-if="isLoggedIn" class="btn-primary" @click="emit('newChat')">✏️ 新建对话</button>
        <button v-else class="btn-primary" @click="emit('login')">🚀 立即登录</button>
        <button class="btn-secondary" @click="emit('createAgent')">🧠 创建 Agent</button>
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
              <div class="bubble markdown-body" v-html="renderMarkdown(msg.content)"></div>
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
</template>

<style scoped>
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

/* ── Markdown 渲染排版样式 ────────────────────────────────────────────── */
.bubble.markdown-body {
  white-space: normal;
  word-break: break-word;
}

/* 链接样式 */
.bubble.markdown-body :deep(a) {
  color: #4d6bfe;
  text-decoration: none;
  border-bottom: 1px dotted #4d6bfe;
}
.bubble.markdown-body :deep(a:hover) {
  color: #708aff;
  border-bottom-style: solid;
}

/* 标题样式 */
.bubble.markdown-body :deep(h1),
.bubble.markdown-body :deep(h2),
.bubble.markdown-body :deep(h3),
.bubble.markdown-body :deep(h4) {
  color: #ffffff;
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  line-height: 1.4;
}
.bubble.markdown-body :deep(h1) { font-size: 1.4em; border-bottom: 1px solid #252525; padding-bottom: 4px; }
.bubble.markdown-body :deep(h2) { font-size: 1.25em; border-bottom: 1px solid #252525; padding-bottom: 4px; }
.bubble.markdown-body :deep(h3) { font-size: 1.12em; }
.bubble.markdown-body :deep(h4) { font-size: 1em; }

/* 段落与间隔 */
.bubble.markdown-body :deep(p) {
  margin-top: 0;
  margin-bottom: 10px;
  line-height: 1.7;
  color: #d1d1d1;
}
.bubble.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

/* 列表样式 */
.bubble.markdown-body :deep(ul),
.bubble.markdown-body :deep(ol) {
  margin-top: 0;
  margin-bottom: 10px;
  padding-left: 20px;
}
.bubble.markdown-body :deep(li) {
  margin-bottom: 4px;
  line-height: 1.6;
  color: #d1d1d1;
}

/* 引用块样式 */
.bubble.markdown-body :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  background: #141414;
  border-left: 4px solid #4d6bfe;
  border-radius: 4px;
}
.bubble.markdown-body :deep(blockquote p) {
  color: #888888;
  margin: 0;
}

/* 行内代码样式 */
.bubble.markdown-body :deep(code:not(.hljs code)) {
  background: #252525;
  color: #ff7b72;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace;
  font-size: 0.9em;
}

/* 代码块样式 */
.bubble.markdown-body :deep(pre.hljs) {
  margin: 12px 0;
  padding: 12px 14px;
  background: #0d1117 !important;
  border-radius: 8px;
  border: 1px solid #20262e;
  overflow-x: auto;
}
.bubble.markdown-body :deep(pre.hljs code) {
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace;
  font-size: 0.88em;
  line-height: 1.5;
  color: #c9d1d9;
}

/* 现代圆角防锯齿表格样式 */
.bubble.markdown-body :deep(table) {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 14px 0;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
  background: #141414;
}
.bubble.markdown-body :deep(th) {
  background: #1c1c1c;
  color: #ffffff;
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid #2a2a2a;
}
.bubble.markdown-body :deep(td) {
  padding: 8px 12px;
  border-bottom: 1px solid #222222;
  color: #c0c0c0;
}
.bubble.markdown-body :deep(tr:last-child td) {
  border-bottom: none;
}
.bubble.markdown-body :deep(tr:hover td) {
  background: #181818;
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

/* Shared buttons */
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
