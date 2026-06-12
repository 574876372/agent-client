import api from './request'

/**
 * Agent 智能体管理 API 客户端
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
}

export default api
