<script setup lang="ts">
import { disable, enable, isEnabled } from 'tauri-plugin-autostart-api';

import { Checkbox } from '@/components/ui/checkbox';

const { data: autoLaunchEnabled, refresh } = useRequest(isEnabled);

async function handleChecked(checked: boolean) {
  const handler = checked ? enable : disable;
  await handler();
  refresh();
}
</script>

<template>
  <div class="flex items-center space-x-2">
    <Checkbox
      id="autoLaunch"
      :checked="autoLaunchEnabled"
      @update:checked="handleChecked"
    />
    <label
      for="autoLaunch"
      class="text-sm leading-none peer-disabled:opacity-70 select-none"
    >
      Auto Launch
    </label>
  </div>
</template>
