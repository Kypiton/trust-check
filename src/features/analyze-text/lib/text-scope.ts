/** MVP safeguard for the supported English and Russian rule sets. */
export function supportsTextScript(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;
  const latin = letters.filter((letter) => /\p{Script=Latin}/u.test(letter)).length;
  const cyrillic = letters.filter((letter) => /\p{Script=Cyrillic}/u.test(letter)).length;
  if (latin / letters.length >= 0.8) return true;
  if (cyrillic / letters.length >= 0.8) {
    // Russian is supported; Ukrainian-specific letters remain outside the MVP
    // so Ukrainian content is never silently labelled LOW by Russian rules.
    return !/[іїєґ]/iu.test(text);
  }
  return false;
}

export function hasUsefulText(text: string, signalCount: number): boolean {
  const words = text.match(/\p{L}+/gu) ?? [];
  return signalCount > 0 || (text.length >= 10 && words.length >= 2);
}
