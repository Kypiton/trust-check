import type { DetectedSignal } from "../../../entities/risk";

type TextDetector = (text: string) => DetectedSignal | null;

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
}

// Restrict negation to the nearby clause, not the entire message. A safety warning
// must not hide a separate request later in the text. This is English phrase
// matching, not a general parser for quotations, intent, or complex negation.
function isNegated(text: string, matchIndex: number): boolean {
  const prefix = text.slice(0, matchIndex).split(/[.!?;:,]|\b(?:but|however|instead)\b/).at(-1) ?? "";
  return /(?:\b(?:never|not|don't|doesn't|shouldn't|mustn't|cannot|can't|won't|avoid|stop|without|no need to)\s+(?:[a-z'-]+\s+){0,5}$)|(?:^|\s)(?:не|никогда не|не нужно|не надо|не следует)\s+(?:[а-яё-]+\s+){0,5}$/iu.test(prefix);
}

function hasRequestContext(text: string, matchIndex: number): boolean {
  const prefix = text.slice(0, matchIndex).split(/[.!?;:,]|\b(?:but|however|instead)\b/).at(-1)?.trim() ?? "";
  return prefix === "" || /(?:\b(?:please|kindly|and|then|by|you must|you should|you need to|you have to|you are required to|you to|can you|could you|would you)|(?:пожалуйста|срочно|немедленно|нужно|необходимо|вы должны|требуется|можете|пожалуйста,?))$/iu.test(prefix);
}

function createDetector(
  code: DetectedSignal["code"],
  title: string,
  description: string,
  patterns: readonly RegExp[],
  requestContext = false,
): TextDetector {
  return (rawText) => {
    const text = normalizeText(rawText);
    for (const pattern of patterns) {
      // Fresh regexes avoid shared lastIndex state across calls. Check every
      // occurrence so a negated first match does not suppress a later request.
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
        if (!isNegated(text, match.index) && (!requestContext || hasRequestContext(text, match.index))) {
          return { code, title, description, category: "TEXT" };
        }
      }
    }
    return null;
  };
}

// Small, bounded connector vocabularies keep actions close to their objects;
// they cannot jump across sentences or unrelated stretches of text.
const requestAction = String.raw`(?:send|share|provide|confirm|enter(?:ing)?|submit|give|tell|reply|disclose|type)`;
const requestConnector = String.raw`(?:\s+(?:us|me|your|the|a|an|my|our|with|to|back|please)){0,5}\s+`;
const credential = String.raw`(?:username and password|passwords?|login credentials|pin|security answers?)`;
const otp = String.raw`(?:verification code|otp|one[- ]time password|sms code|security code)`;

export const detectArtificialUrgency = createDetector(
  "ARTIFICIAL_URGENCY",
  "Creates artificial urgency",
  "The message uses urgent language or a short deadline to pressure the recipient.",
  [
    /\b(?:act now|respond immediately|immediately|urgent|final warning|expires today)\b/,
    /\bwithin \d{1,3} (?:minutes?|hours?)\b/,
    /\byour (?:bank )?account will be (?:blocked|suspended)\b/,
    /(?:^|[^\p{L}])(?:срочно|немедленно|последнее предупреждение|действуйте сейчас|ответьте немедленно)(?!\p{L})/u,
    /(?:^|[^\p{L}])в течение \d{1,3} (?:минут|минуты|часов|часа)(?!\p{L})/u,
    /(?:ваш|ваша) (?:банковский )?(?:аккаунт|сч[её]т) (?:будет|могут) (?:заблокирован|заблокировать|приостановлен)/u,
  ],
);

export const detectCredentialRequest = createDetector(
  "CREDENTIAL_REQUEST",
  "Requests login credentials",
  "The message asks the recipient to provide a password, PIN or other login credentials.",
  [new RegExp(String.raw`\b${requestAction}${requestConnector}${credential}\b`), /(?:сообщите|отправьте|пришлите|введите|передайте|подтвердите)(?:\s+(?:нам|мне|ваш|свой|этот|код|логин|пароль|пин)){0,5}\s+(?:пароль|логин и пароль|уч[её]тные данные|пин(?:-код)?|ответы на контрольные вопросы)/u],
  true,
);

export const detectOtpRequest = createDetector(
  "OTP_REQUEST",
  "Requests a verification code",
  "The message asks the recipient to provide a verification code or one-time password.",
  [new RegExp(String.raw`\b${requestAction}${requestConnector}${otp}\b`), /(?:сообщите|отправьте|пришлите|введите|передайте)(?:\s+(?:нам|мне|ваш|свой|этот|одноразовый)){0,5}\s+(?:код подтверждения|одноразовый код|смс[- ]?код|код из смс|код безопасности)/u],
  true,
);

export const detectMoneyRequest = createDetector(
  "MONEY_REQUEST",
  "Requests a payment or transfer",
  "The message directly asks for money, a payment or a transfer of funds.",
  [
    /\b(?:send|transfer|wire) (?:us |me )?(?:the |your |some |a )?(?:money|funds|payment)\b/,
    /\bmake (?:a |the )?(?:payment|transfer)\b/,
    /\bpay (?:us |me )?(?:immediately|now)\b/,
    /(?:переведите|отправьте)\s+(?:(?:нам|мне)\s+)?(?:деньги|средства|плат[её]ж|\d[\d\s.,]*\s*(?:руб(?:лей|ля)?|₽|доллар(?:ов|а)?|usd|eur))|(?:оплатите|внесите)\s+(?:сч[её]т|плат[её]ж|перевод)/u,
  ],
  true,
);

const giftCard = String.raw`(?:(?:apple|google(?: play)?|amazon) )?gift cards?`;
const quantity = String.raw`(?:(?:a|an|the|some|one|two|three|four|five|\d{1,3}) )?`;

export const detectGiftCardPayment = createDetector(
  "GIFT_CARD_PAYMENT",
  "Requests gift card payment",
  "The message asks the recipient to buy gift cards, pay with them or send their codes.",
  [
    new RegExp(String.raw`\b(?:buy|purchase) ${quantity}${giftCard}\b`),
    new RegExp(String.raw`\bpay (?:with|using|in) ${quantity}${giftCard}\b`),
    new RegExp(String.raw`\bsend (?:us |me )?(?:the |your )?${giftCard} codes?\b`),
    /(?:купите|приобретите|оплатите)(?:\s+\S+){0,4}\s+(?:подарочн(?:ую|ые) карт(?:у|ы)|gift card)/u,
    /(?:отправьте|пришлите|сообщите)(?:\s+\S+){0,4}\s+(?:код|коды) (?:подарочной карты|gift card)/u,
  ],
  true,
);

const crypto = String.raw`(?:bitcoin|btc|ethereum|eth|usdt|cryptocurrency|crypto(?: wallet)?)`;
const paymentConnector = String.raw`(?:\s+(?:the|a|your|my|our|this|that|us|me|payment|money|funds|to|in|with|using|via)){0,7}\s+`;

export const detectCryptoPayment = createDetector(
  "CRYPTO_PAYMENT",
  "Requests cryptocurrency payment",
  "The message asks for a cryptocurrency payment or a transfer to a crypto wallet.",
  [new RegExp(String.raw`\b(?:send|pay|transfer|deposit)${paymentConnector}${crypto}\b`), /(?:отправьте|переведите|оплатите|внесите)(?:\s+\S+){0,7}\s+(?:биткоин|btc|ethereum|eth|usdt|криптовалюту|крипто(?:валюту)?)/u],
  true,
);

export const detectThreatOrIntimidation = createDetector(
  "THREAT_OR_INTIMIDATION",
  "Threatens negative consequences",
  "The message threatens arrest, fines, legal action or loss of an account or service.",
  [
    /\byou will be (?:arrested|fined)\b/,
    /\blegal action will be taken\b/,
    /\byour (?:bank )?account will be (?:closed|suspended|blocked)\b/,
    /\b(?:your )?service will be terminated\b/,
    /(?:вас|вы) (?:арестуют|будете арестованы|оштрафуют)/u,
    /(?:будет|будут) (?:подан иск|приняты юридические меры|начато судебное разбирательство)/u,
    /(?:ваш|ваша) (?:сч[её]т|аккаунт|карта) (?:будет|могут) (?:закрыт|заблокирован|заблокировать|приостановлен)/u,
  ],
);

export const detectUnexpectedReward = createDetector(
  "UNEXPECTED_REWARD",
  "Offers an unexpected reward",
  "The message announces a prize, selection or unexpected refund, or asks the recipient to claim a reward.",
  [
    /\byou (?:have won|are the winner|have been selected)\b/,
    /\bclaim your (?:prize|reward)\b/,
    /\b(?:lottery winner|unexpected refund)\b/,
    /(?:вы выиграли|вы победитель|вас выбрали|вы получили приз|вам положен возврат)/u,
    /(?:получите|заберите|активируйте) (?:приз|награду|выигрыш|возврат)/u,
  ],
);

const organization = String.raw`(?:bank(?: security team)?|microsoft support|apple support|government agency|police department|delivery service|paypal security team)`;

export const detectImpersonation = createDetector(
  "IMPERSONATION",
  "Claims to represent a trusted organization",
  "The message presents the sender as a trusted organization or support team. This claim has not been verified.",
  [
    new RegExp(String.raw`\b(?:we are|we're|i am|i'm|this is)(?: from)? (?:your |the |a |an )?${organization}\b`),
    // Sender labels and signatures, not mentions such as "I called Apple support".
    new RegExp(String.raw`(?:^|[.!?;]\s*|\bregards,?\s*)(?:your |the )?${organization}(?=$|[,:.!]|\s+(?:here|speaking|contacting you)\b)`),
    /(?:^|[.!?;]\s*)(?:это|мы из|я из|служба безопасности|служба поддержки)(?:\s+(?:вашего|вашей|банка|сбербанка|тинькофф|альфа[- ]?банка|paypal|microsoft|apple|полиции|госуслуг|службы доставки)){0,5}/u,
    /(?:^|[.!?;]\s*)(?:служба безопасности банка|поддержка microsoft|поддержка apple|полиция|госуслуги|служба доставки|служба безопасности paypal)(?:[,:.!]|$)/u,
  ],
);

const textDetectors: readonly TextDetector[] = [
  detectArtificialUrgency,
  detectCredentialRequest,
  detectOtpRequest,
  detectMoneyRequest,
  detectGiftCardPayment,
  detectCryptoPayment,
  detectThreatOrIntimidation,
  detectUnexpectedReward,
  detectImpersonation,
];

export function detectTextSignals(text: string): DetectedSignal[] {
  return textDetectors.flatMap((detect) => {
    const signal = detect(text);
    return signal ? [signal] : [];
  });
}
