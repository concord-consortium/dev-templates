---
framework: "react"
last_updated: "2025-01"
---

# React Accessibility Patterns

React-specific accessibility patterns grouped by component type. Each pattern includes the problem, solution, and testing guidance.

---

## Forms

### Text Input with Label

**Problem**: Input lacks programmatic label association.

**Detection**:
- `<input>` without associated `<label>`
- `<input>` without `aria-label` or `aria-labelledby`
- Placeholder used as only label

**Solution**:
```jsx
// Preferred: explicit label association
<label htmlFor="email">Email address</label>
<input id="email" type="email" />

// Alternative: wrapping label
<label>
  Email address
  <input type="email" />
</label>

// For icon inputs or space-constrained UI
<input type="search" aria-label="Search products" />

// Using external label
<span id="email-label">Email address</span>
<input aria-labelledby="email-label" type="email" />
```

**Testing**: Verify label is announced by screen reader on focus.

**WCAG**: 1.3.1, 4.1.2

---

### Form Validation Errors

**Problem**: Errors not announced to screen readers or not associated with fields.

**Detection**:
- Error messages not linked to inputs
- Errors shown only with color
- No `aria-invalid` on error fields

**Solution**:
```jsx
const [error, setError] = useState("");

<div>
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
</div>
```

**Testing**: Submit invalid form, verify error is announced and field is identified.

**WCAG**: 1.3.1, 3.3.1, 3.3.2, 4.1.2

---

### Required Fields

**Problem**: Required fields not programmatically indicated.

**Detection**:
- Required indicated only by asterisk or color
- Missing `required` or `aria-required` attribute

**Solution**:
```jsx
<label htmlFor="name">
  Name <span aria-hidden="true">*</span>
</label>
<input id="name" type="text" required />

// Or with aria-required for custom validation
<input id="name" type="text" aria-required="true" />

// Include legend for form
<p id="required-hint">Fields marked with * are required</p>
```

**Testing**: Verify screen reader announces "required" on focus.

**WCAG**: 1.3.1, 3.3.2

---

### Form Field Groups

**Problem**: Related fields (radio buttons, checkboxes) not grouped.

**Detection**:
- Radio/checkbox groups without `<fieldset>`
- Missing `<legend>` for field groups

**Solution**:
```jsx
<fieldset>
  <legend>Notification preferences</legend>

  <label>
    <input type="checkbox" name="notify" value="email" />
    Email notifications
  </label>

  <label>
    <input type="checkbox" name="notify" value="sms" />
    SMS notifications
  </label>
</fieldset>
```

**Testing**: Verify legend is announced when entering group.

**WCAG**: 1.3.1

---

### Select/Dropdown

**Problem**: Select element lacks label or uses inaccessible custom dropdown.

**Detection**:
- `<select>` without associated label
- Custom dropdown without ARIA

**Solution**:
```jsx
// Native select (preferred)
<label htmlFor="country">Country</label>
<select id="country">
  <option value="">Select a country</option>
  <option value="us">United States</option>
  <option value="ca">Canada</option>
</select>

// Custom dropdown (requires extensive ARIA)
<div>
  <label id="country-label">Country</label>
  <button
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    aria-labelledby="country-label"
  >
    {selectedValue || "Select a country"}
  </button>
  {isOpen && (
    <ul role="listbox" aria-labelledby="country-label">
      <li role="option" aria-selected={selected === "us"}>
        United States
      </li>
    </ul>
  )}
</div>
```

**Testing**: Navigate with keyboard, verify options announced.

**WCAG**: 1.3.1, 4.1.2

---

## Buttons and Interactive Elements

### Button vs Link

**Problem**: Using wrong element for interaction type.

**Detection**:
- `<a>` without `href` used as button
- `<button>` used for navigation
- `<div>` or `<span>` with click handlers

**Solution**:
```jsx
// Use button for actions
<button onClick={handleSave}>Save</button>

// Use link for navigation
<a href="/settings">Settings</a>

// Link styled as button is OK for navigation
<a href="/signup" className="button">Sign up</a>

// NEVER do this
<div onClick={handleClick}>Click me</div>  // ❌
<span onClick={handleClick}>Click me</span>  // ❌
<a onClick={handleClick}>Click me</a>  // ❌ (missing href)
```

