<script setup lang="ts">
import { computed, ref } from 'vue'

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
    <header class="sql-result-header">
      <span class="result-icon">📊</span>
      <span class="result-title">查询结果</span>
      <span class="result-meta">{{ payload.rowCount }} 行 · {{ payload.elapsedMs }}ms</span>
      <span v-if="payload.truncated" class="meta-pill truncated">已截断</span>
      <span class="spacer" />
      <button v-if="(payload.rows?.length ?? 0) > 0" class="btn-export" @click="exportCsv">导出 CSV</button>
    </header>

    <div v-if="payload.status !== 'EXECUTED'" :class="['result-banner', payload.status.toLowerCase()]">
      {{ payload.message || payload.error || payload.status }}
    </div>

    <div v-else-if="(payload.rows?.length ?? 0) === 0" class="result-empty">
      未返回任何数据
    </div>

    <div v-else class="result-table-wrap">
      <table class="result-table">
        <thead>
          <tr>
            <th v-for="(col, i) in payload.columns" :key="i">{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in visibleRows" :key="ri">
            <td v-for="(cell, ci) in row" :key="ci">{{ cellText(cell) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="hiddenCount > 0" class="result-fold">
        <button class="btn-fold" @click="expanded = !expanded">
          {{ expanded ? '收起' : `展开剩余 ${hiddenCount} 行` }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sql-result {
  border: 1px solid #2a2a2a;
  border-left: 3px solid #00ced1;
  border-radius: 10px;
  background: #141414;
  padding: 10px 12px;
  margin: 6px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sql-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.result-icon { font-size: 16px; }
.result-title { font-weight: 600; color: #e8e8e8; }
.result-meta {
  font-size: 11px;
  color: #888;
  background: #1f1f1f;
  border-radius: 4px;
  padding: 2px 8px;
}
.meta-pill.truncated {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #4a2a1a;
  color: #fbbf24;
}
.spacer { flex: 1; }

.btn-export {
  background: #1f1f1f;
  border: 1px solid #2a2a2a;
  color: #ccc;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}
.btn-export:hover { background: #2a2a2a; color: #fff; }

.result-banner {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
}
.result-banner.rejected { background: #2a2a2a; color: #ccc; }
.result-banner.token_expired { background: #4a3a1a; color: #fbbf24; }
.result-banner.error { background: #4a1d1d; color: #fca5a5; }

.result-empty {
  padding: 16px;
  text-align: center;
  color: #666;
  font-size: 13px;
}

.result-table-wrap {
  overflow-x: auto;
  border: 1px solid #20262e;
  border-radius: 8px;
  background: #0d1117;
}
.result-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12.5px;
}
.result-table th {
  background: #1c1c1c;
  color: #fff;
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid #2a2a2a;
  white-space: nowrap;
}
.result-table td {
  padding: 6px 12px;
  border-bottom: 1px solid #1a1a1a;
  color: #c0c0c0;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
  max-width: 320px;
  text-overflow: ellipsis;
  overflow: hidden;
}
.result-table tr:last-child td { border-bottom: none; }
.result-table tr:hover td { background: #161616; }

.result-fold { text-align: center; padding: 8px 0; }
.btn-fold {
  background: transparent;
  border: 1px solid #2a2a2a;
  color: #888;
  border-radius: 6px;
  padding: 4px 14px;
  cursor: pointer;
  font-size: 12px;
}
.btn-fold:hover { color: #fff; border-color: #4d6bfe; }
</style>
