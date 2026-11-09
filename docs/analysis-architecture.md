# TrustCheck Analysis Architecture

## 1. Goal

Этот документ описывает, как TrustCheck анализирует пользовательский input.

Главный принцип:

**TrustCheck не должен зависеть от одного AI-запроса.**

Анализ строится из нескольких независимых detectors.

Каждый detector:

- получает определённый тип данных;
- выполняет одну конкретную проверку;
- возвращает signals;
- может завершиться успешно, с ошибкой или быть пропущен.

---

# 2. High-Level Architecture

```text
User Input
    ↓
Input Normalization
    ↓
Detector Selection
    ↓
Parallel Analysis
    ↓
Signals
    ↓
Risk Engine
    ↓
Risk Result
    ↓
Explanation Layer
    ↓
User Result
```

---

# 3. Input Normalization

Перед анализом TrustCheck должен привести input к удобному внутреннему формату.

---

## TEXT

Input:

```text
"Your bank account will be suspended..."
```

Normalized data:

```text
text
detectedUrls[]
language?
```

---

## URL

Input:

```text
https://example.com/login
```

Normalized data:

```text
originalUrl
normalizedUrl
protocol
hostname
path
queryParameters
```

---

## SCREENSHOT

Input:

```text
image file
```

Normalized data:

```text
imageReference
extractedText
detectedUrls[]
```

После extraction screenshot может использовать те же detectors, что TEXT и URL.

---

# 4. Detector Concept

Detector — небольшой независимый анализатор.

Пример:

```text
OTPRequestDetector
```

получает текст и проверяет:

```text
просит ли сообщение verification code / OTP
```

Если да:

```text
Signal:
OTP_REQUEST
```

---

Другой пример:

```text
HttpsDetector
```

получает URL и проверяет:

```text
использует ли URL HTTPS
```

Если нет:

```text
Signal:
NO_HTTPS
```

---

# 5. Detector Result

Каждый detector концептуально возвращает:

```text
DetectorResult

detector
status

signals[]

metadata?
error?
```

Possible statuses:

- SUCCESS
- FAILED
- SKIPPED
- NOT_APPLICABLE

---

# 6. Text Detectors

Первая версия может использовать следующие detectors.

---

## Urgency Detector

Ищет давление и искусственную срочность.

Примеры:

- Act now
- Immediately
- Your account will be blocked
- Final warning
- You have 10 minutes

Possible signal:

`ARTIFICIAL_URGENCY`

---

## Credential Request Detector

Ищет запрос:

- password;
- login credentials;
- PIN;
- security answers.

Possible signal:

`CREDENTIAL_REQUEST`

---

## OTP Detector

Ищет просьбу передать:

- OTP;
- SMS code;
- verification code;
- one-time password.

Possible signal:

`OTP_REQUEST`

---

## Payment Request Detector

Ищет просьбы:

- send money;
- make a transfer;
- pay immediately.

Possible signal:

`MONEY_REQUEST`

---

## Gift Card Detector

Ищет требования оплаты gift cards.

Possible signal:

`GIFT_CARD_PAYMENT`

---

## Cryptocurrency Detector

Ищет:

- crypto transfers;
- wallet addresses;
- bitcoin payment requests.

Possible signal:

`CRYPTO_PAYMENT`

---

## Threat Detector

Ищет угрозы:

- account suspension;
- legal action;
- arrest;
- fines;
- service termination.

Possible signal:

`THREAT_OR_INTIMIDATION`

---

## Reward Detector

Ищет:

- winnings;
- prizes;
- unexpected refunds;
- free rewards.

Possible signal:

`UNEXPECTED_REWARD`

---

## Impersonation Detector

Определяет попытки представиться:

- bank;
- police;
- government;
- delivery company;
- marketplace;
- employer;
- support service.

Possible signal:

`IMPERSONATION`

---

# 7. URL Detectors

---

## HTTPS Detector

Проверяет protocol.

Possible signal:

`NO_HTTPS`

---

## URL Structure Detector

Проверяет:

- excessive subdomains;
- strange path structure;
- encoded characters;
- unusually long URLs;
- misleading hostname structure.

Possible signals:

```text
LONG_URL
EXCESSIVE_SUBDOMAINS
SUSPICIOUS_URL_STRUCTURE
```

---

## IP Address Detector

Проверяет, используется ли IP вместо normal domain.

Example:

```text
http://185.23.44.11/login
```

Possible signal:

`IP_ADDRESS_URL`

---

## Shortener Detector

Определяет известные URL shorteners.

Possible signal:

`SHORTENED_URL`

---

## Brand Impersonation Detector

Проверяет похожие написания:

```text
paypa1.com
micros0ft-login.com
apple-security.example
```

Possible signal:

`BRAND_IMPERSONATION`

---

# 8. Domain Detectors

Domain detectors требуют внешних данных.

---

## Domain Age Detector

Проверяет возраст домена.

