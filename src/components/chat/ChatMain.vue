<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { chatApi } from '@/api/chat'
import md from '@/utils/markdown'
import { parseMessageContent } from '@/utils/parser'
import {
  appendToolResult,
  createStreamBuffers,
  mergeStreamContent,
  parseSseEventLine,
  type SseEventType,
  type StreamBuffers
} from '@/utils/sse'

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

// ── 流式缓冲、打字机（仅 message 事件）────────────────────────────────
let typewriterQueue = ''
let typewriterIntervalId: ReturnType<typeof setInterval> | null = null
let streamBuffers: StreamBuffers = createStreamBuffers()

function applyStreamContent(msgIdx: number) {
  messages.value[msgIdx].content = mergeStreamContent(streamBuffers)
}

function startTypewriter(msgIdx: number) {
  if (typewriterIntervalId) {
    clearInterval(typewriterIntervalId)
  }

  typewriterIntervalId = setInterval(() => {
    if (typewriterQueue.length > 0) {
      const count = typewriterQueue.length > 30 ? 6 : typewriterQueue.length > 15 ? 3 : 1
      const chars = typewriterQueue.slice(0, count)
      typewriterQueue = typewriterQueue.slice(count)
      streamBuffers.message += chars
      applyStreamContent(msgIdx)
      scrollToBottom()
    } else if (!isLoading.value) {
      clearInterval(typewriterIntervalId!)
      typewriterIntervalId = null
    }
  }, 15)
}

