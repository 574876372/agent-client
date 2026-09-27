<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount, computed } from 'vue'
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
import GenericApprovalCard from './GenericApprovalCard.vue'
import SqlResultTable from './SqlResultTable.vue'
import RetrievalSources from './RetrievalSources.vue'
import {
  Bot,
  Brain,
  ChevronRight,
  Eye,
  History,
  Layers,
  LogIn,
  MessageSquarePlus,
  SendHorizontal,
  Sparkles,
  User,
  Wrench
} from 'lucide-vue-next'

interface Agent {
  id: string
  name: string
  description: string
  model: string
  systemPrompt: string
  memoryMode?: 'FULL' | 'WINDOW' | 'SUMMARY'
  maxTurns?: number | null
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

/** 当前正在调用的工具名称（空字符串表示未在调用） */
const toolCallingName = ref('')

/** 记忆压缩进行中（触发时短暂显示压缩动效 badge） */
const isCompressing = ref(false)

/** 计算当前对话轮数（user + assistant 配对） */
const currentTurns = computed(() => Math.floor(messages.value.length / 2))

/** 记忆 badge 状态：模式图标 */
const memoryModeIcon = computed(() => {
  const mode = props.selectedAgent?.memoryMode || 'SUMMARY'
  if (mode === 'FULL') return History
  if (mode === 'WINDOW') return Layers
  return Sparkles
})

/** 记忆 badge 文字描述 */
const memoryBadgeText = computed(() => {
  const agent = props.selectedAgent
  if (!agent) return ''
  const mode = agent.memoryMode || 'SUMMARY'
  if (isCompressing.value) return '正在压缩历史...'
  if (mode === 'FULL') {
    const count = messages.value.length
    if (count >= 50) return `已有 ${count} 条消息，注意 Token 用量`
    return `共 ${count} 条历史消息`
  }
  const maxTurns = agent.maxTurns ?? 10
  return `第 ${currentTurns.value} 轮 / 上限 ${maxTurns} 轮`
})

/** 记忆 badge 是否为警告状态（橙色） */
const memoryBadgeWarn = computed(() => {
  const agent = props.selectedAgent
  if (!agent) return false
  const mode = agent.memoryMode || 'SUMMARY'
  return mode === 'FULL' && messages.value.length >= 50
})

async function loadHistory(id: string) {
  if (!id || id === 'undefined') return
  try {
    const res = await chatApi.getHistory(id)
    const data = res.data
    messages.value = Array.isArray(data) ? data : (data?.body || [])
    syncConsumedTokensFromHistory()
    scrollToBottom()
  } catch (e) {
    console.error('加载历史记录失败:', e)
    messages.value = []
  }
}

// ── 通用 HITL 审批与 SQL 执行结果 Payload 定义 ──────────────────────
type GenericPendingPayload = {
  status: 'PENDING_APPROVAL'
  approvalToken: string
  token?: string
  toolName: string
  parameters: Record<string, any>
  parameterSchema: {
    type: 'object'
    properties: Record<string, {
      type: string
      description?: string
    }>
    required?: string[]
  }
  preCheckMeta?: {
    estimatedRows?: number
    warnings?: string[]
    sql?: string
    [key: string]: any
  }
}
type SqlExecutionPayload = {
  status: 'EXECUTED' | 'REJECTED' | 'TOKEN_EXPIRED' | 'ERROR'
  sql?: string
  datasourceId?: string
  columns: string[]
  rows: unknown[][]
  rowCount: number
  elapsedMs: number
  truncated?: boolean
  message?: string
  error?: string
}

/** 已被处理过的 token（点击过执行/编辑/取消，或属于历史消息） */
const consumedTokens = ref<Set<string>>(new Set())

function parseSqlPayload(content: string):
  | { kind: 'pending'; data: GenericPendingPayload }
  | { kind: 'execution'; data: SqlExecutionPayload }
  | null {
  const trimmed = (content ?? '').trim()
  
  const extractFromValue = (val: any):
    | { kind: 'pending'; data: GenericPendingPayload }
    | { kind: 'execution'; data: SqlExecutionPayload }
    | null => {
    if (!val) return null
    
    let target = val
    if (Array.isArray(val)) {
      target = val.find(item => item && (item.status === 'PENDING_APPROVAL' || item.status === 'EXECUTED' || item.status === 'REJECTED' || item.status === 'TOKEN_EXPIRED' || item.status === 'ERROR')) || val[0]
    }
    
    if (target?.status === 'PENDING_APPROVAL') {
      const token = target.approvalToken ?? target.token ?? target.confirmToken
      if (typeof token === 'string') {
        return {
          kind: 'pending',
          data: { ...target, token } as GenericPendingPayload
        }
      }
    }
    if (
      target?.status === 'EXECUTED' ||
      target?.status === 'REJECTED' ||
      target?.status === 'TOKEN_EXPIRED' ||
      target?.status === 'ERROR'
    ) {
      return {
        kind: 'execution',
        data: {
          columns: [],
          rows: [],
          ...target
        } as SqlExecutionPayload
      }
    }
    return null
  }

  // 1. 尝试直接解析完整内容
  try {
    const json = JSON.parse(trimmed)
    const res = extractFromValue(json)
    if (res) return res
  } catch {
    // 忽略，继续后面步骤
  }

  // 2. 逐行寻找以 { 或 [ 开头并以 } 或 ] 结尾的行进行解析
  const lines = trimmed.split('\n')
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (
      (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) ||
      (trimmedLine.startsWith('[') && trimmedLine.endsWith(']'))
    ) {
      try {
        const json = JSON.parse(trimmedLine)
        const res = extractFromValue(json)
        if (res) return res
      } catch {
        // 静默忽略，继续检查下一行
      }
    }
  }

