---
version: "2.1"
level: "AA"
last_updated: "2025-01"
---

# WCAG 2.1 AA Checklist

Quick reference for WCAG 2.1 Level A and AA success criteria relevant to web application development.

---

## 1. Perceivable

Information and user interface components must be presentable to users in ways they can perceive.

### 1.1.1 Non-text Content (Level A)

**Description**: All non-text content has a text alternative that serves the equivalent purpose.

**Common Violations**:
- Images missing `alt` attributes
- Icon buttons without accessible names
- Decorative images not marked as such
- SVG icons without text alternatives
- Background images conveying information

**Fix Patterns**:
- Add descriptive `alt` text for informative images
- Use `alt=""` or `role="presentation"` for decorative images
- Add `aria-label` to icon-only buttons
- Use `<title>` or `aria-label` for SVGs

**Severity**: Critical (functional images), Moderate (decorative not marked)

---

### 1.2.1 Audio-only and Video-only (Prerecorded) (Level A)

**Description**: For prerecorded audio-only or video-only media, an alternative is provided.

**Common Violations**:
- Podcast without transcript
- Video (no audio) without text description
- Audio recording without text equivalent

**Fix Patterns**:
- Provide text transcript for audio content
- Provide text description or audio track for silent video
- Link transcript near media player

**Severity**: Serious

---

### 1.2.2 Captions (Prerecorded) (Level A)

**Description**: Captions are provided for all prerecorded audio content in synchronized media.

**Common Violations**:
- Videos without captions
- Auto-generated captions not reviewed for accuracy
- Captions missing speaker identification
- Captions missing sound effects descriptions

**Fix Patterns**:
- Add synchronized captions to all videos with audio
- Review and correct auto-generated captions
- Include speaker identification when multiple speakers
- Describe relevant sound effects in brackets [door slams]

**Severity**: Critical

---

### 1.2.3 Audio Description or Media Alternative (Prerecorded) (Level A)

**Description**: An alternative for time-based media or audio description is provided for prerecorded video.

**Common Violations**:
- Video with important visual content not described
- No transcript provided as alternative
- Visual demonstrations without verbal explanation

**Fix Patterns**:
- Add audio description track describing visual content
- Provide full text transcript including visual descriptions
- Ensure narration describes key visual information

**Severity**: Serious

---

### 1.2.4 Captions (Live) (Level AA)

**Description**: Captions are provided for all live audio content in synchronized media.

**Common Violations**:
- Live streams without real-time captions
- Webinars without captioning service
- Live events without CART (Communication Access Realtime Translation)

**Fix Patterns**:
- Use live captioning service for streams
- Enable auto-captioning with human monitor for corrections
- Provide CART services for live events

**Severity**: Serious

---

### 1.2.5 Audio Description (Prerecorded) (Level AA)

**Description**: Audio description is provided for all prerecorded video content.

**Common Violations**:
- Videos rely on visual content not described in main audio
- Training videos with on-screen text not read aloud
- Demonstrations where actions aren't verbally described

**Fix Patterns**:
- Add audio description track for videos with significant visual content
- Ensure main narration includes description of key visuals
- Create extended audio description if pauses are insufficient

**Severity**: Moderate

**Note**: This is a stronger requirement than 1.2.3 - audio description is required, not just an alternative.

---

### 1.3.1 Info and Relationships (Level A)

**Description**: Information, structure, and relationships conveyed through presentation can be programmatically determined.

**Common Violations**:
- Form inputs without associated labels
- Tables without proper headers
- Headings used for styling (not structure)
- Lists not using `<ul>`, `<ol>`, `<li>`
- Related form fields not grouped with `<fieldset>`

**Fix Patterns**:
- Associate labels with `htmlFor`/`id` or wrap input in `<label>`
- Use `<th>` with `scope` attribute for table headers
- Use semantic heading hierarchy (`<h1>` through `<h6>`)
- Group related radio/checkbox inputs with `<fieldset>` and `<legend>`

