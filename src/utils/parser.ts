export interface ParsedSegment {
  type: 'think' | 'action' | 'observation' | 'text'
  content: string
  title?: string
}

export function parseMessageContent(content: string): ParsedSegment[] {
  if (!content) return []
  
  const segments: ParsedSegment[] = []
  let currentIndex = 0
  
  // 1. 先进行 DeepSeek 风格 <think> 标签的提取
  while (currentIndex < content.length) {
    const thinkStart = content.indexOf('<think>', currentIndex)
    if (thinkStart === -1) {
      const rest = content.slice(currentIndex)
      if (rest) {
        segments.push(...parseReActSegments(rest))
      }
      break
    }
    
    if (thinkStart > currentIndex) {
      const preceding = content.slice(currentIndex, thinkStart)
      if (preceding) {
        segments.push(...parseReActSegments(preceding))
      }
    }
    
    const thinkEnd = content.indexOf('</think>', thinkStart + 7)
    if (thinkEnd === -1) {
      // 未闭合的 think 块（流式传输中）
      segments.push({
        type: 'think',
        content: content.slice(thinkStart + 7),
        title: '思考过程'
      })
      currentIndex = content.length
    } else {
      segments.push({
        type: 'think',
        content: content.slice(thinkStart + 7, thinkEnd),
        title: '思考过程'
      })
      currentIndex = thinkEnd + 8
    }
  }
  
  return segments.filter(seg => seg.content || seg.type !== 'text')
}

export function parseReActSegments(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []
  const lines = text.split('\n')
  
  let currentType: 'think' | 'action' | 'observation' | 'text' = 'text'
  let currentLines: string[] = []
  
  const flush = () => {
    if (currentLines.length > 0) {
      const content = currentLines.join('\n')
      if (content.trim() || currentType !== 'text') {
        segments.push({
          type: currentType,
          content: content,
          title: currentType === 'think' ? '思考过程' : currentType === 'action' ? '工具调用' : currentType === 'observation' ? '工具返回' : undefined
        })
      }
      currentLines = []
    }
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    
    const thoughtMatch = line.match(/^Thought\s*:\s*(.*)/i)
    const actionMatch = line.match(/^Action\s*:\s*(.*)/i)
    const obsMatch = line.match(/^Observation\s*:\s*(.*)/i)
    
    if (thoughtMatch) {
      flush()
      currentType = 'think'
      currentLines.push(thoughtMatch[1])
    } else if (actionMatch) {
      flush()
      currentType = 'action'
      currentLines.push(actionMatch[1])
    } else if (obsMatch) {
      flush()
      currentType = 'observation'
      currentLines.push(obsMatch[1])
    } else {
      // 遇到空行且处于推理/工具块中，切换回普通文本以防吞咽后续内容
      if (trimmed === '' && currentType !== 'text') {
        flush()
        currentType = 'text'
      } else {
        currentLines.push(line)
      }
    }
  }
  
  flush()
  return segments
}