  // 3. 特殊容错：如果 trimmed 包含 JSON 子串，可以使用匹配法提取
  try {
    const jsonStartIdx = trimmed.indexOf('{')
    const arrayStartIdx = trimmed.indexOf('[')
    let startIdx = -1
    let endChar = ''
    if (jsonStartIdx !== -1 && (arrayStartIdx === -1 || jsonStartIdx < arrayStartIdx)) {
      startIdx = jsonStartIdx
      endChar = '}'
    } else if (arrayStartIdx !== -1) {
      startIdx = arrayStartIdx
      endChar = ']'
    }

    if (startIdx !== -1) {
      const endIdx = trimmed.lastIndexOf(endChar)
      if (endIdx > startIdx) {
        const potentialJson = trimmed.slice(startIdx, endIdx + 1)
        try {
          const json = JSON.parse(potentialJson)
          const res = extractFromValue(json)
          if (res) return res
        } catch {
          // 忽略
        }
      }
    }
  } catch {
    // 忽略
  }

  return null
}

/**
 * 历史消息中的 PENDING_APPROVAL 卡片视为已处理（避免对过往会话重复触发审批）。
 * 只把"最后一条消息"中的 token 保留为未消费，让用户可以继续审批最新一张未操作的卡片。
 */
function syncConsumedTokensFromHistory() {
  const next = new Set<string>()
  const lastIdx = messages.value.length - 1
  messages.value.forEach((msg, mi) => {
    if (msg.role !== 'assistant') return
    const segments = parseMessageContent(msg.content || '')
    segments.forEach((seg) => {
      if (seg.type !== 'observation') return
      const parsed = parseSqlPayload(seg.content)
      if (parsed?.kind === 'pending' && mi !== lastIdx) {
        next.add(parsed.data.token || '')
      }
    })
  })
  consumedTokens.value = next
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
    toolCallingName.value = ''
    streamBuffers.reasoning += piece
    applyStreamContent(msgIdx)
    scrollToBottom()
    return
  }
  if (eventType === 'tool_result') {
    // 从 JSON 中提取工具名称，显示"正在调用工具 [xxx]..."状态
    try {
      const parsed = JSON.parse(dataStr) as { tool?: string }
      toolCallingName.value = parsed.tool || '工具'
    } catch {
      toolCallingName.value = '工具'
    }
    streamBuffers.tools = appendToolResult(streamBuffers.tools, dataStr)
    applyStreamContent(msgIdx)
    scrollToBottom()
    // 短暂延迟后清除调用状态，让用户看到结果过渡
    setTimeout(() => { toolCallingName.value = '' }, 800)
    return
  }
  if (eventType === 'retrieval') {
    // 检索来源为单行 JSON，一次性到达
    streamBuffers.retrieval += piece
    applyStreamContent(msgIdx)
    scrollToBottom()
    return
  }
  if (eventType === 'error') {
    toolCallingName.value = ''
    streamBuffers.message += (streamBuffers.message ? '\n\n' : '') + `[错误] ${dataStr}`
    applyStreamContent(msgIdx)
    return
  }
  // message 或未知类型：走打字机
  toolCallingName.value = ''
  if (isFirstLine) {
    typewriterQueue += dataStr
  } else {
    typewriterQueue += '\n' + dataStr
  }
}

