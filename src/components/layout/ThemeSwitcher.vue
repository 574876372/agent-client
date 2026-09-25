<script setup lang="ts">
import { computed } from 'vue'
import { Sun, Moon, Monitor, Palette, Check } from 'lucide-vue-next'
import { useThemeStore, PRIMARY_PRESETS, type ThemeMode } from '@/stores/theme'

/**
 * 主题切换控件：外观模式（浅色 / 深色 / 跟随系统）+ 主色（预设或自定义）。
 */
const theme = useThemeStore()

const modes: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

const isCustomPrimary = computed(() => !PRIMARY_PRESETS.some(p => p.value === theme.primary))

function onPickCustom(color: string | null) {
  if (color) theme.setPrimary(color)
}
</script>

<template>
  <el-popover placement="right-end" :width="248" trigger="click" :offset="12">
    <template #reference>
      <button type="button" class="theme-trigger" aria-label="主题设置" title="主题设置">
        <Palette :size="18" :stroke-width="1.75" />
      </button>
    </template>

    <div class="theme-panel">
      <div class="panel-label">外观</div>
      <div class="mode-list" role="radiogroup" aria-label="外观模式">
        <button
          v-for="m in modes"
          :key="m.value"
          type="button"
          role="radio"
          :aria-checked="theme.mode === m.value"
          :class="['mode-item', { active: theme.mode === m.value }]"
          @click="theme.setMode(m.value)"
        >
          <component :is="m.icon" :size="16" :stroke-width="1.75" />
          <span>{{ m.label }}</span>
        </button>
      </div>

      <div class="panel-label">主题色</div>
      <div class="swatch-list">
        <button
          v-for="p in PRIMARY_PRESETS"
          :key="p.value"
          type="button"
          class="swatch"
          :style="{ background: p.value }"
          :title="p.name"
          :aria-label="`主题色：${p.name}`"
          @click="theme.setPrimary(p.value)"
        >
          <Check v-if="theme.primary === p.value" :size="14" :stroke-width="2.5" color="#FFFFFF" />
        </button>
        <el-color-picker
          :model-value="isCustomPrimary ? theme.primary : ''"
          size="small"
          :predefine="PRIMARY_PRESETS.map(p => p.value)"
          aria-label="自定义主题色"
          @change="onPickCustom"
        />
      </div>

      <button type="button" class="reset-link" @click="theme.reset()">恢复默认</button>
    </div>
  </el-popover>
</template>

<style scoped>
.theme-trigger {
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
.theme-trigger:hover {
  background: var(--app-bg-hover);
  color: var(--app-text-primary);
}

.theme-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.panel-label {
  font-size: var(--app-font-size-xs);
  font-weight: 500;
  color: var(--app-text-tertiary);
}
.mode-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.mode-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-bg-surface);
  color: var(--app-text-secondary);
  font-size: var(--app-font-size-xs);
  cursor: pointer;
}
.mode-item:hover {
  border-color: var(--app-border-strong);
}
.mode-item.active {
  border-color: var(--app-primary);
  background: var(--app-primary-soft);
  color: var(--app-primary);
}
.swatch-list {
  display: flex;
  align-items: center;
  gap: 8px;
}
.swatch {
  width: 24px;
  height: 24px;
  border-radius: var(--app-radius);
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.reset-link {
  align-self: flex-start;
  border: none;
  background: none;
  padding: 0;
  font-size: var(--app-font-size-xs);
  color: var(--app-text-tertiary);
  cursor: pointer;
}
.reset-link:hover {
  color: var(--app-primary);
}
</style>
