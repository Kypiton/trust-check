import { describe, expect, it } from "vitest";
import { calculateRisk, type DetectedSignal } from "../../../entities/risk";
import { analyzeText } from "../index";
import {
  detectArtificialUrgency,
  detectCredentialRequest,
  detectOtpRequest,
  detectMoneyRequest,
  detectGiftCardPayment,
  detectCryptoPayment,
  detectThreatOrIntimidation,
  detectUnexpectedReward,
  detectImpersonation,
} from "./detectors";

const cases: {
  code: DetectedSignal["code"];
  detect: (text: string) => DetectedSignal | null;
  positive: string[];
  negative: string[];
}[] = [
  {
    code: "ARTIFICIAL_URGENCY", detect: detectArtificialUrgency,
    positive: ["URGENT! Your account will be suspended today.", "Act now", "Respond immediately", "Final warning", "Reply within 10 minutes.", "Respond within 24 hours.", "Your account will be blocked.", "Your offer expires today."],
    negative: ["We are meeting today.", "This is not urgent.", "An insurgent was mentioned in the news."],
  },
  {
    code: "CREDENTIAL_REQUEST", detect: detectCredentialRequest,
    positive: ["Confirm your account by entering your password.", "Send your password", "Enter your password", "Please provide your login credentials.", "Confirm your PIN", "Tell me your security answer.", "Give us your username and password."],
    negative: ["I changed my password yesterday.", "password", "Never share your password.", "We will never ask you to enter your password.", "Send the report. Your password was changed.", "Enter the office to discuss your password.", "Enter your one-time password."],
  },
  {
    code: "OTP_REQUEST", detect: detectOtpRequest,
    positive: ["Send us the verification code you receive.", "Tell me the OTP you received.", "Reply with the SMS code.", "Please provide your one-time password.", "Share your security code.", "Could you send me your verification code?", "We need you to share your OTP."],
    negative: ["Never share your verification code with anyone.", "Do not send your OTP.", "Don’t ever share your SMS code.", "You should not provide your verification code.", "Avoid sharing your security code.", "Your verification code is 123456.", "An OTP expires after five minutes.", "Send the report. The OTP is private.", "We never ask you to share your OTP.", "I share my OTP in this fictional story."],
  },
  {
    code: "MONEY_REQUEST", detect: detectMoneyRequest,
    positive: ["Transfer the money immediately.", "Send money", "Make a payment", "Wire the funds", "Pay immediately", "Send payment", "You must transfer your money."],
    negative: ["The item costs $20.", "I send money to my family every month.", "We discussed how to transfer money.", "Do not send money.", "The payment was received."],
  },
  {
    code: "GIFT_CARD_PAYMENT", detect: detectGiftCardPayment,
    positive: ["Buy two Apple gift cards and send me the codes.", "Pay with gift cards", "Send gift card codes", "Purchase an Apple gift card", "Purchase a Google gift card", "Purchase an Amazon gift card", "Buy 3 Google Play gift cards."],
    negative: ["I received an Apple gift card for my birthday.", "Gift cards are sold here.", "Never buy gift cards for strangers.", "I buy gift cards for birthdays."],
  },
  {
    code: "CRYPTO_PAYMENT", detect: detectCryptoPayment,
    positive: ["Send the payment to this Bitcoin wallet.", "Pay in BTC", "Transfer Ethereum", "Send ETH", "Pay with USDT", "Pay using cryptocurrency", "Transfer funds to this crypto wallet"],
    negative: ["Bitcoin prices changed today.", "I read an article about Ethereum.", "I send Bitcoin to my own wallet.", "Do not pay with BTC.", "Send the report. Bitcoin is discussed later.", "Payment methods include crypto."],
  },
  {
    code: "THREAT_OR_INTIMIDATION", detect: detectThreatOrIntimidation,
    positive: ["You will be arrested", "Legal action will be taken", "Your account will be closed", "Your bank account will be suspended", "You will be fined", "Your service will be terminated"],
    negative: ["Your account will not be suspended.", "You will not be fined.", "The article discusses legal action.", "This does not mean you will be arrested."],
  },
  {
    code: "UNEXPECTED_REWARD", detect: detectUnexpectedReward,
    positive: ["Congratulations, you have won a prize. Claim it now.", "You are the winner", "Claim your prize", "Lottery winner", "Claim your reward", "An unexpected refund is waiting.", "You have been selected"],
    negative: ["We discussed the prizes for our school event.", "You have not won a prize.", "Do not claim your prize from that message."],
  },
  {
    code: "IMPERSONATION", detect: detectImpersonation,
    positive: ["This is your bank security team.", "We are from your bank.", "This is your bank.", "Bank security team", "Microsoft support", "Apple support: please respond.", "We are a government agency.", "This is the police department.", "This is your delivery service.", "PayPal security team", "Regards, Microsoft support"],
    negative: ["I contacted Microsoft support yesterday.", "Your bank account will be suspended.", "The police department is near my house.", "The delivery service arrived yesterday.", "We are not from your bank.", "We are from your banknote collection club."],
  },
];