/**
 * 通用流式调用：发送任意 SendMessageRequest 体，处理 SSE 帧并写回到 assistantMsgIndex 行。
 * 普通对话与 SQL 审批确认都复用此入口。
 */
async function streamSend(payload: Record<string, unknown>) {
  if (!props.selectedConversation) return
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
        ...payload
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
      if (!line.startsWith('data:')) return
      const dataStr = line.slice(5).trimStart()
      if (dataStr === '[DONE]') {
        streamDone = true
        return
      }
      if (dataStr.startsWith('[CONV_ID]')) {
        console.log('当前流式会话 ID:', dataStr.slice(9))
        return
      }
      if (dataStr === 'memory_compressed') {
        isCompressing.value = true
        setTimeout(() => { isCompressing.value = false }, 2500)
        return
      }
      appendSseData(assistantMsgIndex, currentEvent, dataStr, isFirstDataLineInEvent)
      isFirstDataLineInEvent = false
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

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || !props.selectedConversation || isLoading.value) return

  messages.value.push({ role: 'user', content: text, timestamp: new Date().toISOString() })
  inputText.value = ''
  await streamSend({ content: text })
}

/**
 * 通用人机协同（HITL）审批动作的统一入口：将 token 标记为已消费后调用 streamSend，
 * 后端 ChatBizImpl.sendMessageStream 检测 hitlAction != null 会调用 GenericHitlBiz。
 */
