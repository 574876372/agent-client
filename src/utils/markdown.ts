import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css' // 导入经典深色代码高亮主题样式

const md: MarkdownIt = new MarkdownIt({
  html: false,        // 严格关闭原生 HTML 解析，保障防 XSS 安全标准
  linkify: true,      // 自动转换超链接
  breaks: true,       // 自动将换行符 \n 转换为 <br>，对流式聊天文本极为友好
  typographer: true,  // 优化智能排版（双引号、破折号等）
  highlight: function (str, lang) {
    // 处理代码高亮逻辑
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
        }</code></pre>`
      } catch (__) {}
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})

/** 围栏代码块起止行，如 ``` 或 ~~~ */
const FENCE_RE = /^\s{0,3}(```|~~~)/
/** 标题井号后紧跟正文、缺少空格的行，如「##四、」 */
const HEADING_NO_SPACE_RE = /^(\s{0,3})(#{1,6})([^\s#])/

/**
 * 为缺少空格的 ATX 标题补空格，使模型输出的「##四、概述」也能渲染为标题。
 * 围栏代码块内不处理；单个 # 仅在后面是非 ASCII 字符（如中文）时补空格，避免把 #include、#tag 误判为标题。
 */
export function fixHeadingSpaces(src: string): string {
  if (!src || !src.includes('#')) return src
  let inFence = false
  return src
    .split('\n')
    .map((line) => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence
        return line
      }
      if (inFence) return line
      const m = line.match(HEADING_NO_SPACE_RE)
      if (!m) return line
      const [, indent, hashes, first] = m
      if (hashes.length === 1 && first.charCodeAt(0) < 128) return line
      return `${indent}${hashes} ${line.slice(indent.length + hashes.length)}`
    })
    .join('\n')
}

// 所有 md.render 调用都经过 parse，在此统一预处理
const originalParse = md.parse.bind(md)
md.parse = (src: string, env: any) => originalParse(fixHeadingSpaces(src), env)

export default md
