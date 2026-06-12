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

  /** 知识库检索演练场：语义召回测试 */
  search: (kbId: string, query: string, limit?: number) =>
    api.get('/knowledge-base/search', { params: { kbId, query, limit } }),
}

export default api
