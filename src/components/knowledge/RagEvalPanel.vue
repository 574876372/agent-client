<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Play } from 'lucide-vue-next'
import { ragEvalApi } from '@/api/chat'

/**
 * 知识库检索评估：维护「问题 + 标准答案要点」，一键运行统计召回率（要点出现在检索上下文中的比例）
 * 与答案完整度（要点出现在模型回答中的比例）。评估使用全局默认检索参数、不做查询改写。
 */
const props = defineProps<{
  kbId: string
}>()

interface EvalCase {
  id: string
  kbId: string
  question: string
  expectedPoints: string
  createTime?: string
}

interface EvalResult {
  caseId: string
  question: string
  pointCount: number
  contextRecall: number
  answerCompleteness?: number | null
  missingInContext: string[]
  missingInAnswer: string[]
  segmentCount: number
  contextChars: number
  answer?: string | null
  warnings: string[]
  costMs: number
}

interface EvalRun {
  total: number
  avgContextRecall: number
  avgAnswerCompleteness?: number | null
  fullyRecalled: number
  costMs: number
  results: EvalResult[]
}

const cases = ref<EvalCase[]>([])
const loading = ref(false)
const running = ref(false)
const withAnswer = ref(false)
const lastRun = ref<EvalRun | null>(null)

const resultByCase = computed(() => new Map((lastRun.value?.results ?? []).map(r => [r.caseId, r])))

function errMsg(e: any) {
  return e?.response?.data?.message ?? e?.message ?? '未知错误'
}

function pct(v?: number | null) {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}

function pointCount(text: string) {
  return text.split('\n').filter(s => s.trim()).length
}

async function loadCases() {
  loading.value = true
  try {
    const res = await ragEvalApi.listCases(props.kbId)
    cases.value = res.data ?? []
  } catch (e: any) {
    ElMessage.error('加载评估用例失败：' + errMsg(e))
  } finally {
    loading.value = false
  }
}

// ── 用例编辑 ─────────────────────────────────────────────
const showDialog = ref(false)
const saving = ref(false)
const form = reactive({ id: '', question: '', expectedPoints: '' })

function openDialog(c?: EvalCase) {
  form.id = c?.id ?? ''
  form.question = c?.question ?? ''
  form.expectedPoints = c?.expectedPoints ?? ''
  showDialog.value = true
}

async function saveCase() {
  if (!form.question.trim() || !form.expectedPoints.trim()) {
    ElMessage.warning('请填写问题与至少一个要点')
    return
  }
  saving.value = true
  try {
    await ragEvalApi.saveCase({
      id: form.id || undefined,
      kbId: props.kbId,
      question: form.question.trim(),
      expectedPoints: form.expectedPoints
    })
    showDialog.value = false
    await loadCases()
  } catch (e: any) {
    ElMessage.error('保存失败：' + errMsg(e))
  } finally {
    saving.value = false
  }
}

async function removeCase(c: EvalCase) {
  try {
    await ElMessageBox.confirm(`确认删除用例「${c.question}」？`, '删除用例', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    })
  } catch {
    return
  }
  try {
    await ragEvalApi.deleteCase(c.id)
    await loadCases()
  } catch (e: any) {
    ElMessage.error('删除失败：' + errMsg(e))
  }
}

// ── 运行评估 ─────────────────────────────────────────────
async function runEval() {
  if (cases.value.length === 0) return
  running.value = true
  try {
    const res = await ragEvalApi.run(props.kbId, withAnswer.value)
    lastRun.value = res.data
  } catch (e: any) {
    ElMessage.error('评估失败：' + errMsg(e))
  } finally {
    running.value = false
  }
}

watch(
  () => props.kbId,
  () => {
    lastRun.value = null
    loadCases()
  },
  { immediate: true }
)
</script>

