import { Match, Show, Switch } from 'solid-js';

import * as x from './KeyMechanism.css';
import type { CategoryId } from './packs';

const COIL = '150,96 166,103 134,110 166,117 134,124 166,131 134,138 150,145';

// Switch-like mechanisms sit in a socket housing; typebar and fx do not.
const BOXED = new Set<CategoryId>([
  'clicky',
  'thocky',
  'tactile',
  'linear',
  'silent-office',
  'vintage',
]);

function Coil() {
  return <polyline class={x.line} points={COIL} />;
}

/** A stylized mechanism for the category, not any specific hardware. */
function Mechanism(props: { category: CategoryId | null }) {
  return (
    <Switch fallback={<Coil />}>
      <Match when={props.category === 'clicky'}>
        <Coil />
        <path class={x.line} d="M160,101 l12,-5 l-3,11" />
      </Match>
      <Match when={props.category === 'tactile'}>
        <Coil />
        <path class={x.solid} d="M166,118 a4.5,4.5 0 0 1 0,9" />
      </Match>
      <Match when={props.category === 'thocky'}>
        <rect class={x.mass} height="54" width="96" x="102" y="98" />
        <Coil />
      </Match>
      <Match when={props.category === 'silent-office'}>
        <path class={`${x.line} ${x.paper}`} d="M120,148 Q150,100 180,148 Z" />
        <path class={`${x.line} ${x.thin}`} d="M132,148 Q150,116 168,148" />
      </Match>
      <Match when={props.category === 'typewriter'}>
        <line class={`${x.line} ${x.thin}`} x1="118" x2="182" y1="88" y2="88" />
        <circle class={`${x.line} ${x.paper}`} cx="150" cy="100" r="13" />
        <line
          class={`${x.line} ${x.thick}`}
          x1="116"
          x2="140"
          y1="152"
          y2="112"
        />
        <rect
          class={`${x.line} ${x.paper}`}
          height="10"
          rx="1.5"
          transform="rotate(-31 141 109)"
          width="14"
          x="134"
          y="104"
        />
        <circle class={x.solid} cx="116" cy="152" r="3" />
      </Match>
      <Match when={props.category === 'vintage'}>
        <path class={`${x.line} ${x.paper}`} d="M130,118 Q150,98 170,118 Z" />
        <polyline
          class={x.line}
          points="150,120 165,126 135,131 165,136 135,141 150,145"
        />
      </Match>
      <Match when={props.category === 'fx'}>
        <polyline
          class={`${x.line} ${x.wave}`}
          points="90,120 108,96 124,144 140,84 156,144 172,96 190,120 210,120"
        />
      </Match>
    </Switch>
  );
}

/** The current pack's key in cross-section, drawn for its category. */
export function KeyMechanism(props: { category: CategoryId | null }) {
  return (
    <svg
      aria-hidden="true"
      class={x.drawing}
      preserveAspectRatio="xMaxYMax meet"
      viewBox="50 26 200 136"
    >
      <Show when={props.category && BOXED.has(props.category)}>
        <rect class={x.line} height="66" width="108" x="96" y="90" />
      </Show>
      <Mechanism category={props.category} />
      <path
        class={`${x.line} ${x.paper}`}
        d="M58,40 Q58,34 66,34 L234,34 Q242,34 242,40 L226,72 Q225,76 219,76 L81,76 Q75,76 74,72 Z"
        stroke-linejoin="round"
      />
      <path class={`${x.line} ${x.dish}`} d="M74,44 Q150,50 226,44" />
      <rect
        class={`${x.line} ${x.paper}`}
        height="16"
        width="24"
        x="138"
        y="76"
      />
      <line class={`${x.line} ${x.thick}`} x1="60" x2="240" y1="156" y2="156" />
    </svg>
  );
}
