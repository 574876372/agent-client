<script setup lang="ts">
import { reactive, ref } from 'vue'
import { userApi } from '@/api/user'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'login-success', user: { id: string; username: string }): void
}>()

const form = reactive({ username: '', password: '' })
const isLoggingIn = ref(false)

async function handleLogin() {
  if (!form.username || !form.password) return
  isLoggingIn.value = true
  try {
    const res = await userApi.login(form)
    if (res.status === 200) {
      emit('login-success', res.data)
      emit('update:show', false)
      form.username = ''
      form.password = ''
    }
  } catch (e) {
    alert('登录失败，请检查用户名或密码')
  } finally {
    isLoggingIn.value = false
  }
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('update:show', false)">
    <div class="modal login-modal">
      <div class="modal-header">
        <h2>欢迎回来</h2>
        <button class="modal-close" @click="emit('update:show', false)">✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-subtext">登录以管理您的 Agent 和对话记录</p>
        <div class="form-group">
          <label>用户名</label>
          <input v-model="form.username" placeholder="请输入用户名" class="form-input" @keyup.enter="handleLogin" />
        </div>
        <div class="form-group">
          <label>密码</label>
          <input v-model="form.password" type="password" placeholder="请输入密码" class="form-input" @keyup.enter="handleLogin" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary btn-block" @click="handleLogin">
          立即登录
        </button>
        <p class="modal-footer-hint">默认账户: admin / 123456 (新用户将自动注册)</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}
.modal {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  width: 480px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.login-modal { width: 400px; }
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #252525;
}
.modal-header h2 { font-size: 16px; font-weight: 600; color: #fff; }
.modal-close {
  background: transparent;
  border: none;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.modal-close:hover { color: #fff; background: #2a2a2a; }
.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.modal-subtext { color: #666; font-size: 13px; margin-bottom: 4px; }
.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #252525;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}
.modal-footer-hint { font-size: 11px; color: #444; margin-top: 12px; text-align: center; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 13px; color: #aaa; font-weight: 500; }
.form-input {
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 14px;
  padding: 9px 12px;
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;
  width: 100%;
}
.form-input:focus { border-color: #4d6bfe; }
.btn-primary {
  padding: 9px 20px;
  background: #4d6bfe;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover:not(:disabled) { background: #3a56e8; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-block { width: 100%; padding: 12px; }
</style>
