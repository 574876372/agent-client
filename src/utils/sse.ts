/** 流式 SSE 分路缓冲区 */
export interface StreamBuffers {
  /** 检索来源 JSON（retrieval 事件），未检索时为空串 */
  retrieval: string
  reasoning: string
  tools: string
  message: string
}

export function createStreamBuffers(): StreamBuffers {
  return { retrieval: '', reasoning: '', tools: '', message: '' }
}

/**
 * 将分路缓冲合并为可被 parseMessageContent 解析的单一文本。
 * 格式与后端持久化一致：<retrieval>…</retrieval><think>…</think>{工具摘要}{回复}
 */
export function mergeStreamContent(buf: StreamBuffers): string {
  let content = ''
  if (buf.retrieval) {
    // 与后端持久化一致：把 </ 转义为 <\/（仍是合法 JSON），防止原文中的 </retrieval> 提前闭合标签
    content += `<retrieval>${buf.retrieval.replace(/<\//g, '<\\/')}</retrieval>`
  }
  if (buf.reasoning) {
    content += `<think>${buf.reasoning}</think>`
  }
  content += buf.tools
  content += buf.message
  return content
}

/** 解析 tool_result 事件的 JSON 并追加 ReAct 行 */
export function appendToolResult(tools: string, json: string): string {
  try {
    const parsed = JSON.parse(json) as { tool?: string; output?: string }
    const tool = parsed.tool ?? 'tool'
    const output = parsed.output ?? ''
    return `${tools}Action: ${tool}\nObservation: ${output}\n`
  } catch {
    return tools
  }
}

export type SseEventType = 'message' | 'reasoning' | 'tool_result' | 'retrieval' | 'control' | 'error'

/** 解析 SSE event 行 */
export function parseSseEventLine(line: string): SseEventType | null {
  if (!line.startsWith('event:')) return null
  const name = line.slice(6).trim()
  if (name === 'reasoning' || name === 'tool_result' || name === 'message' || name === 'retrieval' || name === 'error') {
    return name
  }
  return 'control'
}
