import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

import { LoginToggle } from './Home';
import * as s from './SettingsSheet.css';
import { Sheet, SheetFine } from './Sheet';
import * as sheet from './Sheet.css';
import * as ui from './styles/controls.css';

function Row(props: { label: string; children: JSX.Element }) {
  return (
    <div class={s.row}>
      <span class={s.label}>{props.label}</span>
      <span class={s.value}>{props.children}</span>
    </div>
  );
}

/** License, the All Sounds offer, open at login, the sounds folder and the version. */
export function SettingsSheet(props: {
  version: string;
  /** What the saved key covers, in a few words. */
  licenseStatus: string;
  owner: boolean;
  /** The All Sounds Forever price; null for people who own every pack. */
  allPrice: string | null;
  autoLaunch: boolean;
  autoLaunchLoading: boolean;
  toasts?: JSX.Element;
  onAutoLaunch: (enabled: boolean) => void;
  onLicense: () => void;
  onUnlockAll: () => void;
  onSoundsFolder: () => void;
  onWhatsNew: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet label="Settings" toasts={props.toasts} onClose={props.onClose}>
      <h2 class={sheet.heading}>Settings</h2>
      <div class={s.rows}>
        <Row label="License">
          <span classList={{ [s.status]: true, [s.owned]: props.owner }}>
            {props.licenseStatus}
          </span>
          <button
            class={ui.smallButton}
            type="button"
            onClick={() => props.onLicense()}
          >
            Manage
          </button>
        </Row>
        <Show when={props.allPrice}>
          {(price) => (
            <Row label="All Sounds Forever">
              <span class={ui.price}>{price()}</span>
              <button
                class={ui.smallButton}
                type="button"
                onClick={() => props.onUnlockAll()}
              >
                Unlock all
              </button>
            </Row>
          )}
        </Show>
        <Row label="Open at login">
          <LoginToggle
            enabled={props.autoLaunch}
            loading={props.autoLaunchLoading}
            onChange={(enabled) => props.onAutoLaunch(enabled)}
          />
        </Row>
        <Row label="Sounds folder">
          <button
            class={ui.smallButton}
            type="button"
            onClick={() => props.onSoundsFolder()}
          >
            Open
          </button>
        </Row>
        <Row label="What's new">
          <button
            class={ui.smallButton}
            type="button"
            onClick={() => props.onWhatsNew()}
          >
            Open
          </button>
        </Row>
      </div>
      <SheetFine>KeyEcho v{props.version}</SheetFine>
    </Sheet>
  );
}