async function handleHitlAction(token: string, action: 'APPROVE' | 'REJECT' | 'EDIT', editedParams?: Record<string, any>) {
  if (!props.selectedConversation || isLoading.value) return
  if (consumedTokens.value.has(token)) return
  consumedTokens.value.add(token)
  await streamSend({
    content: '',
    hitlAction: action,
    hitlToken: token,
    ...(action === 'EDIT' && editedParams ? { editedParameters: editedParams } : {})
  })
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
      <div class="welcome-mark" aria-hidden="true"><Bot :size="28" :stroke-width="1.75" /></div>
      <h1 class="welcome-title">{{ isLoggedIn ? '开始一次对话' : '欢迎使用 AgentScope' }}</h1>
      <p class="welcome-sub">{{ isLoggedIn ? '从左侧选择一个对话，或新建对话与智能体交流' : '登录后即可创建智能体、管理知识库并开始对话' }}</p>
      <div class="welcome-actions">
        <el-button v-if="isLoggedIn" type="primary" @click="emit('newChat')">
          <MessageSquarePlus :size="16" :stroke-width="1.75" /><span>新建对话</span>
        </el-button>
        <el-button v-else type="primary" @click="emit('login')">
          <LogIn :size="16" :stroke-width="1.75" /><span>登录</span>
        </el-button>
        <el-button @click="emit('createAgent')">
          <Bot :size="16" :stroke-width="1.75" /><span>创建智能体</span>
        </el-button>
      </div>
    </div>

    <!-- Chat view -->
    <template v-else>
      <header class="chat-header">
        <div class="chat-header-info">
          <div class="chat-header-title">{{ selectedConversation.title }}</div>
          <div v-if="selectedAgent" class="chat-header-meta">
            <span>{{ selectedAgent.name }}</span>
            <el-tag size="small" type="info" effect="plain" class="mono">{{ selectedAgent.model }}</el-tag>
          </div>
        </div>
        <!-- 记忆状态 Badge -->
        <div
          v-if="selectedAgent && memoryBadgeText"
          :class="['memory-badge', { warn: memoryBadgeWarn, compressing: isCompressing }]"
        >
          <component :is="memoryModeIcon" :size="14" :stroke-width="1.75" />
          <span>{{ memoryBadgeText }}</span>
        </div>
      </header>

      <!-- Messages -->
      <div class="messages-area">
        <div class="messages-inner">
          <div v-if="messages.length === 0" class="messages-empty">发送一条消息开始对话</div>

          <template v-for="(msg, idx) in messages" :key="idx">
            <div v-if="shouldShowMessage(msg, idx)" :class="['message-row', msg.role]">
              <div class="avatar" aria-hidden="true">
                <User v-if="msg.role === 'user'" :size="16" :stroke-width="1.75" />
                <Bot v-else :size="16" :stroke-width="1.75" />
              </div>
              <div class="bubble-wrap">
                <!-- 用户消息：直接渲染 Markdown -->
                <div v-if="msg.role === 'user'" class="bubble markdown-body" v-html="renderMarkdown(msg.content)"></div>

                <!-- 助手消息：解析流式推理与工具调用段落 -->
                <div v-else class="bubble assistant-bubble-container">
                  <template v-for="(segment, segIdx) in parseMessageContent(msg.content)" :key="segIdx">
                    <!-- 普通文本段落 -->
                    <div v-if="segment.type === 'text'" class="bubble-text markdown-body" v-html="renderMarkdown(segment.content)"></div>

                    <!-- 知识库引用来源（GENERIC 前置检索） -->
                    <RetrievalSources v-else-if="segment.type === 'retrieval'" :json="segment.content" />

                    <!-- SQL Agent/Generic HITL: PENDING_APPROVAL 审批卡片 -->
                    <template v-else-if="segment.type === 'observation' && parseSqlPayload(segment.content)?.kind === 'pending'">
                      <GenericApprovalCard
                        :payload="(parseSqlPayload(segment.content)!.data as GenericPendingPayload)"
                        :consumed="consumedTokens.has((parseSqlPayload(segment.content)!.data as GenericPendingPayload).token || '')"
                        @approve="(t) => handleHitlAction(t, 'APPROVE')"
                        @reject="(t) => handleHitlAction(t, 'REJECT')"
                        @edit="(t, p) => handleHitlAction(t, 'EDIT', p)"
                      />
                    </template>

                    <!-- SQL Agent: 执行结果表格 -->
                    <template v-else-if="segment.type === 'observation' && parseSqlPayload(segment.content)?.kind === 'execution'">
                      <SqlResultTable :payload="(parseSqlPayload(segment.content)!.data as SqlExecutionPayload)" />
                    </template>

                    <!-- 可折叠的推理/工具调用段落（其它情况） -->
                    <div v-else :class="['reasoning-container', segment.type]">
                      <button
                        type="button"
                        class="reasoning-header"
                        :aria-expanded="!isCollapsed(idx, segIdx)"
                        @click="toggleCollapse(idx, segIdx)"
                      >
                        <span class="reasoning-icon">
                          <Brain v-if="segment.type === 'think'" :size="14" :stroke-width="1.75" />
                          <Wrench v-else-if="segment.type === 'action'" :size="14" :stroke-width="1.75" />
                          <Eye v-else-if="segment.type === 'observation'" :size="14" :stroke-width="1.75" />
                        </span>
                        <span class="reasoning-title">{{ segment.title }}</span>
                        <ChevronRight :class="['chevron-icon', { expanded: !isCollapsed(idx, segIdx) }]" :size="16" :stroke-width="1.75" />
                      </button>
                      <div v-show="!isCollapsed(idx, segIdx)" class="reasoning-content markdown-body" v-html="renderMarkdown(segment.content)"></div>
                    </div>
                  </template>
                </div>
                <div class="msg-time">{{ formatTime(msg.timestamp) }}</div>
              </div>
            </div>
          </template>

          <!-- Tool calling indicator -->
          <div v-if="toolCallingName" class="message-row assistant">
            <div class="avatar" aria-hidden="true"><Bot :size="16" :stroke-width="1.75" /></div>
            <div class="bubble-wrap">
              <div class="status-pill">
                <span class="spinner" aria-hidden="true"></span>
                <span>正在调用工具 <strong class="mono">{{ toolCallingName }}</strong></span>
              </div>
            </div>
          </div>

          <!-- Loading indicator -->
          <div v-if="isLoading && !toolCallingName" class="message-row assistant">
            <div class="avatar" aria-hidden="true"><Bot :size="16" :stroke-width="1.75" /></div>
            <div class="bubble-wrap">
              <div class="bubble loading-bubble" aria-label="正在生成">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
            </div>
          </div>

          <div ref="messagesEndRef"></div>
        </div>
      </div>

      <!-- Input area -->
      <div class="input-area">
        <div class="input-box">
          <textarea
            v-model="inputText"
            class="input-textarea"
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            aria-label="消息输入"
            rows="2"
            @keydown="handleKeydown"
          ></textarea>
          <div class="input-toolbar">
            <span class="input-hint">内容由 AI 生成，请核实重要信息</span>
            <el-button
              type="primary"
              class="send-btn"
              :disabled="!inputText.trim() || isLoading"
              aria-label="发送"
              @click="sendMessage"
            >
              <SendHorizontal :size="16" :stroke-width="1.75" />
            </el-button>
          </div>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
.chat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-bg-surface);
}

