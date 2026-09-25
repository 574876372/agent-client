<script setup lang="ts">
/**
 * 管理页顶部面包屑栏：「分组 / 页面名」，右侧可放全局操作。
 */
defineProps<{
  group: string
  title: string
}>()
</script>

<template>
  <header class="page-header">
    <el-breadcrumb separator="/">
      <el-breadcrumb-item>{{ group }}</el-breadcrumb-item>
      <el-breadcrumb-item>{{ title }}</el-breadcrumb-item>
    </el-breadcrumb>
    <div class="page-header-extra"><slot /></div>
  </header>
</template>

<style scoped>
.page-header {
  height: var(--app-header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--app-space-8);
  background: var(--app-bg-surface);
  border-bottom: 1px solid var(--app-border);
}
.page-header :deep(.el-breadcrumb__inner) {
  color: var(--app-text-tertiary);
  font-weight: 400;
}
.page-header :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: var(--app-text-primary);
  font-weight: 500;
}
.page-header-extra {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
