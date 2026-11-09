# TrustCheck Design System

## 1. Design Direction

TrustCheck должен выглядеть:

- trustworthy;
- calm;
- secure;
- modern;
- minimal;
- understandable for non-technical users.

Продукт не должен выглядеть:

- агрессивно;
- как antivirus из 2010 года;
- слишком “hacker style”;
- перегруженно;
- пугающе;
- как enterprise dashboard.

Основное ощущение:

**“Я могу спокойно проверить что-то подозрительное и понять результат.”**

---

# 2. Brand Personality

TrustCheck:

- calm;
- protective;
- transparent;
- factual;
- helpful.

TrustCheck не пытается напугать пользователя.

Даже High Risk должен сообщаться спокойно и конкретно.

---

# 3. Primary Color

Основной брендовый цвет:

`#2563EB`

Blue 600.

Используется для:

- primary buttons;
- links;
- focus states;
- selected controls;
- brand accents.

Light variant:

`#DBEAFE`

Dark variant:

`#1D4ED8`

---

# 4. Neutral Colors — Light

Background:

`#F8FAFC`

Surface:

`#FFFFFF`

Surface Secondary:

`#F1F5F9`

Border:

`#E2E8F0`

Text Primary:

`#0F172A`

Text Secondary:

`#64748B`

Text Tertiary:

`#94A3B8`

---

# 5. Neutral Colors — Dark

Background:

`#090E17`

Surface:

`#111827`

Surface Secondary:

`#182132`

Border:

`#263244`

Text Primary:

`#F8FAFC`

Text Secondary:

`#94A3B8`

Text Tertiary:

`#64748B`

---

# 6. Risk Colors

Risk colors имеют строго фиксированное значение.

## Low Risk

Primary:

`#16A34A`

Background:

`#F0FDF4`

Dark Background:

`#052E16`

---

## Medium Risk

Primary:

`#D97706`

Background:

`#FFFBEB`

Dark Background:

`#451A03`

---

## High Risk

Primary:

`#DC2626`

Background:

`#FEF2F2`

Dark Background:

`#450A0A`

---

## Neutral / Unknown

Primary:

`#64748B`

Background:

`#F1F5F9`

---

## Important

Цвет никогда не является единственным способом показать результат.

Всегда использовать:

- icon;
- label;
- explanation.

Example:

🔴 High Risk

а не просто красный блок.

---

# 7. Typography

Primary font:

**Geist Sans**

Fallback:

`Arial, Helvetica, sans-serif`

---

## Typography Scale

### Caption

12px  
Line height: 16px  
Weight: 400 / 500

Usage:

- metadata;
- timestamps;
- technical labels.

---

### Small

14px  
Line height: 20px  
Weight: 400 / 500

Usage:

- secondary text;
- navigation;
- buttons.

---

### Body

16px  
Line height: 24px  
Weight: 400 / 500

Usage:

- main text;
- explanations;
- form input.

---

### Heading Small

20px  
Line height: 28px  
Weight: 600

Usage:

- card headings;
- sections.

---

### Heading

24px  
Line height: 32px  
Weight: 600

Usage:

- page sections;
- result titles.

---

### Page Title

36px  
Line height: 44px  
Weight: 700

Usage:

- landing hero;
- major page titles.

Mobile may use:

32px / 40px.

---

# 8. Spacing

Use a 4px spacing system.

Allowed values:

4px  
8px  
12px  
16px  
20px  
24px  
32px  
40px  
48px  
64px  
80px

Avoid arbitrary spacing unless necessary.

---

# 9. Border Radius

Small:

6px

Medium:

8px

Large:

12px

Extra Large:

16px

Card:

16px

Full:

9999px

TrustCheck should feel slightly softer than TaskFlow.

---

# 10. Borders

Default:

1px solid Border

Cards should rely primarily on:

- border;
- background separation.

Avoid excessive shadows.

---

# 11. Shadows

Small:

Subtle floating controls.

Medium:

Dropdowns / popovers.

Large:

Modals.

Normal content cards should usually use no shadow.

---

# 12. Buttons

## Primary

Background:

Primary Blue

Text:

White

Height:

44px

Radius:

8px

Horizontal padding:

16px

Font:

14–16px / Medium

---

## Secondary

Background:

Surface

Border:

Border

Text:

Primary Text

---

## Danger

Use only for destructive actions.

Example:

Delete account.

Do not use danger buttons for normal High Risk results.

---

# 13. Inputs

Height:

44px minimum.

Radius:

8px.

Border:

1px.

Input background:

Surface.

Focus:

Primary Blue border + subtle focus ring.

---

# 14. Large Check Input

The main TrustCheck input is a key component.

Minimum height:

160px for text mode.

Desktop max width:

720px.

Mobile:

100%.

Radius:

12px.

Padding:

16px.

---

# 15. Cards

Default card:

Background:

Surface

Border:

1px solid Border

Radius:

16px

Padding:

20–24px

---

# 16. Risk Result Card

Risk result should be visually prominent.

Structure:

Icon

Risk Label

Score

Confidence

Short explanation

Risk card should not look like an advertisement or warning popup.

It should feel factual and calm.

---

# 17. Icons

Use simple outline icons.

Recommended size:

16px  
20px  
24px

Stroke:

1.5–2px

Avoid detailed illustrations in functional UI.

---

# 18. Logo Direction

TrustCheck logo should communicate:

- verification;
- protection;
- trust.

Possible concepts:

- shield + check;
- check mark inside rounded frame;
- abstract verification mark.

Avoid:

- padlock clichés;
- hacker imagery;
- skulls;
- aggressive security symbols.

---

# 19. Layout

## Desktop

Content max width:

1200px.

Primary check area:

720px maximum.

Page horizontal padding:

32px.

---

## Tablet

Horizontal padding:

24px.

---

## Mobile

Horizontal padding:

16px.

Main controls:

full width.

---

# 20. Header

TrustCheck should use a compact header.

Desktop:

Logo

Check

History

Right side:

Theme  
Account / Sign in

Header height:

64px.

Do not use a large sidebar for MVP.

---

# 21. Responsive Breakpoints

Mobile:

< 768px

Tablet:

768–1199px

Desktop:

≥ 1200px

---

# 22. Motion

Animations should be subtle.

Fast:

150ms

Normal:

200ms

Slow:

300ms

Support:

`prefers-reduced-motion`

Avoid decorative animations during risk analysis.

---

# 23. Accessibility

Minimum goals:

- WCAG AA contrast;
- visible keyboard focus;
- semantic form labels;
- no color-only status;
- minimum interactive target around 40–44px;
- keyboard accessible navigation.

---

# 24. Tone of Voice

TrustCheck speaks calmly.

Bad:

**DANGER!!! YOU ARE BEING SCAMMED!!!**

Good:

**High risk**

This message contains several strong signs of phishing.

Bad:

**Everything looks safe.**

Good:

**Low risk**

We didn't detect strong signs of fraud, but this does not guarantee that the content is safe.

---

# 25. Core Principle

The interface should reduce anxiety, not increase it.

TrustCheck should communicate:

**Risk clearly. Evidence transparently. Actions simply.**
