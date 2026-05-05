import api from './request'


export const agentApi = {
  // 获取所有agents
  getAgents: () => api.get('/agents'),

  // 获取单个agent
  getAgent: (id: string) => api.get(`/agents/${id}`),

  // 创建agent
  createAgent: (data: any) => api.post('/agents', data),

  // 更新agent
  updateAgent: (id: string, data: any) => api.put(`/agents/${id}`, data),

  // 删除agent
  deleteAgent: (id: string) => api.delete(`/agents/${id}`),

  // 执行agent任务
  executeTask: (id: string, taskData: any) => api.post(`/agents/${id}/execute`, taskData)
}

export default api
