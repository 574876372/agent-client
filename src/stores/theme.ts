import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'

/**
 * 主题切换控制。
 *
 * - 外观模式：浅色 / 深色 / 跟随系统；深色通过 <html class="dark"> 生效（Element Plus 暗色变量同一开关）；
 * - 主色：预设色或任意自定义色；Element Plus 需要的各级深浅（light-3/5/7/8/9、dark-2）在此按当前模式计算后写入 CSS 变量，
 *   语义色（成功 / 警告 / 危险 / 信息）同理，保证浅色与深色下的标签、按钮背景都协调；
 * - 选择持久化到 localStorage；index.html 中的内联脚本在首屏前读取同一个键，避免深色用户看到浅色闪烁。
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export interface PrimaryPreset {
  name: string
  value: string
}

/** 预设主色：均满足白字 4.5:1 对比度 */
export const PRIMARY_PRESETS: PrimaryPreset[] = [
  { name: '企业蓝', value: '#1D4ED8' },
  { name: '靛蓝', value: '#4338CA' },
  { name: '青色', value: '#0E7490' },
  { name: '墨绿', value: '#067647' },
]

export const DEFAULT_PRIMARY = PRIMARY_PRESETS[0].value

/** 与 index.html 内联脚本共用的存储键 */
export const THEME_STORAGE_KEY = 'agentscope-theme'

/** 语义色：浅色 / 深色两套基准色 */
const SEMANTIC_COLORS: Record<'success' | 'warning' | 'danger' | 'error' | 'info', { light: string; dark: string }> = {
  success: { light: '#067647', dark: '#47CD89' },
  warning: { light: '#B54708', dark: '#FDB022' },
  danger: { light: '#B42318', dark: '#F97066' },
  error: { light: '#B42318', dark: '#F97066' },
  info: { light: '#475467', dark: '#A4ACB9' },
}

/** 各模式下用于混色的背景色，需与 theme.css 中 --app-bg-surface 一致 */
const MIX_BASE = { light: '#FFFFFF', dark: '#151821' }

interface StoredTheme {
  mode: ThemeMode
  primary: string
}

function readStored(): StoredTheme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredTheme>
      return {
        mode: parsed.mode === 'dark' || parsed.mode === 'system' ? parsed.mode : 'light',
        primary: isHexColor(parsed.primary) ? parsed.primary! : DEFAULT_PRIMARY,
      }
    }
  } catch {
    // 隐私模式或存储被禁用：使用默认值
  }
  return { mode: 'light', primary: DEFAULT_PRIMARY }
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/** 按 weight（0~1，取 target 的比例）混合两种颜色 */
function mix(color: string, target: string, weight: number): string {
  const a = hexToRgb(color)
  const b = hexToRgb(target)
  return rgbToHex([0, 1, 2].map(i => a[i] * (1 - weight) + b[i] * weight) as [number, number, number])
}

/** 写入某个颜色的 Element Plus 全套深浅变量 */
function applyColorScale(root: HTMLElement, name: string, base: string, dark: boolean) {
  const mixBase = dark ? MIX_BASE.dark : MIX_BASE.light
  root.style.setProperty(`--el-color-${name}`, base)
  for (const level of [3, 5, 7, 8, 9]) {
    root.style.setProperty(`--el-color-${name}-light-${level}`, mix(base, mixBase, level / 10))
  }
  // 悬停 / 按下态：浅色模式加深，深色模式提亮
  root.style.setProperty(`--el-color-${name}-dark-2`, mix(base, dark ? '#FFFFFF' : '#000000', 0.2))
}

export const useThemeStore = defineStore('theme', () => {
  const stored = readStored()
  const mode = ref<ThemeMode>(stored.mode)
  const primary = ref<string>(stored.primary)

  const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const systemDark = ref<boolean>(media?.matches ?? false)
  media?.addEventListener('change', e => {
    systemDark.value = e.matches
  })

  /** 当前实际生效的是否为深色 */
  const isDark = computed(() => mode.value === 'dark' || (mode.value === 'system' && systemDark.value))

  function apply() {
    const root = document.documentElement
    const dark = isDark.value
    root.classList.toggle('dark', dark)
    // 深色背景上把用户选择的主色适当提亮，保证文字与图标可读
    applyColorScale(root, 'primary', dark ? mix(primary.value, '#FFFFFF', 0.25) : primary.value, dark)
    for (const [name, pair] of Object.entries(SEMANTIC_COLORS)) {
      applyColorScale(root, name, dark ? pair.dark : pair.light, dark)
    }
  }

  function persist() {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ mode: mode.value, primary: primary.value }))
    } catch {
      // 存储不可用时仅本次会话生效
    }
  }

  function setMode(next: ThemeMode) {
    mode.value = next
  }

  function setPrimary(color: string) {
    if (isHexColor(color)) {
      primary.value = color.toUpperCase()
    }
  }

  function reset() {
    mode.value = 'light'
    primary.value = DEFAULT_PRIMARY
  }

  watch([mode, primary, systemDark], () => {
    apply()
    persist()
  })

  return { mode, primary, isDark, apply, setMode, setPrimary, reset }
})
