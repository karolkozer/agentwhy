/** Orders strings by UTF-16 code units — the order `Array.prototype.sort` uses without a comparator. */
export function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
