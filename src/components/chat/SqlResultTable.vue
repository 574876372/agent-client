<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Table2 } from 'lucide-vue-next'

/**
 * 后端 SqlExecutionResult JSON 结构（与 starter `executor/SqlExecutionResult.java` 对齐）。
 */
interface ExecutionPayload {
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

const props = defineProps<{
  payload: ExecutionPayload
}>()

const expanded = ref(false)
const MAX_VISIBLE = 50

const visibleRows = computed(() => {
  if (expanded.value || (props.payload.rows?.length ?? 0) <= MAX_VISIBLE) {
    return props.payload.rows ?? []
  }
  return (props.payload.rows ?? []).slice(0, MAX_VISIBLE)
})

const hiddenCount = computed(() => {
  const total = props.payload.rows?.length ?? 0
  return Math.max(0, total - MAX_VISIBLE)
})

function exportCsv() {
  const cols = props.payload.columns ?? []
  const rows = props.payload.rows ?? []
  const escape = (val: unknown) => {
    if (val == null) return ''
    const s = String(val)
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const lines = [cols.map(escape).join(',')]
  for (const row of rows) {
    lines.push(row.map(escape).join(','))
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sql-result-${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function cellText(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val)
}
</script>

<template>
  <div class="sql-result">
    <header class="result-head">
      <span class="head-icon" aria-hidden="true"><Table2 :size="15" :stroke-width="1.75" /></span>
      <span class="head-title">查询结果</span>
      <span class="head-meta">{{ payload.rowCount }} 行 · {{ payload.elapsedMs }} ms</span>
      <el-tag v-if="payload.truncated" size="small" type="warning" effect="plain">已截断</el-tag>
      <span class="head-spacer" />
      <el-button v-if="(payload.rows?.length ?? 0) > 0" size="small" @click="exportCsv">
        <Download :size="14" :stroke-width="1.75" /><span>导出 CSV</span>
      </el-button>
    </header>

    <div v-if="payload.status !== 'EXECUTED'" class="result-banner">
      <el-alert
        :title="payload.message || payload.error || payload.status"
        :type="payload.status === 'ERROR' ? 'error' : payload.status === 'TOKEN_EXPIRED' ? 'warning' : 'info'"
        :closable="false"
        show-icon
      />
    </div>

    <div v-else-if="(payload.rows?.length ?? 0) === 0" class="result-empty">未返回任何数据</div>

    <div v-else class="result-table-wrap">
      <table class="result-table">
        <thead>
          <tr>
            <th v-for="(col, i) in payload.columns" :key="i">{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in visibleRows" :key="ri">
            <td v-for="(cell, ci) in row" :key="ci" :title="cellText(cell)">{{ cellText(cell) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="hiddenCount > 0" class="result-fold">
        <el-button size="small" text type="primary" @click="expanded = !expanded">
          {{ expanded ? '收起' : `展开剩余 ${hiddenCount} 行` }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sql-result {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-surface);
  overflow: hidden;
}

.result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
}
.head-icon {
  width: 24px;
  height: 24px;
  border-radius: var(--app-radius-sm);
  background: var(--app-success-soft);
  color: var(--app-success);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.head-title {
  font-size: var(--app-font-size-base);
  font-weight: 600;
}
.head-meta {
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}
.head-spacer {
  flex: 1;
}
.result-head :deep(.el-button > span) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.result-banner {
  padding: 12px 14px;
}
.result-empty {
  padding: 20px;
  text-align: center;
  font-size: var(--app-font-size-sm);
  color: var(--app-text-tertiary);
}

.result-table-wrap {
  overflow-x: auto;
}
.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--app-font-size-sm);
}
.result-table th {
  padding: 8px 14px;
  text-align: left;
  white-space: nowrap;
  font-size: var(--app-font-size-xs);
  font-weight: 500;
  color: var(--app-text-secondary);
  background: var(--app-bg-subtle);
  border-bottom: 1px solid var(--app-border);
}
.result-table td {
  max-width: 320px;
  padding: 7px 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--app-font-mono);
  color: var(--app-text-primary);
  border-bottom: 1px solid var(--app-border);
}
.result-table tr:last-child td {
  border-bottom: none;
}
.result-table tbody tr:hover td {
  background: var(--app-bg-subtle);
}
.result-fold {
  padding: 6px 0;
  text-align: center;
  border-top: 1px solid var(--app-border);
}
</style>
