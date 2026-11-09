# TrustCheck Result States

## 1. Goal

This document defines every result state TrustCheck may return after an analysis.

A result is not limited to:

- Low Risk
- Medium Risk
- High Risk

TrustCheck must also correctly handle cases where:

- there is not enough information;
- analysis fails;
- a URL cannot be reached;
- a threat source confirms malicious activity;
- only part of the analysis succeeds.

The UI and Risk Engine must use the same states.

---

# 2. Core Risk States

## Low Risk

### Code

`LOW_RISK`

### Score

`0–29`

### Meaning

No strong scam indicators were detected in the available data.

This does **not** mean the content is guaranteed to be safe.

### UI

Color:

Green / Success

Title:

**Low risk**

Description:

No strong signs of fraud were detected.

### User Guidance

- Stay cautious with sensitive information.
- Verify unexpected requests independently.
- Never share passwords or verification codes.

### Important

Never display:

**Safe**

or:

**100% safe**

---

## Medium Risk

### Code

`MEDIUM_RISK`

### Score

`30–59`

### Meaning

Some suspicious signals were detected.

There is not enough evidence to classify the content as high risk, but the user should proceed carefully.

### UI

Color:

Yellow / Warning

Title:

**Be careful**

Description:

Some suspicious signs were detected.

### User Guidance

- Do not rush.
- Verify the sender independently.
- Avoid sharing sensitive information.
- Check the official website or contact the organization directly.

---

## High Risk

### Code

`HIGH_RISK`

### Score

`60–100`

### Meaning

Multiple strong scam or social-engineering indicators were detected.

### UI

Color:

Red / Danger

Title:

**High risk**

Description:

This content shows strong signs of potential fraud.

### User Guidance

- Do not click suspicious links.
- Do not send money.
- Do not share passwords.
- Do not share verification codes.
- Contact the organization through an official channel.

---

# 3. Known Malicious

## Code

`KNOWN_MALICIOUS`

### Meaning

One or more trusted reputation sources identify the URL, domain or resource as malicious.

Examples:

- known phishing URL;
- malware distribution;
- confirmed malicious domain;
- known scam infrastructure.

### Risk

High

### Score

Recommended score:

`95–100`

### UI

Color:

Red / Danger

Title:

**Known malicious content**

Description:

This resource has been identified as malicious by external threat intelligence sources.

### User Guidance

- Do not open the link.
- Do not download files.
- Do not enter personal information.
- Close the page if it is already open.

### Important

This state is stronger than normal `HIGH_RISK` because it is supported by external reputation data.

---

# 4. Not Enough Information

## Code

`INSUFFICIENT_DATA`

### Meaning

TrustCheck cannot make a useful assessment because too little information was provided.

Examples:

- message contains only “Hello”;
- screenshot is unreadable;
- URL is incomplete;
- text contains no meaningful context.

### Risk

None

### Score

Not shown.

### Confidence

Low

### UI

Color:

Neutral

Title:

**Not enough information**

Description:

We need more information to assess this content.

### User Guidance

Ask the user to provide:

- the full message;
- the complete URL;
- a clearer screenshot;
- additional context.

### Important

Do not force the result into `Low Risk`.

Not enough evidence does not mean low risk.

---

# 5. Partial Analysis

## Code

`PARTIAL_ANALYSIS`

### Meaning

TrustCheck successfully completed some detectors but others failed or were unavailable.

Example:

Text analysis:

Successful

URL analysis:

Successful

Domain reputation:

Unavailable

Threat intelligence:

Unavailable

### Result

A normal risk level may still be returned.

Example:

**Medium Risk**

Confidence:

**Medium**

### UI

Show the normal result and an additional notice:

**Some checks were unavailable**

Description:

The result is based on the information we could verify.

### Important

Partial analysis should reduce confidence when important detectors are unavailable.

---

# 6. URL Unreachable

## Code

`URL_UNREACHABLE`

### Meaning

TrustCheck detected a valid URL but could not reach the destination.

Possible causes:

- website offline;
- DNS error;
- connection timeout;
- blocked request;
- domain no longer exists.

### UI

Color:

Neutral / Warning

Title:

**Website unavailable**

Description:

We couldn't reach this website.

### Analysis

TrustCheck may still analyze:

- URL structure;
- domain name;
- domain age;
- reputation data;
- known threat sources.

### Important

An unreachable website is **not automatically malicious**.

It should only contribute to risk when combined with other signals.

---

# 7. Invalid Input

## Code

`INVALID_INPUT`

### Meaning

The submitted content cannot be analyzed.

Examples:

- invalid URL;
- unsupported file;
- empty input;
- corrupted screenshot;
- file too large.

### UI

Color:

Neutral / Warning

