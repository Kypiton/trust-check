# TrustCheck — Screens & User Flow

## 1. Goal

This document defines the initial pages of TrustCheck
and how users move between them.

The MVP should remain simple.

A user should be able to start a check
within seconds of opening the website.

---

# 2. Main Navigation

TrustCheck MVP has the following primary areas:

- Home
- Check
- History
- Account

Authentication pages:

- Login
- Register

System pages:

- Not Found
- Error

---

# 3. Landing Page

Route:

/

Main goal:

Allow the user to understand TrustCheck immediately
and start a check without reading a long explanation.

Primary content:

TrustCheck

Before you click, pay, reply or trust — check it.

Check suspicious messages, links and screenshots
for signs of fraud.

Primary action:

Check something

Secondary explanation:

Supports:

- Text
- Links
- Screenshots

Possible sections:

- How it works
- What TrustCheck checks
- Privacy
- Common scam examples

The landing page should remain short.

---

# 4. Check Page

Route:

/check

Main goal:

Submit suspicious content for analysis.

The user chooses:

- Text
- Link
- Screenshot

---

## Text Mode

Input:

Large text area

Placeholder:

Paste the suspicious message here...

Primary action:

Check message

---

## Link Mode

Input:

URL field

Placeholder:

https://example.com

Primary action:

Check link

---

## Screenshot Mode

Input:

Upload area

Supported formats:

- PNG
- JPG
- WebP

Primary action:

Check screenshot

---

# 5. Analysis State

After submitting content:

/check/[id]

or an equivalent dynamic result route.

The user sees:

Analyzing...

Possible detector progress:

- Checking message
- Checking URL
- Checking domain
- Checking reputation
- Evaluating risk

Important:

Do not show fake progress percentages
if the backend does not actually know progress.

Prefer:

Checking domain...

instead of:

73%

---

# 6. Result Page

Route:

/check/[id]

The analysis state transitions into the result
without requiring a separate page.

Result hierarchy:

1. Risk level
2. Risk score
3. Confidence
4. Short explanation
5. Detected signals
6. Recommended actions
7. Analysis coverage
8. Technical details

---

## Example

HIGH RISK

84 / 100

High confidence

This message shows multiple signs of phishing.

### Why?

- Requests a verification code
- Creates artificial urgency
- Domain does not match the claimed bank

### What should you do?

- Do not open the link
- Do not share verification codes
- Contact the bank directly

---

# 7. Low Risk Result

The interface must not say:

SAFE

Instead:

LOW RISK

No strong signs of fraud were detected.

Additional message:

This does not guarantee that the content is safe.

---

# 8. Medium Risk Result

Title:

BE CAREFUL

Description:

Some suspicious signs were detected.

The user should see clear verification steps.

---

# 9. High Risk Result

Title:

HIGH RISK

Description:

This content shows strong signs of potential fraud.

Recommended actions should appear prominently.

---

# 10. Insufficient Data

Result:

Not enough information

Explanation:

We need more information to assess this content.

Actions:

- Add more context
- Paste the full message
- Check another item

---

# 11. Analysis Failure

Result:

Analysis failed

Description:

Something went wrong while checking this content.

Actions:

- Try again
- Start a new check

---

# 12. History Page

Route:

/history

Requires authentication.

Main goal:

Allow users to see previous checks.

Each item should display:

- input type
- short preview
- risk level
- date
- confidence

Example:

HIGH RISK

"Your bank account has been suspended..."

Text

Nov 9, 2026

---

# 13. History Filters

Initial filters:

- All
- Low risk
- Medium risk
- High risk

Later:

- Text
- URL
- Screenshot
- Date range

Do not include advanced filters in MVP.

---

# 14. Login Page

Route:

/login

Fields:

- Email
- Password

Actions:

- Sign in
- Forgot password
- Create account

---

# 15. Register Page

Route:

/register

Fields:

- Name
- Email
- Password

Primary action:

Create account

---

# 16. Account Page

Route:

/account

MVP settings:

- Name
- Email
- Delete account
- Sign out

Future:

- Family Protection
- Subscription
- Notification settings

---

# 17. Anonymous User Flow

TrustCheck may allow limited checks without registration.

Example:

Landing
↓
Check
↓
Analyze
↓
Result

After the result:

Create an account to save your checks.

This reduces friction for first-time users.

Final decision on anonymous limits will be made before implementation.

---

# 18. Authenticated User Flow

Login
↓
Check
↓
Analyze
↓
Result
↓
Saved automatically
↓
History

---

# 19. Main User Flow

The most important product flow is:

Landing
↓
Choose input
↓
Submit
↓
Analyze
↓
Understand risk
↓
Know what to do next

TrustCheck succeeds when the user leaves
with a clearer and safer decision.

---

# 20. Mobile Flow

Mobile is a primary platform.

Users may receive scams through:

- SMS
- Telegram
- WhatsApp
- Email

Therefore mobile checking must require very few actions.

Mobile navigation:

Home
Check
History
Account

The Check action should remain the most prominent action.

---

# 21. Desktop Navigation

Desktop may use:

Top navigation

or:

Simple compact sidebar

Possible navigation:

TrustCheck

Check
History

Account

Avoid building a complex dashboard navigation system.

TrustCheck is not a project management application.

---

# 22. Empty History

Title:

No checks yet

Description:

Your previous TrustCheck analyses will appear here.

Action:

Check something

---

# 23. Loading States

Use skeletons for:

- History
- Result details

For active analysis:

show detector-based status messages.

Examples:

Checking URL...

Analyzing domain...

Looking for suspicious patterns...

---

# 24. Responsive Priorities

## Mobile

Priority:

- input
- risk
- explanation
- actions

Hide unnecessary technical details behind expandable sections.

---

## Tablet

More horizontal space may be used,
but the layout should remain close to mobile.

---

## Desktop

Result may use two columns:

Main result

-

Technical details / analysis coverage

---

# 25. Initial Routes

MVP routes:

/
/check
/check/[id]
/history
/login
/register
/account

System:

/not-found

---

# 26. Non-Goals

MVP navigation will not include:

- Family
- Reports
- Monitoring
- Browser extension
- Marketplace
- Job checker
- Admin panel

These may be added later.

---

# 27. UX Principles

## Fast entry

The user should not need an account before understanding the product.

## Minimal friction

Do not ask unnecessary questions before analysis.

## Risk first

The most important information on Result
must be visible immediately.

## Actionable

Every result should tell the user what to do next.

## Mobile first

The product must remain easy to use
when someone receives a suspicious message on their phone.

## No dashboard overload

TrustCheck should feel like a focused security tool,
not enterprise software.
