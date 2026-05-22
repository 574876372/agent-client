import { describe, it, expect } from 'vitest'
import { parseMessageContent } from '../parser'

describe('parseMessageContent', () => {
  it('should parse standard text with no tags', () => {
    const input = 'Hello, this is standard text.'
    const result = parseMessageContent(input)
    expect(result).toEqual([
      { type: 'text', content: 'Hello, this is standard text.' }
    ])
  })

  it('should parse closed DeepSeek <think> tags', () => {
    const input = '<think>I am thinking about the answer.</think>The answer is 42.'
    const result = parseMessageContent(input)
    expect(result).toEqual([
      { type: 'think', content: 'I am thinking about the answer.', title: '思考过程' },
      { type: 'text', content: 'The answer is 42.' }
    ])
  })

  it('should parse open DeepSeek <think> tags (streaming)', () => {
    const input = '<think>I am thinking in progress'
    const result = parseMessageContent(input)
    expect(result).toEqual([
      { type: 'think', content: 'I am thinking in progress', title: '思考过程' }
    ])
  })

  it('should parse ReAct tags correctly', () => {
    const input = `Thought: I need to calculate 2 + 2.
Action: Calculator{"expr":"2+2"}
Observation: 4
Thought: I have the answer now.

The final answer is 4.`

    const result = parseMessageContent(input)
    expect(result).toEqual([
      { type: 'think', content: 'I need to calculate 2 + 2.', title: '思考过程' },
      { type: 'action', content: 'Calculator{"expr":"2+2"}', title: '工具调用' },
      { type: 'observation', content: '4', title: '工具返回' },
      { type: 'think', content: 'I have the answer now.', title: '思考过程' },
      { type: 'text', content: 'The final answer is 4.' }
    ])
  })

  it('should handle case insensitivity in ReAct tags', () => {
    const input = `thought: I should run a search.
ACTION: search{"query":"Antigravity"}
observation: Done.`

    const result = parseMessageContent(input)
    expect(result).toEqual([
      { type: 'think', content: 'I should run a search.', title: '思考过程' },
      { type: 'action', content: 'search{"query":"Antigravity"}', title: '工具调用' },
      { type: 'observation', content: 'Done.', title: '工具返回' }
    ])
  })

  it('should handle empty or whitespace-only strings safely', () => {
    expect(parseMessageContent('')).toEqual([])
    expect(parseMessageContent('   ')).toEqual([])
  })
})
