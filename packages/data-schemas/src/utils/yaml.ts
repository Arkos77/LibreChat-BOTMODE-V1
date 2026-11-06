/**
 * Strip a trailing YAML inline comment from an unquoted scalar.
 * YAML treats ` # ...` (space before hash) as a comment; `#` without a
 * preceding space is part of the value (e.g. `hashtag#foo`). A scalar
 * that's entirely a comment (`# nothing yet`) collapses to empty so
 * callers can treat it as "no value". Applied narrowly — only to
 * boolean fields where the token is a single word — to avoid
 * accidentally truncating free-form strings like descriptions that
 * might legitimately contain `#`.
 */
export function stripYamlTrailingComment(value: string): string {
  if (value.trimStart().startsWith('#')) return '';
  // Avoid the quadratic backtracking of /^(.*?)\\s+#.*$/ on long scalars
  // with whitespace but no inline comment.
  let firstLineBreak = -1;
  let lastLineBreak = -1;
  for (let index = 0; index < value.length; index++) {
    if (!/[\r\n\u2028\u2029]/.test(value[index])) {
      continue;
    }
    if (firstLineBreak === -1) {
      firstLineBreak = index;
    }
    lastLineBreak = index;
  }

  for (let hashIndex = 1; hashIndex < value.length; hashIndex++) {
    if (value[hashIndex] !== '#' || !/\s/.test(value[hashIndex - 1])) {
      continue;
    }

    let whitespaceStart = hashIndex - 1;
    while (whitespaceStart > 0 && /\s/.test(value[whitespaceStart - 1])) {
      whitespaceStart--;
    }

    // Preserve the original single-line regex semantics for multiline input.
    if (
      (firstLineBreak !== -1 && firstLineBreak < whitespaceStart) ||
      lastLineBreak > hashIndex
    ) {
      continue;
    }
    return value.slice(0, whitespaceStart);
  }
  return value;
}
