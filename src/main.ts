import '@unocss/reset/tailwind-compat.css';
import 'virtual:uno.css';

import { createApp } from 'vue';

import App from './App.vue';
import type { UserModule } from './types/app';

const app = createApp(App);

Object.values<{ install: UserModule }>(
  import.meta.glob('./modules/*.ts', { eager: true }),
).forEach((i) => {
  i.install?.({ app });
});

app.mount('#app');