function appendSseData(
  msgIdx: number,
  eventType: SseEventType,
  dataStr: string,
  isFirstLine: boolean
) {
  const piece = isFirstLine ? dataStr : '\n' + dataStr

  if (eventType === 'reasoning') {
    streamBuffers.reasoning += piece
    applyStreamContent(msgIdx)
    scrollToBottom()
    return
  }
  if (eventType === 'tool_result') {
    streamBuffers.tools = appendToolResult(streamBuffers.tools, dataStr)
    applyStreamContent(msgIdx)
    scrollToBottom()
    return
  }
  if (eventType === 'error') {
    streamBuffers.message += (streamBuffers.message ? '\n\n' : '') + `[错误] ${dataStr}`
    applyStreamContent(msgIdx)
    return
  }
  // message 或未知类型：走打字机
  if (isFirstLine) {
    typewriterQueue += dataStr
  } else {
    typewriterQueue += '\n' + dataStr
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

  streamBuffers = createStreamBuffers()
  typewriterQueue = ''
  startTypewriter(assistantMsgIndex)

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
    let currentEvent: SseEventType = 'message'
    let isFirstDataLineInEvent = true
    let streamDone = false

    const processDataLine = (dataStr: string) => {
      if (dataStr === '[DONE]') {
        streamDone = true
        return
      }
      if (dataStr.startsWith('[CONV_ID]')) {
        console.log('当前流式会话 ID:', dataStr.slice(9))
        return
      }
      appendSseData(assistantMsgIndex, currentEvent, dataStr, isFirstDataLineInEvent)
      isFirstDataLineInEvent = false
    }

    const processLine = (line: string) => {
      if (line === '') {
        isFirstDataLineInEvent = true
        return
      }
      const eventType = parseSseEventLine(line)
      if (eventType !== null) {
        currentEvent = eventType
        isFirstDataLineInEvent = true
        return
      }
      if (line.startsWith('data:')) {
        let dataStr = line.slice(5)
        if (dataStr.startsWith(' ')) {
          dataStr = dataStr.slice(1)
        }
        processDataLine(dataStr)
      }
    }

    outer: while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      let lineEndIdx: number
      while ((lineEndIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, lineEndIdx).replace(/\r$/, '')
        buffer = buffer.slice(lineEndIdx + 1)
        processLine(line)
        if (streamDone) break outer
      }
    }

    const remainingLine = buffer.replace(/\r$/, '')
    if (remainingLine && !streamDone) {
      processLine(remainingLine)
    }

    // 排空打字机队列中剩余的 message 内容
    if (typewriterQueue.length > 0) {
      streamBuffers.message += typewriterQueue
      typewriterQueue = ''
      applyStreamContent(assistantMsgIndex)
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

// ── 折叠面板状态管理 ──────────────────────────────────────────────
const collapsedStates = ref<Record<string, boolean>>({})

function shouldShowMessage(msg: Message, idx: number) {
  if (msg.role === 'user') {
    return !!msg.content?.trim()
  }
  return msg.content.length > 0 || (isLoading.value && idx === messages.value.length - 1)
}

function isCollapsed(msgIdx: number, segIdx: number) {
  if (isLoading.value && msgIdx === messages.value.length - 1) {
    const segments = parseMessageContent(messages.value[msgIdx]?.content ?? '')
    if (segments[segIdx]?.type === 'think') {
      return false
    }
  }
  return collapsedStates.value[`${msgIdx}-${segIdx}`] === true
}

function toggleCollapse(msgIdx: number, segIdx: number) {
  const key = `${msgIdx}-${segIdx}`
  collapsedStates.value[key] = !collapsedStates.value[key]
}

watch(() => props.selectedConversation?.id, async (newVal) => {
  if (typewriterIntervalId) {
    clearInterval(typewriterIntervalId)
    typewriterIntervalId = null
  }
  if (newVal) {
    await loadHistory(newVal)
  } else {
    messages.value = []
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (typewriterIntervalId) {
    clearInterval(typewriterIntervalId)
  }
})
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
          <div v-if="shouldShowMessage(msg, idx)" :class="['message-row', msg.role]">
            <div class="avatar">
              <span v-if="msg.role === 'user'">👤</span>
              <span v-else>🤖</span>
            </div>
            <div class="bubble-wrap">
              <!-- 用户消息：直接渲染 Markdown -->
              <div v-if="msg.role === 'user'" class="bubble markdown-body" v-html="renderMarkdown(msg.content)"></div>
              
              <!-- 助手消息：解析流式推理与工具调用段落 -->
              <div v-else class="bubble assistant-bubble-container">
                <template v-for="(segment, segIdx) in parseMessageContent(msg.content)" :key="segIdx">
                  <!-- 普通文本段落 -->
                  <div v-if="segment.type === 'text'" class="bubble-text markdown-body" v-html="renderMarkdown(segment.content)"></div>
                  
                  <!-- 可折叠的推理/工具调用段落 -->
                  <div v-else :class="['reasoning-container', segment.type]">
                    <div class="reasoning-header" @click="toggleCollapse(idx, segIdx)">
                      <span class="reasoning-title-wrap">
                        <span class="reasoning-icon">
                          <span v-if="segment.type === 'think'">🧠</span>
                          <span v-else-if="segment.type === 'action'">🛠️</span>
                          <span v-else-if="segment.type === 'observation'">👁️</span>
                        </span>
                        <span class="reasoning-title">{{ segment.title }}</span>
                      </span>
                      <span :class="['chevron-icon', { 'expanded': !isCollapsed(idx, segIdx) }]">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                        </svg>
                      </span>
                    </div>
                    <div v-show="!isCollapsed(idx, segIdx)" class="reasoning-content markdown-body" v-html="renderMarkdown(segment.content)"></div>
                  </div>
                </template>
              </div>
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

/* ── 流式推理/工具调用折叠面板样式 ────────────────────────────────── */
.assistant-bubble-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bubble-text {
  color: #d1d1d1;
}

.reasoning-container {
  margin: 4px 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 🎨 思考、工具调用、工具返回专属配色风格与磨砂效果 */
.reasoning-container.think {
  border-left: 3px solid #8a2be2;
  background: rgba(22, 19, 36, 0.8);
  box-shadow: 0 4px 20px rgba(138, 43, 226, 0.05);
}
.reasoning-container.action {
  border-left: 3px solid #ffa500;
  background: rgba(36, 27, 19, 0.8);
  box-shadow: 0 4px 20px rgba(255, 165, 0, 0.05);
}
.reasoning-container.observation {
  border-left: 3px solid #00ced1;
  background: rgba(19, 36, 36, 0.8);
  box-shadow: 0 4px 20px rgba(0, 206, 209, 0.05);
}

/* 折叠面板头部 */
.reasoning-header {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  transition: background 0.2s ease;
}
.reasoning-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.reasoning-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reasoning-icon {
  font-size: 14px;
  display: inline-flex;
  align-items: center;
}

.reasoning-title {
  font-weight: 600;
  color: #e0e0e0;
  letter-spacing: 0.5px;
}

/* 折叠箭头微动画 */
.chevron-icon {
  display: inline-flex;
  align-items: center;
  color: #777;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s;
}
.reasoning-header:hover .chevron-icon {
  color: #bbb;
}
.chevron-icon.expanded {
  transform: rotate(90deg);
}

/* 折叠内容区 */
.reasoning-content {
  padding: 12px 14px;
  border-top: 1px dashed rgba(255, 255, 255, 0.05);
  font-size: 13px;
  line-height: 1.6;
  color: #b0b0b0;
  background: rgba(0, 0, 0, 0.1);
}

.reasoning-content.markdown-body :deep(p) {
  font-size: 13px;
  line-height: 1.6;
  color: #b0b0b0;
  margin-bottom: 8px;
}
.reasoning-content.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
.reasoning-content.markdown-body :deep(pre.hljs) {
  margin: 8px 0;
  padding: 10px 12px;
}
</style>