**Severity**: Serious

---

### 1.3.2 Meaningful Sequence (Level A)

**Description**: When content sequence affects meaning, a correct reading sequence can be programmatically determined.

**Common Violations**:
- CSS reordering content visually but not in DOM
- Flexbox/Grid `order` property misuse
- Absolute positioning disrupting reading order

**Fix Patterns**:
- Ensure DOM order matches visual order
- Use CSS that doesn't change semantic order
- Test with CSS disabled

**Severity**: Serious

---

### 1.3.3 Sensory Characteristics (Level A)

**Description**: Instructions don't rely solely on sensory characteristics (shape, color, size, location, orientation, sound).

**Common Violations**:
- "Click the green button"
- "See the sidebar on the right"
- "The circular icon"

**Fix Patterns**:
- Include text labels with visual cues
- "Click the Submit button (green)"
- Reference by name, not just appearance

**Severity**: Moderate

---

### 1.3.4 Orientation (Level AA)

**Description**: Content doesn't restrict operation to a single display orientation unless essential.

**Common Violations**:
- Forcing landscape-only or portrait-only
- Using orientation media queries to hide content

**Fix Patterns**:
- Support both orientations
- Only restrict when essential (e.g., piano app)

**Severity**: Moderate

---

### 1.3.5 Identify Input Purpose (Level AA)

**Description**: Input fields collecting user information have programmatically determinable purpose.

**Common Violations**:
- Form fields missing `autocomplete` attributes
- Personal data fields without proper identification

**Fix Patterns**:
- Add `autocomplete` attribute to personal data fields
- Use values like `name`, `email`, `tel`, `street-address`

**Severity**: Minor

---

### 1.4.1 Use of Color (Level A)

**Description**: Color is not the only visual means of conveying information.

**Common Violations**:
- Error states shown only with red color
- Required fields indicated only by color
- Links distinguished only by color
- Chart data differentiated only by color

**Fix Patterns**:
- Add icons, text, or patterns alongside color
- Use underlines for links
- Add error icons with error messages
- Use patterns/labels in addition to colors in charts

**Severity**: Serious

---

### 1.4.2 Audio Control (Level A)

**Description**: Audio playing automatically for more than 3 seconds can be paused/stopped or volume controlled.

**Common Violations**:
- Auto-playing videos with sound
- Background music without controls

**Fix Patterns**:
- Don't autoplay audio
- Provide pause/stop/volume controls
- Use `muted` attribute if autoplay needed

**Severity**: Serious

---

### 1.4.3 Contrast (Minimum) (Level AA)

**Description**: Text has contrast ratio of at least 4.5:1 (3:1 for large text). Large text is defined as 18pt+ (24px) regular weight OR 14pt+ (18.5px) bold weight.

**Common Violations**:
- Light gray text on white backgrounds
- Placeholder text with insufficient contrast
- Disabled state text too low contrast

**Fix Patterns**:
- Use contrast checker tools
- Ensure 4.5:1 for body text
- Ensure 3:1 for large text (18pt+ regular OR 14pt+ bold)

**Severity**: Serious (body text), Moderate (large text)

**Note**: Claude cannot calculate exact contrast ratios. Flag potential issues for human verification.

---

### 1.4.4 Resize Text (Level AA)

**Description**: Text can be resized up to 200% without loss of content or functionality.

**Common Violations**:
- Fixed pixel font sizes
- Containers that clip on zoom
- Horizontal scrolling at 200% zoom

**Fix Patterns**:
- Use relative units (`rem`, `em`, `%`)
- Test at 200% browser zoom
- Use responsive layouts

**Severity**: Moderate

---

### 1.4.5 Images of Text (Level AA)

**Description**: Text is used instead of images of text (with exceptions for logos, customizable images).

**Common Violations**:
- Text rendered as images for styling
- Logos containing text without alternatives

