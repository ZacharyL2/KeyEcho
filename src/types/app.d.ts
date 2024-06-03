import type { App } from 'vue';

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, any>;
  export default component;
}

export interface AppContext {
  app: App<Element>;
}

export type UserModule = (ctx: AppContext) => void;
