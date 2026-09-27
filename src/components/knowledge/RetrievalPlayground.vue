<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, ArrowRight, AlertTriangle, FileText } from 'lucide-vue-next'
import { knowledgeApi } from '@/api/chat'
import { modelApi, type ModelInfoResponse } from '@/api/model'
import md from '@/utils/markdown'
import { chunkRangeLabel, expandModeLabel, sourceLabel, type RetrievalHit, type RetrievalTrace } from '@/utils/retrieval'

/**
 * 知识库检索演练场：调用与智能体完全相同的检索流水线，分步展示
 * 改写检索词 → 向量命中 → 关键词命中 → 融合结果 → 扩展后最终上下文。
 */
const props = defineProps<{
  kbId: string
}>()

const query = ref('')
/** 模拟的前几轮提问，每行一个，用于演示追问改写 */
const previousText = ref('')
const loading = ref(false)
const trace = ref<RetrievalTrace | null>(null)
const showParams = ref(false)

/** 检索参数；数值留空表示使用全局默认（与未单独配置的智能体一致） */
const params = reactive({
  finalTopK: undefined as number | undefined,
  contextMaxChars: undefined as number | undefined,
  scoreThreshold: undefined as number | undefined,
  queryRewrite: true,
  rerankModelId: ''
})

const rerankModels = ref<ModelInfoResponse[]>([])
/** 默认展开的步骤 */
const activeSteps = ref<string[]>(['query', 'final'])

function errMsg(e: any) {
  return e?.response?.data?.message ?? e?.message ?? '未知错误'
}

async function run() {
  if (!query.value.trim()) return
  loading.value = true
  try {
    const previousQuestions = previousText.value.split('\n').map(s => s.trim()).filter(Boolean)
    const res = await knowledgeApi.retrievalTest({
      kbId: props.kbId,
      query: query.value.trim(),
      previousQuestions,
      finalTopK: params.finalTopK,
      contextMaxChars: params.contextMaxChars,
      scoreThreshold: params.scoreThreshold,
      queryRewrite: params.queryRewrite,
      rerankModelId: params.rerankModelId || undefined
    })
    trace.value = res.data
  } catch (e: any) {
    ElMessage.error('检索失败：' + errMsg(e))
  } finally {
    loading.value = false
  }
}

const totalChars = computed(() => (trace.value?.segments ?? []).reduce((n, s) => n + (s.charCount ?? 0), 0))

const STAGE_LABELS: Record<string, string> = {
  rewrite: '改写',
  vector: '向量',
  keyword: '关键词',
  fusion: '融合',
  rerank: '重排',
  expand: '扩展'
}
const stageCosts = computed(() =>
  Object.entries(trace.value?.stageCostMs ?? {})
    .filter(([, ms]) => ms > 0)
    .map(([k, ms]) => `${STAGE_LABELS[k] ?? k} ${ms}ms`)
    .join(' · ')
)

function fmt(n?: number, digits = 4) {
  return n == null ? '—' : n.toFixed(digits)
}

/** 关键词得分 ≥ 1000 表示精确词（字段名、错误码）命中 */
function keywordScoreLabel(h: RetrievalHit) {
  if (h.keywordScore == null) return '—'
  return h.keywordScore >= 1000 ? '精确词' : h.keywordScore.toFixed(3)
}

async function loadRerankModels() {
  try {
    const res = await modelApi.listModels('RERANK')
    rerankModels.value = (res.data ?? []).filter(m => m.enabled === 1)
  } catch {
    rerankModels.value = []
  }
}

watch(() => props.kbId, () => {
  trace.value = null
  query.value = ''
})

onMounted(loadRerankModels)
</script>

