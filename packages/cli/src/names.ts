/**
 * `redirect_uris` → `redirect-uris`: the API's word, in a shell's spelling.
 *
 * Its own module because both the command runner and the flag-surface
 * calculation need it, and having the runner own it made `surface.ts` import
 * `run.ts` import `registry.ts` in a circle.
 */
export function flagName(field: string): string {
  return field.replace(/_/g, '-')
}