Новый домен сам по себе не является мошенничеством.

Possible signal:

`NEW_DOMAIN`

---

## Domain Reputation Detector

Проверяет, встречался ли domain в известных threat/reputation sources.

Possible signals:

```text
KNOWN_MALICIOUS_DOMAIN
KNOWN_PHISHING_DOMAIN
```

---

## Domain Mismatch Detector

Сравнивает организацию, которую упоминает сообщение, с фактическим domain.

Example:

Message claims:

```text
PayPal
```

URL:

```text
paypal-security-check.xyz
```

Possible signal:

`DOMAIN_MISMATCH`

---

# 9. Redirect Analysis

TrustCheck может проверить redirect chain.

Example:

```text
short.url/abc
↓
tracking.example
↓
malicious.example
```

Detector checks:

- number of redirects;
- domain changes;
- final destination.

Possible signals:

```text
MULTIPLE_REDIRECTS
CROSS_DOMAIN_REDIRECT
SUSPICIOUS_REDIRECT
```

---

# 10. Reputation Layer

Reputation data должна использоваться независимо от AI.

Возможные источники:

- phishing databases;
- malware reputation providers;
- domain reputation services;
- browser security providers;
- public threat intelligence feeds.

Конкретные providers выбираются позже.

---

## Important

External reputation data должна иметь высокий вес.

Если авторитетный источник сообщает:

```text
KNOWN_MALICIOUS
```

результат должен сильно влиять на Risk Engine.

---

# 11. Screenshot Analysis

Screenshot detector выполняет два основных действия.

---

## Text Extraction

Извлечь текст из изображения.

Output:

```text
extractedText
```

После этого запускаются обычные Text Detectors.

---

## URL Extraction

Найти URL, отображённые на screenshot.

Output:

```text
detectedUrls[]
```

После этого могут быть запущены URL/Domain Detectors.

---

## Important

Screenshot analysis не должен существовать как полностью отдельная система.

Он должен превращать screenshot в:

```text
text
+
URLs
```

и повторно использовать существующие detectors.

---

# 12. AI Layer

AI используется только там, где rule-based analysis недостаточно.

Примеры:

- social engineering context;
- sophisticated impersonation;
- conversation meaning;
- unusual pressure tactics;
- contextual scam patterns.

AI может возвращать signals.

Example:

```text
SOCIAL_ENGINEERING_PATTERN
```

---

# 13. What AI Must Not Do

AI не должен самостоятельно возвращать:

```text
Risk score = 87
```

или:

```text
This is definitely a scam
```

AI является detector, а не Risk Engine.

Flow:

```text
AI
↓
signals
↓
Risk Engine
```

---

# 14. AI Output

AI detector должен возвращать структурированный результат.

Пример:

```text
signals:

- code:
  SOCIAL_ENGINEERING_PATTERN

  severity:
  MEDIUM

  reason:
  The message creates urgency while requesting sensitive information.
```

AI output должен проходить validation перед использованием.

---

# 15. Detector Selection

TrustCheck не должен запускать все detectors для каждого Check.

---

## TEXT

Run:

```text
Text Detectors
AI Text Detector
```

Если обнаружены URLs:

```text
URL Detectors
Domain Detectors
Reputation
```

---

## URL

Run:

```text
URL Detectors
Domain Detectors
Redirect Analysis
Reputation
```

---

## SCREENSHOT

Run:

```text
Screenshot Extraction
↓
Text Detectors
↓
Detected URL Detectors
↓
AI Detector
```

---

# 16. Parallel Execution

Независимые detectors желательно выполнять параллельно.

Example:

```text
                ┌─ Domain Age
                │
URL ────────────┼─ URL Structure
                │
                ├─ Reputation
                │
                └─ Redirect Analysis
```

Это уменьшает время анализа.

---

# 17. Timeout Strategy

External detectors могут зависнуть или стать недоступными.

Каждый внешний detector должен иметь timeout.

Example:

```text
Domain Reputation
timeout → FAILED
```

Остальные detectors продолжают работу.

Один failed detector не должен автоматически ломать весь Check.

---

# 18. Partial Analysis

Example:

```text
Text Analysis         SUCCESS
URL Analysis          SUCCESS
Domain Age            SUCCESS
Threat Reputation     FAILED
AI Analysis           SUCCESS
```

Check:

```text
status:
PARTIAL
```

Но Risk Engine всё ещё может рассчитать результат.

Confidence уменьшается.

---

# 19. Signal Aggregation

После завершения detectors все signals объединяются.

Example:

```text
ARTIFICIAL_URGENCY
OTP_REQUEST
BANK_IMPERSONATION
DOMAIN_MISMATCH
NEW_DOMAIN
```

После этого signals передаются Risk Engine.

---

# 20. Duplicate Signals

Разные detectors могут обнаружить один и тот же сигнал.

TrustCheck не должен считать одинаковый signal несколько раз без причины.

