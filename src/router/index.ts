import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: HomeView
    },
    {
      // 智能体列表与对话共用同一工作台页面，仅左侧面板默认展示的页签不同
      path: '/agents',
      name: 'agents',
      component: HomeView
    },
    {
      path: '/datasources',
      name: 'datasources',
      component: () => import('../views/DatasourceView.vue')
    },
    {
      path: '/knowledge',
      name: 'knowledge',
      component: () => import('../views/KnowledgeView.vue')
    },
    {
      path: '/models',
      name: 'models',
      component: () => import('../views/ModelView.vue')
    }
  ]
})

export default router
