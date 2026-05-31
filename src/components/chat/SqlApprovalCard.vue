<script setup lang="ts">
import { computed, ref } from 'vue'
import hljs from 'highlight.js/lib/core'
import sql from 'highlight.js/lib/languages/sql'
import 'highlight.js/styles/github-dark.css'

hljs.registerLanguage('sql', sql)

/**
 * 后端 query_database 工具 PENDING_APPROVAL 返回结构。
 * 字段与 starter QueryDatabaseTool#queryDatabase 输出一致。
 */
interface PendingPayload {
  status: 'PENDING_APPROVAL'
  datasourceId?: string
  sql: string
  token: string
  estimatedRows?: number
  warnings?: string[]
  rowLimit?: number
}

const props = defineProps<{
  payload: PendingPayload
  /** 当卡片所属 token 已被消费后，外部置位以禁用按钮 */
  consumed?: boolean
}>()

const emit = defineEmits<{
  (e: 'approve', token: string): void
  (e: 'reject', token: string): void
  (e: 'edit', token: string, editedSql: string): void
}>()

const isEditing = ref(false)
const editedSql = ref(props.payload.sql)

const highlightedSql = computed(() => {
  try {
    return hljs.highlight(props.payload.sql, { language: 'sql', ignoreIllegals: true }).value
  } catch {
    return props.payload.sql
  }
})

const editedHighlighted = computed(() => {
  try {
    return hljs.highlight(editedSql.value, { language: 'sql', ignoreIllegals: true }).value
  } catch {
    return editedSql.value
  }
})

function toggleEdit() {
  if (props.consumed) return
  isEditing.value = !isEditing.value
  if (isEditing.value) {
    editedSql.value = props.payload.sql
  }
}

function submitEdit() {
  if (props.consumed) return
  const text = editedSql.value.trim()
  if (!text) {
    return
  }
  emit('edit', props.payload.token, text)
}

function copySql() {
  navigator.clipboard?.writeText(props.payload.sql).catch(() => { /* 忽略复制失败 */ })
}
</script>

<template>
  <div :class="['sql-card', { consumed }]">
    <header class="sql-card-header">
      <span class="sql-icon">🗄️</span>
      <span class="sql-title">SQL 审批</span>
      <span v-if="payload.datasourceId" class="sql-ds">数据源 {{ payload.datasourceId }}</span>
      <span v-if="consumed" class="sql-consumed-badge">已处理</span>
    </header>

    <div class="sql-meta-row" v-if="(payload.estimatedRows ?? 0) > 0 || (payload.warnings?.length ?? 0) > 0">
      <span v-if="payload.estimatedRows != null" class="meta-pill rows">
        预估扫描 ~{{ payload.estimatedRows.toLocaleString() }} 行
      </span>
      <span v-if="payload.rowLimit != null" class="meta-pill limit">
        LIMIT {{ payload.rowLimit }}
      </span>
      <span v-for="(w, i) in payload.warnings || []" :key="i" class="meta-pill warn">⚠ {{ w }}</span>
    </div>

    <div v-if="!isEditing" class="sql-block">
      <pre class="hljs"><code v-html="highlightedSql"></code></pre>
      <button class="btn-copy" @click="copySql" title="复制 SQL">📋</button>
    </div>
    <div v-else class="sql-block editing">
      <textarea
        v-model="editedSql"
        class="sql-textarea"
        rows="6"
        spellcheck="false"
        placeholder="在此修改 SQL 后点击「保存并执行」"
      />
      <div class="sql-preview" v-if="editedSql.trim()">
        <div class="sql-preview-label">预览（语法高亮）</div>
        <pre class="hljs"><code v-html="editedHighlighted"></code></pre>
      </div>
    </div>

    <footer class="sql-card-footer">
      <template v-if="!isEditing">
        <button class="btn-primary" :disabled="consumed" @click="emit('approve', payload.token)">
          ✓ 执行
        </button>
        <button class="btn-secondary" :disabled="consumed" @click="toggleEdit">✎ 编辑</button>
        <button class="btn-ghost" :disabled="consumed" @click="emit('reject', payload.token)">
          ✕ 取消
        </button>
      </template>
      <template v-else>
        <button class="btn-primary" :disabled="consumed || !editedSql.trim()" @click="submitEdit">
          ✓ 保存并执行
        </button>
        <button class="btn-ghost" @click="toggleEdit">← 返回</button>
      </template>
    </footer>
  </div>
</template>

<style scoped>
.sql-card {
  border: 1px solid #2a2a2a;
  border-left: 3px solid #4d6bfe;
  border-radius: 10px;
  background: #141414;
  padding: 12px 14px;
  margin: 6px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sql-card.consumed {
  opacity: 0.65;
  border-left-color: #444;
}

.sql-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.sql-icon { font-size: 16px; }
.sql-title { font-weight: 600; color: #e8e8e8; }
.sql-ds {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: #888;
  background: #1f1f1f;
  border-radius: 4px;
  padding: 2px 6px;
}
.sql-consumed-badge {
  margin-left: auto;
  background: #2a2a2a;
  color: #888;
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 11px;
}

.sql-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.meta-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #1f1f1f;
  color: #aaa;
}
.meta-pill.rows { background: #1a3a4a; color: #67e8f9; }
.meta-pill.limit { background: #2a2a4a; color: #a5b4fc; }
.meta-pill.warn { background: #4a2a1a; color: #fbbf24; }

.sql-block {
  position: relative;
  background: #0d1117;
  border: 1px solid #20262e;
  border-radius: 8px;
  padding: 10px 12px;
}
.sql-block pre.hljs {
  margin: 0;
  background: transparent !important;
  padding: 0;
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.btn-copy {
  position: absolute;
  top: 6px;
  right: 6px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
}
.btn-copy:hover { color: #fff; }

.sql-textarea {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: #c9d1d9;
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  resize: vertical;
  min-height: 96px;
}
.sql-preview {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #20262e;
}
.sql-preview-label {
  font-size: 11px;
  color: #666;
  margin-bottom: 4px;
}

.sql-card-footer {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn-primary, .btn-secondary, .btn-ghost {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.btn-primary {
  background: #4d6bfe;
  border: 1px solid #4d6bfe;
  color: #fff;
}
.btn-primary:hover:not(:disabled) { background: #3a56e8; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-secondary {
  background: #1f1f1f;
  border: 1px solid #2a2a2a;
  color: #ccc;
}
.btn-secondary:hover:not(:disabled) { background: #2a2a2a; color: #fff; }
.btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-ghost {
  background: transparent;
  border: 1px solid transparent;
  color: #888;
}
.btn-ghost:hover:not(:disabled) { color: #ccc; }
.btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
