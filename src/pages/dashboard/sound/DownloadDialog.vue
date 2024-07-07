<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import {
  array,
  type InferOutput,
  literal,
  object,
  parseAsync,
  pipe,
  string,
  url,
} from 'valibot';

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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import DownloadButton from './DownloadButton.vue';

defineProps<{
  refreshSounds: () => void;
  existedSoundNames: string[];
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

export type GithubSound = InferOutput<typeof GithubSoundsSchema>[number];

const { data: onlineSounds, loading: loadingOnlineSounds } = useRequest(
  async () => {
    const data = await fetch(ONLINE_URL).then((res) => res.json());
    return parseAsync(GithubSoundsSchema, data);
  },
  {
    loadingDelay: 200,
  },
);
</script>

<template>
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="link" class="text-sm p-0 h-6">
        Download from Online
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle> Download Sound </DialogTitle>
      </DialogHeader>

      <DialogDescription> Please select a sound to download </DialogDescription>

      <ScrollArea class="max-h-[42vh] px-2">
        <div v-if="loadingOnlineSounds" class="h-20 grid place-items-center">
          <Loader2 class="animate-spin size-8" />
        </div>

        <div v-for="s in onlineSounds" v-else :key="s.name">
          <div class="flex items-center justify-between p-2">
            <span>{{ s.name }}</span>

            <DownloadButton
              :sound="s"
              :refreshSounds="refreshSounds"
              :isExisted="
                existedSoundNames.some((existedName) =>
                  s.name.startsWith(existedName),
                )
              "
            />
          </div>
          <Separator />
        </div>
      </ScrollArea>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary"> Close </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
