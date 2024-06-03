// @unocss-ignore

import { TOAST_LEAVE_ACTIVE } from './components/toast';

export default {
  css: `
  *[data-pd-ripple='true'] {
    overflow: hidden;
    position: relative;
  }
  span[data-p-ink-active='true'] {
    animation: ripple 0.4s linear;
  }

  @keyframes ripple {
    100% {
      opacity: 0;
      transform: scale(2.5);
    }
  }

  .${TOAST_LEAVE_ACTIVE} {
    transition: max-height .45s cubic-bezier(0,1,0,1), opacity .3s, margin-bottom .3s cubic-bezier(0.4,0,0.2,1) !important;
  }
`,
};