**Testing**: Tab to element, verify role announced correctly.

**WCAG**: 4.1.2

---

### Icon Buttons

**Problem**: Button with icon only lacks accessible name.

**Detection**:
- `<button>` containing only `<svg>` or `<img>`
- Icon button without `aria-label`

**Solution**:
```jsx
// With aria-label
<button aria-label="Close dialog" onClick={handleClose}>
  <CloseIcon aria-hidden="true" />
</button>

// With visually hidden text
<button onClick={handleClose}>
  <CloseIcon aria-hidden="true" />
  <span className="visually-hidden">Close dialog</span>
</button>

// Visually hidden class (add to CSS)
// .visually-hidden {
//   position: absolute;
//   width: 1px;
//   height: 1px;
//   padding: 0;
//   margin: -1px;
//   overflow: hidden;
//   clip: rect(0, 0, 0, 0);
//   border: 0;
// }
```

**Testing**: Focus button, verify meaningful name is announced.

**WCAG**: 1.1.1, 4.1.2

---

### Toggle Buttons

**Problem**: Toggle state not communicated to assistive technology.

**Detection**:
- Toggle button without `aria-pressed`
- State indicated only visually

**Solution**:
```jsx
const [isEnabled, setIsEnabled] = useState(false);

<button
  aria-pressed={isEnabled}
  onClick={() => setIsEnabled(!isEnabled)}
>
  Dark mode
</button>

// For toggle switches
<button
  role="switch"
  aria-checked={isEnabled}
  onClick={() => setIsEnabled(!isEnabled)}
>
  Dark mode
</button>
```

**Testing**: Activate toggle, verify state change is announced.

**WCAG**: 4.1.2

---

### Disabled Buttons

**Problem**: Disabled state not communicated or button not focusable.

**Detection**:
- Disabled styling without `disabled` attribute
- Using `aria-disabled` without preventing action

**Solution**:
```jsx
// Native disabled (removes from tab order)
<button disabled onClick={handleSubmit}>
  Submit
</button>

// aria-disabled (keeps in tab order - often better for UX)
// IMPORTANT: Must prevent both click AND keyboard activation
<button
  aria-disabled={!isValid}
  onClick={isValid ? handleSubmit : undefined}
  onKeyDown={(e) => {
    if (!isValid && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
    }
  }}
>
  Submit
</button>

// With explanation for why disabled
<button
  aria-disabled={!isValid}
  aria-describedby="submit-help"
  onClick={isValid ? handleSubmit : undefined}
  onKeyDown={(e) => {
    if (!isValid && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
    }
  }}
>
  Submit
</button>
<p id="submit-help" className="hint">
  {!isValid ? "Complete all required fields to submit" : ""}
</p>
```

**Testing**: Verify disabled state is announced and button is not activatable via click or keyboard.

**WCAG**: 4.1.2

---

## Modals and Dialogs

### Focus Management

**Problem**: Focus not moved to modal or trapped within it.

**Detection**:
- Modal opens but focus stays behind
- Tab key moves focus outside modal
- No focus trap implementation

**Solution**:
```jsx
const modalRef = useRef(null);
const previousFocusRef = useRef(null);

useEffect(() => {
  if (isOpen) {
    // Store current focus
    previousFocusRef.current = document.activeElement;
    // Move focus to modal
    modalRef.current?.focus();
  } else {
    // Return focus when closing
    previousFocusRef.current?.focus();
  }
}, [isOpen]);

// Handle keyboard events including focus trap
const handleKeyDown = (e) => {
  if (e.key === "Escape") {
    onClose();
    return;
  }

  // Focus trap implementation
  if (e.key === "Tab") {
    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements?.[0];
    const lastElement = focusableElements?.[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement?.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement?.focus();
    }
  }
};

<div
  ref={modalRef}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabIndex={-1}
  onKeyDown={handleKeyDown}
>
  <h2 id="modal-title">Dialog Title</h2>
  {/* Modal content */}
  <button onClick={onClose}>Close</button>
</div>
```

**Testing**: Open modal, verify focus moves in, Tab stays trapped, Escape closes.

**WCAG**: 2.1.2, 2.4.3

---

### Modal Backdrop

**Problem**: Background content still interactive when modal is open.

