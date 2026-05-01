import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8080/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    // 可以在这里添加认证token等
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  response => {
    return response
  },
  error => {
    if (error.response) {
      // 服务器响应错误
      console.error('API Error:', error.response.status, error.response.data)
    } else if (error.request) {
      // 请求未收到响应
      console.error('Network Error:', error.request)
    } else {
      // 请求配置错误
      console.error('Request Error:', error.message)
    }
    return Promise.reject(error)
  }
)

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