for (const { code, detect, positive, negative } of cases) {
  describe(code, () => {
    it.each(positive)("detects: %s", (text) => {
      const signal = detect(text);
      expect(signal).toMatchObject({ code, category: "TEXT" });
      expect(signal?.title).toBeTruthy();
      expect(signal?.description).toBeTruthy();
      expect(signal).not.toHaveProperty("weight");
      expect(analyzeText(text).signals.map((item) => item.code)).toContain(code);
    });
    it.each(negative)("does not detect: %s", (text) => {
      expect(detect(text)).toBeNull();
      expect(analyzeText(text).signals.map((item) => item.code)).not.toContain(code);
    });
  });
}

describe("analyzeText", () => {
  it.each(["", " \t\n  ", "Hi, are we still meeting tomorrow at 6?"])("returns no evidence for %j", (text) => {
    expect(analyzeText(text)).toEqual({ signals: [], risk: { score: 0, level: "LOW", scoredSignals: [] } });
  });

  it("normalizes case and repeated whitespace without changing the input", () => {
    const text = "  SeNd\n us\t the   VERIFICATION CODE you receive.  ";
    expect(analyzeText(text)).toEqual(analyzeText("Send us the verification code you receive."));
    expect(text).toBe("  SeNd\n us\t the   VERIFICATION CODE you receive.  ");
  });

  it("scores the combined phishing example through the real Risk Engine", () => {
    const result = analyzeText("URGENT!\nYour bank account will be suspended.\nSend us the verification code you receive.");
    expect(result.signals.map((item) => item.code)).toEqual(["ARTIFICIAL_URGENCY", "OTP_REQUEST", "THREAT_OR_INTIMIDATION"]);
    expect(result.risk).toEqual(calculateRisk(result.signals));
    expect(result.risk).toMatchObject({ score: 60, level: "HIGH" });
    expect(result).not.toHaveProperty("confidence");
    expect(result).not.toHaveProperty("status");
  });

  it("adds impersonation evidence only when there is a sender claim", () => {
    const result = analyzeText("This is your bank security team. URGENT! Your account will be suspended. Send us the verification code.");
    expect(result.signals.map((item) => item.code)).toContain("IMPERSONATION");
    expect(result.risk).toMatchObject({ score: 80, level: "HIGH" });
  });

  it("emits each signal at most once for repeated phrases", () => {
    const result = analyzeText("Urgent urgent urgent! Act now. Send your OTP. Share your verification code.");
    expect(result.signals.map((item) => item.code)).toEqual(["ARTIFICIAL_URGENCY", "OTP_REQUEST"]);
    expect(result.risk.score).toBe(45);
  });

  it.each([
    "Never share your verification code. Send us the verification code.",
    "Never share your OTP with strangers, but send us your OTP.",
    "Do not send your password. Please send your password to us.",
  ])("does not let negation hide a separate request: %s", (text) => {
    const expected = text.includes("password") ? "CREDENTIAL_REQUEST" : "OTP_REQUEST";
    expect(analyzeText(text).signals.map((item) => item.code)).toContain(expected);
  });

  it("does not double count one-time passwords as login credentials", () => {
    const result = analyzeText("Send your one-time password.");
    expect(result.signals.map((item) => item.code)).toEqual(["OTP_REQUEST"]);
    expect(result.risk.score).toBe(35);
  });

  it("is deterministic across repeated and interleaved calls", () => {
    const text = "Send your OTP. This is your bank. Act now.";
    const first = analyzeText(text);
    analyzeText("Never share your verification code.");
    expect(analyzeText(text)).toEqual(first);
    expect(analyzeText(text).signals[0]).not.toBe(first.signals[0]);
    expect(text).toBe("Send your OTP. This is your bank. Act now.");
  });
});

describe("Russian text support", () => {
  it("detects a combined Russian phishing message through the same canonical signals", () => {
    const result = analyzeText("СРОЧНО! Это служба безопасности банка. Ваш счёт будет заблокирован. Отправьте нам код подтверждения.");
    expect(result.signals.map((item) => item.code)).toEqual(expect.arrayContaining([
      "ARTIFICIAL_URGENCY",
      "OTP_REQUEST",
      "THREAT_OR_INTIMIDATION",
      "IMPERSONATION",
    ]));
    expect(result.risk.level).toBe("HIGH");
  });

  it.each([
    ["Сообщите нам пароль от аккаунта.", "CREDENTIAL_REQUEST"],
    ["Переведите деньги немедленно.", "MONEY_REQUEST"],
    ["Купите подарочную карту и пришлите код подарочной карты.", "GIFT_CARD_PAYMENT"],
    ["Отправьте оплату в USDT криптовалюту.", "CRYPTO_PAYMENT"],
    ["Вы выиграли приз. Получите награду сейчас.", "UNEXPECTED_REWARD"],
  ])("detects Russian evidence: %s", (text, code) => {
    expect(analyzeText(text).signals.map((item) => item.code)).toContain(code);
  });

  it("keeps a normal Russian message LOW without fabricated signals", () => {
    expect(analyzeText("Привет, мы всё ещё встречаемся завтра в шесть?")).toMatchObject({ signals: [], risk: { score: 0, level: "LOW" } });
  });

  it.each([
    "Не сообщайте код подтверждения никому.",
    "Я позвонил в полицию и уточнил информацию.",
    "Мы обсуждали перевод денег на встрече.",
  ])("does not create obvious Russian false positives: %s", (text) => {
    expect(analyzeText(text).signals).toEqual([]);
  });
});