/* 按钮内图标与文字对齐 */
.chat-main :deep(.el-button > span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ── 空状态 ───────────────────────────────────── */
.welcome-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  background: var(--app-bg-subtle);
}
.welcome-mark {
  width: 56px;
  height: 56px;
  border-radius: var(--app-radius-lg);
  background: var(--app-primary-soft);
  color: var(--app-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.welcome-title {
  font-size: var(--app-font-size-lg);
  font-weight: 600;
}
.welcome-sub {
  font-size: var(--app-font-size-base);
  color: var(--app-text-secondary);
}
.welcome-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

/* ── 头部 ─────────────────────────────────────── */
.chat-header {
  height: 64px;
  flex-shrink: 0;
  padding: 0 24px;
  border-bottom: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.chat-header-info {
  min-width: 0;
}
.chat-header-title {
  font-size: var(--app-font-size-md);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-header-meta {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-secondary);
}

.memory-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--app-radius);
  background: var(--app-primary-soft);
  color: var(--app-primary);
  font-size: var(--app-font-size-xs);
  font-weight: 500;
  white-space: nowrap;
}
.memory-badge.warn {
  background: var(--app-warning-soft);
  color: var(--app-warning);
}
.memory-badge.compressing {
  animation: memoryPulse 1s ease-in-out infinite;
}
@keyframes memoryPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* ── 消息区 ───────────────────────────────────── */
.messages-area {
  flex: 1;
  overflow-y: auto;
  background: var(--app-bg-subtle);
}
.messages-inner {
  max-width: 820px;
  margin: 0 auto;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.messages-empty {
  padding: 80px 0;
  text-align: center;
  font-size: var(--app-font-size-base);
  color: var(--app-text-tertiary);
}

.message-row {
  display: flex;
  gap: 12px;
  width: 100%;
}
.message-row.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--app-radius-lg);
  border: 1px solid var(--app-border);
  background: var(--app-bg-surface);
  color: var(--app-text-regular);
  display: flex;
  align-items: center;
  justify-content: center;
}
.message-row.user .avatar {
  border-color: transparent;
  background: var(--app-primary-soft);
  color: var(--app-primary);
}

.bubble-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: calc(100% - 44px);
}
.message-row.assistant .bubble-wrap {
  flex: 1;
}
.message-row.user .bubble-wrap {
  align-items: flex-end;
}

.bubble {
  font-size: var(--app-font-size-base);
  line-height: 1.7;
  word-break: break-word;
}
.message-row.user .bubble {
  padding: 10px 14px;
  border-radius: var(--app-radius-lg);
  background: var(--app-primary);
  color: var(--app-text-inverse);
}
.message-row.assistant .bubble {
  color: var(--app-text-primary);
}

