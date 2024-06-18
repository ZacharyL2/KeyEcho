<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { commands } from '@/services/bindings';

import AutoLaunch from './AutoLaunch.vue';
import DownloadSoundDialog from './DownloadSoundDialog.vue';

const { data: sounds, refresh: refreshSounds } = useRequest(async () => {
  const res = await commands.getSounds();
  if (res.status === 'ok') {
    return res.data ?? [];
  }
});

const { data: selectedSound, refresh: refreshSelectedSound } = useRequest(
  async () => {
    const res = await commands.getSelectedSound();
    if (res.status === 'ok') {
      return res.data ?? '';
    }
  },
);

const { toast } = useToast();

const { run: selectSound } = useRequest(
  async (sound: string) => {
    const res = await commands.selectSound(sound);
    if (res.status === 'error') {
      toast({
        variant: 'destructive',
        description:
          'Your selected sound needs an update. Please re-download it.',
      });
    }
  },
  {
    manual: true,
    onAfter: () => {
      refreshSelectedSound();
    },
  },
);

const existedSounds = computed(() => sounds.value?.map((s) => s.name));
</script>

<template>
  <div class="grid place-items-center">
    <div class="flex flex-col items-center gap-2 p-12">
      <div class="text-2xl">KeyEcho</div>

      <AutoLaunch class="self-end mt-8 mb-2" />
      <Select v-model="selectedSound" @update:model-value="selectSound">
        <SelectTrigger class="w-80" :disabled="!existedSounds?.length">
          <SelectValue placeholder="Select Your Sound" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem v-for="s in sounds" :key="s.value" :value="s.value">
              {{ s.name }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <DownloadSoundDialog
        :refreshSounds="refreshSounds"
        :existedSounds="existedSounds"
      />
    </div>
  </div>
</template>
