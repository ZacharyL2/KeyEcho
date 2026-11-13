import type { JSX } from 'solid-js';
import { createResource, createSignal, For, onMount, Show } from 'solid-js';

import { packLabel } from './catalog';
import { activateLicense, loadSounds, unwrapCommand } from './library';
import {
  forgetVerifiedLicense,
  loadStoredLicenseKey,
  packDownloadUrl,
  storeLicenseKey,
} from './license';
import * as s from './LicenseSheet.css';
import type { Notify } from './notify';
import { createRestoreRequest } from './restore';
import { commands } from './services/bindings';
import { Sheet, SheetFine } from './Sheet';
import * as sheet from './Sheet.css';
import * as ui from './styles/controls.css';

interface CheckFailure {
  message: string;
  hint?: string;
  details?: string;
  retry?: boolean;
}

const KEY_PROBLEM_ID = 'license-key-problem';
const EMAIL_PROBLEM_ID = 'restore-email-problem';

/** A failure shown right under the field it belongs to. */
function FieldProblem(props: {
  id: string;
  problem: CheckFailure;
  onRetry: () => void;
}) {
  return (
    <div class={s.inline} id={props.id} role="alert">
      <span>
        <b class={s.messageStrong}>{props.problem.message}.</b>
        <Show when={props.problem.hint}>{(hint) => ` ${hint()}`}</Show>
      </span>
      <Show when={props.problem.retry}>
        <button class={ui.smallButton} type="button" onClick={props.onRetry}>
          Retry
        </button>
      </Show>
      <Show when={props.problem.details}>
        {(details) => (
          <details class={s.details}>
            <summary>Details</summary>
            <p class={s.detailsText}>{details()}</p>
          </details>
        )}
      </Show>
    </div>
  );
}