Title:

**We couldn't analyze this**

Description:

Check the input and try again.

### User Guidance

Examples:

**Enter a complete URL**

or:

**Upload a PNG, JPG or WebP image**

---

# 8. Analysis Failed

## Code

`ANALYSIS_FAILED`

### Meaning

TrustCheck encountered an internal error and could not finish the analysis.

Possible causes:

- internal server error;
- external API unavailable;
- processing failure;
- timeout.

### Risk

None

### Score

None

### UI

Color:

Neutral / Danger

Title:

**Analysis failed**

Description:

Something went wrong while checking this content.

Action:

**Try again**

### Important

Do not return a guessed risk score when analysis fails.

---

# 9. Service Temporarily Unavailable

## Code

`SERVICE_UNAVAILABLE`

### Meaning

TrustCheck temporarily cannot perform analysis.

Examples:

- maintenance;
- external threat provider outage;
- AI provider outage;
- infrastructure incident.

### UI

Title:

**TrustCheck is temporarily unavailable**

Description:

Please try again shortly.

Action:

**Try again**

---

# 10. Unsupported Content

## Code

`UNSUPPORTED_CONTENT`

### Meaning

The user submitted something TrustCheck does not currently support.

Examples for MVP:

- audio recording;
- video;
- executable file;
- QR-only image that cannot yet be analyzed;
- unsupported document format.

### UI

Title:

**This content isn't supported yet**

Description:

TrustCheck currently supports text, links and screenshots.

---

# 11. Confidence Levels

Confidence describes how much reliable information was available for the assessment.

Confidence is separate from risk.

Example:

**High Risk**

with:

**Low Confidence**

is valid.

---

## Low Confidence

### Meaning

The analysis is based on very limited evidence.

Examples:

- short message;
- URL only;
- several detectors unavailable.

UI text:

**Limited information was available for this assessment.**

---

## Medium Confidence

### Meaning

Multiple useful signals were analyzed, but some important information is missing.

UI text:

**This assessment is based on several available signals.**

---

## High Confidence

### Meaning

Multiple independent detectors and reliable signals support the result.

Examples:

- text signals;
- domain analysis;
- reputation sources;
- redirect analysis;
- known threat intelligence.

UI text:

**Multiple independent signals support this assessment.**

---

# 12. Result Structure

A completed analysis should conceptually contain:

```text
Result

status
riskLevel
riskScore
confidence

signals[]

explanation

recommendedActions[]

analysisCoverage
```

Example:

```text
status:
COMPLETED

riskLevel:
HIGH

riskScore:
84

confidence:
HIGH

signals:
- OTP_REQUEST
- ARTIFICIAL_URGENCY
- DOMAIN_MISMATCH
- NEW_DOMAIN

recommendedActions:
- Do not open the link
- Do not share verification codes
- Contact the organization directly
```

---

# 13. Analysis Coverage

TrustCheck should record which detectors were successfully executed.

Example:

```text
Text Analysis        ✓
URL Analysis         ✓
Domain Analysis      ✓
Threat Reputation    ✕
Screenshot Analysis  N/A
```

This information helps calculate confidence.

The user does not necessarily need to see all technical details by default.

---

# 14. UI Hierarchy

Every successful result should present information in this order:

### 1. Risk

Example:

**High Risk**

### 2. Score

Example:

**84 / 100**

### 3. Confidence

Example:

**High confidence**

### 4. Short Explanation

Example:

This message contains several common signs of phishing.

### 5. Detected Signals

Example:

- Requests a verification code
- Creates artificial urgency
- Domain does not match the claimed bank

### 6. Recommended Actions

Example:

- Do not click the link
- Do not share the code
- Contact your bank directly

### 7. Technical Details

Optional expandable section.

---

# 15. Result Colors

Result colors must have consistent meaning.

### Green

Low Risk

### Yellow

Medium Risk / Caution

### Red

High Risk / Known Malicious

### Neutral

Insufficient Data  
Invalid Input  
Unsupported Content

### Error

Analysis Failed  
Service Unavailable

Color must never be the only way a risk level is communicated.

Always include text and an icon.

---

# 16. Important Product Rules

TrustCheck must never display absolute claims such as:

**This is completely safe.**

**This is definitely a scam.**

unless an external authoritative source explicitly identifies the resource as malicious.

Even then, the UI should explain the evidence.

---

A low-risk result means:

**No strong suspicious signals were detected.**

It does not mean:

**This content is guaranteed to be safe.**

---

Errors and missing data must never silently become Low Risk.

---

Risk and confidence must always remain separate concepts.

---

Technical failures must never produce fabricated analysis.

---

The user must always understand:

1. what TrustCheck found;
2. why it matters;
3. what they should do next.