**Detection**:
- Can tab to elements behind modal
- Background content not marked inert

**Solution**:
```jsx
// Use inert attribute on background content
useEffect(() => {
  const mainContent = document.getElementById("main");
  if (isOpen) {
    mainContent?.setAttribute("inert", "");
  } else {
    mainContent?.removeAttribute("inert");
  }
}, [isOpen]);

// Or use aria-hidden (less robust)
<main id="main" aria-hidden={isOpen}>
  {/* Page content */}
</main>

// Modal portal renders outside main
{isOpen && createPortal(<Modal />, document.body)}
```

**Testing**: With modal open, verify background elements are not focusable.

**WCAG**: 2.1.2

---

### Alert Dialogs

**Problem**: Urgent dialog not announced immediately.

**Detection**:
- Confirmation dialogs without `role="alertdialog"`
- Critical messages not using alert role

**Solution**:
```jsx
<div
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="alert-title"
  aria-describedby="alert-desc"
>
  <h2 id="alert-title">Confirm deletion</h2>
  <p id="alert-desc">
    Are you sure you want to delete this item? This cannot be undone.
  </p>
  <button onClick={onConfirm}>Delete</button>
  <button onClick={onCancel}>Cancel</button>
</div>
```

**Testing**: Open dialog, verify it's announced immediately.

**WCAG**: 4.1.2

---

## Navigation

### Skip Links

**Problem**: No way to bypass repeated navigation.

**Detection**:
- Missing skip link at page start
- Skip link not visible on focus

**Solution**:
```jsx
// At top of page
<a href="#main-content" className="skip-link">
  Skip to main content
</a>

<nav>{/* Navigation */}</nav>

<main id="main-content" tabIndex={-1}>
  {/* Main content */}
</main>

// CSS for skip link
// .skip-link {
//   position: absolute;
//   left: -9999px;
// }
// .skip-link:focus {
//   position: static;
//   left: auto;
// }
```

**Testing**: Tab on page load, verify skip link appears and works.

**WCAG**: 2.4.1

---

### Landmark Regions

**Problem**: Page lacks landmark regions for navigation.

**Detection**:
- Missing `<main>`, `<nav>`, `<header>`, `<footer>`
- Multiple unlabeled landmarks of same type

**Solution**:
```jsx
<header>
  <nav aria-label="Main navigation">
    {/* Primary nav */}
  </nav>
</header>

<main>
  {/* Page content */}
</main>

<aside aria-label="Related articles">
  {/* Sidebar */}
</aside>

<footer>
  <nav aria-label="Footer navigation">
    {/* Footer nav */}
  </nav>
</footer>
```

**Testing**: Use screen reader landmarks navigation, verify all regions accessible.

**WCAG**: 1.3.1, 2.4.1

---

### Current Page Indication

**Problem**: Current page not indicated in navigation.

**Detection**:
- Active nav item indicated only visually
- Missing `aria-current` attribute

**Solution**:
```jsx
<nav>
  <a href="/" aria-current={isHome ? "page" : undefined}>
    Home
  </a>
  <a href="/about" aria-current={isAbout ? "page" : undefined}>
    About
  </a>
  <a href="/contact" aria-current={isContact ? "page" : undefined}>
    Contact
  </a>
</nav>
```

**Testing**: Navigate to page, verify "current page" is announced on nav item.

**WCAG**: 2.4.4

---

### Breadcrumbs

**Problem**: Breadcrumbs lack proper structure and labeling.

**Detection**:
- Breadcrumbs without `<nav>` wrapper
- Missing `aria-label` on breadcrumb nav
- Current page not indicated

**Solution**:
```jsx
<nav aria-label="Breadcrumb">
  <ol>
    <li>
      <a href="/">Home</a>
    </li>
    <li>
      <a href="/products">Products</a>
    </li>
    <li>
      <a href="/products/widgets" aria-current="page">
        Widgets
      </a>
    </li>
  </ol>
</nav>
```

**Testing**: Verify breadcrumb navigation is distinct from main nav.

**WCAG**: 1.3.1, 2.4.4

---

## Images and Media

### Informative Images

**Problem**: Image conveying information lacks alternative text.

**Detection**:
- `<img>` without `alt` attribute
- Empty `alt` on informative image

