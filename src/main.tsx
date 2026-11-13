import './styles/tokens.css';
import './styles/global.css';

import { render } from 'solid-js/web';

import App from './App';
import * as s from './App.css';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Missing app root.');
}

root.className = s.root;
render(() => <App />, root);
