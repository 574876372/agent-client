import api from './request'

/**
 * 模型配置管理 API 客户端
 *
 * - 厂商 / 模型 CRUD 与连通性测试：对接后端 `/api/model-config` 路由
 * - 所有业务 ID 通过查询参数传递，禁止路径变量
 * - API Key 只写不读：仅在「新增 / 更换密钥」时通过 apiKeyPlain 上传，响应中只有 apiKeyConfigured
 */

export type ModelType = 'CHAT' | 'EMBEDDING'

export interface ModelProviderResponse {
  id: string
  code: string
  name: string
  protocol: string
  baseUrl: string
  apiKeyConfigured: boolean
  enabled: number
  createTime?: string
  updateTime?: string
}

export interface ModelProviderRequest {
  id?: string
  /** 仅新增时可填，创建后不可修改 */
  code?: string
  name: string
  protocol?: string
  baseUrl: string
  /** 留空 = 不修改密钥 */
  apiKeyPlain?: string
  enabled?: number
}

export interface ModelInfoResponse {
  id: string
  providerId: string
  providerName?: string
  modelType: ModelType
  modelName: string
  dimensions?: number
  sendDimensions?: number
  isDefault: number
  enabled: number
  /** 绑定该向量模型的知识库数量；大于 0 时模型名与维度不可修改 */
  boundKbCount: number
  createTime?: string
  updateTime?: string
}

export interface ModelInfoRequest {
  id?: string
  providerId: string
  modelType: ModelType
  modelName: string
  dimensions?: number
  sendDimensions?: number
  isDefault?: number
  enabled?: number
}

export const modelApi = {
  /** 列出全部厂商 */
  listProviders: () => api.get<ModelProviderResponse[]>('/model-config/providers/list'),

  /** 新增厂商 */
  createProvider: (data: ModelProviderRequest) =>
    api.post<ModelProviderResponse>('/model-config/providers/create', data),

  /** 更新厂商（apiKeyPlain 留空 = 不修改密钥） */
  updateProvider: (id: string, data: ModelProviderRequest) =>
    api.put<ModelProviderResponse>('/model-config/providers/update', data, { params: { id } }),

  /** 删除厂商（其下仍有模型或被智能体使用时后端拒绝） */
  removeProvider: (id: string) => api.delete<void>('/model-config/providers/delete', { params: { id } }),

  /** 列出模型，可按类型过滤 */
  listModels: (modelType?: ModelType) =>
    api.get<ModelInfoResponse[]>('/model-config/models/list', { params: { modelType } }),

  /** 新增模型 */
  createModel: (data: ModelInfoRequest) => api.post<ModelInfoResponse>('/model-config/models/create', data),

  /** 更新模型（被知识库绑定的向量模型不可修改模型名与维度） */
  updateModel: (id: string, data: ModelInfoRequest) =>
    api.put<ModelInfoResponse>('/model-config/models/update', data, { params: { id } }),

  /** 删除模型（被知识库绑定时后端拒绝） */
  removeModel: (id: string) => api.delete<void>('/model-config/models/delete', { params: { id } }),

  /** 测试模型连通性；向量模型会校验返回维度与配置一致 */
  testModel: (id: string) =>
    api.post<{ success: boolean; message: string }>('/model-config/models/test', null, { params: { id } }),
}