**Solution**:
```jsx
// Informative image
<img src="chart.png" alt="Sales increased 25% from Q1 to Q2" />

// Image with complex info
<figure>
  <img
    src="diagram.png"
    alt="System architecture diagram"
    aria-describedby="diagram-desc"
  />
  <figcaption id="diagram-desc">
    The system consists of three layers: presentation, business logic,
    and data access. [Full description...]
  </figcaption>
</figure>
```

**Testing**: Disable images or use screen reader, verify meaning is conveyed.

**WCAG**: 1.1.1

---

### Decorative Images

**Problem**: Decorative image announced unnecessarily.

**Detection**:
- Decorative image with descriptive alt text
- Background image patterns in `<img>` tags

**Solution**:
```jsx
// Empty alt for decorative images
<img src="decorative-divider.png" alt="" />

// Or use role="presentation"
<img src="decorative-divider.png" alt="" role="presentation" />

// Better: use CSS for purely decorative images
<div className="decorative-background" />
```

**Testing**: Use screen reader, verify decorative images are not announced.

**WCAG**: 1.1.1

---

### SVG Icons

**Problem**: SVG icon lacks accessible name or is announced unnecessarily.

**Detection**:
- Inline SVG without `aria-hidden` or accessible name
- SVG icon in button without button label

**Solution**:
```jsx
// Decorative SVG (hidden from AT)
<svg aria-hidden="true" focusable="false">
  <use href="#icon-star" />
</svg>

// Informative standalone SVG
<svg role="img" aria-label="5 star rating">
  <use href="#icon-star" />
</svg>

// SVG in button (hide SVG, label button)
<button aria-label="Add to favorites">
  <svg aria-hidden="true" focusable="false">
    <use href="#icon-heart" />
  </svg>
</button>
```

**Testing**: Verify icons are either hidden or have meaningful names.

**WCAG**: 1.1.1, 4.1.2

---

### Iframes

**Problem**: Iframe lacks descriptive title for screen readers.

**Detection**:
- `<iframe>` without `title` attribute
- Empty or generic title ("iframe", "embedded content")

**Solution**:
```jsx
// Basic iframe with title
<iframe
  src="https://www.youtube.com/embed/abc123"
  title="Introduction to React Hooks tutorial video"
/>

// Map embed
<iframe
  src="https://maps.google.com/..."
  title="Map showing office location at 123 Main Street"
/>

// Form embed
<iframe
  src="/contact-form"
  title="Contact us form"
  aria-describedby="iframe-help"
/>
<p id="iframe-help">
  Fill out this form to send us a message.
</p>

// Hidden/technical iframe (tracking, etc.)
<iframe
  src="/analytics"
  title="Analytics tracking"
  aria-hidden="true"
  style={{ display: 'none' }}
/>
```

**Edge Cases**:
- Multiple iframes need unique, descriptive titles
- Dynamic content in iframes should update title when content changes
- Consider `loading="lazy"` for performance on below-fold iframes

**Testing**: Use screen reader to verify iframe purpose is announced.

**WCAG**: 2.4.1, 4.1.2

---

## Dynamic Content

### Live Regions

**Problem**: Dynamic content updates not announced.

**Detection**:
- Content changes without `aria-live`
- Toast notifications not announced
- Loading states silent

**Solution**:
```jsx
// Status updates (polite)
<div role="status" aria-live="polite">
  {statusMessage}
</div>

// Important alerts (assertive)
<div role="alert" aria-live="assertive">
  {errorMessage}
</div>

// Search results count
<p role="status" aria-live="polite" aria-atomic="true">
  {results.length} results found
</p>

// Loading state
<div role="status" aria-live="polite">
  {isLoading ? "Loading..." : ""}
</div>
```

**Testing**: Trigger update, verify announcement without focus change.

**WCAG**: 4.1.3

---

### Loading States

**Problem**: Loading state not communicated to assistive technology.

**Detection**:
- Spinner without text alternative
- Loading state only visual

**Solution**:
```jsx
// Loading button
<button disabled={isLoading} aria-busy={isLoading}>
  {isLoading ? (
    <>
      <Spinner aria-hidden="true" />
      <span className="visually-hidden">Loading</span>
    </>
  ) : (
    "Submit"
  )}
</button>

// Loading region
<section aria-busy={isLoading} aria-live="polite">
  {isLoading ? <LoadingSpinner /> : <Content />}
</section>
```