<template>
  <div class="playground">
    <p class="playground-hint">
      演练场与智能体使用同一条检索流水线：查询改写 → 向量 + 关键词两路召回 → RRF 融合 → 重排（可选）→ 按知识库类型扩展上下文。
      参数留空时使用全局默认值，与未单独配置的智能体效果一致。
    </p>

    <div class="search-row">
      <el-input
        v-model="query"
        placeholder="输入测试问题，例如：独立代发接口的全部请求参数"
        clearable
        @keyup.enter="run"
      >
        <template #prefix><Search :size="16" :stroke-width="1.75" /></template>
      </el-input>
      <el-button type="primary" :loading="loading" :disabled="!query.trim()" @click="run">检索</el-button>
      <el-button link type="primary" @click="showParams = !showParams">{{ showParams ? '收起参数' : '参数' }}</el-button>
    </div>

    <div v-show="showParams" class="params">
      <el-form label-position="top" class="params-grid">
        <el-form-item label="最终段数 Top-K">
          <el-input-number v-model="params.finalTopK" :min="1" :max="20" placeholder="默认 5" controls-position="right" />
        </el-form-item>
        <el-form-item label="上下文总长上限（字）">
          <el-input-number v-model="params.contextMaxChars" :min="500" :max="50000" :step="1000" placeholder="默认 20000" controls-position="right" />
        </el-form-item>
        <el-form-item label="向量预过滤阈值">
          <el-input-number v-model="params.scoreThreshold" :min="0" :max="1" :step="0.05" :precision="2" placeholder="默认 0.3" controls-position="right" />
        </el-form-item>
        <el-form-item label="重排模型">
          <el-select v-model="params.rerankModelId" clearable placeholder="默认重排模型（未配置则不重排）">
            <el-option v-for="m in rerankModels" :key="m.id" :value="m.id" :label="`${m.modelName}（${m.providerName}）`" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-form label-position="top">
        <el-form-item label="模拟前几轮提问（每行一个，用于测试追问改写，如先问「代发接口的请求参数」再测「那响应参数呢？」）">
          <el-input v-model="previousText" type="textarea" :rows="2" placeholder="可留空" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="params.queryRewrite">结合上面的提问改写检索词（使用默认对话模型）</el-checkbox>
        </el-form-item>
      </el-form>
    </div>

    <el-empty v-if="!trace && !loading" :image-size="64" description="检索过程将分步显示在这里" />

    <div v-else v-loading="loading" class="trace">
      <template v-if="trace">
        <div class="trace-summary">
          <span>总耗时 <strong class="mono">{{ trace.costMs }}ms</strong></span>
          <span v-if="stageCosts" class="muted">（{{ stageCosts }}）</span>
          <span class="spacer" />
          <span>最终 <strong>{{ trace.segments.length }}</strong> 段 · <strong class="mono">{{ totalChars }}</strong> 字</span>
        </div>

        <el-alert v-for="(w, i) in trace.warnings" :key="i" :title="w" type="warning" :closable="false" show-icon class="trace-warning">
          <template #icon><AlertTriangle :size="14" /></template>
        </el-alert>

        <el-collapse v-model="activeSteps" class="steps">
          <!-- ① 检索词 -->
          <el-collapse-item name="query">
            <template #title>
              <span class="step-no">①</span>检索词
              <el-tag size="small" :type="trace.rewriteApplied ? 'success' : 'info'" effect="plain" class="step-tag">
                {{ trace.rewriteApplied ? '已改写' : '未改写' }}
              </el-tag>
            </template>
            <div class="query-flow">
              <span class="query-text">{{ trace.query }}</span>
              <template v-if="trace.rewriteApplied">
                <ArrowRight :size="14" :stroke-width="1.75" class="muted" />
                <span class="query-text rewritten">{{ trace.rewrittenQuery }}</span>
              </template>
              <span v-else class="muted">（未提供前几轮提问或未开启改写时直接使用原问题）</span>
            </div>
          </el-collapse-item>

          <!-- ② 向量命中 -->
          <el-collapse-item name="vector">
            <template #title><span class="step-no">②</span>向量命中<span class="step-count">{{ trace.vectorHits.length }}</span></template>
            <el-table :data="trace.vectorHits" size="small" max-height="360" empty-text="无向量命中（可能被预过滤阈值过滤）">
              <el-table-column type="expand">
                <template #default="{ row }"><pre class="hit-content">{{ row.content }}</pre></template>
              </el-table-column>
              <el-table-column label="排名" prop="vectorRank" width="60" />
              <el-table-column label="位置" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">{{ row.docName }} › {{ row.sectionPath || '—' }} › 切片 #{{ row.chunkIndex }}</template>
              </el-table-column>
              <el-table-column label="相似度" width="90">
                <template #default="{ row }"><span class="mono">{{ fmt(row.vectorScore) }}</span></template>
              </el-table-column>
            </el-table>
          </el-collapse-item>

          <!-- ③ 关键词命中 -->
          <el-collapse-item name="keyword">
            <template #title><span class="step-no">③</span>关键词命中<span class="step-count">{{ trace.keywordHits.length }}</span></template>
            <el-table :data="trace.keywordHits" size="small" max-height="360" empty-text="无关键词命中">
              <el-table-column type="expand">
                <template #default="{ row }"><pre class="hit-content">{{ row.content }}</pre></template>
              </el-table-column>
              <el-table-column label="排名" prop="keywordRank" width="60" />
              <el-table-column label="位置" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">{{ row.docName }} › {{ row.sectionPath || '—' }} › 切片 #{{ row.chunkIndex }}</template>
              </el-table-column>
              <el-table-column label="得分" width="90">
                <template #default="{ row }"><span class="mono">{{ keywordScoreLabel(row as RetrievalHit) }}</span></template>
              </el-table-column>
            </el-table>
          </el-collapse-item>

          <!-- ④ 融合与重排 -->
          <el-collapse-item name="fused">
            <template #title>
              <span class="step-no">④</span>融合结果<span class="step-count">{{ trace.fusedHits.length }}</span>
              <el-tag v-if="trace.reranked" size="small" type="success" effect="plain" class="step-tag">已重排 · {{ trace.rerankModel }}</el-tag>
            </template>
            <el-table :data="trace.fusedHits" size="small" max-height="360" empty-text="无候选">
              <el-table-column type="expand">
                <template #default="{ row }"><pre class="hit-content">{{ row.content }}</pre></template>
              </el-table-column>
              <el-table-column label="名次" type="index" width="60" :index="(i: number) => i + 1" />
              <el-table-column label="位置" min-width="200" show-overflow-tooltip>
                <template #default="{ row }">{{ row.docName }} › {{ row.sectionPath || '—' }} › 切片 #{{ row.chunkIndex }}</template>
              </el-table-column>
              <el-table-column label="向量名次" width="80">
                <template #default="{ row }">{{ row.vectorRank ?? '—' }}</template>
              </el-table-column>
              <el-table-column label="关键词名次" width="90">
                <template #default="{ row }">{{ row.keywordRank ?? '—' }}</template>
              </el-table-column>
              <el-table-column label="RRF 得分" width="90">
                <template #default="{ row }"><span class="mono">{{ fmt(row.fusedScore) }}</span></template>
              </el-table-column>
              <el-table-column v-if="trace.reranked" label="重排得分" width="90">
                <template #default="{ row }"><span class="mono">{{ fmt(row.rerankScore, 3) }}</span></template>
              </el-table-column>
            </el-table>
          </el-collapse-item>

          <!-- ⑤ 最终上下文 -->
          <el-collapse-item name="final">
            <template #title><span class="step-no">⑤</span>扩展后最终上下文<span class="step-count">{{ trace.segments.length }}</span></template>
            <el-empty v-if="trace.segments.length === 0" :image-size="48" description="没有检索到相关内容" />
            <article v-for="seg in trace.segments" :key="seg.citation" class="segment-card">
              <header class="segment-head">
                <span class="mono citation">[{{ seg.citation }}]</span>
                <FileText :size="14" :stroke-width="1.75" class="muted" />
                <span class="segment-label" :title="sourceLabel(seg)">{{ sourceLabel(seg) }}</span>
                <el-tag size="small" effect="plain">{{ expandModeLabel(seg.expandMode) }}</el-tag>
              </header>
              <div class="segment-meta muted">
                命中 {{ seg.hitIndexes.map(i => '#' + i).join('、') }} · 扩展为 {{ chunkRangeLabel(seg) }} · {{ seg.charCount }} 字 · 最佳名次 {{ seg.bestRank }}
              </div>
              <div class="segment-content markdown-body" v-html="md.render(seg.content || '')"></div>
            </article>
            <details v-if="trace.contextText" class="context-raw">
              <summary>查看注入模型的完整上下文</summary>
              <pre>{{ trace.contextText }}</pre>
            </details>
          </el-collapse-item>
        </el-collapse>
      </template>
    </div>
  </div>
