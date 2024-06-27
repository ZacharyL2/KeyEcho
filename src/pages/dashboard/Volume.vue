<script setup lang="ts">
import { isUndefined } from 'lodash-es';

import Slider from '@/components/ui/slider/Slider.vue';
import { useToast } from '@/components/ui/toast';
import { commands } from '@/services/bindings';

const { toast } = useToast();

const { data: volume, refresh: refreshVolume } = useRequest(async () => {
  const res = await commands.getVolume();
  if (res.status === 'ok') {
    return [Math.round(res.data * 100)];
  }
});

const updateVolume = useDebounceFn(async (nextVolume?: number) => {
  if (!isUndefined(nextVolume)) {
    try {
      await commands.updateVolume(nextVolume / 100);
      toast({
        description: `Volume changed successfully to ${nextVolume}`,
      });
    } catch (err) {
      toast({
        description: `Volume change failed. Reason: ${err}`,
      });
    } finally {
      refreshVolume();
    }
  }
}, 350);
</script>

<template>
  <div class="flex items-center gap-2">
    {{ volume?.at(0) }}

    <Slider
      v-model="volume"
      class="w-32"
      :step="1"
      :max="100"
      @update:model-value="
        (v) => {
          updateVolume(v?.at(0));
        }
      "
    />
  </div>
</template>