**Testing**: Trigger loading, verify state is announced.

**WCAG**: 4.1.3

---

### Expandable Content

**Problem**: Expand/collapse state not communicated.

**Detection**:
- Accordion without `aria-expanded`
- Show/hide without state indication

**Solution**:
```jsx
const [isExpanded, setIsExpanded] = useState(false);

<div>
  <button
    aria-expanded={isExpanded}
    aria-controls="content-panel"
    onClick={() => setIsExpanded(!isExpanded)}
  >
    Show details
  </button>
  <div id="content-panel" hidden={!isExpanded}>
    {/* Expandable content */}
  </div>
</div>
```

**Testing**: Activate control, verify "expanded"/"collapsed" announced.

**WCAG**: 4.1.2

---

## Tables

### Data Tables

**Problem**: Table lacks proper headers and structure.

**Detection**:
- `<table>` without `<th>` elements
- Header cells without `scope` attribute
- Missing table caption

**Solution**:
```jsx
<table>
  <caption>Quarterly sales by region</caption>
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col">Q1</th>
      <th scope="col">Q2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">North</th>
      <td>$10,000</td>
      <td>$12,000</td>
    </tr>
  </tbody>
</table>
```

**Testing**: Navigate table with screen reader, verify headers announced with data.

**WCAG**: 1.3.1

---

### Layout Tables

**Problem**: Layout table exposes table semantics unnecessarily.

**Detection**:
- `<table>` used for layout (not data)
- CSS alternative possible

**Solution**:
```jsx
// Preferred: use CSS Grid or Flexbox instead

// If table must be used for layout
<table role="presentation">
  <tr>
    <td>{/* Layout content */}</td>
    <td>{/* Layout content */}</td>
  </tr>
</table>
```

**Testing**: Verify layout is not announced as table.

**WCAG**: 1.3.1

---

## Focus Management

### Focus Indicators

**Problem**: Focus indicator missing or insufficient.

**Detection**:
- `outline: none` or `outline: 0` without replacement
- Focus indicator low contrast
- No `:focus` or `:focus-visible` styles

**Solution**:
```css
/* Never do this without replacement */
*:focus {
  outline: none; /* ❌ */
}

/* Good: enhanced focus styles */
:focus {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}

/* Better: keyboard-only focus styles */
:focus:not(:focus-visible) {
  outline: none;
}

:focus-visible {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}
```

**Testing**: Tab through page, verify all focusable elements have visible indicator.

**WCAG**: 2.4.7

---

### Programmatic Focus

**Problem**: Focus not managed after dynamic changes.

**Detection**:
- New content added without focus management
- Deleted content leaves focus in limbo
- Route changes don't move focus

**Solution**:
```jsx
// After adding new content
const newItemRef = useRef(null);
useEffect(() => {
  if (showNewItem) {
    newItemRef.current?.focus();
  }
}, [showNewItem]);

// After deleting
const handleDelete = (index) => {
  deleteItem(index);
  // Move focus to next item or container
  listRef.current?.focus();
};

// After route change
useEffect(() => {
  document.getElementById("main")?.focus();
}, [location.pathname]);
```

**Testing**: Perform action, verify focus moves to logical location.

**WCAG**: 2.4.3

---

## Headings

### Heading Hierarchy

**Problem**: Heading levels skipped or used for styling.

**Detection**:
- Jumping from `<h1>` to `<h3>`
- Heading levels not hierarchical
- `<h1>` used multiple times for styling

**Solution**:
```jsx
<h1>Page Title</h1>
  <h2>Section A</h2>
    <h3>Subsection A.1</h3>
    <h3>Subsection A.2</h3>
  <h2>Section B</h2>
    <h3>Subsection B.1</h3>

// Use CSS for styling, not heading levels
<h2 className="large-heading">Section</h2>
<h3 className="large-heading">Subsection</h3>
```

**Testing**: Use heading navigation, verify logical structure.

**WCAG**: 1.3.1, 2.4.6

---

### Single Page Apps

**Problem**: SPA route changes don't announce new page.

**Detection**:
- No page title update on navigation
- Focus doesn't move on route change
- No announcement of new content

