<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import { array, literal, object, parseAsync, pipe, string, url } from 'valibot';

import Button from '@/components/ui/button/Button.vue';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast/use-toast';
import { commands } from '@/services/bindings';

const props = defineProps<{
  existedSounds?: string[];
  refreshSounds: () => void;
}>();

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

const { toast } = useToast();
const downloadingUrl = ref('');

const { run: handleDownload } = useRequest(
  async (url: string) => {
    const res = await commands.downloadSound(url);
    if (res.status === 'ok') {
      toast({
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
    onAfter: () => {
      downloadingUrl.value = '';
    },
    onBefore: ([url]) => {
      downloadingUrl.value = url;
    },
  },
);

const isDownloadingSound = (soundUrl: string) =>
  soundUrl === downloadingUrl.value;
const isExistedSound = (soundName: string) =>
  props.existedSounds?.some((s) => soundName.startsWith(s));
</script>

<template>
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="link"> Download from online </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Download sound</DialogTitle>
      </DialogHeader>

      <div v-for="s in onlineSounds" :key="s.name">
        <div class="flex items-center justify-between border-b-[1px] p-2">
          <span>
            {{ s.name }}
          </span>

          <Button
            :variant="isExistedSound(s.name) ? 'outline' : 'default'"
            :disabled="isDownloadingSound(s.download_url)"
            @click="handleDownload(s.download_url)"
          >
            <Loader2
              v-if="isDownloadingSound(s.download_url)"
              class="w-4 h-4 mr-2 animate-spin"
            />

            {{ isExistedSound(s.name) ? 'Redownload' : 'Download' }}
          </Button>
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary"> Close </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
