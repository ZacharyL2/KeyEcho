<script setup lang="ts">
import { disable, enable, isEnabled } from 'tauri-plugin-autostart-api';

import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

const { toast } = useToast();

const { data: autoLaunchEnabled, refreshAsync } = useRequest(isEnabled);
async function handleChecked(checked: boolean) {
  const handlerFn = checked ? enable : disable;
  const actionText = checked ? 'enabled' : 'disabled';

  try {
    await handlerFn();
    await refreshAsync();

    toast({
      description: `Auto launch ${actionText} successfully.`,
    });
  } catch (err) {
    toast({
      description: `Auto launch ${actionText} failed. Reason: ${err}`,
    });
  }
}
</script>

<template>
  <Switch :checked="autoLaunchEnabled" @update:checked="handleChecked" />
</template>
