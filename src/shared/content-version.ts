/**
 * A short name for a content, so that two contents can be told apart without keeping either (`live-pages` L1). FNV-1a,
 * 32 bits, in base 36: it guards nothing - a page only asks "is my file still what I was sent?" - and a collision costs
 * one update shown two seconds late, never a wrong answer about a session.
 */
export function contentVersion(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
