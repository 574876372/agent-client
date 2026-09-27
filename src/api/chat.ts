import api from './request'

/**
 * Agent 智能体管理 API 客户端（chat.ts 中的镜像，供旧组件兼容引用）
 * 对接后端 /api/agents 路由，所有业务 ID 通过查询参数传递，禁止路径变量
 */
export const agentApi = {
  /** 获取支持的模型厂商及其模型列表 */
  getModelProviders: () => api.get('/agents/models'),

  /** 获取所有 Agent 列表 */
  getAgents: () => api.get('/agents/list'),

  /** 获取单个 Agent 详情 */
  getAgent: (id: string) => api.get('/agents/detail', { params: { id } }),

  /** 创建 Agent */
  createAgent: (data: any) => api.post('/agents/create', data),

  /** 更新 Agent（含工具绑定、知识库绑定） */
  updateAgent: (id: string, data: any) => api.put('/agents/update', data, { params: { id } }),

  /** 删除 Agent */
  deleteAgent: (id: string) => api.delete('/agents/delete', { params: { id } }),

  /** 向指定 Agent 发送同步消息 */
  chat: (id: string, data: any) => api.post('/agents/chat', data, { params: { id } }),

  /** 获取工具列表 */
  getTools: () => api.get('/tools'),
}

/**
 * 对话会话管理 API 客户端
 * 对接后端 /api/chat 路由，所有业务 ID 通过查询参数传递，禁止路径变量
 */
export const chatApi = {
  /** 创建新会话 */
  createConversation: (data: any) => api.post('/chat/conversation/create', data),

  /** 列出当前用户所有会话 */
  listConversations: () => api.get('/chat/conversation/list'),

  /** 删除指定会话 */
  deleteConversation: (conversationId: string) =>
    api.delete('/chat/conversation/delete', { params: { conversationId } }),

  /** 同步发送消息 */
  sendMessage: (data: any) => api.post('/chat/message', data),

  /** 获取指定会话的历史消息 */
  getHistory: (conversationId: string) =>
    api.get('/chat/history', { params: { conversationId } }),
}

/**
 * 知识库及文档管理 API 客户端
 * 对接后端 /api/knowledge-base 路由，所有业务 ID 通过查询参数传递，禁止路径变量
 */
export const knowledgeApi = {
  /** 创建知识库 */
  createKb: (data: any) => api.post('/knowledge-base/create', data),

  /** 列出当前用户的所有知识库 */
  listKbs: () => api.get('/knowledge-base/list'),

  /** 获取知识库详情 */
  getKb: (id: string) => api.get('/knowledge-base/detail', { params: { id } }),

  /** 删除知识库（级联清理文档与向量索引） */
  deleteKb: (id: string) => api.delete('/knowledge-base/delete', { params: { id } }),

  /** 上传文档并绑定到指定知识库，异步触发切片向量化 */
  uploadDoc: (kbId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/knowledge-base/document/upload', formData, {
      params: { kbId },
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** 列出指定知识库下的所有文档及解析状态 */
  listDocs: (kbId: string) => api.get('/knowledge-base/document/list', { params: { kbId } }),

  /** 删除指定文档（级联清理切片与向量索引） */
  deleteDoc: (docId: string) => api.delete('/knowledge-base/document/delete', { params: { docId } }),

  /** 知识库检索演练场：语义召回测试（旧接口，仅向量检索） */
  search: (kbId: string, query: string, limit?: number) =>
    api.get('/knowledge-base/search', { params: { kbId, query, limit } }),

  /** 更新知识库名称、描述、类型与切片 / 扩展参数（向量模型不可更换） */
  updateKb: (id: string, data: any) => api.put('/knowledge-base/update', data, { params: { id } }),

  /** 知识库类型预设及其默认参数 */
  listTypes: () => api.get('/knowledge-base/types'),

  /** 按当前配置重新解析单个文档（异步） */
  reparseDoc: (docId: string) => api.post('/knowledge-base/document/reparse', null, { params: { docId } }),

  /** 按当前配置重新解析知识库全部文档（异步），返回 { submitted } */
  reparseKb: (kbId: string) => api.post('/knowledge-base/reparse', null, { params: { kbId } }),

  /** 演练场：与智能体相同的检索流水线，返回各阶段中间结果 */
  retrievalTest: (data: any) => api.post('/knowledge-base/retrieval/test', data, { timeout: 120000 }),
}

/**
 * 知识库检索评估 API 客户端（问题 + 标准答案要点，统计召回率与答案完整度）
 */
export const ragEvalApi = {
  /** 列出知识库的评估用例 */
  listCases: (kbId: string) => api.get('/knowledge-base/eval/case/list', { params: { kbId } }),

  /** 新增或修改评估用例（id 为空时新增） */
  saveCase: (data: { id?: string; kbId: string; question: string; expectedPoints: string }) =>
    api.post('/knowledge-base/eval/case/save', data),

  /** 删除评估用例 */
  deleteCase: (id: string) => api.delete('/knowledge-base/eval/case/delete', { params: { id } }),

  /** 一键运行全部用例；withAnswer 为 true 时额外生成回答并统计完整度 */
  run: (kbId: string, withAnswer: boolean) =>
    api.post('/knowledge-base/eval/run', null, { params: { kbId, withAnswer }, timeout: 600000 }),
}

export default api
