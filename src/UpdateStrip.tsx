import { Icon } from './Icon';
import * as ui from './styles/controls.css';
import * as s from './UpdateStrip.css';

/** Shown once after an update, until dismissed. */
export function UpdateStrip(props: {
  version: string;
  title: string;
  onWhatsNew: () => void;
  onDismiss: () => void;
}) {
  return (
    <section class={s.updateStrip}>
      <span class={ui.grow}>
        <b class={s.version}>v{props.version}</b>{' '}
        <span class={s.title}>· {props.title}</span>
      </span>
      <button class={s.cta} type="button" onClick={props.onWhatsNew}>
        What's new
      </button>
      <button
        aria-label="Hide update"
        class={s.dismiss}
        type="button"
        onClick={props.onDismiss}
      >
        <Icon name="close" />
      </button>
    </section>
  );
}
