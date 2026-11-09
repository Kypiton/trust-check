# TrustCheck Check Model

## 1. Goal

`Check` — основная бизнес-сущность TrustCheck.

Один `Check` представляет одну попытку пользователя проверить подозрительный контент.

Примеры:

- текст подозрительного SMS;
- URL;
- screenshot сообщения.

Каждая проверка проходит определённый lifecycle от создания до завершения или ошибки.

---

# 2. Input Types

MVP поддерживает три типа входных данных.

## Text

Code:

`TEXT`

Примеры:

- SMS;
- Telegram message;
- WhatsApp message;
- email text;
- marketplace message.

Основные данные:

- text content.

---

## URL

Code:

`URL`

Примеры:

- website;
- suspicious login page;
- payment link;
- delivery tracking link;
- online store.

Основные данные:

- original URL.

---

## Screenshot

Code:

`SCREENSHOT`

Примеры:

- SMS screenshot;
- Telegram screenshot;
- email screenshot;
- website screenshot.

Основные данные:

- uploaded image;
- extracted text;
- detected URLs.

---

# 3. Check Status

Status отвечает только на вопрос:

**На каком этапе находится анализ?**

Status не описывает риск.

---

## Created

Code:

`CREATED`

Проверка создана, но анализ ещё не начался.

---

## Analyzing

Code:

`ANALYZING`

TrustCheck выполняет необходимые проверки.

Например:

- text analysis;
- URL parsing;
- domain analysis;
- reputation checks;
- screenshot extraction.

---

## Completed

Code:

`COMPLETED`

Анализ успешно завершён.

Проверка содержит полноценный результат:

- risk level;
- score;
- confidence;
- signals;
- explanation;
- recommended actions.

---

## Partial

Code:

`PARTIAL`

Часть анализаторов завершилась успешно, но некоторые проверки были недоступны.

Проверка всё ещё может иметь:

- risk level;
- score;
- confidence.

Confidence может быть уменьшена.

---

## Failed

Code:

`FAILED`

Анализ не удалось выполнить.

Risk result не должен генерироваться.

---

# 4. Lifecycle

Обычный успешный lifecycle:

```text
CREATED
   ↓
ANALYZING
   ↓
COMPLETED
```

Частичный анализ:

```text
CREATED
   ↓
ANALYZING
   ↓
PARTIAL
```

Ошибка:

```text
CREATED
   ↓
ANALYZING
   ↓
FAILED
```

---

# 5. Check Structure

Одна проверка концептуально содержит:

```text
Check

id

userId?

inputType
input

status

riskLevel?
riskScore?
confidence?

signals[]

explanation?

recommendedActions[]

analysisCoverage

error?

createdAt
startedAt?
completedAt?
```

---

# 6. Identity

## id

Уникальный идентификатор проверки.

Пример:

`chk_01...`

Точная реализация ID определяется позже.

---

## userId

Пользователь, которому принадлежит проверка.

Может отсутствовать, если TrustCheck позже позволит выполнять ограниченные anonymous checks.

Для первой версии решение об anonymous checks принимается отдельно.

---

# 7. Input

Input должен сохранять исходные данные проверки.

Но разные input types имеют разные структуры.

---

## Text Input

```text
type:
TEXT

text:
"Your bank account will be suspended..."
```

---

## URL Input

```text
type:
URL

url:
https://example.com/verify
```

---

## Screenshot Input

```text
type:
SCREENSHOT

image:
reference to uploaded file

extractedText:
optional

detectedUrls:
optional
```

---

# 8. Risk Result

Risk fields появляются только после анализа.

## riskLevel

Possible values:

- `LOW`
- `MEDIUM`
- `HIGH`

---

## riskScore

Range:

`0–100`

Risk score никогда не является абсолютной вероятностью мошенничества.

Например:

`84 / 100`

означает:

TrustCheck обнаружил сильную комбинацию risk signals.

Это не означает:

`84% probability that this is a scam`.

---

## confidence

Possible values:

- `LOW`
- `MEDIUM`
- `HIGH`

Risk и Confidence являются независимыми.

---

# 9. Signals

Каждый обнаруженный признак должен храниться отдельно.

Пример:

```text
Signal

code:
OTP_REQUEST

category:
TEXT

severity:
HIGH

weight:
35

description:
Requests a verification code
```

Другой пример:

```text
code:
DOMAIN_MISMATCH

category:
DOMAIN

severity:
HIGH

weight:
30

description:
The domain does not match the organization mentioned in the message
```

---

# 10. Signal Categories

Начальные категории:

