import { describe, it, expect } from 'vitest'
import {
  appendToolResult,
  createStreamBuffers,
  mergeStreamContent,
  parseSseEventLine
} from '../sse'

describe('sse utils', () => {
  it('parseSseEventLine recognizes reasoning', () => {
    expect(parseSseEventLine('event: reasoning')).toBe('reasoning')
    expect(parseSseEventLine('event: tool_result')).toBe('tool_result')
    expect(parseSseEventLine('event: message')).toBe('message')
  })

  it('mergeStreamContent wraps reasoning in tags', () => {
    const buf = createStreamBuffers()
    buf.reasoning = 'step one'
    buf.tools = 'Action: search\nObservation: ok\n'
    buf.message = 'Hello'
    expect(mergeStreamContent(buf)).toBe(
      '<think>step one</think>Action: search\nObservation: ok\nHello'
    )
  })

  it('recognizes the retrieval event and prefixes the retrieval block', () => {
    expect(parseSseEventLine('event: retrieval')).toBe('retrieval')
    const buf = createStreamBuffers()
    buf.retrieval = '{"segments":[]}'
    buf.message = 'Hi'
    expect(mergeStreamContent(buf)).toBe('<retrieval>{"segments":[]}</retrieval>Hi')
  })

  it('appendToolResult parses JSON', () => {
    const next = appendToolResult('', '{"tool":"weather","output":"sunny"}')
    expect(next).toBe('Action: weather\nObservation: sunny\n')
  })
})