/** Paste a key to activate it, or have every key for an email sent again. */
export function LicenseSheet(props: {
  notify: Notify;
  toasts?: JSX.Element;
  onClose: () => void;
  onSoundsChanged: () => void;
}) {
  const [key, setKey] = createSignal(loadStoredLicenseKey());
  const [entitled, setEntitled] = createSignal<string[] | null>(null);
  const [checking, setChecking] = createSignal(false);
  const [failure, setFailure] = createSignal<CheckFailure | null>(null);
  const [downloadingPack, setDownloadingPack] = createSignal<string | null>(
    null,
  );
  // Packs saved from this sheet since it opened.
  const [saved, setSaved] = createSignal<ReadonlySet<string>>(new Set());
  const restore = createRestoreRequest();
  const restoreFailure = (): CheckFailure | null => {
    const state = restore.state();
    if (state.kind === 'missing') {
      return { message: 'Enter your checkout email' };
    }
    return state.kind === 'failed'
      ? {
          message: "Can't reach keyecho.app right now",
          details: state.details,
          retry: true,
        }
      : null;
  };
  const [installed, installedControls] = createResource(async () => {
    return new Set((await loadSounds()).map((sound) => sound.name));
  });

  const isInstalled = (packId: string) => installed()?.has(packId) ?? false;

  const download = async (packId: string) => {
    setDownloadingPack(packId);
    try {
      unwrapCommand(
        await commands.downloadSound(packDownloadUrl(packId), key().trim()),
      );
      setSaved((packs) => new Set([...packs, packId]));
      await installedControls.refetch();
      props.onSoundsChanged();
    } catch (error) {
      props.notify(`${packLabel(packId)} didn't download`, {
        tone: 'error',
        details: String(error),
        action: { label: 'Retry', run: () => void download(packId) },
      });
    } finally {
      setDownloadingPack(null);
    }
  };

  const check = async () => {
    // Only the form used last speaks.
    restore.clear();
    const trimmed = key().trim();
    if (!trimmed) {
      setFailure({ message: 'No key to activate' });
      setEntitled(null);
      return;
    }

    setChecking(true);
    setFailure(null);
    try {
      const { entitled: packs } = await activateLicense(
        trimmed,
        props.notify,
        () => {
          void installedControls.refetch();
          props.onSoundsChanged();
        },
      );
      setEntitled(packs);
      setKey(trimmed);
      await installedControls.refetch();
      props.onSoundsChanged();
    } catch (error) {
      setEntitled(null);
      setFailure(
        error instanceof Error && error.message === 'invalid-key'
          ? {
              message: "That key isn't recognized",
              hint: 'Check for a missing character, or send the key to your email below.',
            }
          : {
              message: "Can't reach keyecho.app right now",
              details: String(error),
              retry: true,
            },
      );
    } finally {
      setChecking(false);
    }
  };

  const forget = () => {
    storeLicenseKey('');
    forgetVerifiedLicense();
    setKey('');
    setEntitled(null);
    setFailure(null);
  };

  onMount(() => {
    if (key().trim()) {
      void check();
    }
  });

  return (
    <Sheet label="License" toasts={props.toasts} onClose={props.onClose}>
      <div class={s.headingRow}>
        <h2 class={sheet.heading}>License</h2>
        <Show when={entitled() !== null}>
          <button class={ui.textLink} type="button" onClick={forget}>
            Forget this key
          </button>
        </Show>
      </div>

      <form
        class={s.pair}
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <label class={s.field}>
          <span class={s.label}>License key</span>
          <input
            aria-describedby={failure() ? KEY_PROBLEM_ID : undefined}
            aria-invalid={failure() !== null}
            autocomplete="off"
            class={s.input}
            classList={{ [s.invalid]: failure() !== null }}
            placeholder="Paste the key from your email"
            spellcheck={false}
            value={key()}
            onInput={(event) => {
              setKey(event.currentTarget.value);
              setFailure(null);
            }}
          />
        </label>
        <button class={s.pairButton} disabled={checking()} type="submit">
          <Show fallback="Activate" when={checking()}>
            Checking…
          </Show>
        </button>
      </form>

      <Show when={failure()}>
        {(problem) => (
          <FieldProblem
            id={KEY_PROBLEM_ID}
            problem={problem()}
            onRetry={() => void check()}
          />
        )}
      </Show>

      <Show when={entitled()}>
        {(packs) => (
          <Show
            fallback={<p class={s.message}>This key has no packs yet</p>}
            when={packs().length > 0}
          >
            <div class={s.packs}>
              <p class={ui.monoLabel}>
                Activated · {packs().length} pack
                {packs().length === 1 ? '' : 's'}
              </p>
              <For each={packs()}>
                {(packId) => (
                  <div class={s.packRow}>
                    <span class={s.packName} title={packId}>
                      {packLabel(packId)}
                    </span>
                    <Show
                      when={saved().has(packId) && downloadingPack() !== packId}
                    >
                      <span class={ui.monoLabel} role="status">
                        Saved
                      </span>
                    </Show>
                    <button
                      class={ui.smallButton}
                      disabled={downloadingPack() !== null}
                      type="button"
                      onClick={() => download(packId)}
                    >
                      <Show
                        fallback={
                          isInstalled(packId) ? 'Download again' : 'Download'
                        }
                        when={downloadingPack() === packId}
                      >
                        Saving…
                      </Show>
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        )}
      </Show>

      <hr class={s.rule} />

      <form
        class={s.pair}
        onSubmit={(event) => {
          event.preventDefault();
          setFailure(null);
          void restore.submit();
        }}
      >
        <label class={s.field}>
          <span class={s.label}>Email</span>
          <input
            aria-describedby={restoreFailure() ? EMAIL_PROBLEM_ID : undefined}
            aria-invalid={restoreFailure() !== null}
            autocomplete="email"
            class={`${s.input} ${s.textInput}`}
            classList={{ [s.invalid]: restoreFailure() !== null }}
            placeholder="you@example.com"
            type="email"
            value={restore.email()}
            onInput={(event) => restore.setEmail(event.currentTarget.value)}
          />
        </label>
        <button
          class={s.pairSmallButton}
          disabled={restore.state().kind === 'sending'}
          type="submit"
        >
          <Show fallback="Send key" when={restore.state().kind === 'sending'}>
            Sending…
          </Show>
        </button>
      </form>
      <Show when={restoreFailure()}>
        {(problem) => (
          <FieldProblem
            id={EMAIL_PROBLEM_ID}
            problem={problem()}
            onRetry={() => void restore.submit()}
          />
        )}
      </Show>
      <Show when={restore.state().kind === 'sent'}>
        <p class={s.message} role="status">
          If that email has a purchase, the key is on its way.
        </p>
      </Show>

      <SheetFine>
        {/* Once sent, the line above says it. */}
        <Show when={restore.state().kind !== 'sent'}>
          Lost your key? We email every key on file for that address.
        </Show>
      </SheetFine>
    </Sheet>
  );
}
