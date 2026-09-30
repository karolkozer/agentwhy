/**
 * Breaks text into lines that fit a width, at spaces where it can and inside a long run where it must - a URL
 * or a path is never silently truncated, because a report that hides half a finding is worse than a wide line.
 */
export function wrap(text: string, width: number): string[] {
  const usable = Math.max(width, 8);

  return text.split('\n').flatMap((paragraph) => wrapParagraph(paragraph, usable));
}

function wrapParagraph(paragraph: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of paragraph.split(/\s+/).filter((part) => part !== '')) {
    if (current === '') current = word;
    else if (`${current} ${word}`.length <= width) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
    while (current.length > width) {
      lines.push(current.slice(0, width));
      current = current.slice(width);
    }
  }
  if (current !== '') lines.push(current);
  return lines.length === 0 ? [''] : lines;
}
