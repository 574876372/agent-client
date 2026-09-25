<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { userApi } from '@/api/user'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'login-success', user: { id: string; username: string }): void
}>()

const formRef = ref<FormInstance>()
const form = reactive({ username: '', password: '' })
const isLoggingIn = ref(false)

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  isLoggingIn.value = true
  try {
    const res = await userApi.login(form)
    if (res.status === 200) {
      emit('login-success', res.data)
      emit('update:show', false)
      form.username = ''
      form.password = ''
    }
  } catch {
    ElMessage.error('登录失败，请检查用户名或密码')
  } finally {
    isLoggingIn.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="show"
    title="登录 AgentScope"
    width="400px"
    align-center
    @update:model-value="emit('update:show', $event)"
  >
    <p class="login-sub">登录以管理智能体、知识库与对话记录</p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="handleLogin">
      <el-form-item label="用户名" prop="username">
        <el-input v-model="form.username" placeholder="请输入用户名" autocomplete="username" @keyup.enter="handleLogin" />
      </el-form-item>
      <el-form-item label="密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="请输入密码"
          autocomplete="current-password"
          show-password
          @keyup.enter="handleLogin"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" class="login-submit" :loading="isLoggingIn" @click="handleLogin">登录</el-button>
      <p class="login-hint">默认账户 admin / 123456，新用户名将自动注册</p>
    </template>
  </el-dialog>
</template>

<style scoped>
.login-sub {
  margin-bottom: var(--app-space-4);
  font-size: var(--app-font-size-sm);
  color: var(--app-text-secondary);
}
.login-submit {
  width: 100%;
}
.login-hint {
  margin-top: var(--app-space-3);
  text-align: center;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
}
</style>
