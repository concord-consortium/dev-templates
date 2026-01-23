---
format_version: "1.0"
last_updated: "2025-01"
---

# Common Accessibility Fixes

Lookup table mapping issue types to fix templates. Each entry includes detection patterns, fix templates, edge cases, and WCAG criteria.

---

## Missing Alt Text

**Issue**: `<img>` element lacks alt attribute.

**Severity**: Critical (informative images), Minor (decorative images)

**Detection**:
```
img:not([alt])
<img src="...">  (without alt)
```

**Fix Template**:
```jsx
// Before
<img src="photo.jpg" />

// After (informative image)
<img src="photo.jpg" alt="[descriptive text]" />

// After (decorative image)
<img src="photo.jpg" alt="" />
```

**Guidance for alt text**:
- Describe the image's purpose, not appearance
- Keep it concise (typically under 125 characters)
- Don't start with "Image of..." or "Picture of..."
- For functional images (links, buttons), describe the action

**Edge Cases**:
- Complex images (charts, diagrams) need extended description via `aria-describedby`
- CSS background images conveying information need text alternative
- Image links should describe destination, not image
- Redundant alt (image next to text link with same destination) should be empty

**WCAG**: 1.1.1

---

## Missing Form Label

**Issue**: Form control lacks associated label.

**Severity**: Serious

**Detection**:
```
input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])
  - without associated <label>
  - without aria-label
  - without aria-labelledby

select, textarea without label association
```

**Fix Template**:
```jsx
// Before
<input type="text" placeholder="Enter your name" />

// After (explicit association - preferred)
<label htmlFor="name">Name</label>
<input id="name" type="text" />

// After (wrapping label)
<label>
  Name
  <input type="text" />
</label>

// After (aria-label for icon inputs)
<input type="search" aria-label="Search products" />
```

**Edge Cases**:
- Search inputs may use `aria-label` instead of visible label
- Groups of related inputs should use `fieldset`/`legend`
- Placeholder is NOT a substitute for label
- Hidden labels (visually-hidden class) acceptable for visual design constraints

**WCAG**: 1.3.1, 4.1.2

---

## Missing Button Label

**Issue**: Button lacks accessible name.

**Severity**: Critical

**Detection**:
```
button:empty
button containing only img/svg without alt/aria-label
<button><svg>...</svg></button>
<button><img src="icon.png"></button>
```

**Fix Template**:
```jsx
// Before
<button onClick={handleClose}>
  <CloseIcon />
</button>

// After (aria-label)
<button onClick={handleClose} aria-label="Close dialog">
  <CloseIcon aria-hidden="true" />
</button>

// After (visually hidden text)
<button onClick={handleClose}>
  <CloseIcon aria-hidden="true" />
  <span className="visually-hidden">Close dialog</span>
</button>
```

**Edge Cases**:
- Submit buttons typically use their value as label
- Image buttons need alt text
- Icon + text buttons don't need additional aria-label

**WCAG**: 1.1.1, 4.1.2

---

## Non-Interactive Element with Click Handler

**Issue**: Click handler on non-interactive element (div, span).

**Severity**: Critical

**Detection**:
```
<div onClick=...>
<span onClick=...>
<a onClick=...> (without href)
```

**Fix Template**:
```jsx
// Before
<div onClick={handleClick} className="button">
  Click me
</div>

// After (use button)
<button onClick={handleClick} className="button">
  Click me
</button>

// Before (link without href)
<a onClick={handleNavigate}>Go somewhere</a>

// After (proper link)
<a href="/somewhere">Go somewhere</a>

// After (if must be button behavior)
<button onClick={handleNavigate}>Go somewhere</button>
```

**Edge Cases**:
- If element MUST remain a div, add: `role="button"`, `tabIndex={0}`, `onKeyDown` handler for Enter/Space
- Custom dropdowns may need `role="listbox"` or `role="combobox"`
- This is a code smell - almost always better to use semantic element

**WCAG**: 2.1.1, 4.1.2

---

## Missing Focus Indicator

**Issue**: Focus indicator removed without replacement.

**Severity**: Serious

**Detection**:
```css
outline: none
outline: 0
:focus { outline: none }
```

**Fix Template**:
```css
/* Before */
button:focus {
  outline: none;
}

/* After (custom focus style) */
button:focus {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}

/* After (keyboard-only focus) */
button:focus:not(:focus-visible) {
  outline: none;
}

button:focus-visible {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}
```