**Fix Patterns**:
- Use CSS for text styling
- Use web fonts
- Provide alt text for necessary text images

**Severity**: Moderate

---

### 1.4.10 Reflow (Level AA)

**Description**: Content reflows without horizontal scrolling at 320px width (400% zoom on 1280px).

**Common Violations**:
- Fixed-width layouts
- Tables that don't adapt
- Overflow causing horizontal scroll

**Fix Patterns**:
- Use responsive design
- Allow tables to stack or scroll within container
- Test at 320px viewport width

**Severity**: Moderate

---

### 1.4.11 Non-text Contrast (Level AA)

**Description**: UI components and graphics have 3:1 contrast against adjacent colors.

**Common Violations**:
- Form field borders too light
- Icon buttons without sufficient contrast
- Focus indicators too subtle

**Fix Patterns**:
- Ensure 3:1 contrast for borders, icons, focus states
- Test UI components against backgrounds

**Severity**: Serious

**Note**: Claude cannot calculate exact contrast ratios. Flag potential issues for human verification.

---

### 1.4.12 Text Spacing (Level AA)

**Description**: No loss of content when user adjusts text spacing.

**Common Violations**:
- Fixed-height containers clipping text
- Overflow hidden on text containers

**Fix Patterns**:
- Allow containers to expand
- Don't use fixed heights on text containers
- Test with increased spacing

**Severity**: Minor

---

### 1.4.13 Content on Hover or Focus (Level AA)

**Description**: Hover/focus content is dismissible, hoverable, and persistent.

**Common Violations**:
- Tooltips that can't be dismissed
- Tooltips that disappear when moving to them
- Tooltips that vanish too quickly

**Fix Patterns**:
- Allow Escape to dismiss
- Keep content visible while hovering over it
- Don't timeout hover content

**Severity**: Moderate

---

## 2. Operable

User interface components and navigation must be operable.

### 2.1.1 Keyboard (Level A)

**Description**: All functionality is operable through keyboard.

**Common Violations**:
- Click handlers without keyboard equivalents
- Custom controls not keyboard accessible
- Drag-and-drop without keyboard alternative
- `onClick` on non-interactive elements

**Fix Patterns**:
- Use `<button>` or `<a>` for interactive elements
- Add `onKeyDown`/`onKeyUp` handlers
- Implement keyboard alternatives for mouse-only actions
- Add `tabIndex="0"` to custom interactive elements

**Severity**: Critical

---

### 2.1.2 No Keyboard Trap (Level A)

**Description**: Keyboard focus can be moved away from any component.

**Common Violations**:
- Modal dialogs that trap focus without escape
- Custom widgets that capture keyboard
- Infinite focus loops

**Fix Patterns**:
- Allow Escape key to close modals
- Ensure focus can leave all components
- Test keyboard navigation thoroughly

**Severity**: Critical

---

### 2.1.4 Character Key Shortcuts (Level A)

**Description**: Single character key shortcuts can be turned off, remapped, or are only active on focus.

**Common Violations**:
- Global single-key shortcuts (e.g., "s" for search)
- Shortcuts interfering with speech input

**Fix Patterns**:
- Use modifier keys (Ctrl+S, not just S)
- Allow disabling shortcuts
- Limit shortcuts to when component is focused

**Severity**: Moderate

---

### 2.2.1 Timing Adjustable (Level A)

**Description**: Time limits can be turned off, adjusted, or extended.

**Common Violations**:
- Session timeouts without warning
- Auto-advancing carousels
- Timed quizzes without extensions

**Fix Patterns**:
- Warn before timeout with option to extend
- Provide controls to pause auto-advancing content
- Allow disabling time limits

**Severity**: Serious

---

### 2.2.2 Pause, Stop, Hide (Level A)

**Description**: Moving, blinking, scrolling, or auto-updating content can be paused, stopped, or hidden.

