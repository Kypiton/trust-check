# TrustCheck Wireframes

## 1. Primary Screen

Route:

`/check`

The Check screen is the most important screen in the product.

Goal:

Allow the user to begin a security check within seconds.

---

# 2. Desktop Wireframe

Viewport:

1440px

```text
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ✓ TrustCheck                     Check    History        ◐  Sign in │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                                      │
│                         Check something                              │
│                                                                      │
│            Not sure if a message or link is trustworthy?             │
│                       Check it before you act.                       │
│                                                                      │
│                 ┌────────┬────────┬────────────┐                     │
│                 │  Text  │  Link  │ Screenshot │                     │
│                 └────────┴────────┴────────────┘                     │
│                                                                      │
│           ┌────────────────────────────────────────────┐             │
│           │                                            │             │
│           │ Paste the suspicious message here...       │             │
│           │                                            │             │
│           │                                            │             │
│           │                                            │             │
│           └────────────────────────────────────────────┘             │
│                                                                      │
│           🔒 Your content is only used for this analysis.            │
│                                                                      │
│           ┌────────────────────────────────────────────┐             │
│           │              Check message                 │             │
│           └────────────────────────────────────────────┘             │
│                                                                      │
│                      What TrustCheck looks for                       │
│                                                                      │
│               Urgency    Suspicious links    Impersonation           │
│                                                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

# 3. Desktop Dimensions

Header:

64px height.

Content:

max width 1200px.

Main checking area:

max width 720px.

Top spacing after header:

80px.

Title:

36px / 44px / Bold.

Subtitle:

16px / 24px.

Tabs:

44px height.

Gap title → subtitle:

12px.

Gap subtitle → tabs:

32px.

Gap tabs → input:

16px.

Input:

720px maximum width.

Minimum height:

180px.

Padding:

16px.

Button:

44px height.

Full width relative to input.

---

# 4. Link Mode

Same layout.

Input changes to:

```text
┌───────────────────────────────────────────────┐
│ 🔗  https://example.com                      │
└───────────────────────────────────────────────┘

[ Check link ]
```

URL field:

44px height.

---

# 5. Screenshot Mode

```text
┌───────────────────────────────────────────────┐
│                                               │
│                   ↑                           │
│                                               │
│           Drop a screenshot here              │
│                                               │
│       PNG, JPG or WebP — up to 10 MB          │
│                                               │
│              [ Choose file ]                  │
│                                               │
└───────────────────────────────────────────────┘
```

Upload area:

minimum height 220px.

Border:

dashed.

Radius:

12px.

---

# 6. Analysis State

After submission:

```text
┌───────────────────────────────────────────────┐

               Checking this content...

                     ◌

              ✓ Reading message
              ✓ Detecting links
              ● Checking domain
              ○ Checking reputation
              ○ Evaluating risk

└───────────────────────────────────────────────┘
```

Do not display fake percentages.

---

# 7. Result Wireframe — Desktop

```text
┌────────────────────────────────────────────────────────────────────┐

                           ← New check


        ┌────────────────────────────────────────────────────┐
        │                                                    │
        │   ⚠ HIGH RISK                           84 / 100    │
        │                                                    │
        │   High confidence                                  │
        │                                                    │
        │   This message contains several common signs        │
        │   of phishing.                                     │
        │                                                    │
        └────────────────────────────────────────────────────┘


        ┌──────────────────────────┐  ┌───────────────────────┐
        │                          │  │                       │
        │ Why this looks risky     │  │ What you should do    │
        │                          │  │                       │
        │ ⚠ Requests OTP           │  │ ✓ Don't open link     │
        │ ⚠ Creates urgency        │  │ ✓ Don't share code    │
        │ ⚠ Domain mismatch        │  │ ✓ Contact bank        │
        │                          │  │                       │
        └──────────────────────────┘  └───────────────────────┘


        ▸ Technical details

```

---

# 8. Result Layout

Maximum width:

960px.

Main Risk Card:

full width.

Below:

two-column desktop layout.

Column gap:

24px.

Cards:

equal width.

Technical details:

collapsed by default.

---

# 9. Mobile Check Wireframe

Viewport:

390px.

```text
┌─────────────────────────────────┐
│                                 │
│ ✓ TrustCheck              ☰     │
│                                 │
├─────────────────────────────────┤
│                                 │
│ Check something                 │
│                                 │
│ Not sure if it's trustworthy?   │
│ Check it before you act.        │
│                                 │
│ ┌──────┬──────┬────────────┐    │
│ │ Text │ Link │ Screenshot │    │
│ └──────┴──────┴────────────┘    │
│                                 │
│ ┌─────────────────────────────┐ │
│ │                             │ │
│ │ Paste suspicious message... │ │
│ │                             │ │
│ │                             │ │
│ │                             │ │
│ └─────────────────────────────┘ │
│                                 │
│ 🔒 Used only for analysis       │
│                                 │
│ ┌─────────────────────────────┐ │
│ │       Check message         │ │
│ └─────────────────────────────┘ │
│                                 │
└─────────────────────────────────┘
```

---

# 10. Mobile Result

```text
┌─────────────────────────────────┐
│ ← New check                     │
│                                 │
│ ┌─────────────────────────────┐ │
│ │                             │ │
│ │ ⚠ HIGH RISK                │ │
│ │                             │ │
│ │ 84 / 100                   │ │
│ │ High confidence            │ │
│ │                             │ │
│ │ Strong signs of phishing   │ │
│ │ were detected.             │ │
│ │                             │ │
│ └─────────────────────────────┘ │
│                                 │
│ Why this looks risky            │
│                                 │
│ ⚠ Requests OTP                  │
│ ⚠ Creates urgency               │
│ ⚠ Domain mismatch               │
│                                 │
│ What you should do              │
│                                 │
│ ✓ Don't open the link           │
│ ✓ Don't share codes             │
│ ✓ Contact the bank directly     │
│                                 │
│ ▸ Technical details             │
│                                 │
└─────────────────────────────────┘
```

---

# 11. Mobile Priorities

The first viewport should ideally show:

- risk level;
- score;
- confidence;
- short explanation.

Recommended actions should appear immediately below.

Technical data remains secondary.

---

# 12. Navigation

Desktop:

```text
TrustCheck       Check    History              Theme    Account
```

Mobile:

```text
TrustCheck                                     Menu
```

Menu contains:

- Check
- History
- Account
- Theme

---

# 13. Landing Page Concept

The landing page may reuse the Check input.

Instead of forcing:

Landing → Check page

TrustCheck may eventually allow:

Landing → immediate check.

This decision can be tested later.

For MVP, `/check` remains the dedicated main tool.

---

# 14. UX Principle

The main TrustCheck interface should require almost no learning.

The intended behavior is:

```text
See suspicious thing
↓
Open TrustCheck
↓
Paste
↓
Check
↓
Understand
↓
Act safely
```
