import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { agentApi } from '@/api/agent'

export const useAgentStore = defineStore('agent', () => {
  const agents = ref([])
  const loading = ref(false)
  const error = ref('')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => !!error.value)
  const agentCount = computed(() => agents.value.length)

  async function fetchAgents() {
    loading.value = true
    error.value = ''
    try {
      const response = await agentApi.getAgents()
      agents.value = response.data
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch agents'
    } finally {
      loading.value = false
    }
  }

  async function createAgent(agentData: any) {
    loading.value = true
    error.value = ''
    try {
      const response = await agentApi.createAgent(agentData)
      agents.value.push(response.data)
      return response.data
    } catch (err: any) {
      error.value = err.message || 'Failed to create agent'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    agents,
    loading,
    error,
    isLoading,
    hasError,
    agentCount,
    fetchAgents,
    createAgent
  }
})
