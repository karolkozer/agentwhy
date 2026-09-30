/** Which AI wrote a session (`2026-09-27-what-codex-wrote.md` X28): a row, a key and a report say it. */
export type Provider = 'claude-code' | 'codex';

/** Each AI by its product's name, which is the same in every language a page is written in. */
export const PROVIDER_NAMES: Readonly<Record<Provider, string>> = { 'claude-code': 'Claude Code', codex: 'Codex' };

/**
 * What a format's test of an input's content says (X2): the input is that format's, it is not, or it could not be read
 * to tell. A path or an extension decides nothing, and an input no format recognises is read by none.
 */
export type Recognition = 'recognised' | 'unknown' | 'unavailable';

/** One format's first-line test (X2), registered under the AI that writes the format. */
export interface FormatRecognition {
  readonly provider: Provider;
  recognise(input: string): Promise<Recognition>;
}

/**
 * What the registry says of an input: whose it is; that no format could read it to tell; or that every format read it
 * and none recognised it.
 */
export type FormatSelection =
  | { readonly kind: 'recognised'; readonly provider: Provider }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'unknown' };

/**
 * The one registry that tells formats apart (XD7), shared by every command that reads a session. Formats are tested in
 * the order given - the stricter rule first - and the first that recognises the input has it. What each command does
 * with the provider is its own keyed choice, never a fallback: no format's reader runs on an input it did not recognise.
 */
export class SessionFormats {
  readonly #formats: readonly FormatRecognition[];

  constructor(formats: readonly FormatRecognition[]) {
    const providers = formats.map((format) => format.provider);
    if (new Set(providers).size !== providers.length) throw new Error('A provider is registered more than once.');
    this.#formats = formats;
  }

  async select(input: string): Promise<FormatSelection> {
    let unavailable = false;
    for (const format of this.#formats) {
      const recognition = await format.recognise(input);
      if (recognition === 'recognised') return { kind: 'recognised', provider: format.provider };
      if (recognition === 'unavailable') unavailable = true;
    }
    return unavailable ? { kind: 'unavailable' } : { kind: 'unknown' };
  }
}