/* ── Markdown 排版 ────────────────────────────── */
.markdown-body :deep(p) {
  margin: 0 0 10px;
  line-height: 1.7;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 16px 0 8px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--app-text-primary);
}
.markdown-body :deep(h1) { font-size: 1.35em; }
.markdown-body :deep(h2) { font-size: 1.2em; }
.markdown-body :deep(h3) { font-size: 1.1em; }
.markdown-body :deep(h4) { font-size: 1em; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 10px;
  padding-left: 22px;
}
.markdown-body :deep(li) {
  margin-bottom: 4px;
}
.markdown-body :deep(a) {
  color: var(--app-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.markdown-body :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 14px;
  border-radius: var(--app-radius);
  background: var(--app-bg-muted);
  color: var(--app-text-secondary);
}
.markdown-body :deep(code:not(pre code)) {
  padding: 1px 6px;
  border-radius: var(--app-radius-sm);
  background: var(--app-inline-code-bg);
  color: var(--app-inline-code-text);
  font-family: var(--app-font-mono);
  font-size: 0.9em;
}
.markdown-body :deep(pre.hljs) {
  margin: 12px 0;
  padding: 12px 14px;
  border-radius: var(--app-radius-lg);
  border: 1px solid var(--app-code-border);
  background: var(--app-code-bg) !important;
  overflow-x: auto;
}
.markdown-body :deep(pre.hljs code) {
  font-family: var(--app-font-mono);
  font-size: 0.88em;
  line-height: 1.55;
  color: var(--app-code-text);
}
.markdown-body :deep(table) {
  width: 100%;
  margin: 12px 0;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  overflow: hidden;
  background: var(--app-bg-surface);
  font-size: var(--app-font-size-sm);
}
.markdown-body :deep(th) {
  padding: 8px 12px;
  text-align: left;
  font-weight: 500;
  color: var(--app-text-secondary);
  background: var(--app-bg-subtle);
  border-bottom: 1px solid var(--app-border);
}
.markdown-body :deep(td) {
  padding: 8px 12px;
  border-bottom: 1px solid var(--app-border);
}
.markdown-body :deep(tr:last-child td) {
  border-bottom: none;
}

/* 用户气泡在主色底上：文字、链接、行内代码统一为反白 */
.message-row.user .markdown-body :deep(p),
.message-row.user .markdown-body :deep(li),
.message-row.user .markdown-body :deep(a) {
  color: var(--app-text-inverse);
}
.message-row.user .markdown-body :deep(code:not(pre code)) {
  background: rgba(255, 255, 255, 0.18);
  color: var(--app-text-inverse);
}

.msg-time {
  padding: 0 2px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}

/* ── 推理 / 工具调用折叠面板 ──────────────────── */
.assistant-bubble-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reasoning-container {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-surface);
  overflow: hidden;
}
.reasoning-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: none;
  background: transparent;
  font-size: var(--app-font-size-sm);
  color: var(--app-text-regular);
  text-align: left;
  cursor: pointer;
}
.reasoning-header:hover {
  background: var(--app-bg-subtle);
}
.reasoning-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: var(--app-radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.reasoning-container.think .reasoning-icon {
  background: var(--app-primary-soft);
  color: var(--app-primary);
}
.reasoning-container.action .reasoning-icon {
  background: var(--app-warning-soft);
  color: var(--app-warning);
}
.reasoning-container.observation .reasoning-icon {
  background: var(--app-success-soft);
  color: var(--app-success);
}
.reasoning-title {
  flex: 1;
  font-weight: 500;
}
.chevron-icon {
  color: var(--app-text-tertiary);
  transition: transform 0.2s ease;
}
.chevron-icon.expanded {
  transform: rotate(90deg);
}
.reasoning-content {
  padding: 10px 14px 12px;
  border-top: 1px solid var(--app-border);
  font-size: var(--app-font-size-sm);
  color: var(--app-text-secondary);
}
.reasoning-content.markdown-body :deep(p) {
  font-size: var(--app-font-size-sm);
  margin-bottom: 8px;
}
.reasoning-content.markdown-body :deep(pre.hljs) {
  margin: 8px 0;
  padding: 10px 12px;
}

/* ── 状态指示 ─────────────────────────────────── */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: var(--app-radius);
  background: var(--app-warning-soft);
  color: var(--app-warning);
  font-size: var(--app-font-size-sm);
}
.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-bubble {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 10px 0;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-text-tertiary);
  animation: bounce 1.2s infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-5px); opacity: 1; }
}

/* ── 输入区 ───────────────────────────────────── */
.input-area {
  flex-shrink: 0;
  padding: 12px 24px 20px;
  background: var(--app-bg-subtle);
}
.input-box {
  max-width: 772px;
  margin: 0 auto;
  padding: 10px 10px 8px 14px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-surface);
  box-shadow: var(--app-shadow-sm);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input-box:focus-within {
  border-color: var(--app-primary);
  box-shadow: 0 0 0 3px var(--app-primary-soft);
}
.input-textarea {
  width: 100%;
  max-height: 160px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--app-text-primary);
  font-size: var(--app-font-size-base);
  line-height: 1.6;
}
.input-textarea::placeholder {
  color: var(--app-text-disabled);
}
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}
.input-hint {
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}
.send-btn {
  width: 36px;
  padding: 0;
}
</style>
