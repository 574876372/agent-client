<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { datasourceApi, type DatasourceRequest, type DatasourceResponse } from '@/api/datasource'

const router = useRouter()

const list = ref<DatasourceResponse[]>([])
const loading = ref(false)
const showEditor = ref(false)
const editing = ref<DatasourceResponse | null>(null)

const form = reactive<DatasourceRequest>({
  id: undefined,
  name: '',
  description: '',
  dbType: 'mysql',
  jdbcUrl: '',
  username: '',
  passwordPlain: '',
  enabled: 1,
})

const testResult = ref<{ ok: boolean; message: string } | null>(null)

async function loadList() {
  loading.value = true
  try {
    const res = await datasourceApi.list()
    list.value = res.data ?? []
  } catch (e: any) {
    console.error('[Datasource] 列表加载失败', e)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, {
    id: undefined,
    name: '',
    description: '',
    dbType: 'mysql',
    jdbcUrl: '',
    username: '',
    passwordPlain: '',
    enabled: 1,
  })
  testResult.value = null
  showEditor.value = true
}

function openEdit(ds: DatasourceResponse) {
  editing.value = ds
  Object.assign(form, {
    id: ds.id,
    name: ds.name,
    description: ds.description ?? '',
    dbType: ds.dbType,
    jdbcUrl: ds.jdbcUrl,
    username: ds.username,
    passwordPlain: '',
    enabled: ds.enabled,
  })
  testResult.value = null
  showEditor.value = true
}

async function submit() {
  if (!form.name || !form.jdbcUrl || !form.username) {
    alert('请填写名称、JDBC URL、用户名')
    return
  }
  if (!editing.value && !form.passwordPlain) {
    alert('新增时密码必填')
    return
  }
  try {
    if (editing.value) {
      await datasourceApi.update(editing.value.id, form)
    } else {
      await datasourceApi.create(form)
    }
    showEditor.value = false
    await loadList()
  } catch (e: any) {
    alert('保存失败：' + (e?.response?.data?.message ?? e?.message ?? '未知错误'))
  }
}

async function remove(ds: DatasourceResponse) {
  if (!confirm(`确认删除数据源「${ds.name}」？`)) return
  try {
    await datasourceApi.remove(ds.id)
    await loadList()
  } catch (e: any) {
    alert('删除失败：' + (e?.response?.data?.message ?? e?.message ?? '未知错误'))
  }
}

async function testInEditor() {
  testResult.value = null
  try {
    const res = editing.value
      ? await datasourceApi.testExisting(editing.value.id, form)
      : await datasourceApi.testNew(form)
    testResult.value = res.data?.success
      ? { ok: true, message: '连接成功' }
      : { ok: false, message: '连接失败（用户名/密码 / 网络 / 库不可达）' }
  } catch (e: any) {
    testResult.value = { ok: false, message: e?.response?.data?.message ?? e?.message ?? '请求失败' }
  }
}

async function quickTest(ds: DatasourceResponse) {
  try {
    const res = await datasourceApi.testExisting(ds.id, {})
    alert(res.data?.success ? `「${ds.name}」连接成功` : `「${ds.name}」连接失败`)
  } catch (e: any) {
    alert('测试失败：' + (e?.response?.data?.message ?? e?.message ?? '未知错误'))
  }
}

onMounted(loadList)
</script>

