/**
 * An option shown as what it makes the AI say (guidelines §9.2, "Every option has an example"): one small AI bubble in
 * the option's colour, the way the onboarding's step 3 draws it. It is an example, written by the page, never a line
 * from a transcript.
 */
export type ChatTone = 'coral' | 'mint' | 'grey';

export interface ChatExample {
  readonly tone: ChatTone;
  /** Every argument is already written in every language and escaped. */
  readonly ai: string;
  readonly answer: string;
}

export function chatExample(spec: ChatExample): string {
  return '<div class="ce">' +
    '<span class="ce-who ce-who-' + spec.tone + '" aria-hidden="true">' + spec.ai + '</span>' +
    '<span class="ce-say ce-say-' + spec.tone + '">' + spec.answer + '</span>' +
    '</div>';
}

export const CHAT_EXAMPLE_STYLE = String.raw`
.ce{display:flex;gap:8px;align-items:flex-start;margin-top:10px}
.ce-say{font-size:13.5px;line-height:1.45;color:var(--text);padding:7px 12px;border-radius:4px 12px 12px 12px;border:1px solid transparent}
.ce-say-coral{background:var(--coral-08);border-color:var(--coral-35)}
.ce-say-mint{background:var(--mint-07);border-color:var(--mint-30)}
.ce-say-grey{background:var(--white-04);border-color:var(--white-10)}
.ce-who{flex:none;width:22px;height:22px;margin-top:3px;border-radius:50%;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center}
.ce-who-coral{background:var(--coral-16);color:var(--coral-text)}
.ce-who-mint{background:var(--mint-16);color:var(--mint)}
.ce-who-grey{background:var(--white-08);color:var(--text-2)}
`;