- `TEXT`
- `URL`
- `DOMAIN`
- `REPUTATION`
- `REDIRECT`
- `SCREENSHOT`

Позже могут появиться дополнительные категории.

---

# 11. Explanation

Explanation — краткое человеческое объяснение результата.

Пример:

**This message contains several common signs of phishing, including an OTP request and a suspicious banking domain.**

Explanation не должна заменять individual signals.

Signals дают доказательства.

Explanation объединяет их в понятный вывод.

---

# 12. Recommended Actions

Каждый Check может содержать несколько рекомендуемых действий.

Пример:

```text
DO_NOT_OPEN_LINK
DO_NOT_SHARE_OTP
CONTACT_ORGANIZATION_DIRECTLY
```

UI может превращать их в понятный текст:

- Do not open the link.
- Do not share verification codes.
- Contact your bank using its official website or phone number.

---

# 13. Analysis Coverage

TrustCheck должен хранить информацию о том, какие анализаторы были выполнены.

Пример:

```text
Text Analysis
SUCCESS

URL Analysis
SUCCESS

Domain Analysis
SUCCESS

Threat Reputation
FAILED
```

Possible statuses:

- `SUCCESS`
- `FAILED`
- `SKIPPED`
- `NOT_APPLICABLE`

---

# 14. Error

Если status:

`FAILED`

Check должен содержать информацию об ошибке.

Пример:

```text
code:
ANALYSIS_TIMEOUT

message:
Analysis could not be completed.
```

Внутренняя техническая ошибка не обязательно должна полностью показываться пользователю.

UI получает безопасное человеческое сообщение.

---

# 15. Timestamps

Каждая проверка должна иметь:

## createdAt

Когда Check был создан.

## startedAt

Когда начался анализ.

## completedAt

Когда анализ завершился.

Для FAILED и PARTIAL проверок `completedAt` также может использоваться как время окончания процесса.

---

# 16. Data Privacy

TrustCheck должен хранить минимально необходимый объём пользовательских данных.

Особенно важно учитывать, что пользователь может вставлять:

- личные сообщения;
- номера телефонов;
- email;
- банковские сообщения;
- имена;
- потенциально чувствительные данные.

Основные принципы:

- не хранить данные без необходимости;
- не использовать пользовательский контент для публичных datasets;
- ограничивать доступ к Check владельцем;
- предусмотреть удаление Check пользователем;
- не логировать исходный чувствительный контент без необходимости.

Точная retention policy определяется перед production release.

---

# 17. Deletion

Пользователь должен иметь возможность удалить Check из History.

Удаление должно включать связанные с ним данные, которые больше не нужны:

- original input;
- result;
- signals;
- screenshot references.

Детальная стратегия удаления будет определена вместе с storage architecture.

---

# 18. Example — Text Check

Input:

```text
Your bank account has been locked.

Verify immediately using this link and send us
the verification code you receive.
```

Lifecycle:

```text
CREATED
↓
ANALYZING
↓
COMPLETED
```

Detected signals:

```text
ARTIFICIAL_URGENCY     +10
BANK_IMPERSONATION     +20
OTP_REQUEST            +35
```

Result:

```text
Risk:
HIGH

Score:
65

Confidence:
MEDIUM
```

---

# 19. Example — URL Check

Input:

```text
http://secure-paypa1-login.example
```

Detected signals:

```text
NO_HTTPS               +10
BRAND_IMPERSONATION    +20
SUSPICIOUS_DOMAIN      +20
NEW_DOMAIN             +15
```

Result:

```text
Risk:
HIGH

Score:
65

Confidence:
HIGH
```

---

# 20. Example — Partial Check

Text analysis:

`SUCCESS`

URL analysis:

`SUCCESS`

Domain analysis:

`SUCCESS`

Threat reputation:

`FAILED`

Result:

```text
Status:
PARTIAL

Risk:
MEDIUM

Score:
48

Confidence:
MEDIUM
```

UI:

**Some checks were unavailable.**

The result is based on the information we could verify.

---

# 21. Important Rules

A Check's `status` and `riskLevel` must never be confused.

For example:

```text
status:
COMPLETED

riskLevel:
LOW
```

is valid.

And:

```text
status:
PARTIAL

riskLevel:
HIGH
```

is also valid.

---

A failed Check must not receive a fabricated risk score.

---

An insufficient input must not automatically become Low Risk.

---

Raw user input and final analysis should remain conceptually separate.

---

Signal detection and result explanation should remain conceptually separate.

---

The Check model should allow new detectors to be added later without redesigning the entire entity.
