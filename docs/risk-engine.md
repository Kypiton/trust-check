# TrustCheck Risk Engine

## 1. Goal

Risk Engine converts detected signals into:

- Risk score: 0–100
- Risk level: Low / Medium / High
- Confidence: Low / Medium / High

---

## 2. Risk Levels

### Low Risk

0–29

No strong scam indicators detected.

### Medium Risk

30–59

Some suspicious signals were detected.

### High Risk

60–100

Multiple strong indicators of fraud or social engineering were detected.

---

## 3. Text Signals

### Artificial urgency

Examples:

- "Act now"
- "Your account will be blocked"
- "You have 10 minutes"

Weight:
+10

### Request for password

Weight:
+30

### Request for verification code / OTP

Weight:
+35

### Request for card details

Weight:
+35

### Request for money

Weight:
+20

### Cryptocurrency payment

Weight:
+20

### Gift card payment

Weight:
+30

### Threat or intimidation

Weight:
+15

### Prize / reward

Weight:
+10

### Impersonation

Examples:

- bank
- police
- government
- delivery company

Weight:
+20

---

## 4. URL Signals

### HTTPS missing

Weight:
+10

### Suspicious domain spelling

Example:
paypal-security-login.com

Weight:
+20

### Very new domain

Weight:
+15

### Excessively long URL

Weight:
+5

### IP address instead of domain

Weight:
+20

### URL shortener

Weight:
+10

### Multiple redirects

Weight:
+10

### Known malicious reputation

Weight:
+50

### Domain mismatch with claimed company

Weight:
+30

---

## 5. Score Calculation

Base score:

0

Each detected signal adds its weight.

Example:

Urgency +10
Requests OTP +35
Suspicious domain +20
Domain mismatch +30
----
Raw score 95

Final score:

min(rawScore, 100)

Result:

High Risk — 95/100

---

## 6. Confidence

Confidence is separate from risk.

Example:

High Risk + Low Confidence

means:

The available evidence looks dangerous,
but there is not enough information to make
a strong assessment.

### Low Confidence

Very little information available.

### Medium Confidence

Several useful signals available.

### High Confidence

Multiple independent signals available.

---

## 7. Important Rules

- Never classify something as absolutely safe.
- AI should not control the score by itself.
- Strong technical signals should outweigh vague language signals.
- Multiple weak signals may combine into a meaningful risk.
- Known malicious reputation should heavily influence the result.
- Confidence and risk must remain separate.