<template>
  <div class="ds-page">
    <header class="ds-header">
      <button class="btn-back" @click="router.push('/')">← 返回</button>
      <h1>数据源管理</h1>
      <button class="btn-primary" @click="openCreate">+ 新增数据源</button>
    </header>

    <section class="ds-table-wrap">
      <table class="ds-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>类型</th>
            <th>JDBC URL</th>
            <th>用户名</th>
            <th>启用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="empty">加载中...</td>
          </tr>
          <tr v-else-if="list.length === 0">
            <td colspan="6" class="empty">暂无数据源，点击右上角"新增"开始注册</td>
          </tr>
          <tr v-for="ds in list" :key="ds.id">
            <td>
              <div class="ds-name">{{ ds.name }}</div>
              <div class="ds-desc">{{ ds.description || '—' }}</div>
            </td>
            <td>{{ ds.dbType }}</td>
            <td class="mono">{{ ds.jdbcUrl }}</td>
            <td>{{ ds.username }}</td>
            <td>
              <span :class="['badge', ds.enabled === 1 ? 'on' : 'off']">
                {{ ds.enabled === 1 ? '启用' : '禁用' }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-link" @click="quickTest(ds)">测试</button>
              <button class="btn-link" @click="openEdit(ds)">编辑</button>
              <button class="btn-link danger" @click="remove(ds)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Editor Modal -->
    <div v-if="showEditor" class="modal-mask" @click.self="showEditor = false">
      <div class="modal">
        <header class="modal-header">
          <h2>{{ editing ? '编辑数据源' : '新增数据源' }}</h2>
          <button class="btn-close" @click="showEditor = false">×</button>
        </header>

        <div class="modal-body">
          <label>
            <span>名称 *</span>
            <input v-model="form.name" placeholder="例如：线上订单库" />
          </label>
          <label>
            <span>描述（LLM 决策依据）</span>
            <textarea
              v-model="form.description"
              rows="2"
              placeholder="例如：包含 t_order / t_customer，存储线上正式交易数据"
            />
          </label>
          <label>
            <span>数据库类型 *</span>
            <select v-model="form.dbType">
              <option value="mysql">MySQL</option>
            </select>
          </label>
          <label>
            <span>JDBC URL *</span>
            <input
              v-model="form.jdbcUrl"
              placeholder="jdbc:mysql://host:3306/db?useSSL=false&characterEncoding=utf8"
            />
          </label>
          <label>
            <span>用户名 *</span>
            <input v-model="form.username" placeholder="只读账号（强烈建议）" />
          </label>
          <label>
            <span>密码 {{ editing ? '（留空 = 保留原密码）' : '*' }}</span>
            <input v-model="form.passwordPlain" type="password" autocomplete="off" />
          </label>
          <label class="inline">
            <input type="checkbox" :checked="form.enabled === 1" @change="form.enabled = ($event.target as HTMLInputElement).checked ? 1 : 0" />
            <span>启用</span>
          </label>

          <div v-if="testResult" :class="['test-result', testResult.ok ? 'ok' : 'fail']">
            {{ testResult.message }}
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn-secondary" @click="testInEditor">测试连接</button>
          <div class="spacer" />
          <button class="btn-secondary" @click="showEditor = false">取消</button>
          <button class="btn-primary" @click="submit">保存</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ds-page {
  min-height: 100vh;
  padding: 24px 32px;
  background: #0f0f0f;
  color: #e8e8e8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.ds-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.ds-header h1 {
  flex: 1;
  font-size: 22px;
  font-weight: 600;
}
.btn-back {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #e8e8e8;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
}
.btn-primary {
  background: #4f46e5;
  border: none;
  color: white;
  padding: 8px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}
.btn-primary:hover { background: #6366f1; }
.btn-secondary {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #e8e8e8;
  padding: 8px 18px;
  border-radius: 6px;
  cursor: pointer;
}
.btn-secondary:hover { background: #333; }

.ds-table-wrap {
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #2a2a2a;
}
.ds-table {
  width: 100%;
  border-collapse: collapse;
}
.ds-table th {
  background: #222;
  text-align: left;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #aaa;
  border-bottom: 1px solid #2a2a2a;
}
.ds-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #222;
  font-size: 14px;
  vertical-align: top;
}
.ds-table tr:last-child td { border-bottom: none; }
.ds-name { font-weight: 500; margin-bottom: 4px; }
.ds-desc { font-size: 12px; color: #888; max-width: 260px; }
.mono { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; color: #ccc; max-width: 320px; word-break: break-all; }
.empty { text-align: center; color: #666; padding: 40px 0 !important; }
.badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
}
.badge.on { background: #14532d; color: #86efac; }
.badge.off { background: #4a1d1d; color: #fca5a5; }
.actions { white-space: nowrap; }
.btn-link {
  background: transparent;
  border: none;
  color: #818cf8;
  cursor: pointer;
  margin-right: 12px;
  font-size: 13px;
}
.btn-link:hover { color: #a5b4fc; }
.btn-link.danger { color: #f87171; }
.btn-link.danger:hover { color: #fca5a5; }

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  width: 520px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #2a2a2a;
}
.modal-header h2 { flex: 1; font-size: 17px; font-weight: 600; }
.btn-close {
  background: transparent;
  border: none;
  color: #888;
  font-size: 22px;
  cursor: pointer;
}
.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-body label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.modal-body label.inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.modal-body span {
  font-size: 13px;
  color: #aaa;
}
.modal-body input, .modal-body textarea, .modal-body select {
  background: #0f0f0f;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  color: #e8e8e8;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
}
.modal-body input:focus, .modal-body textarea:focus, .modal-body select:focus {
  outline: none;
  border-color: #4f46e5;
}
.test-result {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}
.test-result.ok { background: #14532d; color: #86efac; }
.test-result.fail { background: #4a1d1d; color: #fca5a5; }
.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid #2a2a2a;
  display: flex;
  gap: 10px;
  align-items: center;
}
.spacer { flex: 1; }
</style>