**Edge Cases**:
- Focus indicator should have 3:1 contrast ratio
- Focus within complex components may need custom handling
- Never remove outline globally without replacement

**WCAG**: 2.4.7

---

## Missing Heading Structure

**Issue**: Page lacks proper heading hierarchy.

**Severity**: Serious

**Detection**:
```
- Page without <h1>
- Heading levels skipped (h1 → h3)
- Multiple <h1> elements (usually)
- <div class="heading"> without semantic heading
```

**Fix Template**:
```jsx
// Before
<div className="page-title">Welcome</div>
<div className="section-title">About Us</div>

// After
<h1>Welcome</h1>
<h2>About Us</h2>

// Before (skipped levels)
<h1>Page Title</h1>
<h3>Subsection</h3>

// After
<h1>Page Title</h1>
<h2>Section</h2>
<h3>Subsection</h3>
```

**Edge Cases**:
- Sectioning elements (article, section, nav) can have their own h1, but sequential levels preferred
- Visually hidden headings acceptable for screen reader navigation
- Use CSS for visual styling, not heading levels

**WCAG**: 1.3.1, 2.4.6

---

## Missing Language Attribute

**Issue**: Page lacks language declaration.

**Severity**: Serious

**Detection**:
```html
<html>  (without lang attribute)
```

**Fix Template**:
```jsx
// Before
<html>
  <head>...</head>
</html>

// After
<html lang="en">
  <head>...</head>
</html>

// For other languages
<html lang="es">  // Spanish
<html lang="fr">  // French
<html lang="de">  // German
```

**Edge Cases**:
- Passages in different language need `lang` attribute on containing element
- Use BCP 47 language tags (en-US, en-GB, etc. for regional variants)

**WCAG**: 3.1.1

---

## Missing ARIA Expanded State

**Issue**: Expandable control lacks expanded/collapsed state.

**Severity**: Serious

**Detection**:
```
- Button controlling show/hide without aria-expanded
- Accordion headers without aria-expanded
- Dropdown toggles without aria-expanded
```

**Fix Template**:
```jsx
// Before
<button onClick={() => setIsOpen(!isOpen)}>
  Menu
</button>
{isOpen && <div>Menu content</div>}

// After
<button
  onClick={() => setIsOpen(!isOpen)}
  aria-expanded={isOpen}
  aria-controls="menu-content"
>
  Menu
</button>
{isOpen && <div id="menu-content">Menu content</div>}
```

**Edge Cases**:
- Use `aria-controls` to link button to controlled content
- Hidden content should use `hidden` attribute or CSS `display: none`
- For accordions, consider using `<details>`/`<summary>` if appropriate

**WCAG**: 4.1.2

---

## Missing Live Region

**Issue**: Dynamic content updates not announced.

**Severity**: Serious

**Detection**:
```
- Toast/notification components without aria-live or role="alert"
- Form submission success messages not announced
- Loading states without announcement
- Search result counts not announced
```

**Fix Template**:
```jsx
// Before
{message && <div className="notification">{message}</div>}

// After (polite announcement)
<div role="status" aria-live="polite">
  {message}
</div>

// After (assertive for errors)
<div role="alert" aria-live="assertive">
  {errorMessage}
</div>

// Search results
<p role="status" aria-live="polite" aria-atomic="true">
  {results.length} results found
</p>
```

**Edge Cases**:
- Use `role="status"` for non-urgent updates
- Use `role="alert"` for important/urgent messages
- `aria-atomic="true"` announces entire region, not just changes
- Don't overuse live regions (can be noisy)

**WCAG**: 4.1.3

---

## Missing Skip Link

**Issue**: No mechanism to bypass repeated content.

**Severity**: Serious

**Detection**:
```
- No skip link as first focusable element
- Skip link target missing or invalid
```

**Fix Template**:
```jsx
// Add at top of page
<a href="#main-content" className="skip-link">
  Skip to main content
</a>

<header>...</header>
<nav>...</nav>

<main id="main-content" tabIndex={-1}>
  {/* Main content */}
</main>

// CSS
.skip-link {
  position: absolute;
  left: -9999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.skip-link:focus {
  position: fixed;
  top: 0;
  left: 0;
  width: auto;
  height: auto;
  padding: 8px 16px;
  background: #000;
  color: #fff;
  z-index: 9999;
}
```

**Edge Cases**:
- Multiple skip links may be appropriate for complex layouts
- Target should be focusable (main element with tabIndex="-1")
- Consider skip links for repeated within-page content too

**WCAG**: 2.4.1

---

## Form Error Not Associated

