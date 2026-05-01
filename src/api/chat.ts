import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8080/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data)
    } else if (error.request) {
      console.error('Network Error:', error.request)
    } else {
      console.error('Request Error:', error.message)
    }
    return Promise.reject(error)
  }
)

export const agentApi = {
  getAgents: () => api.get('/agents'),
  getAgent: (id: string) => api.get(`/agents/${id}`),
  createAgent: (data: any) => api.post('/agents', data),
  deleteAgent: (id: string) => api.delete(`/agents/${id}`),
  chat: (id: string, data: any) => api.post(`/agents/${id}/chat`, data)
}

export const chatApi = {
  createConversation: (data: any) => api.post('/chat/conversation', data),
  listConversations: () => api.get('/chat/conversations'),
  deleteConversation: (id: string) => api.delete(`/chat/conversation/${id}`),
  sendMessage: (data: any) => api.post('/chat/message', data),
  getHistory: (conversationId: string) => api.get(`/chat/history/${conversationId}`)
}

export default api
