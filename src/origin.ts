// Where the app talks to the store. Overridable for local testing:
//   VITE_KEYECHO_ORIGIN=http://localhost:3999 pnpm tauri dev
// Ships pointing at prod. Dev builds also relax the Rust URL allowlist so a
// localhost origin can actually be opened/downloaded from.
export const KEYECHO_ORIGIN =
  (import.meta.env.VITE_KEYECHO_ORIGIN as string | undefined) ??
  'https://keyecho.app';
