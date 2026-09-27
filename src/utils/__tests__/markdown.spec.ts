import { describe, it, expect } from 'vitest'
import md, { fixHeadingSpaces } from '../markdown'

describe('fixHeadingSpaces', () => {
  it('inserts a space after hashes followed by Chinese text', () => {
    expect(fixHeadingSpaces('##四、请求参数')).toBe('## 四、请求参数')
    expect(fixHeadingSpaces('#概述')).toBe('# 概述')
    expect(fixHeadingSpaces('  ###1. 说明')).toBe('  ### 1. 说明')
  })

  it('leaves well-formed headings and single-hash ASCII alone', () => {
    expect(fixHeadingSpaces('## 已有空格')).toBe('## 已有空格')
    expect(fixHeadingSpaces('#include <stdio.h>')).toBe('#include <stdio.h>')
    expect(fixHeadingSpaces('####### 七个井号')).toBe('####### 七个井号')
  })

  it('does not touch fenced code blocks', () => {
    const src = '```bash\n##注释\n```\n##标题'
    expect(fixHeadingSpaces(src)).toBe('```bash\n##注释\n```\n## 标题')
  })

  it('renders as a heading through md.render', () => {
    expect(md.render('##四、响应参数')).toContain('<h2>四、响应参数</h2>')
  })
})
