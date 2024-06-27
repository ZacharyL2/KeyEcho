<script setup lang="ts">
import Toaster from '@/components/ui/toast/Toaster.vue';

import AutoLaunch from './AutoLaunch.vue';
import Logo from './Logo.vue';
import SettingItem from './SettingItem.vue';
import SoundSelect from './sound/Select.vue';
import Volume from './Volume.vue';
</script>

<template>
  <Toaster :duration="2000" />
  <div class="grid place-items-center">
    <div class="flex flex-col gap-8 w-96 mt-16">
      <Logo />

      <SoundSelect />

      <SettingItem label="Auto Launch">
        <AutoLaunch />
      </SettingItem>

      <SettingItem label="Volume">
        <Volume />
      </SettingItem>
    </div>
  </div>
</template>