**Common Violations**:
- Auto-playing carousels without pause
- Animated backgrounds
- Live feeds without pause option

**Fix Patterns**:
- Add pause/stop controls
- Respect `prefers-reduced-motion`
- Don't autoplay animations

**Severity**: Serious

---

### 2.3.1 Three Flashes or Below Threshold (Level A)

**Description**: Pages don't contain anything that flashes more than three times per second.

**Common Violations**:
- Rapid animations
- Flashing alerts/notifications
- Video content with flashing

**Fix Patterns**:
- Limit flash rate
- Provide warnings for flashing content
- Respect `prefers-reduced-motion`

**Severity**: Critical (seizure risk)

---

### 2.4.1 Bypass Blocks (Level A)

**Description**: Mechanism to bypass repeated blocks of content.

**Common Violations**:
- No skip link to main content
- No landmark regions
- Repeated navigation without bypass

**Fix Patterns**:
- Add "Skip to main content" link
- Use landmark roles (`<main>`, `<nav>`, `<header>`)
- Implement proper heading structure

**Severity**: Serious

---

### 2.4.2 Page Titled (Level A)

**Description**: Pages have titles that describe topic or purpose.

**Common Violations**:
- Generic titles ("Page", "Untitled")
- Same title on all pages
- Missing `<title>` element

**Fix Patterns**:
- Use descriptive, unique page titles
- Update title on route changes in SPAs
- Include site name and page-specific content

**Severity**: Moderate

---

### 2.4.3 Focus Order (Level A)

**Description**: Focusable components receive focus in order that preserves meaning and operability.

**Common Violations**:
- Positive `tabindex` values disrupting order
- Modal content not receiving focus
- Visual order doesn't match DOM order

**Fix Patterns**:
- Use `tabindex="0"` or `tabindex="-1"`, avoid positive values
- Manage focus when opening/closing modals
- Ensure DOM order matches visual order

**Severity**: Serious

---

### 2.4.4 Link Purpose (In Context) (Level A)

**Description**: Link purpose can be determined from link text alone, or from link text combined with programmatically determinable context.

**Common Violations**:
- "Click here" or "Read more" links without programmatic context
- Links with same text going to different destinations
- Icon-only links without accessible names

**Fix Patterns**:
- Use descriptive link text (preferred)
- Add `aria-label` for icon links
- Use `aria-describedby` to reference contextual text
- Place link within a heading, list item, or table cell that provides context
- Use `aria-labelledby` to combine multiple text sources

**Programmatic Context**: Context that satisfies this criterion includes:
- Text in the same sentence, paragraph, list item, or table cell
- Text in a parent list item
- Text in a table header cell associated with the link's cell
- Text provided via `aria-describedby` or `aria-labelledby`

**Severity**: Moderate

**Note**: Claude can flag generic link text but cannot fully determine if surrounding programmatic context provides sufficient meaning.

---

### 2.4.5 Multiple Ways (Level AA)

**Description**: More than one way to locate a page (except for process steps).

**Common Violations**:
- No search functionality
- No sitemap
- Single navigation path only

**Fix Patterns**:
- Provide search
- Include sitemap
- Use consistent navigation and related links

**Severity**: Minor

---

### 2.4.6 Headings and Labels (Level AA)

**Description**: Headings and labels describe topic or purpose.

**Common Violations**:
- Vague headings ("Section 1")
- Form labels that don't describe input
- Missing headings for content sections

**Fix Patterns**:
- Use descriptive headings
- Label forms clearly
- Maintain logical heading hierarchy

**Severity**: Moderate

**Note**: Claude can flag missing or potentially vague headings but cannot fully evaluate descriptiveness in context.

---

### 2.4.7 Focus Visible (Level AA)

**Description**: Keyboard focus indicator is visible.

**Common Violations**:
- `outline: none` without replacement
- Focus styles removed for aesthetics
- Low contrast focus indicators

