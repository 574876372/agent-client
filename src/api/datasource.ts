import api from './request'

/**
 * 数据源管理 API 客户端
 *
 * - 列表 / CRUD / 测试连接：对接后端 `/api/datasources` 路由
 * - 所有业务 ID 通过查询参数传递，禁止路径变量
 * - 字段命名与后端 DatasourceRequest / DatasourceResponse 一致
 * - 密码字段只在「创建 / 重置密码」时通过 passwordPlain 上传，永不下行
 */

export interface DatasourceResponse {
  id: string
  name: string
  description?: string
  dbType: string
  jdbcUrl: string
  username: string
  enabled: number
  readOnly: number
  createTime?: string
  updateTime?: string
}

export interface DatasourceRequest {
  id?: string
  name: string
  description?: string
  dbType: string
  jdbcUrl: string
  username: string
  /** 仅创建 / 修改密码时填；编辑场景留空 = 保留原密码 */
  passwordPlain?: string
  enabled?: number
}

export const datasourceApi = {
  /** 列出当前用户全部启用数据源 */
  list: () => api.get<DatasourceResponse[]>('/datasources/list'),

  /** 新增数据源 */
  create: (data: DatasourceRequest) => api.post<DatasourceResponse>('/datasources/create', data),

  /** 更新数据源（passwordPlain 留空 = 不修改密码） */
  update: (id: string, data: DatasourceRequest) =>
    api.put<DatasourceResponse>('/datasources/update', data, { params: { id } }),

  /** 删除数据源（软删除 + 释放运行时连接池） */
  remove: (id: string) => api.delete<void>('/datasources/delete', { params: { id } }),

  /** 测试未保存的连接配置（创建前的连通性预检） */
  testNew: (data: DatasourceRequest) =>
    api.post<{ success: boolean }>('/datasources/test/new', data),

  /** 复测已保存的数据源（可不传 passwordPlain；自动从 cipher 回源） */
  testExisting: (id: string, data?: Partial<DatasourceRequest>) =>
    api.post<{ success: boolean }>('/datasources/test/existing', data ?? {}, { params: { id } }),
}

