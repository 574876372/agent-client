import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * 登录用户状态（全局共享）。
 * <p>用户 ID 与用户名保存在 localStorage，请求拦截器从 agent_user_id 读取并写入 X-User-Id 请求头。</p>
 */

export interface CurrentUser {
  id: string
  username: string
}

const USER_ID_KEY = 'agent_user_id'
const USERNAME_KEY = 'agent_username'

function readStoredUser(): CurrentUser | null {
  try {
    const id = localStorage.getItem(USER_ID_KEY)
    const username = localStorage.getItem(USERNAME_KEY)
    return id && username ? { id, username } : null
  } catch {
    return null
  }
}

export const useUserStore = defineStore('user', () => {
  const currentUser = ref<CurrentUser | null>(readStoredUser())
  const isLoggedIn = computed(() => !!currentUser.value)

  /** 登录弹窗显隐，任何页面都可以通过 requireLogin 唤起 */
  const loginVisible = ref(false)

  function login(user: CurrentUser) {
    currentUser.value = user
    loginVisible.value = false
    try {
      localStorage.setItem(USER_ID_KEY, user.id)
      localStorage.setItem(USERNAME_KEY, user.username)
    } catch {
      // 存储不可用时仅本次会话保持登录
    }
  }

  function logout() {
    currentUser.value = null
    try {
      localStorage.removeItem(USER_ID_KEY)
      localStorage.removeItem(USERNAME_KEY)
    } catch {
      // 忽略
    }
  }

  /** 已登录则执行回调，否则弹出登录框 */
  function requireLogin(callback: () => void) {
    if (isLoggedIn.value) {
      callback()
    } else {
      loginVisible.value = true
    }
  }

  return { currentUser, isLoggedIn, loginVisible, login, logout, requireLogin }
})
