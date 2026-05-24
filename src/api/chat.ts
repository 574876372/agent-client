import api from './request'


export const agentApi = {
  getAgents: () => api.get('/agents'),
  getAgent: (id: string) => api.get(`/agents/${id}`),
  createAgent: (data: any) => api.post('/agents', data),
  updateAgent: (id: string, data: any) => api.put(`/agents/${id}`, data),
  deleteAgent: (id: string) => api.delete(`/agents/${id}`),
  chat: (id: string, data: any) => api.post(`/agents/${id}/chat`, data),
  getModelProviders: () => api.get('/agents/models'),
  getTools: () => api.get('/tools')
}

export const chatApi = {
  createConversation: (data: any) => api.post('/chat/conversation', data),
  listConversations: () => api.get('/chat/conversations'),
  deleteConversation: (id: string) => api.delete(`/chat/conversation/${id}`),
  sendMessage: (data: any) => api.post('/chat/message', data),
  getHistory: (conversationId: string) => api.get(`/chat/history/${conversationId}`)
}

export default api