Example:

```text
Text Detector:
IMPERSONATION

AI Detector:
IMPERSONATION
```

Risk Engine должен deduplicate signals.

---

# 21. Conflicting Signals

Detectors могут давать разные признаки.

Example:

```text
Domain reputation:
clean

Message:
requests OTP
```

Clean reputation не должна автоматически отменять сильный scam signal.

TrustCheck должен оценивать совокупность evidence.

---

# 22. Explanation Layer

После Risk Engine система получает:

```text
Risk:
HIGH

Score:
82

Signals:
OTP_REQUEST
DOMAIN_MISMATCH
ARTIFICIAL_URGENCY
```

Explanation Layer превращает это в:

**This message shows several common signs of phishing. It asks for a verification code and links to a domain that does not match the organization it claims to represent.**

---

## Important

Explanation должна основываться только на реально обнаруженных signals.

AI не должен придумывать причины, которых detectors не нашли.

---

# 23. Recommended Actions Layer

Actions выбираются из signals.

Example:

Signal:

`OTP_REQUEST`

Action:

`DO_NOT_SHARE_OTP`

Signal:

`SUSPICIOUS_URL`

Action:

`DO_NOT_OPEN_LINK`

Signal:

`BANK_IMPERSONATION`

Action:

`CONTACT_BANK_DIRECTLY`

---

# 24. Complete Analysis Flow

```text
User Input
   ↓
Normalize Input
   ↓
Choose Detectors
   ↓
Run Detectors
   ↓
Collect Detector Results
   ↓
Collect Signals
   ↓
Deduplicate Signals
   ↓
Calculate Analysis Coverage
   ↓
Risk Engine
   ↓
Risk Level
Risk Score
Confidence
   ↓
Explanation Layer
   ↓
Recommended Actions
   ↓
Check Result
```

---

# 25. Example

Input:

```text
URGENT!

Your PayPal account has been suspended.

Verify your account immediately:

http://paypa1-security-login.xyz

Send the verification code you receive.
```

---

## Text Detectors

```text
ARTIFICIAL_URGENCY
OTP_REQUEST
IMPERSONATION
```

---

## URL Detectors

```text
NO_HTTPS
BRAND_IMPERSONATION
SUSPICIOUS_URL_STRUCTURE
```

---

## Domain Detectors

```text
NEW_DOMAIN
DOMAIN_MISMATCH
```

---

## Reputation

```text
NO_KNOWN_MATCH
```

---

## Signals

```text
ARTIFICIAL_URGENCY
OTP_REQUEST
IMPERSONATION
NO_HTTPS
BRAND_IMPERSONATION
SUSPICIOUS_URL_STRUCTURE
NEW_DOMAIN
DOMAIN_MISMATCH
```

---

## Risk Engine

Example result:

```text
Risk:
HIGH

Score:
96

Confidence:
HIGH
```

---

## Explanation

The message shows multiple signs of phishing, including artificial urgency, a request for a verification code and a domain that appears to imitate PayPal.

---

## Recommended Actions

- Do not open the link.
- Do not share the verification code.
- Open PayPal manually using its official website or app.
- Change your password if you already entered credentials.

---

# 26. MVP Detector Set

Первая версия TrustCheck не должна реализовывать десятки detectors.

Минимальный набор:

## Text

- Urgency Detector
- Credential Request Detector
- OTP Detector
- Money Request Detector
- Impersonation Detector

## URL

- HTTPS Detector
- URL Structure Detector
- IP Address Detector
- Shortener Detector
- Brand Impersonation Detector

## Domain

- Domain Age Detector
- Reputation Detector
- Domain Mismatch Detector

## Screenshot

- Text Extraction
- URL Extraction

## AI

- Context / Social Engineering Detector

---

# 27. Future Detectors

Позже могут появиться:

```text
Phone Reputation Detector
Email Sender Detector
QR Detector
File Reputation Detector
Marketplace Detector
Job Scam Detector
Crypto Wallet Detector
Deepfake Detector
Browser Extension Signals
```

---

# 28. Architecture Principles

## Small detectors

Каждый detector решает одну конкретную задачу.

---

## Independent detectors

Ошибка одного detector не должна ломать весь analysis pipeline.

---

## Explainable signals

Каждый risk signal должен быть объясним пользователю.

---

## AI is not the source of truth

AI — только один из detectors.

---

## External evidence matters

Reliable reputation data должно иметь больший вес, чем vague language patterns.

---

## Extendable

Новые detectors должны добавляться без переписывания Risk Engine.

---

## Privacy

Каждый detector должен получать только те данные, которые ему действительно нужны.

---

# 29. Final Principle

TrustCheck должен строить оценку риска из нескольких независимых источников evidence.

Архитектура:

```text
Evidence
+
Detectors
+
Risk Engine
+
Explanation
```

а не:

```text
User Input
↓
AI
↓
Random percentage
```
