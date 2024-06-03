<script setup lang="ts">
import Toast from 'primevue/toast';

import OnlineSoundModal from './components/OnlineSoundModal.vue';
import { commands } from './services/bindings';

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
  <Toast position="top-center" />
  <div class="flex flex-col items-center gap-6 p-12">
    <div class="mb-8 text-3xl">KeyEcho</div>

    <Dropdown
      v-model="selectedSound"
      :options="sounds"
      optionLabel="name"
      optionValue="value"
      class="w-80"
      placeholder="Select a Sound"
      @change="
        (evt) => {
          selectSound(evt.value);
        }
      "
    />

    <OnlineSoundModal
      :refreshSounds="refreshSounds"
      :existedSounds="existedSounds"
    />
  </div>
</template>