</template>

<style scoped>
.playground-hint {
  margin-bottom: 12px;
  font-size: var(--app-font-size-sm);
  color: var(--app-text-tertiary);
  line-height: 1.6;
}
.search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.params {
  margin-top: 12px;
  padding: 12px 14px 0;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-bg-subtle);
}
.params-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0 12px;
}
.params-grid :deep(.el-input-number),
.params-grid :deep(.el-select) {
  width: 100%;
}
.trace {
  margin-top: 16px;
  min-height: 120px;
}
.trace-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: var(--app-font-size-sm);
  color: var(--app-text-regular);
}
.spacer {
  flex: 1;
}
.muted {
  color: var(--app-text-tertiary);
}
.trace-warning {
  margin-bottom: 8px;
}
.steps :deep(.el-collapse-item__header) {
  font-weight: 500;
  gap: 6px;
}
.step-no {
  color: var(--app-primary);
  margin-right: 4px;
}
.step-count {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--app-bg-subtle);
  font-size: var(--app-font-size-xs);
  color: var(--app-text-secondary);
}
.step-tag {
  margin-left: 8px;
}
.query-flow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--app-font-size-sm);
}
.query-text {
  padding: 2px 8px;
  border-radius: var(--app-radius-sm);
  background: var(--app-bg-subtle);
}
.query-text.rewritten {
  background: var(--app-primary-soft);
  color: var(--app-primary);
}
.hit-content {
  margin: 0 12px;
  white-space: pre-wrap;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-secondary);
  max-height: 240px;
  overflow: auto;
}
.segment-card {
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  margin-bottom: 10px;
}
.segment-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--app-font-size-sm);
}
.citation {
  color: var(--app-primary);
}
.segment-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.segment-meta {
  margin: 4px 0 6px;
  font-size: var(--app-font-size-xs);
}
.segment-content {
  max-height: 360px;
  overflow: auto;
  font-size: var(--app-font-size-sm);
}
.context-raw summary {
  cursor: pointer;
  font-size: var(--app-font-size-sm);
  color: var(--app-primary);
}
.context-raw pre {
  margin-top: 8px;
  padding: 10px;
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: var(--app-font-size-xs);
  background: var(--app-bg-subtle);
  border-radius: var(--app-radius-md, 6px);
}
</style>