**Fix Patterns**:
- Never remove focus styles without replacement
- Use `:focus-visible` for keyboard-only styles
- Ensure 3:1 contrast for focus indicators

**Severity**: Serious

---

### 2.5.1 Pointer Gestures (Level A)

**Description**: Multipoint or path-based gestures have single-pointer alternatives.

**Common Violations**:
- Pinch-to-zoom only
- Swipe-only navigation
- Drawing gestures without alternatives

**Fix Patterns**:
- Provide button alternatives for gestures
- Add zoom controls alongside pinch
- Support single-click alternatives

**Severity**: Serious

---

### 2.5.2 Pointer Cancellation (Level A)

**Description**: Functions triggered by pointer can be aborted or undone.

**Common Violations**:
- Actions on mousedown instead of click
- No way to cancel accidental activations

**Fix Patterns**:
- Trigger on `mouseup`/`click`, not `mousedown`
- Allow dragging away to cancel
- Provide undo for destructive actions

**Severity**: Moderate

---

### 2.5.3 Label in Name (Level A)

**Description**: Accessible name contains visible text label.

**Common Violations**:
- `aria-label` doesn't include visible text
- Accessible name completely different from visual label

**Fix Patterns**:
- Ensure `aria-label` starts with or contains visible text
- Don't use completely different accessible names

**Severity**: Serious

---

### 2.5.4 Motion Actuation (Level A)

**Description**: Motion-triggered functions can be disabled and have UI alternatives.

**Common Violations**:
- Shake to undo without alternative
- Tilt controls without buttons

**Fix Patterns**:
- Provide button alternatives
- Allow disabling motion features

**Severity**: Moderate

---

## 3. Understandable

Information and operation of user interface must be understandable.

### 3.1.1 Language of Page (Level A)

**Description**: Default language of page can be programmatically determined.

**Common Violations**:
- Missing `lang` attribute on `<html>`
- Incorrect language code

**Fix Patterns**:
- Add `<html lang="en">` (or appropriate code)
- Use correct BCP 47 language tags

**Severity**: Serious

---

### 3.1.2 Language of Parts (Level AA)

**Description**: Language of passages or phrases can be programmatically determined.

**Common Violations**:
- Foreign language text not marked
- Inline quotes in different language

**Fix Patterns**:
- Use `lang` attribute on elements with different language
- `<span lang="fr">Bonjour</span>`

**Severity**: Minor

---

### 3.2.1 On Focus (Level A)

**Description**: Receiving focus doesn't trigger unexpected context change.

**Common Violations**:
- Auto-submitting on focus
- Navigation on focus
- Modal opening on focus

**Fix Patterns**:
- Require explicit activation (click/enter)
- Don't change context on focus alone

**Severity**: Serious

---

### 3.2.2 On Input (Level A)

**Description**: Changing input doesn't automatically cause context change unless user is advised.

**Common Violations**:
- Auto-submitting on selection
- Auto-navigation on dropdown change
- Form submission on checkbox change

**Fix Patterns**:
- Require explicit submit action
- Warn users if input causes navigation
- Use separate submit button

**Severity**: Serious

---

### 3.2.3 Consistent Navigation (Level AA)

**Description**: Navigation mechanisms are consistent across pages.

**Common Violations**:
- Navigation order changes between pages
- Different navigation patterns on different pages

**Fix Patterns**:
- Keep navigation in same order
- Use consistent navigation patterns

**Severity**: Moderate

---

### 3.2.4 Consistent Identification (Level AA)

**Description**: Components with same functionality are identified consistently.

**Common Violations**:
- Search icon labeled differently on different pages
- Submit buttons with varying labels

**Fix Patterns**:
- Use same labels for same functions
- Maintain consistent iconography

**Severity**: Moderate

---

### 3.3.1 Error Identification (Level A)

**Description**: Input errors are automatically detected and described in text.

