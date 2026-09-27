<script setup lang="ts">
import { computed, ref } from 'vue'
import { BookOpen, ChevronRight, FileText, AlertTriangle, Search } from 'lucide-vue-next'
import md from '@/utils/markdown'
import { parseRetrieval, sourceLabel, expandModeLabel } from '@/utils/retrieval'

/**
 * 对话中的「引用来源」折叠块：展示检索词（含改写）与每段来源的文档名 › 章节 › 切片范围，
 * 展开单条来源可查看交给模型的原文片段。数据来自 SSE retrieval 事件或历史消息中的 <retrieval> 块。
 */
const props = defineProps<{
  /** retrieval JSON 原文 */
  json: string
}>()

const info = computed(() => parseRetrieval(props.json))
const segments = computed(() => info.value?.segments ?? [])

/** 整个折叠块是否展开（默认收起） */
const open = ref(false)
/** 已展开原文的来源编号 */
const openedCitations = ref<Set<number>>(new Set())

function toggleSegment(citation: number) {
  const next = new Set(openedCitations.value)
  if (next.has(citation)) {
    next.delete(citation)
  } else {
    next.add(citation)
  }
  openedCitations.value = next
}

const title = computed(() =>
  segments.value.length > 0 ? `引用了 ${segments.value.length} 个来源` : '未检索到相关内容'
)
</script>

<template>
  <div v-if="info" class="retrieval-container">
    <button type="button" class="retrieval-header" :aria-expanded="open" @click="open = !open">
      <span class="retrieval-icon"><BookOpen :size="14" :stroke-width="1.75" /></span>
      <span class="retrieval-title">{{ title }}</span>
      <span v-if="info.rewriteApplied" class="retrieval-query" :title="`原问题：${info.query}`">
        <Search :size="12" :stroke-width="1.75" />检索词：{{ info.rewrittenQuery }}
      </span>
      <ChevronRight :class="['chevron-icon', { expanded: open }]" :size="16" :stroke-width="1.75" />
    </button>

    <div v-show="open" class="retrieval-body">
      <ol v-if="segments.length > 0" class="source-list">
        <li v-for="seg in segments" :key="seg.citation" class="source-item">
          <button type="button" class="source-head" :aria-expanded="openedCitations.has(seg.citation)" @click="toggleSegment(seg.citation)">
            <span class="source-no mono">[{{ seg.citation }}]</span>
            <FileText class="source-file-icon" :size="14" :stroke-width="1.75" />
            <span class="source-label" :title="sourceLabel(seg)">{{ sourceLabel(seg) }}</span>
            <el-tag size="small" effect="plain" type="info" class="source-tag">{{ expandModeLabel(seg.expandMode) }}</el-tag>
            <ChevronRight :class="['chevron-icon', { expanded: openedCitations.has(seg.citation) }]" :size="14" :stroke-width="1.75" />
          </button>
          <div
            v-if="openedCitations.has(seg.citation)"
            class="source-content markdown-body"
            v-html="md.render(seg.content || '')"
          ></div>
        </li>
      </ol>
      <ul v-if="info.warnings && info.warnings.length > 0" class="warning-list">
        <li v-for="(w, i) in info.warnings" :key="i">
          <AlertTriangle :size="12" :stroke-width="1.75" /><span>{{ w }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.retrieval-container {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-surface);
  overflow: hidden;
}
.retrieval-header {
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
.retrieval-header:hover {
  background: var(--app-bg-subtle);
}
.retrieval-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: var(--app-radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--app-primary-soft);
  color: var(--app-primary);
}
.retrieval-title {
  font-weight: 500;
  flex-shrink: 0;
}
.retrieval-query {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.retrieval-title + .chevron-icon {
  margin-left: auto;
}
.chevron-icon {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
  transition: transform 0.2s ease;
}
.chevron-icon.expanded {
  transform: rotate(90deg);
}
.retrieval-body {
  border-top: 1px solid var(--app-border);
  padding: 6px 8px 8px;
}
.source-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.source-item + .source-item {
  border-top: 1px dashed var(--app-border);
}
.source-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 6px;
  border: none;
  background: transparent;
  font-size: var(--app-font-size-sm);
  color: var(--app-text-regular);
  text-align: left;
  cursor: pointer;
  border-radius: var(--app-radius-sm);
}
.source-head:hover {
  background: var(--app-bg-subtle);
}
.source-no {
  color: var(--app-primary);
  flex-shrink: 0;
}
.source-file-icon {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}
.source-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.source-tag {
  flex-shrink: 0;
}
.source-content {
  margin: 2px 6px 8px 28px;
  padding: 8px 10px;
  max-height: 320px;
  overflow: auto;
  border-radius: var(--app-radius-md, 6px);
  background: var(--app-bg-subtle);
  font-size: var(--app-font-size-xs);
  color: var(--app-text-secondary);
}
.source-content :deep(table) {
  font-size: var(--app-font-size-xs);
}
.warning-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0 6px;
}
.warning-list li {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--app-font-size-xs);
  color: var(--app-warning);
  line-height: 1.6;
}
.warning-list li svg {
  margin-top: 3px;
  flex-shrink: 0;
}
</style>
