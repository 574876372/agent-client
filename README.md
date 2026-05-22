# Agent Client

一个基于 Vue 3 + TypeScript 的前端应用，用于与 Agent Scope 后端服务交互。

## 技术栈

- **Vue 3** - 渐进式前端框架，使用 Composition API
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **Pinia** - 状态管理
- **Vue Router** - 路由管理
- **Element Plus** - UI 组件库
- **Axios** - HTTP 客户端

## 项目结构

```
src/
├── api/           # API 接口层
│   ├── chat.ts    # Chat/Agent 接口服务
│   └── request.ts # Axios 请求配置与拦截器
├── assets/        # 静态资源
│   ├── logo.svg
│   └── main.css
├── components/    # 业务功能组件目录
│   ├── auth/      # 认证/登录模块
│   │   └── LoginModal.vue
│   ├── agent/     # 智能体创作模块
│   │   └── CreateAgentModal.vue
│   └── chat/      # 聊天与对话列表模块
│       ├── AppSidebar.vue
│       ├── ChatMain.vue
│       └── NewChatModal.vue
├── router/        # 路由配置
│   └── index.ts
├── stores/        # 状态管理
│   ├── counter.ts
│   └── agent.ts
├── views/         # 页面组件
│   ├── HomeView.vue
│   └── AboutView.vue
└── main.ts        # 应用入口
```

## 开发指南

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 代码检查

```bash
npm run lint
```

### 类型检查

```bash
npm run type-check
```

## API 集成

本项目配置了代理到 `http://localhost:8080` 的后端服务。请确保 agent-scope 服务正在运行。

API 基础路径：`http://localhost:8080/api`

### 主要接口

- `GET /agents` - 获取所有 agents
- `POST /agents` - 创建新 agent
- `GET /agents/{id}` - 获取指定 agent
- `PUT /agents/{id}` - 更新 agent
- `DELETE /agents/{id}` - 删除 agent
- `POST /agents/{id}/execute` - 执行 agent 任务

## 环境要求

- Node.js >= 18
- npm 或 yarn

## 自定义配置

详见 [Vite 配置](https://vitejs.dev/config/) 和 [Vue CLI 配置](https://cli.vuejs.org/config/)。

## 许可证

MIT
