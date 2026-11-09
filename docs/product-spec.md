# TrustCheck

## 1. Problem

Люди регулярно получают подозрительные сообщения, ссылки, письма и предложения и не понимают, можно ли им доверять.

Основная проблема не просто в существовании мошенничества, а в том, что обычному пользователю сложно самостоятельно определить признаки риска.

Человек должен быстро получить ответ на вопрос:

**“Can I trust this?”**

---

## 2. Product

TrustCheck — веб-приложение для быстрой проверки подозрительного цифрового контента.

Пользователь может:

- вставить текст сообщения;
- вставить ссылку;
- загрузить скриншот.

TrustCheck анализирует содержимое и показывает:

- уровень риска;
- обнаруженные подозрительные признаки;
- причины оценки;
- рекомендуемые безопасные действия.

---

## 3. Product Promise

**Before you click, pay, reply or trust — check it.**

TrustCheck должен помочь пользователю понять потенциальный риск за несколько секунд простым человеческим языком.

---

## 4. Target User

Основной пользователь первой версии:

**обычный интернет-пользователь, который получил подозрительное сообщение или ссылку и не уверен, можно ли им доверять.**

Например:

- SMS якобы от банка;
- сообщение в Telegram / WhatsApp;
- подозрительная ссылка;
- письмо о доставке;
- сообщение о выигрыше;
- просьба срочно перевести деньги;
- подозрительный интернет-магазин;
- сообщение от неизвестного отправителя.

TrustCheck не должен требовать технических знаний.

---

## 5. Core User Flow

1. Пользователь открывает TrustCheck.
2. Выбирает способ проверки:
   - Text
   - Link
   - Screenshot
3. Добавляет содержимое.
4. Нажимает **Check**.
5. TrustCheck проводит анализ.
6. Пользователь получает результат.

Пример:

### HIGH RISK

**Why this looks suspicious**

- Creates artificial urgency
- Requests sensitive information
- Sender domain does not match the claimed organization
- Link redirects to another domain

**What you should do**

- Do not open the link
- Do not enter passwords or card details
- Do not provide SMS verification codes
- Contact the organization using its official website or phone number

---

## 6. Risk Model

TrustCheck никогда не должен утверждать:

**100% SAFE**

или:

**100% SCAM**

Результат должен выражаться через уровень риска.

### Low Risk

Серьёзные признаки мошенничества не обнаружены.

Это не гарантирует безопасность.

### Medium Risk

Обнаружены признаки, которые требуют дополнительной проверки.

Пользователь должен соблюдать осторожность.

### High Risk

Обнаружены несколько сильных признаков потенциального мошенничества.

Пользователю рекомендуется не взаимодействовать с содержимым до дополнительной проверки.

---

## 7. MVP

Первая версия TrustCheck поддерживает только три типа проверки:

### Text Analysis

Пользователь вставляет текст сообщения.

TrustCheck анализирует:

- urgency;
- pressure;
- requests for money;
- requests for credentials;
- requests for verification codes;
- impersonation patterns;
- suspicious wording;
- social engineering indicators.

### URL Analysis

Пользователь вставляет URL.

TrustCheck проверяет доступные сигналы:

- HTTPS;
- domain;
- domain age;
- redirects;
- suspicious URL structure;
- impersonation patterns;
- known threat/reputation sources.

### Screenshot Analysis

Пользователь загружает screenshot.

Система извлекает содержимое и анализирует его так же, как текст/URL.

---

## 8. Result

Каждая проверка должна возвращать:

- Risk level
- Risk score
- Confidence
- Detected signals
- Explanation
- Recommended actions

Пример:

Risk:

**High**

Score:

**84 / 100**

Confidence:

**High**

---

## 9. History

Авторизованный пользователь сможет видеть историю своих проверок.

Каждая проверка содержит:

- type;
- date;
- risk level;
- short description;
- result.

---

## 10. Non-Goals for MVP

Первая версия НЕ включает:

- browser extension;
- mobile application;
- QR scanner;
- phone call analysis;
- voice deepfake detection;
- family accounts;
- real-time monitoring;
- automatic email scanning;
- bank integrations;
- job verification;
- marketplace seller verification;
- cryptocurrency analysis.

Эти функции могут появиться позже.

---

## 11. Product Principles

### Explain, don't just classify

TrustCheck должен объяснять, почему что-то выглядит подозрительно.

### Never create false certainty

TrustCheck показывает вероятность риска, а не абсолютную истину.

### Simple language

Результат должен быть понятен человеку без технических знаний.

### Security first

Минимизировать хранение пользовательских данных.

### Fast

Проверка должна требовать минимального количества действий.

### Useful actions

Каждый результат должен отвечать не только:

**“Is this dangerous?”**

но и:

**“What should I do now?”**

---

## 12. Initial Pages

MVP будет состоять из:

- Landing
- Check
- Result
- History
- Login
- Register

---

## 13. Success Metrics

На первом этапе главный показатель — не доход.

Нужно доказать, что продукт людям нужен.

Первые цели:

- 50 реальных пользователей;
- 100 выполненных проверок;
- пользователи возвращаются для повторной проверки;
- люди делятся TrustCheck с другими;
- пользователи считают объяснение результата полезным.

После этого можно тестировать монетизацию.

---

## 14. Future Roadmap

### V1

Text  
URL  
Screenshot  
Risk analysis  
History

### V2

QR codes  
Online shops  
Job offers  
Improved reputation sources

### V3

Family Protection

### V4

Browser Extension

### V5

Continuous scam monitoring and alerts

---

## Vision

TrustCheck должен стать простым слоем доверия поверх интернета.

Когда пользователь сомневается перед тем, как:

**click, pay, reply, download, sign in or trust**

он сначала проверяет это через TrustCheck.

Product Spec v0.1
