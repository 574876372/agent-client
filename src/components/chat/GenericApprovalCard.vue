<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue'
import hljs from 'highlight.js/lib/core'
import sql from 'highlight.js/lib/languages/sql'
import 'highlight.js/styles/github-dark.css'
import { ElMessage } from 'element-plus'
import { Copy, Database, ShieldCheck } from 'lucide-vue-next'

hljs.registerLanguage('sql', sql)

/**
 * 通用 PENDING_APPROVAL 结构。
 */
interface GenericPendingPayload {
  status: 'PENDING_APPROVAL'
  approvalToken: string
  token?: string // 兼容字段
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

const props = defineProps<{
  payload: GenericPendingPayload
  /** 当卡片所属 token 已被消费后，禁用交互 */
  consumed?: boolean
}>()

const emit = defineEmits<{
  (e: 'approve', token: string): void
  (e: 'reject', token: string): void
  (e: 'edit', token: string, editedParams: Record<string, any>): void
}>()

const token = computed(() => props.payload.approvalToken || props.payload.token || '')

const isEditing = ref(false)
// 复制参数对象以供编辑
const formParams = reactive<Record<string, any>>({ ...props.payload.parameters })

// 如果是 SQL 查询工具，特别进行高亮处理
const isSqlTool = computed(() => props.payload.toolName === 'query_database')
const sqlText = computed(() => {
  const sqlVal = formParams.sql || props.payload.parameters.sql || ''
  return sqlVal
})

const highlightedSql = computed(() => {
  try {
    const rawSql = props.payload.preCheckMeta?.sql || props.payload.parameters.sql || ''
    return hljs.highlight(rawSql, { language: 'sql', ignoreIllegals: true }).value
  } catch {
    return props.payload.parameters.sql || ''
  }
})

const editedHighlighted = computed(() => {
  try {
    return hljs.highlight(formParams.sql || '', { language: 'sql', ignoreIllegals: true }).value
  } catch {
    return formParams.sql || ''
  }
})

function toggleEdit() {
  if (props.consumed) return
  isEditing.value = !isEditing.value
  if (isEditing.value) {
    // 重置为当前的实际参数
    Object.assign(formParams, props.payload.parameters)
  }
}

function submitEdit() {
  if (props.consumed) return
  // 过滤空的参数
  const edited = { ...formParams }
  emit('edit', token.value, edited)
  isEditing.value = false
}

function copyText(val: string) {
  navigator.clipboard?.writeText(val).then(() => ElMessage.success('已复制')).catch(() => { /* 忽略 */ })
}
</script>

<template>
  <div :class="['approval-card', { consumed }]">
    <header class="card-head">
      <span :class="['head-icon', isSqlTool ? 'sql' : 'generic']" aria-hidden="true">
        <Database v-if="isSqlTool" :size="15" :stroke-width="1.75" />
        <ShieldCheck v-else :size="15" :stroke-width="1.75" />
      </span>
      <span class="head-title">{{ isSqlTool ? '待审批 SQL' : '操作审批' }}</span>
      <el-tag size="small" type="info" effect="plain" class="mono">{{ payload.toolName }}</el-tag>
      <span class="head-spacer" />
      <el-tag v-if="consumed" size="small" type="info">已处理</el-tag>
      <el-tag v-else size="small" type="warning">等待确认</el-tag>
    </header>

    <!-- 预检信息行 (EXPLAIN 结果、警告提示等) -->
    <div class="meta-row" v-if="payload.preCheckMeta && ((payload.preCheckMeta.estimatedRows ?? -1) >= 0 || (payload.preCheckMeta.warnings?.length ?? 0) > 0)">
      <el-tag v-if="payload.preCheckMeta.estimatedRows != null && payload.preCheckMeta.estimatedRows >= 0" size="small" effect="plain">
        预估扫描约 {{ payload.preCheckMeta.estimatedRows.toLocaleString() }} 行
      </el-tag>
      <el-tag v-for="(w, i) in payload.preCheckMeta.warnings || []" :key="i" size="small" type="warning" effect="plain">
        {{ w }}
      </el-tag>
    </div>

    <!-- 非编辑模式：只读预览 -->
    <div v-if="!isEditing" class="card-content">
      <div v-if="isSqlTool" class="code-block">
        <pre class="hljs"><code v-html="highlightedSql"></code></pre>
        <button
          type="button"
          class="btn-copy"
          aria-label="复制 SQL"
          title="复制 SQL"
          @click="copyText(payload.preCheckMeta?.sql || payload.parameters.sql || '')"
        >
          <Copy :size="14" :stroke-width="1.75" />
        </button>
      </div>

