<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';

import Button from '@/components/ui/button/Button.vue';
import { useToast } from '@/components/ui/toast';
import { commands } from '@/services/bindings';

import type { GithubSound } from './DownloadDialog.vue';

const props = defineProps<{
  sound: GithubSound;
  isExisted: boolean;
  refreshSounds: () => void;
}>();

const { toast } = useToast();

const { run: handleDownload, loading } = useRequest(
  async (url: string) => {
    const res = await commands.downloadSound(url);
    if (res.status === 'ok') {
      toast({
        duration: 1000,
        description: 'Download successful',
      });

      props.refreshSounds();
    } else {
      toast({
        description: 'Download failed',
      });
    }
  },
  {
    manual: true,
  },
);
</script>

<template>
  <Button
    :disabled="loading"
    :variant="isExisted ? 'outline' : 'default'"
    @click="handleDownload(sound.download_url)"
  >
    <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />

    {{ isExisted ? 'Redownload' : 'Download' }}
  </Button>
</template>
