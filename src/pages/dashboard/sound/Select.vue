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

import DownloadDialog from './DownloadDialog.vue';

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
    } else {
      const soundItem = sounds.value?.find((s) => s.value === sound);
      if (soundItem) {
        toast({
          duration: 1000,
          description: `'${soundItem.name}' chosen successfully.`,
        });
      }
    }
  },
  {
    manual: true,
    onAfter: () => {
      refreshSelectedSound();
    },
  },
);

const existedSoundNames = computed(() => sounds.value?.map((s) => s.name));
const hasExistedSounds = computed(() =>
  Boolean(existedSoundNames.value?.length),
);
</script>

<template>
  <div>
    <Select v-model="selectedSound" @update:model-value="selectSound">
      <SelectTrigger :disabled="!hasExistedSounds">
        <SelectValue
          :placeholder="
            hasExistedSounds ? 'Select Your Sound' : 'Download Sounds to Select'
          "
        />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem v-for="s in sounds" :key="s.value" :value="s.value">
            {{ s.name }}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>

    <DownloadDialog
      :refreshSounds="refreshSounds"
      :existedSoundNames="existedSoundNames"
    />
  </div>
</template>