**Solution**:
```jsx
// Update document title
useEffect(() => {
  document.title = `${pageTitle} | Site Name`;
}, [pageTitle]);

// Announce route changes
<div role="status" aria-live="polite" className="visually-hidden">
  {`Navigated to ${pageTitle}`}
</div>

// Move focus to main content
useEffect(() => {
  const main = document.querySelector("main");
  main?.setAttribute("tabindex", "-1");
  main?.focus();
}, [location.pathname]);
```

**React Router Integration**:
```jsx
import { useLocation } from "react-router-dom";

function RouteAnnouncer() {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Get page title from route or document
    const pageTitle = document.title.split(" | ")[0];
    setAnnouncement(`Navigated to ${pageTitle}`);

    // Focus main content
    const main = document.querySelector("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus();
      // Remove tabindex after focus to prevent outline on click
      main.addEventListener("blur", () => main.removeAttribute("tabindex"), {
        once: true,
      });
    }
  }, [location.pathname]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="visually-hidden"
    >
      {announcement}
    </div>
  );
}

// Use in App.jsx
function App() {
  return (
    <BrowserRouter>
      <RouteAnnouncer />
      <Routes>{/* ... */}</Routes>
    </BrowserRouter>
  );
}
```

**Testing**: Navigate via SPA, verify new page is announced.

**WCAG**: 2.4.2, 4.1.3

---

## Complex Components

### Tabs

**Problem**: Tab interface lacks proper ARIA roles and keyboard navigation.

**Detection**:
- Tabs without `role="tablist"`, `role="tab"`, `role="tabpanel"`
- Missing `aria-selected` state
- No keyboard navigation (arrow keys)

**Solution**:
```jsx
function Tabs({ tabs, defaultTab = 0 }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const tabRefs = useRef([]);

  const handleKeyDown = (e, index) => {
    let newIndex = index;

    switch (e.key) {
      case "ArrowLeft":
        newIndex = index === 0 ? tabs.length - 1 : index - 1;
        break;
      case "ArrowRight":
        newIndex = index === tabs.length - 1 ? 0 : index + 1;
        break;
      case "Home":
        newIndex = 0;
        break;
      case "End":
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    setActiveTab(newIndex);
    tabRefs.current[newIndex]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Account settings">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => (tabRefs.current[index] = el)}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === index}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === index ? 0 : -1}
            onClick={() => setActiveTab(index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== index}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
```

**Keyboard Behavior**:
- `Tab`: Moves into tab list, then to active panel
- `Arrow Left/Right`: Navigate between tabs
- `Home/End`: First/last tab
- `Enter/Space`: Activate tab (optional - can activate on focus)

**Testing**: Navigate with keyboard only, verify all tabs reachable and panel changes announced.

**WCAG**: 1.3.1, 2.1.1, 4.1.2

---

### Tooltips

**Problem**: Tooltip not accessible to keyboard users or screen readers.

**Detection**:
- Tooltip appears only on hover
- Tooltip content not announced
- Cannot dismiss tooltip with Escape

**Solution**:
```jsx
function Tooltip({ children, content, id }) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);

  const show = () => {
    clearTimeout(timeoutRef.current);
    setIsVisible(true);
  };

  const hide = () => {
    // Small delay allows moving to tooltip
    timeoutRef.current = setTimeout(() => setIsVisible(false), 100);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape" && isVisible) {
      setIsVisible(false);
    }
  };

  return (
    <div
      className="tooltip-container"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={handleKeyDown}
    >
      <button
        aria-describedby={isVisible ? id : undefined}
        type="button"
      >
        {children}
      </button>

      {isVisible && (
        <div
          role="tooltip"
          id={id}
          className="tooltip"
          // Allow hovering over tooltip itself
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {content}
        </div>
      )}
    </div>
  );
}

// Usage
<Tooltip id="help-tooltip" content="This field is required for shipping">
  <HelpIcon aria-hidden="true" />
  <span className="visually-hidden">Help</span>
</Tooltip>
```

**WCAG 1.4.13 Requirements**:
- Dismissible: Escape key closes tooltip
- Hoverable: Can move mouse to tooltip without it disappearing
- Persistent: Stays visible until user dismisses or moves away

