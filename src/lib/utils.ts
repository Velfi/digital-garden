export function removeIndent(text: string): string {
  const lines = text.split('\n');
  let minIndent = Infinity;

  // Find the minimum indent
  for (const line of lines) {
    if (line.trim() === '') {
      continue;
    }
    const currentIndent = line.search(/\S/);
    if (currentIndent !== -1 && currentIndent < minIndent) {
      minIndent = currentIndent;
    }
  }

  // Remove the minimum indent from all non-empty lines
  const trimmedLines = lines.map((line) => {
    if (line.trim() === '') {
      return line;
    }
    return line.slice(minIndent);
  });

  // Join the lines back into a single string
  return trimmedLines.join('\n');
}
