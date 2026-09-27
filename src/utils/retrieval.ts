/**
 * 知识库检索结果的类型定义与展示辅助。
 * 对应后端 RetrievalTrace / RetrievalSegment / RetrievalHit，供对话「引用来源」与知识库演练场共用。
 */

/** 最终交给模型的一段连续原文（一条引用来源） */
export interface RetrievalSegment {
  citation: number
  kbId: string
  kbName?: string
  docId: string
  docName?: string
  sectionPath?: string
  startIndex: number
  endIndex: number
  hitIndexes: number[]
  /** none=不扩展 / window=相邻切片 / section=整章 / section-partial=章节节选 / trimmed=超长被截断 */
  expandMode?: string
  bestRank?: number
  score?: number
  content: string
  charCount?: number
}

/** 检索流水线中的单个切片候选 */
export interface RetrievalHit {
  chunkId?: string
  kbId: string
  kbName?: string
  docId: string
  docName?: string
  chunkIndex: number
  sectionPath?: string
  chunkType?: string
  content: string
  vectorScore?: number
  vectorRank?: number
  keywordScore?: number
  keywordRank?: number
  fusedScore?: number
  rerankScore?: number
}

/** 对话中的 retrieval 事件载荷（不含各阶段中间结果） */
export interface RetrievalInfo {
  query: string
  rewrittenQuery: string
  rewriteApplied: boolean
  reranked?: boolean
  segments: RetrievalSegment[]
  warnings: string[]
  costMs?: number
}

/** 演练场返回的完整检索过程 */
export interface RetrievalTrace extends RetrievalInfo {
  vectorHits: RetrievalHit[]
  keywordHits: RetrievalHit[]
  fusedHits: RetrievalHit[]
  rerankModel?: string
  contextText?: string
  stageCostMs?: Record<string, number>
}

/** 安全解析 retrieval JSON；格式不对时返回 null */
export function parseRetrieval(json: string): RetrievalInfo | null {
  try {
    const data = JSON.parse(json)
    if (!data || !Array.isArray(data.segments)) return null
    return { warnings: [], ...data } as RetrievalInfo
  } catch {
    return null
  }
}

/** 切片范围文本，如「切片 #3-#6」 */
export function chunkRangeLabel(seg: Pick<RetrievalSegment, 'startIndex' | 'endIndex'>): string {
  return seg.startIndex === seg.endIndex ? `切片 #${seg.startIndex}` : `切片 #${seg.startIndex}-#${seg.endIndex}`
}

/** 来源标注：文档名 › 章节 › 切片范围 */
export function sourceLabel(seg: RetrievalSegment): string {
  const parts = [seg.docName || '未知文档']
  if (seg.sectionPath) parts.push(seg.sectionPath)
  parts.push(chunkRangeLabel(seg))
  return parts.join(' › ')
}

/** 扩展方式的中文说明 */
export function expandModeLabel(mode?: string): string {
  switch (mode) {
    case 'section':
      return '整章'
    case 'window':
      return '含相邻切片'
    case 'section-partial':
      return '章节节选'
    case 'trimmed':
      return '已截断'
    default:
      return '仅命中切片'
  }
}