**Testing**: Verify tooltip appears on focus and hover, can be dismissed with Escape.

**WCAG**: 1.4.13, 4.1.2

---

### Combobox/Autocomplete

**Problem**: Autocomplete input lacks proper ARIA for screen readers.

**Detection**:
- Input with dropdown suggestions missing `role="combobox"`
- Suggestions list missing `role="listbox"`
- No `aria-activedescendant` for keyboard navigation

**Solution**:
```jsx
function Autocomplete({ id, label, options, onSelect }) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef(null);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleKeyDown = (e) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setActiveIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case "Enter":
        if (activeIndex >= 0 && filteredOptions[activeIndex]) {
          e.preventDefault();
          selectOption(filteredOptions[activeIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  const selectOption = (option) => {
    setInputValue(option);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect?.(option);
  };

  const activeDescendant =
    activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined;

  return (
    <div className="autocomplete">
      <label htmlFor={id}>{label}</label>
      <div role="combobox" aria-expanded={isOpen} aria-haspopup="listbox">
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-activedescendant={activeDescendant}
        />
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          ref={listRef}
          aria-label={`${label} suggestions`}
        >
          {filteredOptions.map((option, index) => (
            <li
              key={option}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => selectOption(option)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}

      <div role="status" aria-live="polite" className="visually-hidden">
        {isOpen && filteredOptions.length > 0
          ? `${filteredOptions.length} suggestions available`
          : ""}
      </div>
    </div>
  );
}
```

**Keyboard Behavior**:
- `Arrow Down`: Open list / move to next option
- `Arrow Up`: Move to previous option
- `Enter`: Select current option
- `Escape`: Close list

**Testing**: Verify suggestions announced, keyboard navigation works, selection announced.

**WCAG**: 1.3.1, 2.1.1, 4.1.2

---

## Animations

### Reduced Motion

**Problem**: Animations can cause discomfort or harm for users with vestibular disorders.

**Detection**:
- Animations without `prefers-reduced-motion` check
- Auto-playing animations
- Parallax scrolling effects

**Solution**:
```jsx
// Hook to detect reduced motion preference
function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}

// Usage in components
function AnimatedComponent() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <motion.div
      animate={{ x: 100 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.3,
      }}
    >
      Content
    </motion.div>
  );
}

// CSS approach (preferred for simple animations)
// In your stylesheet:
```

```css
/* Base animation */
.animated-element {
  transition: transform 0.3s ease;
}

/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
  .animated-element {
    transition: none;
  }

  /* Or use reduced animation instead of none */
  .fade-in {
    animation: none;
    opacity: 1;
  }
}
```

**What to Disable/Reduce**:
- Parallax scrolling → Remove or make static
- Auto-playing carousels → Pause by default
- Zoom/scale animations → Use opacity fade instead
- Spinning loaders → Use static or pulsing indicator

**What to Keep**:
- Essential animations (loading indicators) → Simplify
- User-triggered animations → Make instant or very short

**Testing**: Enable "Reduce motion" in OS settings, verify animations respect preference.

**WCAG**: 2.3.3

---

## Testing Patterns

### Automated Testing with jest-axe

**Problem**: Accessibility issues not caught during development.

**Solution**:
```jsx
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

describe("Button", () => {
  it("should have no accessibility violations", async () => {
    const { container } = render(
      <button onClick={() => {}}>Click me</button>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("icon button should have accessible name", async () => {
    const { container } = render(
      <button aria-label="Close">
        <CloseIcon aria-hidden="true" />
      </button>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// Test dynamic content
describe("Modal", () => {
  it("should have no violations when open", async () => {
    const { container } = render(<Modal isOpen={true} onClose={() => {}} />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

**Custom axe Rules**:
```jsx
// Disable specific rules if needed (use sparingly)
const results = await axe(container, {
  rules: {
    // Only disable with good reason and comment
    "color-contrast": { enabled: false }, // Tested manually
  },
});
```

**Integration with CI**:
```json
// package.json
{
  "scripts": {
    "test:a11y": "jest --testPathPattern=a11y"
  }
}
```

**Testing**: Run `npm test`, verify all a11y tests pass.

**Note**: Automated testing catches ~30% of issues. Manual testing with screen readers and keyboard-only navigation is still essential.
