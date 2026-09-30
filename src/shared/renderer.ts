/** Strategy for turning a value into output text. */
export interface Renderer<T> {
  render(value: T): string;
}
