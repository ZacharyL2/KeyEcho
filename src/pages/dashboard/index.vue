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
  <div class="flex flex-col items-center p-12">
    <div class="text-2xl">KeyEcho</div>

    <Select v-model="selectedSound" @update:model-value="selectSound">
      <SelectTrigger class="w-80 mt-10 mb-2" :disabled="!existedSounds?.length">
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
</template>