**Issue**: Error message not programmatically associated with field.

**Severity**: Serious

**Detection**:
```
- Error message displayed near field without aria-describedby
- Field in error state without aria-invalid
```

**Fix Template**:
```jsx
// Before
<label htmlFor="email">Email</label>
<input id="email" type="email" />
{error && <span className="error">{error}</span>}

// After
<label htmlFor="email">Email</label>
<input
  id="email"
  type="email"
  aria-invalid={error ? "true" : "false"}
  aria-describedby={error ? "email-error" : undefined}
/>
{error && (
  <span id="email-error" role="alert">
    {error}
  </span>
)}
```

**Edge Cases**:
- Multiple descriptions can be space-separated in `aria-describedby`
- Use `role="alert"` for immediate announcement
- Error summary at top of form should link to individual fields

**WCAG**: 1.3.1, 3.3.1

---

## Missing Modal Focus Management

**Issue**: Modal doesn't manage focus properly.

**Severity**: Serious

**Detection**:
```
- Modal without role="dialog" or role="alertdialog"
- Modal without aria-modal="true"
- Focus doesn't move to modal on open
- Focus not trapped within modal
- Focus not returned on close
```

**Fix Template**:
```jsx
// Before
{isOpen && (
  <div className="modal">
    <h2>Modal Title</h2>
    <button onClick={onClose}>Close</button>
  </div>
)}

// After
{isOpen && (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    ref={modalRef}
    tabIndex={-1}
    onKeyDown={handleKeyDown}
  >
    <h2 id="modal-title">Modal Title</h2>
    {/* Modal content */}
    <button onClick={onClose}>Close</button>
  </div>
)}

// Focus management hook
useEffect(() => {
  if (isOpen) {
    previousFocusRef.current = document.activeElement;
    modalRef.current?.focus();
  } else {
    previousFocusRef.current?.focus();
  }
}, [isOpen]);

// Key handler for Escape
const handleKeyDown = (e) => {
  if (e.key === "Escape") {
    onClose();
  }
};
```

**Background Content Isolation (Required)**:

Use the `inert` attribute to prevent interaction with background content:
```jsx
// App structure
<div id="app-root" inert={isModalOpen ? "" : undefined}>
  {/* All page content */}
</div>

{isModalOpen && createPortal(
  <Modal onClose={() => setIsModalOpen(false)} />,
  document.body
)}

// Or with useEffect
useEffect(() => {
  const appRoot = document.getElementById("app-root");
  if (isModalOpen) {
    appRoot?.setAttribute("inert", "");
  } else {
    appRoot?.removeAttribute("inert");
  }
  return () => appRoot?.removeAttribute("inert");
}, [isModalOpen]);
```

**Why `inert` over `aria-hidden`**:
- `inert` prevents ALL interaction (focus, click, selection)
- `aria-hidden` only hides from assistive tech, doesn't trap focus
- `inert` is now supported in all modern browsers

**Edge Cases**:
- Use `alertdialog` for critical confirmation dialogs
- Implement focus trap for Tab key (or rely on `inert` for background)
- Consider focus on close button vs heading vs first input
- Nested modals require careful focus management

**WCAG**: 2.1.2, 2.4.3

---

## Insufficient Color Contrast

**Issue**: Text or UI component has insufficient color contrast.

**Severity**: Serious (body text), Moderate (large text/UI)

**Detection**:
```
- Light text on light background
- Low contrast placeholder text
- Focus indicators with insufficient contrast
- Note: Claude cannot calculate exact ratios; flags for human verification
```

**Fix Template**:
```css
/* Before */
.text {
  color: #999;  /* gray on white - likely fails */
}

/* After - verify with contrast checker */
.text {
  color: #595959;  /* darker gray - 7:1 on white */
}

/* Placeholder text */
::placeholder {
  color: #767676;  /* minimum 4.5:1 on white */
}
```

**Guidance**:
- Regular text: 4.5:1 minimum
- Large text (18pt+ regular OR 14pt+ bold): 3:1 minimum
- UI components and graphics: 3:1 minimum

