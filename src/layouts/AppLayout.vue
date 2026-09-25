<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { MessageSquare, Bot, BookOpen, Database, Cpu, LogOut, LogIn } from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'
import ThemeSwitcher from '@/components/layout/ThemeSwitcher.vue'
import LoginModal from '@/components/auth/LoginModal.vue'

/**
 * 应用外壳：左侧分组导航（工作台 / 管理）+ 右侧路由内容区。
 * 管理类菜单仅登录后显示；登录弹窗在此全局挂载，由 userStore.loginVisible 控制。
 */
const route = useRoute()
const user = useUserStore()

const workspaceMenus = [
  { path: '/', label: '对话', icon: MessageSquare },
  { path: '/agents', label: '智能体', icon: Bot },
]

const manageMenus = [
  { path: '/knowledge', label: '知识库', icon: BookOpen },
  { path: '/datasources', label: '数据源', icon: Database },
  { path: '/models', label: '模型管理', icon: Cpu },
]

const activeMenu = computed(() => route.path)

const userInitial = computed(() => (user.currentUser?.username ?? '?').slice(0, 1).toUpperCase())
</script>

<template>
  <div class="app-shell">
    <nav class="app-nav" aria-label="主导航">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
            <path d="M12 12l8-4.5" />
            <path d="M12 12v9" />
            <path d="M12 12L4 7.5" />
          </svg>
        </div>
        <span class="brand-name">AgentScope</span>
      </div>

      <el-menu class="nav-menu" :default-active="activeMenu" router>
        <el-menu-item-group title="工作台">
          <el-menu-item v-for="m in workspaceMenus" :key="m.path" :index="m.path">
            <component :is="m.icon" class="nav-icon" :size="18" :stroke-width="1.75" />
            <span>{{ m.label }}</span>
          </el-menu-item>
        </el-menu-item-group>
        <el-menu-item-group v-if="user.isLoggedIn" title="管理">
          <el-menu-item v-for="m in manageMenus" :key="m.path" :index="m.path">
            <component :is="m.icon" class="nav-icon" :size="18" :stroke-width="1.75" />
            <span>{{ m.label }}</span>
          </el-menu-item>
        </el-menu-item-group>
      </el-menu>

      <div class="nav-footer">
        <template v-if="user.isLoggedIn">
          <div class="user-avatar" aria-hidden="true">{{ userInitial }}</div>
          <div class="user-meta">
            <div class="user-name">{{ user.currentUser?.username }}</div>
          </div>
          <ThemeSwitcher />
          <el-tooltip content="退出登录" placement="top">
            <button type="button" class="icon-btn" aria-label="退出登录" @click="user.logout()">
              <LogOut :size="18" :stroke-width="1.75" />
            </button>
          </el-tooltip>
        </template>
        <template v-else>
          <el-button type="primary" class="login-btn" @click="user.loginVisible = true">
            <LogIn :size="16" :stroke-width="1.75" />
            <span>登录</span>
          </el-button>
          <ThemeSwitcher />
        </template>
      </div>
    </nav>

    <main class="app-main">
      <RouterView />
    </main>

    <LoginModal v-model:show="user.loginVisible" @login-success="user.login" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  background: var(--app-bg-page);
  color: var(--app-text-primary);
}

.app-nav {
  width: var(--app-nav-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 12px 12px;
  background: var(--app-bg-surface);
  border-right: 1px solid var(--app-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 16px;
}
.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: var(--app-radius-lg);
  background: var(--app-primary);
  color: var(--app-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-name {
  font-size: var(--app-font-size-md);
  font-weight: 600;
}

/* el-menu：去掉默认边框，选中态为浅主色底 + 主色字 */
.nav-menu {
  --el-menu-item-height: 40px;
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: var(--app-bg-hover);
  --el-menu-text-color: var(--app-text-regular);
  --el-menu-active-color: var(--app-primary);
  --el-menu-base-level-padding: 10px;
  --el-menu-item-font-size: var(--app-font-size-base);
  flex: 1;
  border-right: none;
  overflow-y: auto;
}
.nav-menu :deep(.el-menu-item-group__title) {
  padding: 16px 10px 6px !important;
  font-size: var(--app-font-size-xs);
  font-weight: 500;
  color: var(--app-text-tertiary);
}
.nav-menu :deep(.el-menu-item-group:first-child .el-menu-item-group__title) {
  padding-top: 4px !important;
}
.nav-menu :deep(.el-menu-item) {
  border-radius: var(--app-radius);
  margin-bottom: 2px;
  gap: 10px;
}
.nav-menu :deep(.el-menu-item.is-active) {
  background: var(--app-primary-soft);
  font-weight: 500;
}
.nav-icon {
  flex-shrink: 0;
}

.nav-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 8px 0;
  border-top: 1px solid var(--app-border);
}
.user-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--app-bg-muted);
  color: var(--app-text-regular);
  font-size: var(--app-font-size-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.user-meta {
  flex: 1;
  min-width: 0;
}
.user-name {
  font-size: var(--app-font-size-base);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.login-btn {
  flex: 1;
  gap: 6px;
}
.login-btn :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: var(--app-radius);
  color: var(--app-text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--app-bg-hover);
  color: var(--app-text-primary);
}

.app-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
</style>
