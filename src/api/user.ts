import api from './request'

export const userApi = {
  login: (data: any) => api.post('/user/login', data)
}
