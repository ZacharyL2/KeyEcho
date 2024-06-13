<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import { array, literal, object, parseAsync, pipe, string, url } from 'valibot';

import Button from '@/components/ui/button/Button.vue';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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

const { data: onlineSounds, loading: loadingOnlineSounds } = useRequest(
  async () => {
    const data = await fetch(ONLINE_URL).then((res) => res.json());
    return parseAsync(GithubSoundsSchema, data);
  },
  {
    loadingDelay: 200,
  },
);

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
      <Button variant="link"> Download from Online </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle> Download Sound </DialogTitle>
      </DialogHeader>

      <DialogDescription> Please select a sound to download </DialogDescription>

      <div class="max-h-[42vh] overflow-y-auto px-2">
        <div v-if="loadingOnlineSounds" class="h-20 grid place-items-center">
          <Loader2 class="animate-spin size-8" />
        </div>

        <div v-for="s in onlineSounds" v-else :key="s.name">
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
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary"> Close </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
