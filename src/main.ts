import '@/assets/index.css';

import disableDevtool from 'disable-devtool';
import { createApp } from 'vue';

import App from './App.vue';
import { isDev } from './lib/utils';

disableDevtool({
  ignore: () => isDev,
});

const app = createApp(App);

app.mount('#app');
