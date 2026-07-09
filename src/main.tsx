import '@unocss/reset/normalize.css';
import 'virtual:uno.css';
import './assets/index.css';

import { render } from 'solid-js/web';

import App from './App';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Missing app root.');
}

render(() => <App />, root);
