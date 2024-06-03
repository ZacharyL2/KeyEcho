<script setup lang="ts">
import { array, literal, object, parseAsync, pipe, string, url } from 'valibot';

import { useCommonToast } from '@/composables/useCommonToast';
import { commands } from '@/services/bindings';

const props = defineProps<{
  existedSounds?: string[];
  refreshSounds: () => void;
}>();

const dialogOpen = ref(false);

const ONLINE_URL =
  'https://api.github.com/repos/ZacharyL2/KeyEcho/contents/src-tauri/resources';

const GithubSoundsSchema = array(
  object({
    name: string(),
    type: literal('file'),
    download_url: pipe(string(), url()),
  }),
);

const { data: onlineSounds } = useRequest(async () => {
  const data = await fetch(ONLINE_URL).then((res) => res.json());
  return parseAsync(GithubSoundsSchema, data);
});

const sounds = computed(() =>
  onlineSounds.value?.map((sound) => {
    const existed = props.existedSounds?.some((s) => sound.name.startsWith(s));
    return {
      existed,
      ...sound,
    };
  }),
);

const downloadingUrl = ref('');
const { showToast } = useCommonToast();

const { run: handleDownload } = useRequest(
  async (url: string) => {
    const res = await commands.downloadSound(url);
    if (res.status === 'ok') {
      showToast({
        severity: 'success',
        detail: 'Download successful',
      });

      props.refreshSounds();
    } else {
      showToast({
        severity: 'error',
        detail: 'Download failed',
      });
    }
  },
  {
    manual: true,
    onAfter: () => {
      downloadingUrl.value = '';
    },
    onBefore: ([url]) => {
      downloadingUrl.value = url;
    },
  },
);
</script>

<template>
  <div class="clickable-text" @click="dialogOpen = true">
    Download from online
  </div>

  <Dialog
    v-model:visible="dialogOpen"
    :modal="true"
    :draggable="false"
    class="min-w-lg"
    header="Add Sound"
  >
    <div v-for="item in sounds" :key="item.name">
      <div class="flex items-center justify-between border-b-1 p-4">
        <span class="text-lg">
          {{ item.name }}
        </span>

        <Button
          :label="item.existed ? 'Redownload' : 'Download'"
          :severity="item.existed ? 'contrast' : 'info'"
          :loading="downloadingUrl === item.download_url"
          @click="handleDownload(item.download_url)"
        />
      </div>
    </div>

    <template #footer>
      <Button label="Close" severity="secondary" @click="dialogOpen = false" />
    </template>
  </Dialog>
</template>
