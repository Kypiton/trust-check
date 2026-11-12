import type { AnalysisSourceCode } from "@/entities/confidence/model/types";
import type { RiskLevel, SignalCode } from "@/entities/risk/model/types";
import type { Locale } from "./index";

const ruSignals: Partial<Record<SignalCode, { title: string; description: string }>> = {
  ARTIFICIAL_URGENCY: { title: "Создаёт искусственную срочность", description: "Сообщение давит на получателя срочными формулировками или коротким сроком." },
  CREDENTIAL_REQUEST: { title: "Запрашивает данные для входа", description: "Сообщение просит сообщить пароль, PIN-код или другие учётные данные." },
  OTP_REQUEST: { title: "Запрашивает код подтверждения", description: "Сообщение просит передать одноразовый код или код подтверждения." },
  MONEY_REQUEST: { title: "Просит перевести деньги", description: "Сообщение напрямую просит оплату, перевод или отправку денег." },
  CRYPTO_PAYMENT: { title: "Просит оплату криптовалютой", description: "Сообщение просит отправить криптовалюту или перевести средства на криптокошелёк." },
  GIFT_CARD_PAYMENT: { title: "Просит оплатить подарочными картами", description: "Сообщение просит купить подарочные карты, оплатить ими или отправить коды." },
  THREAT_OR_INTIMIDATION: { title: "Угрожает негативными последствиями", description: "Сообщение угрожает блокировкой, штрафом, арестом или другими последствиями." },
  UNEXPECTED_REWARD: { title: "Обещает неожиданное вознаграждение", description: "Сообщение сообщает о выигрыше, возврате средств или неожиданном призе." },
  IMPERSONATION: { title: "Выдаёт отправителя за доверенную организацию", description: "Сообщение утверждает, что отправлено банком, службой поддержки или другой организацией. Это не подтверждено." },
  NO_HTTPS: { title: "Ссылка использует HTTP", description: "Ссылка не использует защищённое HTTPS-соединение." },
  BRAND_IMPERSONATION: { title: "Домен похож на известный бренд", description: "Имя домена похоже на название известной организации, но не является её проверенным доменом." },
  NEW_DOMAIN: { title: "Недавно зарегистрированный домен", description: "Домен зарегистрирован недавно, поэтому его стоит проверить особенно внимательно." },
  LONG_URL: { title: "Необычно длинная ссылка", description: "Очень длинные ссылки могут скрывать важные части адреса." },
  IP_ADDRESS_URL: { title: "Ссылка ведёт на IP-адрес", description: "Вместо обычного доменного имени в ссылке используется IP-адрес." },
  SHORTENED_URL: { title: "Сокращённая ссылка", description: "Сервис сокращения скрывает конечный адрес ссылки." },
  MULTIPLE_REDIRECTS: { title: "Несколько перенаправлений", description: "Ссылка проходит через несколько перенаправлений перед конечным адресом." },
  DOMAIN_MISMATCH: { title: "Несоответствие домена", description: "Проверенная информация о домене не совпадает с ожидаемым контекстом." },
  KNOWN_MALICIOUS_DOMAIN: { title: "Известный вредоносный домен", description: "Домен отмечен источником репутации как вредоносный." },
  KNOWN_PHISHING_DOMAIN: { title: "Известный фишинговый домен", description: "Домен отмечен источником репутации как фишинговый." },
  KNOWN_MALICIOUS_URL: { title: "Известная вредоносная ссылка", description: "Ссылка отмечена источником репутации как вредоносная." },
  KNOWN_PHISHING_URL: { title: "Известная фишинговая ссылка", description: "Ссылка отмечена источником репутации как фишинговая." },
};

const ruActions: Record<string, string> = {
  VERIFY_PRESSURE: "Не действуйте под давлением — проверьте информацию независимо",
  PROTECT_CODES: "Не сообщайте коды подтверждения",
  PROTECT_CREDENTIALS: "Не сообщайте пароли и данные для входа",
  VERIFY_PAYMENT: "Не отправляйте деньги, пока не подтвердите запрос другим способом",
  AVOID_GIFT_CARDS: "Не покупайте и не передавайте коды подарочных карт",
  VERIFY_CRYPTO_RECIPIENT: "Не отправляйте криптовалюту, пока не подтвердите получателя",
  VERIFY_REWARD: "Проверьте информацию о выигрыше через официальный источник",
  CONTACT_ORGANIZATION: "Свяжитесь с организацией через официальный сайт или номер телефона",
  DO_NOT_OPEN_LINK: "Не открывайте обнаруженную подозрительную ссылку",
  USE_OFFICIAL_WEBSITE: "Откройте официальный сайт организации вручную",
  VERIFY_RECENT_DOMAIN: "Проверьте организацию независимо перед вводом данных или оплатой",
  VERIFY_DESTINATION: "Проверьте конечный адрес перед вводом конфиденциальной информации",
  VERIFY_SHORTENED_DESTINATION: "Проверьте, куда ведёт сокращённая ссылка, перед продолжением",
  AVOID_SENSITIVE_INFORMATION: "Не вводите конфиденциальные данные, пока не убедитесь в подлинности сайта",
  CLOSE_PAGE: "Закройте страницу и не взаимодействуйте с ней дальше",
  DO_NOT_DOWNLOAD_FILES: "Не скачивайте файлы с этой страницы",
};

const ruSourceLabels: Record<AnalysisSourceCode, string> = {
  TEXT_HEURISTICS: "Анализ текста",
  URL_STRUCTURE: "Структура ссылки",
  DOMAIN_METADATA: "Анализ домена",
  REDIRECT_ANALYSIS: "Анализ перенаправлений",
  THREAT_REPUTATION: "Репутация угроз",
  AI_CONTEXT: "Контекстный анализ",
  SCREENSHOT_EXTRACTION: "Извлечение текста со скриншота",
};

export function riskLabel(locale: Locale, level: RiskLevel): string {
  if (locale === "ru") return level === "LOW" ? "Низкий риск" : level === "MEDIUM" ? "Средний риск" : "Высокий риск";
  return level === "LOW" ? "Low Risk" : level === "MEDIUM" ? "Medium Risk" : "High Risk";
}

export function localizedSignal(locale: Locale, signal: { code: string; title: string; description: string }) {
  if (locale !== "ru") return signal;
  const copy = ruSignals[signal.code as SignalCode];
  return copy ? { ...signal, ...copy } : signal;
}

export function localizedAction(locale: Locale, action: { code: string; title: string }) {
  if (locale !== "ru") return action;
  return { ...action, title: ruActions[action.code] ?? action.title };
}

export function analysisSourceLabel(locale: Locale, code: AnalysisSourceCode, fallback: string): string {
  return locale === "ru" ? ruSourceLabels[code] : fallback;
}
