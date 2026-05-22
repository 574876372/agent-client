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

export default md
