<script setup lang="ts">
import { ref } from 'vue'

const greeting = ref('Hello Vue 3 + TypeScript + Vite')
</script>

<template>
  <div class="greetings">
    <h1 class="green">{{ greeting }}</h1>
    <h3>
      You’ve successfully created a project with
      <a href="https://vitejs.dev/" target="_blank" rel="noopener">Vite</a> +
      <a href="https://vuejs.org/" target="_blank" rel="noopener">Vue 3</a>. What's next?
    </h3>
  </div>
</template>

<style scoped>
h1 {
  font-weight: 500;
  font-size: 2.6rem;
  position: relative;
  top: -10px;
}

h3 {
  font-size: 1.2rem;
}

.greetings h1,
.greetings h3 {
  text-align: center;
}

.greetings h3 {
  margin: 40px 0 0 0;
  font-weight: normal;
  font-size: 1.4rem;
}

@media (min-width: 1024px) {
  .greetings h1,
  .greetings h3 {
    text-align: left;
  }
}

.green {
  color: hsla(160, 100%, 37%, 1);
}
</style>
