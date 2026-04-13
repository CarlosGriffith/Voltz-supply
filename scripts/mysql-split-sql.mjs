/**
 * Split MySQL dump/migration text that uses DELIMITER // for procedures and triggers.
 * @param {string} content
 * @returns {string[]}
 */
export function splitSqlWithDelimiters(content) {
  const lines = content.split(/\r?\n/);
  let delim = ';';
  const stmts = [];
  let chunk = [];

  const flushChunk = () => {
    const text = chunk.join('\n').trim();
    if (text.length > 0) stmts.push(text);
    chunk = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toUpperCase().startsWith('DELIMITER ')) {
      flushChunk();
      delim = trimmed.slice(10).trim();
      continue;
    }

    chunk.push(line);

    if (delim === ';') {
      if (trimmed.endsWith(';')) flushChunk();
    } else {
      if (trimmed.endsWith(delim)) flushChunk();
    }
  }
  flushChunk();
  return stmts;
}