<template>
  <div class="eval-panel">
    <p class="eval-hint">
      为这个知识库准备一组典型问题，并写下标准答案中必须出现的要点（每行一个，建议用字段名、错误码、关键数值等短语）。
      运行后统计「召回率」= 检索上下文覆盖的要点比例；勾选生成回答时，再用默认对话模型作答并统计「答案完整度」。
    </p>

    <div class="eval-toolbar">
      <el-button @click="openDialog()"><Plus :size="14" :stroke-width="2" /><span>新增用例</span></el-button>
      <span class="spacer" />
      <el-checkbox v-model="withAnswer">生成回答并统计完整度（较慢）</el-checkbox>
      <el-button type="primary" :loading="running" :disabled="cases.length === 0" @click="runEval">
        <Play v-if="!running" :size="14" :stroke-width="2" /><span>运行评估</span>
      </el-button>
    </div>

    <div v-if="lastRun" class="eval-summary">
      <div class="metric">
        <div class="metric-value">{{ pct(lastRun.avgContextRecall) }}</div>
        <div class="metric-label">平均召回率</div>
      </div>
      <div class="metric">
        <div class="metric-value">{{ lastRun.fullyRecalled }} / {{ lastRun.total }}</div>
        <div class="metric-label">要点全部召回</div>
      </div>
      <div class="metric">
        <div class="metric-value">{{ pct(lastRun.avgAnswerCompleteness) }}</div>
        <div class="metric-label">平均答案完整度</div>
      </div>
      <div class="metric">
        <div class="metric-value mono">{{ (lastRun.costMs / 1000).toFixed(1) }}s</div>
        <div class="metric-label">耗时</div>
      </div>
    </div>

    <el-table :data="cases" v-loading="loading" row-key="id" empty-text="暂无评估用例" class="eval-table">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="expand-body">
            <div class="expand-title">标准答案要点</div>
            <pre class="points">{{ row.expectedPoints }}</pre>
            <template v-if="resultByCase.get(row.id)">
              <div v-if="resultByCase.get(row.id)!.missingInContext.length" class="expand-title danger">检索上下文缺失</div>
              <pre v-if="resultByCase.get(row.id)!.missingInContext.length" class="points">{{ resultByCase.get(row.id)!.missingInContext.join('\n') }}</pre>
              <div v-if="resultByCase.get(row.id)!.missingInAnswer.length" class="expand-title danger">回答缺失</div>
              <pre v-if="resultByCase.get(row.id)!.missingInAnswer.length" class="points">{{ resultByCase.get(row.id)!.missingInAnswer.join('\n') }}</pre>
              <div v-if="resultByCase.get(row.id)!.warnings.length" class="expand-title">告警</div>
              <pre v-if="resultByCase.get(row.id)!.warnings.length" class="points">{{ resultByCase.get(row.id)!.warnings.join('\n') }}</pre>
              <template v-if="resultByCase.get(row.id)!.answer">
                <div class="expand-title">模型回答</div>
                <pre class="points">{{ resultByCase.get(row.id)!.answer }}</pre>
              </template>
            </template>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="问题" prop="question" min-width="240" show-overflow-tooltip />
      <el-table-column label="要点" width="70">
        <template #default="{ row }">{{ pointCount(row.expectedPoints) }}</template>
      </el-table-column>
      <el-table-column label="召回率" width="90">
        <template #default="{ row }">
          <el-tag
            v-if="resultByCase.get(row.id)"
            size="small"
            :type="resultByCase.get(row.id)!.contextRecall >= 1 ? 'success' : resultByCase.get(row.id)!.contextRecall >= 0.6 ? 'warning' : 'danger'"
          >{{ pct(resultByCase.get(row.id)!.contextRecall) }}</el-tag>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="完整度" width="90">
        <template #default="{ row }">{{ pct(resultByCase.get(row.id)?.answerCompleteness) }}</template>
      </el-table-column>
      <el-table-column label="来源段 / 字数" width="110">
        <template #default="{ row }">
          <span v-if="resultByCase.get(row.id)" class="mono">{{ resultByCase.get(row.id)!.segmentCount }} / {{ resultByCase.get(row.id)!.contextChars }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="110" align="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDialog(row as EvalCase)">编辑</el-button>
          <el-button link type="danger" @click="removeCase(row as EvalCase)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showDialog" :title="form.id ? '编辑评估用例' : '新增评估用例'" width="560px" align-center>
      <el-form label-position="top">
        <el-form-item label="测试问题" required>
          <el-input v-model="form.question" placeholder="例如：独立代发接口有哪些请求参数？" maxlength="500" />
        </el-form-item>
        <el-form-item label="标准答案要点（每行一个）" required>
          <el-input
            v-model="form.expectedPoints"
            type="textarea"
            :rows="6"
            placeholder="partnerOutBizNo&#10;payeeAccountNo&#10;BBLMAP00000"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCase">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.eval-hint {
  margin-bottom: 12px;
  font-size: var(--app-font-size-sm);
  color: var(--app-text-tertiary);
  line-height: 1.6;
}
.eval-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.eval-toolbar :deep(.el-button > span) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.spacer {
  flex: 1;
}
.eval-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.metric {
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.metric-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text-primary);
}
.metric-label {
  margin-top: 2px;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}
.expand-body {
  padding: 4px 16px 8px 48px;
}
.expand-title {
  margin: 6px 0 4px;
  font-size: var(--app-font-size-xs);
  font-weight: 500;
  color: var(--app-text-secondary);
}
.expand-title.danger {
  color: var(--app-danger);
}
.points {
  margin: 0;
  white-space: pre-wrap;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-regular);
  max-height: 240px;
  overflow: auto;
}
.muted {
  color: var(--app-text-tertiary);
}
</style>