**Common Violations**:
- Errors indicated only by color
- Generic error messages
- Errors not associated with fields

**Fix Patterns**:
- Use text error messages
- Associate errors with fields via `aria-describedby`
- Use `aria-invalid="true"` on error fields

**Severity**: Serious

---

### 3.3.2 Labels or Instructions (Level A)

**Description**: Labels or instructions are provided for user input.

**Common Violations**:
- Placeholder-only labels
- Missing format instructions
- Required fields not indicated

**Fix Patterns**:
- Use visible `<label>` elements
- Provide format hints (e.g., "MM/DD/YYYY")
- Indicate required fields

**Severity**: Serious

---

### 3.3.3 Error Suggestion (Level AA)

**Description**: If error is detected and suggestions known, they are provided.

**Common Violations**:
- "Invalid input" without guidance
- Not suggesting correct format
- Not offering valid options

**Fix Patterns**:
- Provide specific error messages
- Suggest correct format
- Offer valid alternatives when possible

**Severity**: Moderate

---

### 3.3.4 Error Prevention (Legal, Financial, Data) (Level AA)

**Description**: For legal/financial/data submissions: reversible, verified, or confirmed.

**Common Violations**:
- No confirmation for important actions
- No review step before submission
- No undo capability

**Fix Patterns**:
- Add confirmation dialogs
- Provide review step
- Allow editing before final submission

**Severity**: Serious

---

## 4. Robust

Content must be robust enough to be interpreted by a wide variety of user agents.

### 4.1.1 Parsing (Level A)

**Description**: Markup has complete start/end tags, no duplicate attributes, unique IDs.

**Common Violations**:
- Duplicate `id` attributes
- Malformed HTML
- Missing closing tags

**Fix Patterns**:
- Validate HTML
- Ensure unique IDs
- Use linting tools

**Severity**: Minor

**Note**: This criterion was **deprecated in WCAG 2.2** because modern browsers and assistive technologies now handle HTML parsing errors gracefully. However, duplicate IDs can still cause issues with ARIA relationships (aria-labelledby, aria-describedby) and should be avoided. Malformed HTML is typically caught by linters and build tools.

---

### 4.1.2 Name, Role, Value (Level A)

**Description**: UI components have accessible name, role, and state that can be programmatically determined.

**Common Violations**:
- Custom controls without ARIA
- Missing button labels
- State changes not announced
- `<div>` or `<span>` used for interactive elements

**Fix Patterns**:
- Use semantic HTML elements
- Add `aria-label` or `aria-labelledby`
- Use appropriate ARIA roles
- Communicate state with `aria-expanded`, `aria-pressed`, etc.

**Severity**: Critical

---

### 4.1.3 Status Messages (Level AA)

**Description**: Status messages can be programmatically determined without receiving focus.

**Common Violations**:
- Success/error messages not announced
- Loading states not communicated
- Search results count not announced

**Fix Patterns**:
- Use `role="status"` for non-critical updates
- Use `role="alert"` for important messages
- Use `aria-live` regions appropriately

**Severity**: Serious

---

## Quick Reference: Severity by Criterion

| Criterion | Typical Severity |
|-----------|-----------------|
| 1.1.1 | Critical/Moderate |
| 1.2.1 | Serious |
| 1.2.2 | Critical |
| 1.2.3 | Serious |
| 1.2.4 | Serious |
| 1.2.5 | Moderate |
| 1.3.1 | Serious |
| 1.4.1 | Serious |
| 1.4.3 | Serious |
| 2.1.1 | Critical |
| 2.1.2 | Critical |
| 2.4.1 | Serious |
| 2.4.3 | Serious |
| 2.4.7 | Serious |
| 3.3.1 | Serious |
| 3.3.2 | Serious |
| 4.1.1 | Minor (deprecated in 2.2) |
| 4.1.2 | Critical |
| 4.1.3 | Serious |