      <dl v-else class="param-list">
        <div class="param-row" v-for="(val, key) in payload.parameters" :key="key">
          <dt class="param-key">{{ payload.parameterSchema?.properties?.[key]?.description || key }}</dt>
          <dd class="param-val">{{ val }}</dd>
        </div>
      </dl>
    </div>

    <!-- 编辑模式：动态表单 -->
    <div v-else class="card-content">
      <div v-if="isSqlTool" class="sql-edit">
        <el-input
          v-model="formParams.sql"
          type="textarea"
          :rows="6"
          class="sql-textarea"
          spellcheck="false"
          placeholder="在此修改 SQL 后点击「保存并执行」"
        />
        <div class="code-block" v-if="formParams.sql?.trim()">
          <div class="code-label">高亮预览</div>
          <pre class="hljs"><code v-html="editedHighlighted"></code></pre>
        </div>
      </div>

      <el-form v-else label-position="top" class="generic-form">
        <el-form-item
          v-for="(prop, key) in payload.parameterSchema?.properties || {}"
          :key="key"
          :label="prop.description || String(key)"
        >
          <el-input
            v-if="prop.type === 'string' && (key.includes('content') || key.includes('body') || key.includes('message') || key.includes('text'))"
            v-model="formParams[key]"
            type="textarea"
            :rows="3"
          />
          <el-input v-else-if="prop.type === 'string'" v-model="formParams[key]" />
          <el-input-number
            v-else-if="prop.type === 'integer' || prop.type === 'number'"
            v-model="formParams[key]"
            controls-position="right"
          />
          <el-switch v-else-if="prop.type === 'boolean'" v-model="formParams[key]" />
        </el-form-item>
      </el-form>
    </div>

    <!-- 底部操作按钮 -->
    <footer class="card-foot">
      <template v-if="!isEditing">
        <el-button type="primary" size="small" :disabled="consumed" @click="emit('approve', token)">执行</el-button>
        <el-button size="small" :disabled="consumed" @click="toggleEdit">{{ isSqlTool ? '编辑 SQL' : '编辑参数' }}</el-button>
        <el-button size="small" text :disabled="consumed" @click="emit('reject', token)">取消</el-button>
      </template>
      <template v-else>
        <el-button type="primary" size="small" :disabled="consumed" @click="submitEdit">保存并执行</el-button>
        <el-button size="small" text @click="toggleEdit">返回</el-button>
      </template>
    </footer>
  </div>
</template>

<style scoped>
.approval-card {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-surface);
  overflow: hidden;
}
.approval-card.consumed {
  opacity: 0.7;
}

.card-head {
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.head-icon.sql {
  background: var(--app-primary-soft);
  color: var(--app-primary);
}
.head-icon.generic {
  background: var(--app-warning-soft);
  color: var(--app-warning);
}
.head-title {
  font-size: var(--app-font-size-base);
  font-weight: 600;
}
.head-spacer {
  flex: 1;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px 0;
}

.card-content {
  padding: 12px 14px;
}

.code-block {
  position: relative;
  border: 1px solid var(--app-code-border);
  border-radius: var(--app-radius);
  background: var(--app-code-bg);
  padding: 10px 12px;
}
.code-block pre.hljs {
  margin: 0;
  padding: 0;
  background: transparent !important;
  font-family: var(--app-font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--app-code-text);
  white-space: pre-wrap;
  word-break: break-word;
}
.code-label {
  margin-bottom: 4px;
  font-size: var(--app-font-size-xs);
  color: #94a3b8;
}
.btn-copy {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: #94a3b8;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.btn-copy:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.sql-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sql-textarea :deep(textarea) {
  font-family: var(--app-font-mono);
  font-size: 12.5px;
  line-height: 1.6;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--app-radius);
  background: var(--app-bg-subtle);
}
.param-row {
  display: flex;
  gap: 12px;
  font-size: var(--app-font-size-sm);
  line-height: 1.5;
}
.param-key {
  width: 120px;
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}
.param-val {
  color: var(--app-text-primary);
  word-break: break-all;
}

.generic-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.card-foot {
  display: flex;
  gap: 4px;
  padding: 10px 14px;
  border-top: 1px solid var(--app-border);
}
</style>
