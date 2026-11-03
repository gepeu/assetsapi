/** Turns saved HTML into plain text as text processing only: nothing in it ever runs. */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== "#") return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?(p|div|section|article|header|footer|main|nav|aside|ul|ol|li|table|tr|h[1-6]|br|hr|pre|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<\/?(td|th)\b[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MIN_VISIBLE_CHARS = 400;
const CHALLENGE_PAGE = /enable javascript|just a moment|checking your browser|verify you are human/i;

/** True when saved HTML has almost no readable content, as with client-rendered pages. */
export function isEmptyShell(html: string): boolean {
  const text = htmlToText(html);
  return text.length < MIN_VISIBLE_CHARS || (text.length < 2000 && CHALLENGE_PAGE.test(text));
}