**Testing Tools**:
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) - Web-based tool
- [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/) - Desktop app with eyedropper
- Chrome DevTools: Elements panel → Styles → color swatch shows contrast ratio
- Firefox DevTools: Accessibility Inspector → Check for issues
- [Stark](https://www.getstark.co/) - Figma/Sketch plugin for design review

**Edge Cases**:
- Disabled elements are exempt but should still be somewhat readable
- Logos and incidental text are exempt
- Consider both light and dark mode
- Placeholder text must also meet contrast requirements

**WCAG**: 1.4.3, 1.4.11

---

## Table Missing Headers

**Issue**: Data table lacks proper header markup.

**Severity**: Serious

**Detection**:
```
- <table> without <th> elements
- <th> without scope attribute
- Complex table without headers attribute
```

**Fix Template**:
```jsx
// Before
<table>
  <tr>
    <td>Name</td>
    <td>Email</td>
  </tr>
  <tr>
    <td>John</td>
    <td>john@example.com</td>
  </tr>
</table>

// After
<table>
  <caption>User Directory</caption>
  <thead>
    <tr>
      <th scope="col">Name</th>
      <th scope="col">Email</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>John</td>
      <td>john@example.com</td>
    </tr>
  </tbody>
</table>

// With row headers
<table>
  <tr>
    <th scope="row">Q1</th>
    <td>$10,000</td>
  </tr>
</table>
```

**Edge Cases**:
- Layout tables should use `role="presentation"`
- Complex tables with multi-level headers need `headers` attribute
- Consider if table is the right pattern (maybe list or grid)

**WCAG**: 1.3.1

---

## Link with No Discernible Text

**Issue**: Link lacks accessible name.

**Severity**: Serious

**Detection**:
```
- Empty <a> element
- <a> containing only image without alt
- <a> containing only icon without label
```

**Fix Template**:
```jsx
// Before (empty link)
<a href="/profile"></a>

// Before (image link without alt)
<a href="/home"><img src="logo.png" /></a>

// After (with image alt)
<a href="/home">
  <img src="logo.png" alt="Company Name - Home" />
</a>

// After (icon link with aria-label)
<a href="/settings" aria-label="Settings">
  <SettingsIcon aria-hidden="true" />
</a>

// After (with visually hidden text)
<a href="/settings">
  <SettingsIcon aria-hidden="true" />
  <span className="visually-hidden">Settings</span>
</a>
```

**Edge Cases**:
- Adjacent image and text links to same destination should be combined
- "Read more" links need context (aria-label or aria-describedby)

**WCAG**: 2.4.4, 4.1.2

---

## Positive Tabindex

**Issue**: Element uses positive tabindex value.

**Severity**: Moderate

**Detection**:
```
tabindex="1"
tabindex="2"
(any tabindex > 0)
```

**Fix Template**:
```jsx
// Before
<button tabIndex={2}>Second</button>
<button tabIndex={1}>First</button>

// After (use DOM order or CSS)
<button>First</button>
<button>Second</button>

// If element needs to be focusable
<div tabIndex={0}>Focusable div</div>

// If element should be programmatically focusable only
<div tabIndex={-1}>Focus target</div>
```

**Edge Cases**:
- `tabindex="0"` puts element in natural tab order (OK)
- `tabindex="-1"` makes element focusable by script only (OK)
- Positive values should never be used

**WCAG**: 2.4.3

---

## Autoplay Media

**Issue**: Media autoplays without user control.

**Severity**: Serious

**Detection**:
```
<video autoplay>
<audio autoplay>
autoPlay={true} in React
```

**Fix Template**:
```jsx
// Before
<video autoPlay src="intro.mp4" />

// After (no autoplay)
<video src="intro.mp4" controls />

// After (autoplay muted with controls)
<video autoPlay muted src="intro.mp4" controls />

// After (autoplay with immediate pause option)
<video
  autoPlay
  muted
  src="intro.mp4"
  controls
  aria-label="Introduction video"
/>
```

**Edge Cases**:
- Muted video autoplay is generally acceptable
- Always provide pause/stop controls
- Respect `prefers-reduced-motion` media query
- Background videos should be muted and pausable

**WCAG**: 1.4.2

---

## Missing Iframe Title

**Issue**: `<iframe>` element lacks descriptive title attribute.

**Severity**: Serious

**Detection**:
```
<iframe src="...">  (without title attribute)
<iframe src="..." title="">  (empty title)
```

**Fix Template**:
```jsx
// Before
<iframe src="https://www.youtube.com/embed/abc123" />

// After
<iframe
  src="https://www.youtube.com/embed/abc123"
  title="Product demo video"
/>

// For decorative/technical iframes (rare)
<iframe src="tracking.html" title="Analytics tracking" aria-hidden="true" />
```

**Guidance for iframe titles**:
- Describe the content or purpose of the iframe
- Be specific: "Contact form" not just "Form"
- For embedded videos, describe what the video shows
- For maps, include location: "Map showing office location"

**Edge Cases**:
- Hidden iframes (tracking pixels) should still have titles or `aria-hidden="true"`
- Multiple iframes need unique, descriptive titles
- Dynamically loaded content should update title if content changes

**WCAG**: 2.4.1, 4.1.2

---

## Missing Landmark Roles

**Issue**: Page lacks proper landmark regions for navigation.

**Severity**: Serious

**Detection**:
```
- No <main> element
- No <nav> element for navigation
- No <header> or <footer>
- Multiple navs without aria-label differentiation
```

**Fix Template**:
```jsx
// Before
<div className="header">...</div>
<div className="nav">...</div>
<div className="content">...</div>
<div className="sidebar">...</div>
<div className="footer">...</div>

// After
<header>
  <nav aria-label="Main navigation">
    {/* Primary navigation links */}
  </nav>
</header>

<main>
  {/* Primary page content */}
</main>

<aside aria-label="Related articles">
  {/* Sidebar content */}
</aside>

<footer>
  <nav aria-label="Footer navigation">
    {/* Footer links */}
  </nav>
</footer>
```

**Common Landmarks**:
| Element | Implicit Role | Use For |
|---------|--------------|---------|
| `<header>` | banner (when not nested) | Site header |
| `<nav>` | navigation | Navigation sections |
| `<main>` | main | Primary content (one per page) |
| `<aside>` | complementary | Related/supporting content |
| `<footer>` | contentinfo (when not nested) | Site footer |
| `<section>` | region (with aria-label) | Distinct page sections |
| `<form>` | form (with aria-label) | Form regions |

**Edge Cases**:
- Only one `<main>` element per page
- Multiple `<nav>` elements need `aria-label` to differentiate
- Nested headers/footers don't get landmark roles automatically
- Use `role="search"` for search forms

**WCAG**: 1.3.1, 2.4.1

---

## Missing Fieldset/Legend for Grouped Inputs

**Issue**: Related form controls (radio buttons, checkboxes) not properly grouped.

**Severity**: Serious

**Detection**:
```
- Radio button groups without <fieldset>
- Checkbox groups without <fieldset>
- Related fields without group labeling
- <fieldset> without <legend>
```

**Fix Template**:
```jsx
// Before
<p>Preferred contact method:</p>
<input type="radio" name="contact" id="email" />
<label htmlFor="email">Email</label>
<input type="radio" name="contact" id="phone" />
<label htmlFor="phone">Phone</label>
<input type="radio" name="contact" id="mail" />
<label htmlFor="mail">Mail</label>

// After
<fieldset>
  <legend>Preferred contact method</legend>
  <input type="radio" name="contact" id="email" />
  <label htmlFor="email">Email</label>
  <input type="radio" name="contact" id="phone" />
  <label htmlFor="phone">Phone</label>
  <input type="radio" name="contact" id="mail" />
  <label htmlFor="mail">Mail</label>
</fieldset>

// Checkbox group example
<fieldset>
  <legend>Notification preferences (select all that apply)</legend>
  <input type="checkbox" name="notify" id="notify-email" />
  <label htmlFor="notify-email">Email notifications</label>
  <input type="checkbox" name="notify" id="notify-sms" />
  <label htmlFor="notify-sms">SMS notifications</label>
  <input type="checkbox" name="notify" id="notify-push" />
  <label htmlFor="notify-push">Push notifications</label>
</fieldset>
```

**Edge Cases**:
- Single checkboxes (like "Remember me") don't need fieldset
- Nested fieldsets are valid but can be confusing
- CSS can style away the fieldset border if needed: `fieldset { border: 0; padding: 0; }`
- For complex forms, consider `role="group"` with `aria-labelledby` as alternative

**WCAG**: 1.3.1, 3.3.2

---

## Missing Autocomplete Attribute

**Issue**: Form fields collecting personal information lack autocomplete attribute.

**Severity**: Minor

**Detection**:
```
- Input fields for name, email, phone, address without autocomplete
- Login forms without autocomplete
- Payment forms without autocomplete
```

**Fix Template**:
```jsx
// Before
<input type="text" name="fullName" />
<input type="email" name="email" />
<input type="tel" name="phone" />

// After
<input type="text" name="fullName" autocomplete="name" />
<input type="email" name="email" autocomplete="email" />
<input type="tel" name="phone" autocomplete="tel" />

// Address fields
<input type="text" autocomplete="street-address" />
<input type="text" autocomplete="address-level2" /> {/* City */}
<input type="text" autocomplete="address-level1" /> {/* State/Province */}
<input type="text" autocomplete="postal-code" />
<input type="text" autocomplete="country-name" />

// Login/account fields
<input type="text" autocomplete="username" />
<input type="password" autocomplete="current-password" />
<input type="password" autocomplete="new-password" />

// Payment fields
<input type="text" autocomplete="cc-name" />
<input type="text" autocomplete="cc-number" />
<input type="text" autocomplete="cc-exp" />
<input type="text" autocomplete="cc-csc" />
```

**Common Autocomplete Values**:
| Value | Use For |
|-------|---------|
| `name` | Full name |
| `given-name` | First name |
| `family-name` | Last name |
| `email` | Email address |
| `tel` | Phone number |
| `street-address` | Street address |
| `postal-code` | ZIP/Postal code |
| `country-name` | Country |
| `username` | Username |
| `current-password` | Existing password (login) |
| `new-password` | New password (registration/change) |

**Edge Cases**:
- Use `autocomplete="off"` only when autofill would be inappropriate (e.g., CAPTCHA)
- For multi-part names, use `given-name` and `family-name` separately
- Helps users with motor impairments and cognitive disabilities

**WCAG**: 1.3.5

---

## Disabled Button Without Context

**Issue**: Disabled button provides no explanation for why it's disabled.

**Severity**: Moderate

**Detection**:
```
- <button disabled> without nearby explanation
- Disabled submit button with no indication of what's needed
```

**Fix Template**:
```jsx
// Before
<button disabled>Submit</button>

// After (with description)
<button disabled aria-describedby="submit-help">
  Submit
</button>
<p id="submit-help">Complete all required fields to submit</p>

// After (with inline hint)
<button disabled>
  Submit
  <span className="visually-hidden">(complete required fields first)</span>
</button>

// Better pattern: Keep enabled with validation
<button onClick={handleSubmit}>Submit</button>
// Show validation errors on click if form is invalid
```

**Best Practice Alternative**:
Consider keeping buttons enabled and showing validation errors on activation:
```jsx
const handleSubmit = () => {
  if (!isValid) {
    setErrors(validateForm());
    return;
  }
  submitForm();
};

// Button stays enabled, provides feedback on click
<button onClick={handleSubmit}>Submit</button>
```

**Edge Cases**:
- `aria-disabled="true"` keeps button in tab order (often better UX)
- Disabled buttons should have sufficient color contrast to be readable
- Tooltips on disabled buttons are problematic (not keyboard accessible)
- Consider progressive disclosure instead of disabled states

**WCAG**: 1.3.1, 4.1.2

---

## Summary: Quick Fix Reference

| Issue | Primary Fix | WCAG |
|-------|-------------|------|
| Missing alt text | Add `alt="description"` | 1.1.1 |
| Missing form label | Add `<label htmlFor>` | 1.3.1, 4.1.2 |
| Missing button label | Add `aria-label` | 1.1.1, 4.1.2 |
| Click on div/span | Change to `<button>` | 2.1.1, 4.1.2 |
| No focus indicator | Add `:focus-visible` styles | 2.4.7 |
| Skipped headings | Fix heading hierarchy | 1.3.1 |
| Missing lang | Add `<html lang="en">` | 3.1.1 |
| No expanded state | Add `aria-expanded` | 4.1.2 |
| Silent updates | Add `role="status"` | 4.1.3 |
| No skip link | Add skip link component | 2.4.1 |
| Unlinked error | Add `aria-describedby` | 1.3.1, 3.3.1 |
| Modal focus issues | Add focus management + `inert` | 2.1.2, 2.4.3 |
| Low contrast | Adjust colors to 4.5:1+ | 1.4.3 |
| Table no headers | Add `<th scope>` | 1.3.1 |
| Empty link | Add link text or `aria-label` | 2.4.4 |
| Positive tabindex | Remove or use 0/-1 | 2.4.3 |
| Autoplay media | Remove autoplay or mute | 1.4.2 |
| Missing iframe title | Add `title` attribute | 2.4.1, 4.1.2 |
| No landmarks | Use `<main>`, `<nav>`, etc. | 1.3.1, 2.4.1 |
| Ungrouped radios | Wrap in `<fieldset>`/`<legend>` | 1.3.1, 3.3.2 |
| No autocomplete | Add `autocomplete` attribute | 1.3.5 |
| Disabled no context | Add `aria-describedby` explanation | 1.3.1, 4.1.2 |
