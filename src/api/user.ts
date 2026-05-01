import api from './chat'

export const userApi = {
  login: (data: any) => api.post('/user/login', data)
}
