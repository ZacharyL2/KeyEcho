<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { commands } from '@/services/bindings';

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

const { run: selectSound } = useRequest(
  async (sound: string) => {
    await commands.selectSound(sound);
  },
  {
    manual: true,
    onSuccess: () => {
      refreshSelectedSound();
    },
  },
);

const existedSounds = computed(() => sounds.value?.map((s) => s.name));
</script>

<template>
  <div class="flex flex-col items-center p-12">
    <div class="text-2xl">KeyEcho</div>

    <Select v-model="selectedSound" @update:model-value="selectSound">
      <SelectTrigger class="w-80 mt-10 mb-2">
        <SelectValue placeholder="Select a sound" />
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
</template>
