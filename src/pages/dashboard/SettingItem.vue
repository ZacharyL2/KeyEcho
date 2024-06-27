<script setup lang="ts">
const props = defineProps<{
  label: string;
}>();

defineSlots<{
  default: object;
}>();
</script>

<template>
  <div class="flex items-center justify-between">
    <span>{{ props.label }}</span>
    <slot />
  </div>
</template>
