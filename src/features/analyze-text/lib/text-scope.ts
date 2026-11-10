/** Existing MVP script safeguard, not automatic language identification. */
export function supportsTextScript(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  const latinLetters = letters.filter((letter) => /\p{Script=Latin}/u.test(letter)).length;
  return letters.length === 0 || latinLetters / letters.length >= 0.8;
}

export function hasUsefulText(text: string, signalCount: number): boolean {
  const words = text.match(/\p{L}+/gu) ?? [];
  return signalCount > 0 || (text.length >= 10 && words.length >= 2);
}
