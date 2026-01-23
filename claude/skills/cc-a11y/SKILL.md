# cc-a11y: Accessibility Review & Fix Tool

A Claude Code skill for performing accessibility (a11y) reviews and fixes across Concord Consortium repositories.

## Usage

```
/cc-a11y <verb> [options]
```

**Verbs:**
- `review` - Analyze code for accessibility issues
- `fix` - Apply accessibility fixes to identified issues
- `report` - Generate a formal accessibility compliance report

## Verb Routing

Parse the user's command to determine which verb was invoked and route to the appropriate section below.

---

## Branch Safety Check

**IMPORTANT: This check applies to the `fix` verb only.**

Before executing any `fix` operation, you MUST check the current git branch:

```bash
git branch --show-current
```

If the branch is `main` or `master`:
1. Display this warning:
   ```
   ⚠️  Warning: You are on the main/master branch.

   Fixes should be applied on a feature branch to allow for code review.
   Please switch to a feature branch before running fix operations.

   Example:
     git checkout -b a11y-fixes
   ```
2. **Stop execution** - Do not proceed with any fixes
3. Prompt the user to switch branches

The `review` and `report` verbs are read-only operations and can run on any branch.

---

## Verb: review

**Purpose:** Analyze code for accessibility issues.

### Modes

- **File mode** (default): Review current file or selection
- **Git modes**: Review files based on git state (`--staged`, `--changed`, `--branch`, `--commit`)
- **Repo mode**: Full repository audit with `--repo` flag

### Arguments

| Argument | Description |
|----------|-------------|
| (none) | Review current file (or selection if text is selected) |
| `--repo` | Full repository audit |
| `--staged` | Review only staged files |
| `--changed` | Review only modified uncommitted files |
| `--branch` | Review all files changed in current branch vs main/master |
| `--commit <ref>` | Review files changed in a specific commit |
| `--scope <glob>` | Limit to specific paths (e.g., `src/components/**`) |
| `--severity <level>` | Minimum severity to report: `critical`, `serious`, `moderate`, `minor` |
| `--output <path>` | Save report to file (auto-prepends date, appends .md, defaults to a11y/ folder) |
| `--fix` | Automatically fix issues after review |
| `--ignore-file <path>` | Path to ignore file (default: `.a11yignore`) |

---

### File Mode Review (Default)

When no arguments are provided, review the current file or selection.

**Step 1: Identify Target**

1. Check if user has selected text in the IDE
   - If selection exists: Review the smallest complete syntactic unit containing the selection (function, component, or entire file if selection spans multiple units)
   - If no selection: Review the entire current file

2. Validate file type is supported (see Supported File Types below)

**Step 2: Load Ignore Rules**

1. Check for `.a11yignore` file in project root
2. Parse ignore rules (see Ignore File Processing section)
3. Load any ignores applicable to this file

**Step 3: Analyze Code**

For each element in the code, check against WCAG 2.1 AA criteria using these resources:
- [wcag-checklist.md](wcag-checklist.md) - Full criteria reference
- [react-patterns.md](react-patterns.md) - React/JSX-specific patterns
- [common-fixes.md](common-fixes.md) - Detection patterns

**What to Check (prioritized):**

1. **Images & Media**
   - `<img>` without `alt` attribute
   - `<img alt="">` on informative images
   - `<svg>` without accessible name
   - `<iframe>` without `title`
   - `<video>`/`<audio>` without captions reference

2. **Forms**
   - `<input>`, `<select>`, `<textarea>` without associated `<label>`
   - Inputs using placeholder as only label
   - Missing `aria-invalid` and error association
   - Radio/checkbox groups without `<fieldset>`/`<legend>`
   - Missing `autocomplete` on personal data fields

3. **Interactive Elements**
   - `<div>` or `<span>` with `onClick` (should be `<button>`)
   - `<a>` without `href` attribute
   - Icon-only buttons without accessible name
   - Missing `aria-expanded` on toggles/accordions
   - Missing `aria-pressed` on toggle buttons

4. **Keyboard & Focus**
   - `outline: none` or `outline: 0` without replacement
   - Positive `tabindex` values
   - Missing keyboard handlers on custom interactive elements
   - Focus traps without escape

5. **Structure & Semantics**
   - Missing `<main>` landmark
   - Missing or skipped heading levels
   - Missing `lang` attribute on `<html>`
   - Generic link text ("click here", "read more")

6. **Dynamic Content**
   - Status messages without `role="status"` or `aria-live`
   - Modals without `role="dialog"` and focus management
   - Missing loading state announcements

7. **CSS (in .css/.scss files)**
   - `outline: none` without `:focus-visible` replacement
   - Very small font sizes that may indicate contrast issues

**Step 4: Categorize by Severity**

Assign each issue a severity level using the detailed criteria below.

**Step 5: Check Against Ignore Rules**

For each issue found:
1. Check if file is fully ignored → Skip issue
2. Check if file+line is ignored → Skip issue
3. Check if file+WCAG criterion is ignored → Skip issue
4. Check if file+line+WCAG criterion is ignored → Skip issue

**Step 6: Generate Issue IDs**

For each remaining issue, generate a stable ID (see Issue Identifier Generation section).

**Step 7: Format Output**

Generate the report in the standard output format, organized by severity.

---

### Git Mode Review

When a git mode flag is provided (`--staged`, `--changed`, `--branch`, `--commit`), review multiple files based on git state.

**Step 1: Get File List**

Use the appropriate git command based on the mode:

```bash
# --staged: Files staged for commit
git diff --cached --name-only --diff-filter=ACMR

# --changed: Modified files in working directory (not staged)
git diff --name-only --diff-filter=ACMR

# --branch: Files changed in current branch vs main/master
# First, detect the default branch:
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'
# If that fails, try: git remote show origin | grep 'HEAD branch' | cut -d' ' -f5
# Fallback to 'main', then 'master'

# Then get changed files:
git diff origin/<default-branch>...HEAD --name-only --diff-filter=ACMR

# --commit <ref>: Files changed in a specific commit
git diff-tree --no-commit-id --name-only -r <ref>
```

**Step 2: Filter to Supported File Types**

From the file list, keep only files matching: `*.tsx`, `*.jsx`, `*.html`, `*.css`, `*.scss`

```bash
# Example: filter to supported types
echo "$files" | grep -E '\.(tsx|jsx|html|css|scss)$'
```

**Step 3: Apply Scope Filter (if provided)**

If `--scope <glob>` is specified, further filter the file list to match the glob pattern.

**Step 4: Handle Empty File List**

If no files remain after filtering, output:
```markdown
## Accessibility Review
**Date**: [YYYY-MM-DD]
**Mode**: [--staged/--changed/--branch/--commit]

No files to review. No supported files (*.tsx, *.jsx, *.html, *.css, *.scss) found in the specified scope.
```

Exit with code `0` (no issues found).

**Step 5: Review Each File**

For each file in the list:
1. Read the file content
2. Load applicable ignore rules
3. Analyze for accessibility issues (same as File Mode Step 3-6)
4. Collect all issues with file paths

**Step 6: Generate Multi-File Output**

See "Output Format (Multi-File Mode)" section below.

---

### Repo Mode Review

When `--repo` flag is provided, perform a full repository audit.

**Step 1: Discover Files**

Find all supported files in the repository:

```bash
# Find all supported files, respecting .gitignore
git ls-files '*.tsx' '*.jsx' '*.html' '*.css' '*.scss'
```

**Step 2: Apply Scope Filter (if provided)**

If `--scope <glob>` is specified, filter to matching paths only.

Example scope patterns:
- `src/components/**` - All files under src/components
- `src/**/*.tsx` - All TSX files under src
- `{src,lib}/**` - Multiple directories (requires shell quoting)

**Step 3: Process Files**

For each file:
1. Check if file is fully ignored in `.a11yignore`
2. If not ignored, analyze for issues
3. Collect all issues with file paths

**Step 4: Identify Patterns**

After reviewing all files, identify recurring patterns:
- Same issue type appearing in multiple files
- Components with similar violations
- Systemic issues (e.g., all forms missing labels)

**Step 5: Generate Repository Report**

See "Output Format (Multi-File Mode)" and "Output Format (Repository Summary)" sections.

---

### Scope Filtering

The `--scope <glob>` argument limits review to files matching the specified glob pattern.

**Glob Pattern Syntax:**
- `*` - Matches any characters except path separator
- `**` - Matches any characters including path separator (recursive)
- `?` - Matches single character
- `[abc]` - Matches any character in brackets
- `{a,b}` - Matches either pattern (requires shell quoting)

**Examples:**
```bash
--scope "src/components/**"       # All files under src/components
--scope "*.tsx"                   # All TSX files in root
--scope "src/**/*.tsx"            # All TSX files under src
--scope "{src,lib}/**/*.tsx"      # TSX files in src or lib directories
--scope "src/components/forms/*"  # Direct children only
```

**Application:**
1. Get initial file list (from git mode or repo scan)
2. Filter to files where the path matches the glob pattern
3. Continue with filtered list

**Note:** When using `--scope` with special characters (`{`, `*`, etc.), quote the pattern to prevent shell expansion.

---

### Severity Filtering

The `--severity <level>` argument sets the minimum severity to report.

**Severity Hierarchy (highest to lowest):**
1. `critical` - Blocks access completely
2. `serious` - Significant barrier
3. `moderate` - Difficulty with workarounds
4. `minor` - Best practice violations

**Filtering Logic:**
```
function meetsThreshold(issueSeverity, thresholdSeverity):
  severityRank = { critical: 4, serious: 3, moderate: 2, minor: 1 }
  return severityRank[issueSeverity] >= severityRank[thresholdSeverity]
```

**Examples:**
- `--severity critical` - Report only critical issues
- `--severity serious` - Report critical and serious issues
- `--severity moderate` - Report critical, serious, and moderate issues
- `--severity minor` (or no flag) - Report all issues

**Exit Code Impact:**
The exit code is based on whether issues exist at or above the threshold:
- If `--severity serious` and only moderate issues found → Exit `0`
- If `--severity serious` and serious issues found → Exit `1`

---

### Output File Handling

The `--output <path>` argument saves the report to a file with automatic processing.

**Automatic Processing:**
1. **Date prepending**: Current date in ISO 8601 format (YYYY-MM-DD) is prepended to the filename
2. **Extension enforcement**: `.md` extension is automatically appended if not present
3. **Default folder**: If no folder is specified, files are saved to the `a11y/` folder (created if needed)

**Examples:**
```
--output report.md        → a11y/2024-01-15-report.md
--output report           → a11y/2024-01-15-report.md
--output a11y-review      → a11y/2024-01-15-a11y-review.md
--output docs/audit.md    → docs/2024-01-15-audit.md
--output docs/audit       → docs/2024-01-15-audit.md
```

**Behavior:**
1. Parse the path to separate directory and filename
2. If no directory specified, use `a11y/` as the default directory
3. If filename doesn't end with `.md`, append `.md`
4. Prepend date to filename: `[YYYY-MM-DD]-[filename].md`
5. Create the directory if it doesn't exist
6. Write report to the resulting path
7. Display confirmation: `Report saved to: [full-path]`

**Duplicate Handling:**
If a file with the same name already exists, overwrite it. This allows re-running the same command to update the report.

---

### Output Format (Multi-File Mode)

When reviewing multiple files (git modes or `--repo`), group issues by file:

```markdown
## Accessibility Review
**Date**: 2024-01-15
**Mode**: --branch (vs main)
**Files Reviewed**: 5

---

### src/components/LoginForm.tsx

#### Critical Issues (1)
- [ ] **Missing keyboard access** (WCAG 2.1.1) `#a7b2`
  - Line 45: `<div onClick={handleSubmit}>` has no keyboard equivalent
  - Recommendation: Change to `<button>` element

#### Serious Issues (1)
- [ ] **Form input missing label** (WCAG 1.3.1, 4.1.2) `#c3d4`
  - Line 23: `<input type="email">` lacks associated label
  - Recommendation: Add `<label htmlFor="email">` or `aria-label`

---

### src/components/SearchBar.tsx

#### Serious Issues (1)
- [ ] **Icon button missing accessible name** (WCAG 4.1.2) `#e5f6`
  - Line 12: `<button><SearchIcon /></button>` has no text or aria-label
  - Recommendation: Add `aria-label="Search"`

---

### Summary
- **Total issues**: 3
- **By severity**: 1 critical, 2 serious, 0 moderate, 0 minor
- **Files with issues**: 2 of 5
- **Files clean**: 3

### Files Without Issues
- src/components/Header.tsx ✓
- src/components/Footer.tsx ✓
- src/styles/main.css ✓

### Next Steps
Run `/cc-a11y fix --branch` to fix issues, or `/cc-a11y fix --interactive` to review each fix.
```

---

### Output Format (Repository Summary)

For `--repo` mode, include an executive summary and pattern analysis:

```markdown
## Accessibility Audit: [repository-name]
**Date**: 2024-01-15
**Mode**: Full Repository
**Files Analyzed**: 47

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 3     |
| Serious  | 12    |
| Moderate | 8     |
| Minor    | 5     |
| **Total**| **28**|

### Most Common Issues
1. **Missing form labels** (8 occurrences across 5 files)
2. **Focus indicator removed** (6 occurrences across 4 files)
3. **Generic link text** (5 occurrences across 3 files)

### Files Requiring Attention
| File | Critical | Serious | Total |
|------|----------|---------|-------|
| src/components/LoginForm.tsx | 2 | 3 | 7 |
| src/components/DataTable.tsx | 1 | 4 | 8 |
| src/components/Modal.tsx | 0 | 2 | 4 |

---

## Issues by File

[Detailed file-by-file breakdown as in Multi-File Mode format]

---

## Recommendations

1. **Immediate**: Address 3 critical issues blocking keyboard access
2. **Short-term**: Fix form labeling pattern across all form components
3. **Medium-term**: Establish focus style guidelines and apply consistently
4. **Process**: Add `/cc-a11y review --staged` to pre-commit hooks

### Next Steps
- Run `/cc-a11y fix --repo --critical` to fix critical issues first
- Generate formal report with `/cc-a11y report --output compliance.md`
```

---

### Severity Categorization

Use these detailed criteria to assign severity levels:

#### Critical (Blocks Access Completely)

Issues that completely prevent users with disabilities from accessing content or functionality.

**Examples:**
- Interactive element with no keyboard access (div with onClick, no tabIndex/role)
- Button or link with no accessible name (empty, icon-only without aria-label)
- Image conveying critical information with no alt text
- Form that cannot be submitted via keyboard
- Modal that traps focus with no escape
- Video with essential content and no captions

**WCAG Criteria typically Critical:**
- 1.1.1 (functional images)
- 2.1.1 (keyboard access)
- 2.1.2 (no keyboard trap)
- 4.1.2 (name, role, value)
- 1.2.2 (captions for essential video)

#### Serious (Significant Barrier)

Issues that create significant barriers making tasks very difficult but not impossible.

**Examples:**
- Form inputs without labels (can guess from placeholder/context)
- Missing heading structure (navigation difficult)
- Focus indicator removed without replacement
- Error messages not associated with fields
- Missing skip link (must tab through entire nav)
- Live regions not announced (status messages missed)
- Color alone used to convey information

**WCAG Criteria typically Serious:**
- 1.3.1 (info and relationships)
- 1.4.1 (use of color)
- 2.4.1 (bypass blocks)
- 2.4.3 (focus order)
- 2.4.7 (focus visible)
- 3.3.1 (error identification)
- 3.3.2 (labels or instructions)
- 4.1.3 (status messages)

#### Moderate (Difficulty with Workarounds)

Issues that create difficulty but users can work around them.

**Examples:**
- Generic link text like "click here" (context may help)
- Decorative images not marked as decorative
- Missing landmark regions (can navigate by headings)
- Tooltip not dismissible with Escape
- Potential color contrast issues (needs verification)
- Missing `lang` attribute on foreign text passages

**WCAG Criteria typically Moderate:**
- 1.1.1 (decorative images)
- 1.4.3 (contrast - large text)
- 2.4.4 (link purpose)
- 1.4.13 (content on hover/focus)
- 3.1.2 (language of parts)

#### Minor (Best Practice)

Best practice violations with minimal direct user impact.

**Examples:**
- Missing `autocomplete` attributes
- Positive tabindex values (confusing but works)
- Redundant ARIA roles on semantic elements
- Minor heading hierarchy issues
- Missing but non-critical landmark labels

**WCAG Criteria typically Minor:**
- 1.3.5 (identify input purpose)
- 4.1.1 (parsing - deprecated)
- 2.4.6 (headings describe topic)

---

### Supported File Types

Only review these file types: `.tsx`, `.jsx`, `.html`, `.css`, `.scss`

**For unsupported file types**, display:
```
File type not supported for a11y review. Supported: .tsx, .jsx, .html, .css, .scss
```

**File-specific focus:**

| File Type | Primary Focus |
|-----------|---------------|
| `.tsx`, `.jsx` | Components, ARIA, semantic HTML, keyboard handlers |
| `.html` | Document structure, landmarks, forms, images |
| `.css`, `.scss` | Focus styles, outline removal, font sizes |

---

### Output Format (File Mode)

```markdown
## Accessibility Review: ComponentName.tsx
**Date**: 2024-01-15
**Lines Reviewed**: 1-150 (or "Selection: lines 45-67")

### Critical Issues (1)
- [ ] **Missing keyboard access** (WCAG 2.1.1) `#a7b2`
  - Line 45: `<div onClick={handleClick}>` has no keyboard equivalent
  - Recommendation: Change to `<button onClick={handleClick}>` or add `tabIndex={0}`, `role="button"`, and `onKeyDown` handler

### Serious Issues (2)
- [ ] **Form input missing label** (WCAG 1.3.1, 4.1.2) `#c3d4`
  - Line 72: `<input type="email" placeholder="Email" />` lacks associated label
  - Recommendation: Add `<label htmlFor="email">Email</label>` before input and `id="email"` to input

- [ ] **Focus indicator removed** (WCAG 2.4.7) `#e5f6`
  - Line 23: `outline: none` removes focus indicator without replacement
  - Recommendation: Add `:focus-visible` styles or custom focus indicator

### Moderate Issues (1)
- [ ] **Generic link text** (WCAG 2.4.4) `#g7h8`
  - Line 89: `<a href="/docs">Click here</a>` uses non-descriptive text
  - Recommendation: Use descriptive text like `<a href="/docs">View documentation</a>`

### Minor Issues (0)

---

### Summary
- **Total issues**: 4
- **By severity**: 1 critical, 2 serious, 1 moderate, 0 minor
- **Files reviewed**: 1

### Next Steps
Run `/cc-a11y fix` to apply recommended fixes, or `/cc-a11y fix --interactive` to review each fix individually.
```

---

### Handling Edge Cases

**No Issues Found:**
```markdown
## Accessibility Review: ComponentName.tsx
**Date**: 2024-01-15

✓ No accessibility issues found.

### Summary
- Files reviewed: 1
- Issues found: 0

Note: Automated review covers structural issues. Manual testing with screen readers and keyboard navigation is recommended for comprehensive coverage.
```

**Empty File or No Content:**
```markdown
## Accessibility Review: EmptyComponent.tsx
**Date**: 2024-01-15

No reviewable content found in this file.
```

**Mixed Results with Ignores:**
```markdown
### Summary
- Total issues: 4
- By severity: 1 critical, 2 serious, 1 moderate, 0 minor
- Issues suppressed by .a11yignore: 2
```

---

### Exit Codes

Exit codes enable scripting and CI/CD integration:

| Code | Meaning |
|------|---------|
| `0` | No issues found at or above specified severity |
| `1` | Issues found at or above specified severity |
| `2` | Error (invalid arguments, git errors, file not found) |

**Behavior with `--severity`:**
Exit codes respect the severity threshold. If `--severity serious` is set:
- Only moderate/minor issues found → Exit `0`
- Serious or critical issues found → Exit `1`

**CI Integration Examples:**

```bash
# Pre-commit hook: Block commits with any issues
claude /cc-a11y review --staged
if [ $? -eq 1 ]; then
  echo "Accessibility issues found. Please fix before committing."
  exit 1
fi

# Pre-commit hook: Block only critical issues
claude /cc-a11y review --staged --severity critical

# GitHub Actions / CI pipeline: Check branch changes
claude /cc-a11y review --branch --severity serious
EXIT_CODE=$?
if [ $EXIT_CODE -eq 1 ]; then
  echo "::error::Accessibility issues found in branch"
  exit 1
elif [ $EXIT_CODE -eq 2 ]; then
  echo "::error::Accessibility review failed"
  exit 1
fi

# Quarterly audit: Generate report regardless of issues
claude /cc-a11y review --repo --output audit.md
# Saves to a11y/2024-01-15-audit.md - check file for issues
```

**Husky/lint-staged Integration:**

```json
// package.json
{
  "lint-staged": {
    "*.{tsx,jsx}": [
      "claude /cc-a11y review --severity critical"
    ]
  }
}
```

### Resources

Reference these files for review criteria:
- [wcag-checklist.md](wcag-checklist.md) - WCAG 2.1 AA success criteria
- [react-patterns.md](react-patterns.md) - React-specific accessibility patterns
- [common-fixes.md](common-fixes.md) - Issue detection and fix templates

---

## Verb: fix

**Purpose:** Apply accessibility fixes to identified issues.

### Branch Safety

**CRITICAL:** Before ANY fix operation, perform the [Branch Safety Check](#branch-safety-check) described above. Do not proceed if on main/master.

### Arguments

| Argument | Description |
|----------|-------------|
| (none) | Fix all issues in current file. If existing review reports are found in `a11y/`, prompts user to select one or proceed without. |
| `--from <path>` | Read issues from a review report file |
| `--line <number>` | Fix issue at specific line only |
| `--critical` | Fix only critical issues |
| `--interactive` | Step through each fix one by one |
| `--auto` | Apply fixes without prompting for approval |

---

### Auto-Discovery of Reports

When running `/cc-a11y fix` without `--from`, the skill checks the `a11y/` folder for existing review reports.

**Step 1: Check for Reports**

```bash
# Look for review report files in a11y/ folder
ls -t a11y/*-*-review*.md a11y/*-*-audit*.md 2>/dev/null | head -5
```

**Step 2: If Reports Found, Prompt User**

Display available reports with status information:

```
Found existing review reports:
  1. a11y/2024-01-15-a11y-review.md (12 issues, 3 fixed)
  2. a11y/2024-01-10-a11y-review.md (8 issues, 8 fixed)

Use a report? [1/2/n]: _
```

**Report Status Calculation:**
- Count total issues: Lines matching `- [ ]` or `- [x]` with issue ID pattern
- Count fixed issues: Lines matching `- [x]`
- Display as "(N issues, M fixed)"

**Step 3: Handle Selection**

- **Number selected (1, 2, etc.)**: Load that report, equivalent to `--from <path>`
- **'n' selected**: Proceed with fresh review of current file (no report)
- **Invalid input**: Re-prompt

**Step 4: Continue with Fix Process**

If a report was selected, continue to "From Report Mode" section.
If 'n' was selected, continue to "File Mode Fix" section.

---

### File Mode Fix (Default)

When no `--from` argument is provided and user declines to use existing reports, fix issues in the current file.

**Step 1: Branch Safety Check**

```bash
git branch --show-current
```

If result is `main` or `master`, display warning and abort (see Branch Safety Check section).

**Step 2: Identify Issues**

Run a review of the current file to identify all accessibility issues:
1. Read the current file
2. Analyze for issues (same as review verb)
3. Generate issue list with IDs

**Step 3: Filter Issues (if applicable)**

- If `--line <number>`: Keep only issues at that line
- If `--critical`: Keep only issues with Critical severity

**Step 4: Generate Fix Proposals**

For each issue, generate a fix proposal using the resources:
1. Look up issue type in [common-fixes.md](common-fixes.md)
2. Reference [react-patterns.md](react-patterns.md) for React-specific fixes
3. Generate specific fix based on the actual code context

**Fix Proposal Format:**
```
Issue #[id]: [Issue Title] (WCAG X.X.X)
Location: Line [N]
Severity: [Critical/Serious/Moderate/Minor]

Current code:
  [code snippet showing the issue]

Proposed fix:
  [code snippet showing the fix]

Rationale:
  [Brief explanation of why this fix resolves the issue]
```

**Step 5: Apply Fixes**

Behavior depends on mode:

- **Default mode**: Show each fix proposal, ask for confirmation, apply if approved
- **Interactive mode** (`--interactive`): Step through fixes one-by-one with options
- **Auto mode** (`--auto`): Apply all fixes without confirmation

**Step 6: Report Results**

Output the fix summary (see Output Format section).

---

### From Report Mode (`--from`)

When `--from <path>` is provided, read issues from a saved review report file.

**Step 1: Branch Safety Check**

Same as file mode.

**Step 2: Parse Report File**

Read the report file and extract issues:
1. Find all issue entries (lines starting with `- [ ]` - unchecked checkboxes indicate unfixed issues)
2. Skip fixed issues (lines starting with `- [x]`)
3. Extract issue ID (e.g., `#f3a1`)
4. Extract file path from section headers (`### src/components/File.tsx`)
5. Extract line number from issue details
6. Extract WCAG criterion

**Parsing Pattern:**
```
Section header: ### <filepath>
Issue line (unfixed): - [ ] **<title>** (WCAG <criterion>) `#<id>`
Issue line (fixed):   - [x] **<title>** (WCAG <criterion>) `#<id>` ✓ Fixed [YYYY-MM-DD]
Detail line:          - Line <N>: <description>
```

**Step 3: Match Issues to Current Code**

For each issue from the report:
1. Read the referenced file
2. Re-scan for potential issues at/near the line number
3. Generate IDs for found issues
4. Match by ID (not line number - IDs are stable across refactoring)

**If ID matches**: Issue found, prepare fix
**If ID not found**: Issue may have been fixed or code changed significantly

**Step 4: Handle Unmatched Issues**

For issues that can't be matched:
```
Issue #[id] not found in [filepath]

Possible reasons:
- Issue was already fixed
- Code was significantly refactored
- Line numbers shifted beyond recognition

Options:
[s]kip this issue
[r]e-run review on this file
[q]uit
> _
```

**Step 5: Apply Fixes**

Same as file mode Step 5.

**Step 6: Update Report File**

After applying fixes, update the original report:
1. Find the fixed issue in the report
2. Wrap with strikethrough (`~~...~~`)
3. Add fix marker (`✓ Fixed [YYYY-MM-DD]`)

See Report Update Format section for details.

---

### Interactive Mode (`--interactive`)

Step through each fix individually with full control.

**Display Format:**
```
═══════════════════════════════════════════════════════════════
Fix 1 of 3: Missing form label
═══════════════════════════════════════════════════════════════
File: src/components/SearchBar.tsx
Line: 45
Severity: Serious
WCAG: 1.3.1, 4.1.2
Issue ID: #c3d4

CURRENT CODE (line 45):
  <input type="search" placeholder="Search products" />

PROPOSED FIX:
  <input
    type="search"
    placeholder="Search products"
    aria-label="Search products"
  />

RATIONALE:
  Form inputs require an accessible name. Since there's no visible label,
  aria-label provides the accessible name for screen readers.

───────────────────────────────────────────────────────────────
[a]pply    Apply this fix and continue
[s]kip     Skip this fix and continue to next
[e]dit     Let me modify the proposed fix
[v]iew     View more context (±10 lines)
[q]uit     Stop fixing, keep changes made so far
───────────────────────────────────────────────────────────────
> _
```

**Option Behaviors:**

- **[a]pply**: Apply the fix, update the file, continue to next issue
- **[s]kip**: Skip this issue without fixing, continue to next
- **[e]dit**: Allow user to provide alternative fix text
- **[v]iew**: Show more surrounding code context
- **[q]uit**: Stop processing, keep any fixes already applied

**Edit Mode:**
```
Enter your preferred fix (or type 'cancel' to go back):
> <input type="search" aria-label="Search for products" placeholder="Search..." />

Apply this edit? [y/n]
> _
```

---

### Auto Mode (`--auto`)

Apply all fixes without user confirmation. Use with caution.

**Behavior:**
1. Perform branch safety check (still enforced)
2. Identify all issues
3. Generate fixes for each
4. Apply ALL fixes automatically
5. Output summary

**Safeguards:**
- Branch check still required (cannot bypass)
- Issues with ambiguous fixes are skipped (logged in output)
- Skipped issues are listed with reasons

**Ambiguous Fix Criteria:**
- Multiple valid fix approaches exist
- Fix requires context-specific content (e.g., alt text description)
- Code structure is too complex to auto-fix safely

**Auto Mode Output:**
```markdown
## Accessibility Fixes Applied (Auto Mode): SearchBar.tsx

### Changes Made (2)
1. **Line 45**: Added `aria-label="Search"` to input
   - Issue `#c3d4`: Missing form label (WCAG 1.3.1, 4.1.2)

2. **Line 72**: Changed `<div onClick>` to `<button>`
   - Issue `#a7b2`: Missing keyboard access (WCAG 2.1.1)

### Skipped (Requires Manual Review) (1)
1. **Line 89**: Image missing alt text
   - Issue `#e5f6`: Missing alt text (WCAG 1.1.1)
   - Reason: Alt text requires understanding of image content

### Summary
- Issues fixed: 2
- Issues skipped: 1
- Files modified: 1
```

---

### Output Format

**Standard Output (File Mode):**
```markdown
## Accessibility Fixes Applied: [filename]
**Date**: [YYYY-MM-DD]

### Changes Made (N)
1. **Line NN**: [change description]
   - Issue `#[id]`: [issue title] (WCAG X.X.X)
   - Severity: [Critical/Serious/Moderate/Minor]

2. **Line NN**: [change description]
   - Issue `#[id]`: [issue title] (WCAG X.X.X)
   - Severity: [Critical/Serious/Moderate/Minor]

### Skipped (N)
1. **Line NN**: [issue title] - [reason skipped]

### Summary
- Files modified: 1
- Issues fixed: N
- Issues skipped: N

### Next Steps
Run `/cc-a11y review` to verify fixes and check for any remaining issues.
```

**Multi-File Output (from report):**
```markdown
## Accessibility Fixes Applied
**Date**: [YYYY-MM-DD]
**Source**: [report-filename]

### src/components/LoginForm.tsx
- **Line 45**: Added label to email input `#c3d4`
- **Line 67**: Changed div to button `#a7b2`

### src/components/SearchBar.tsx
- **Line 12**: Added aria-label to icon button `#e5f6`

### Summary
- Files modified: 2
- Issues fixed: 3
- Issues skipped: 0
- Report updated: ✓

### Next Steps
Review the updated report at [report-path] to see remaining issues.
```

---

### Report Update Format

When using `--from`, the original report file is updated to mark fixed issues using GitHub-flavored checkboxes.

**Before:**
```markdown
### src/components/LoginForm.tsx

#### Serious Issues (2)
- [ ] **Form input missing label** (WCAG 1.3.1, 4.1.2) `#c3d4`
  - Line 45: `<input type="email">` lacks associated label
  - Recommendation: Add `<label htmlFor="email">` or `aria-label`

- [ ] **Missing keyboard access** (WCAG 2.1.1) `#a7b2`
  - Line 67: `<div onClick={handleSubmit}>` has no keyboard equivalent
  - Recommendation: Change to `<button>` element
```

**After (issues fixed):**
```markdown
### src/components/LoginForm.tsx

#### Serious Issues (2)
- [x] **Form input missing label** (WCAG 1.3.1, 4.1.2) `#c3d4` ✓ Fixed [2024-01-15]
  - Line 45: `<input type="email">` lacks associated label
  - Recommendation: Add `<label htmlFor="email">` or `aria-label`

- [x] **Missing keyboard access** (WCAG 2.1.1) `#a7b2` ✓ Fixed [2024-01-15]
  - Line 67: `<div onClick={handleSubmit}>` has no keyboard equivalent
  - Recommendation: Change to `<button>` element
```

**Update Rules:**
1. Change `- [ ]` to `- [x]` on the issue title line
2. Add ` ✓ Fixed [YYYY-MM-DD]` after the issue ID on the title line
3. Do NOT modify the sub-items (line details, recommendations) - keep them for reference
4. Do NOT change the section counts (e.g., "Serious Issues (2)") - this preserves history
5. Add a note at the end of the Summary section:

```markdown
### Summary
- Total issues: 4
- By severity: 0 critical, 2 serious, 1 moderate, 1 minor
- **Fixed since original review**: 2 (as of 2024-01-15)
```

**Output Confirmation:**
```
Updated report: a11y/2024-01-15-a11y-review.md (3 issues marked as fixed)
```

---

### Edge Cases

**No Issues Found:**
```markdown
## Accessibility Fix: ComponentName.tsx
**Date**: 2024-01-15

No accessibility issues found to fix.

Run `/cc-a11y review` first to identify issues.
```

**All Issues Skipped:**
```markdown
## Accessibility Fix: ComponentName.tsx
**Date**: 2024-01-15

### Skipped (3)
1. **Line 45**: Missing alt text - User skipped
2. **Line 67**: Generic link text - User skipped
3. **Line 89**: Missing form label - User skipped

### Summary
- Issues fixed: 0
- Issues skipped: 3

No changes were made to the file.
```

**File Not Found (from report):**
```
Error: File not found: src/components/DeletedComponent.tsx

This file was referenced in the report but no longer exists.
It may have been deleted or renamed.

Options:
[s]kip issues in this file
[q]uit
> _
```

**Partial Fix Failure:**
If a fix fails to apply (e.g., code changed since review):
```
Warning: Could not apply fix for issue #c3d4

The code at line 45 no longer matches the expected pattern.
Expected: <input type="email" placeholder="Email">
Found:    <TextField variant="outlined" />

The component may have been refactored. Please review manually.

[s]kip and continue
[q]uit
> _
```

---

### Fix Safety Guidelines

1. **Never fix what you don't understand**: If the fix requires context-specific content (like alt text descriptions), prompt the user or skip
2. **Preserve functionality**: Fixes must not change behavior, only add accessibility
3. **Minimal changes**: Apply the smallest change needed to fix the issue
4. **One issue at a time**: Don't combine multiple fixes into one change
5. **Verify syntax**: Ensure generated code is syntactically valid before applying

---

### Resources

Reference these files for fix patterns:
- [common-fixes.md](common-fixes.md) - Issue-to-fix lookup table
- [react-patterns.md](react-patterns.md) - React-specific patterns

---

## Verb: report

**Purpose:** Generate a formal accessibility compliance report suitable for stakeholders, compliance documentation, and progress tracking.

### Arguments

| Argument | Description |
|----------|-------------|
| (none) | Generate report to stdout |
| `--output <path>` | Save report to file (auto-prepends date, appends .md, defaults to a11y/ folder) |
| `--from <path>` | Base report on existing review output file |
| `--scope <glob>` | Limit analysis to specific paths |

---

### Report Generation Process

**Step 1: Gather Data**

Either analyze the codebase or use existing review data:

- **Without `--from`**: Run a full repository review (same as `/cc-a11y review --repo`)
- **With `--from <path>`**: Parse the provided review report file

**Step 2: Calculate Conformance Status**

Determine WCAG 2.1 AA conformance based on issue severity:

```
function calculateConformance(issues):
  criticalCount = count(issues where severity == "critical")
  seriousCount = count(issues where severity == "serious")

  if criticalCount > 0:
    return "Non-conformant"
  else if seriousCount > 0:
    return "Partial"
  else:
    return "Full"
```

**Conformance Definitions:**
| Status | Criteria | Description |
|--------|----------|-------------|
| **Full** | 0 critical, 0 serious | Meets WCAG 2.1 AA requirements |
| **Partial** | 0 critical, 1+ serious | Most requirements met, some barriers exist |
| **Non-conformant** | 1+ critical | Fails to meet minimum requirements |

**Step 3: Categorize Issues**

Group issues by functional category for stakeholder clarity:

| Category | Issue Types Included |
|----------|---------------------|
| **Forms** | Missing labels, error handling, fieldset/legend, autocomplete |
| **Images & Media** | Alt text, captions, audio descriptions, decorative images |
| **Keyboard & Focus** | Keyboard access, focus indicators, focus traps, tab order |
| **Navigation** | Skip links, landmarks, heading structure, link purpose |
| **Interactive Components** | Buttons, toggles, modals, expandable regions, state |
| **Content Structure** | Headings, lists, tables, reading order, language |
| **Color & Contrast** | Contrast ratios, color-only information |
| **Dynamic Content** | Live regions, status messages, loading states |

**Category Mapping:**
```
function categorizeIssue(issue):
  wcag = issue.wcagCriterion

  if wcag in ["1.3.1", "3.3.1", "3.3.2", "1.3.5"]:
    if issue.type contains "label" or "form" or "input":
      return "Forms"

  if wcag in ["1.1.1", "1.2.1", "1.2.2", "1.2.3", "1.2.5"]:
    return "Images & Media"

  if wcag in ["2.1.1", "2.1.2", "2.4.3", "2.4.7"]:
    return "Keyboard & Focus"

  if wcag in ["2.4.1", "2.4.4", "2.4.6", "1.3.1"] and issue.type contains "heading" or "landmark" or "skip":
    return "Navigation"

  if wcag in ["4.1.2"] and issue.type contains "button" or "toggle" or "expanded":
    return "Interactive Components"

  if wcag in ["1.4.1", "1.4.3", "1.4.11"]:
    return "Color & Contrast"

  if wcag in ["4.1.3"]:
    return "Dynamic Content"

  return "Content Structure"  # default
```

**Step 4: Generate Executive Summary**

Create high-level summary for quick understanding:
- Total issues by severity
- Conformance status with explanation
- Top 3 most common issue types
- Files requiring immediate attention

**Step 5: Generate Recommendations**

Based on issues found, generate prioritized recommendations:

1. **Immediate** (Critical issues): Must fix before release
2. **Short-term** (Serious issues): Fix within current sprint/cycle
3. **Medium-term** (Moderate issues): Plan for upcoming work
4. **Long-term** (Minor/patterns): Process improvements

**Step 6: Format Output**

Generate the full compliance report (see Output Format below).

---

### From Mode (`--from`)

When `--from <path>` is provided, base the report on an existing review output file.

**Parsing the Review File:**
1. Extract metadata (date, mode, files reviewed)
2. Parse all issues with their IDs, severities, and locations
3. Handle strikethrough items (already fixed) - exclude from counts but note in report

**Benefits:**
- Faster than re-running full analysis
- Allows manual curation of review before report
- Tracks progress by comparing to previous reports

**Example:**
```bash
# Generate review, manually verify, then create report
/cc-a11y review --repo --output review.md
# ... review and edit the file at a11y/2024-01-15-review.md as needed ...
/cc-a11y report --from a11y/2024-01-15-review.md --output compliance.md
```

---

### Output Format

```markdown
# Accessibility Compliance Report

**Repository**: [repo-name]
**Date**: [YYYY-MM-DD]
**Target Level**: WCAG 2.1 AA
**Scope**: [Full repository / specific paths]

---

## Executive Summary

### Conformance Status: [Full/Partial/Non-conformant]

[Brief explanation of what this means]

### Issue Overview

| Severity | Count | Impact |
|----------|-------|--------|
| Critical | N | Blocks access completely |
| Serious | N | Significant barriers |
| Moderate | N | Usability difficulties |
| Minor | N | Best practice violations |
| **Total** | **N** | |

### Key Findings

1. **[Most common issue type]** - N occurrences across N files
2. **[Second most common]** - N occurrences across N files
3. **[Third most common]** - N occurrences across N files

### Files Requiring Immediate Attention

| File | Critical | Serious | Action Needed |
|------|----------|---------|---------------|
| [filepath] | N | N | [Brief description] |
| [filepath] | N | N | [Brief description] |

---

## Issues by Category

### Forms (N issues)

| Severity | Count | Common Issues |
|----------|-------|---------------|
| Critical | N | [types] |
| Serious | N | [types] |
| Moderate | N | [types] |

**Details:**
- [filepath:line] - [issue description] (WCAG X.X.X)
- [filepath:line] - [issue description] (WCAG X.X.X)

### Images & Media (N issues)

[Same format as Forms]

### Keyboard & Focus (N issues)

[Same format as Forms]

### Navigation (N issues)

[Same format as Forms]

### Interactive Components (N issues)

[Same format as Forms]

### Color & Contrast (N issues)

[Same format as Forms]

### Dynamic Content (N issues)

[Same format as Forms]

### Content Structure (N issues)

[Same format as Forms]

---

## WCAG 2.1 AA Criterion Coverage

| Criterion | Status | Issues |
|-----------|--------|--------|
| 1.1.1 Non-text Content | ✓ Pass / ✗ Fail | N |
| 1.3.1 Info and Relationships | ✓ Pass / ✗ Fail | N |
| 2.1.1 Keyboard | ✓ Pass / ✗ Fail | N |
| 2.4.7 Focus Visible | ✓ Pass / ✗ Fail | N |
| 4.1.2 Name, Role, Value | ✓ Pass / ✗ Fail | N |
| ... | | |

---

## Recommendations

### Immediate Priority (Critical Issues)

These issues completely block access for some users and must be addressed before release:

1. **[Issue type]** in [N files]
   - Impact: [who is affected and how]
   - Fix: [brief fix approach]
   - Effort: [Low/Medium/High]

### Short-term Priority (Serious Issues)

These create significant barriers and should be fixed within the current development cycle:

1. **[Issue type]** in [N files]
   - Impact: [who is affected and how]
   - Fix: [brief fix approach]
   - Effort: [Low/Medium/High]

### Medium-term Priority (Moderate Issues)

These create difficulties but have workarounds. Plan for upcoming sprints:

1. **[Issue type]** in [N files]
   - Impact: [who is affected and how]
   - Fix: [brief fix approach]

### Process Improvements

Based on patterns observed, consider these process changes:

1. **[Recommendation]** - [rationale]
2. **[Recommendation]** - [rationale]

---

## Testing Recommendations

### Automated Testing
- Add `/cc-a11y review --staged` to pre-commit hooks
- Include jest-axe tests for new components
- Run `/cc-a11y review --branch` in CI pipeline

### Manual Testing Checklist
- [ ] Keyboard-only navigation through all interactive elements
- [ ] Screen reader testing (VoiceOver/NVDA) for critical flows
- [ ] High contrast mode verification
- [ ] 200% zoom functionality test

---

## Appendix A: Full Issue List by File

[Detailed file-by-file breakdown, same format as review --repo output]

---

## Appendix B: Methodology

This report was generated using `/cc-a11y report` which analyzes:
- React/JSX components (*.tsx, *.jsx)
- HTML files (*.html)
- Stylesheets (*.css, *.scss)

**Analysis covers:**
- WCAG 2.1 AA success criteria
- Common accessibility patterns and anti-patterns
- React-specific accessibility requirements

**Limitations:**
- Cannot verify color contrast (requires visual inspection)
- Cannot assess content quality (alt text appropriateness, link text clarity)
- Cannot test runtime behavior (focus management, live regions)
- Manual testing with assistive technology is still required

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| WCAG | Web Content Accessibility Guidelines |
| ARIA | Accessible Rich Internet Applications |
| Screen Reader | Software that reads screen content aloud |
| Focus Indicator | Visual indication of which element has keyboard focus |
| Landmark | Semantic region (main, nav, header, footer) |
```

---

### Edge Cases

**No Issues Found:**
```markdown
# Accessibility Compliance Report

**Repository**: [repo-name]
**Date**: [YYYY-MM-DD]
**Target Level**: WCAG 2.1 AA

---

## Executive Summary

### Conformance Status: Full ✓

No accessibility issues were detected in the automated review.

### Important Note

Automated testing covers approximately 30% of accessibility requirements.
This report does not guarantee full WCAG 2.1 AA compliance.

**Manual testing is still required for:**
- Color contrast verification
- Content quality assessment (alt text, link text)
- Keyboard navigation flow
- Screen reader compatibility
- Cognitive accessibility

---

## Recommendations

1. Schedule quarterly accessibility audits
2. Test with actual assistive technology users
3. Maintain current standards in new development
```

**Report Based on Stale Review:**
When using `--from` with an old review file, add a warning:
```markdown
> ⚠️ **Note**: This report is based on a review from [date].
> The codebase may have changed since then. Consider running
> a fresh review with `/cc-a11y review --repo` for current data.
```

**Partial Repository (with --scope):**
```markdown
## Executive Summary

### Scope

This report covers only: `src/components/**`

Files outside this scope were not analyzed. For full repository
compliance, run without `--scope` filter.
```

---

### Progress Tracking

Reports are automatically dated, enabling progress tracking over time.

**Comparing Reports:**
```
Report Date     | Critical | Serious | Moderate | Total
----------------|----------|---------|----------|------
2024-01-15      | 5        | 12      | 8        | 25
2024-02-15      | 2        | 8       | 10       | 20
2024-03-15      | 0        | 3       | 6        | 9
```

**Tracking Fixed Issues:**
When using `--from` with a report that has strikethrough (fixed) items:
```markdown
### Progress Since Last Review

- **Issues fixed**: 8
- **New issues found**: 2
- **Net improvement**: 6 fewer issues
```

---

### Resources

Reference these files for report generation:
- [wcag-checklist.md](wcag-checklist.md) - WCAG criteria reference

---

## Git Mode Commands Reference

For git-based review modes, use these commands to get file lists:

```bash
# --staged: Staged files only
git diff --cached --name-only --diff-filter=ACMR

# --changed: Modified uncommitted files
git diff --name-only --diff-filter=ACMR

# --branch: Files changed in current branch vs main
git diff origin/main...HEAD --name-only --diff-filter=ACMR

# --commit: Files changed in specific commit
git diff-tree --no-commit-id --name-only -r <ref>
```

Filter results to supported file types only.

---

## Ignore File Format (.a11yignore)

The `.a11yignore` file allows suppressing known false positives or accepted exceptions.

### File Location

Look for `.a11yignore` in:
1. Project root (same directory as `package.json`)
2. Path specified via `--ignore-file` argument

### Syntax

```
# Format: <file>[:<line>] [WCAG:<criterion>] [# comment]

# Ignore entire file (all issues)
src/legacy/OldForm.tsx

# Ignore specific line (any issue at that line)
src/components/Hero.tsx:42                    # decorative background

# Ignore specific WCAG criterion for entire file
src/components/Badge.tsx WCAG:1.4.3           # contrast intentional per design

# Ignore specific criterion at specific line
src/components/Modal.tsx:87 WCAG:2.4.3        # focus order intentional

# Multiple criteria on same file (separate lines)
src/components/Chart.tsx WCAG:1.1.1           # complex image has extended desc
src/components/Chart.tsx WCAG:1.4.1           # color differentiation supplemented
```

### Parsing Rules

1. **Comments**: Lines starting with `#` are comments (ignored)
2. **Blank lines**: Ignored
3. **File paths**: Relative to project root, forward slashes only
4. **Line numbers**: Optional, separated by colon (`:`)
5. **WCAG criterion**: Optional, prefixed with `WCAG:`
6. **Inline comments**: Everything after `#` on a rule line is a comment

### Ignore Matching Algorithm

When checking if an issue should be ignored:

```
function shouldIgnore(issue, ignoreRules):
  for each rule in ignoreRules:
    if rule.file matches issue.file:
      # File matches, check specificity
      if rule has no line AND no wcag:
        return true  # Entire file ignored

      if rule.line matches issue.line AND rule has no wcag:
        return true  # Specific line ignored (all criteria)

      if rule.wcag matches issue.wcag AND rule has no line:
        return true  # Specific criterion ignored (entire file)

      if rule.line matches issue.line AND rule.wcag matches issue.wcag:
        return true  # Specific criterion at specific line

  return false
```

### Best Practices

- Always include a comment explaining WHY the issue is ignored
- Prefer specific ignores (line + criterion) over broad ignores (entire file)
- Review `.a11yignore` periodically to remove stale entries
- Use for intentional design decisions, not to silence issues you should fix

---

## Installation

### Prerequisites

- Claude Code CLI installed (v1.x or later)
- Git for version control
- VSCode with Claude Code extension (recommended for file mode features)

### Global Installation (Recommended)

Install the skill globally so it's available in any repository:

```bash
# One-time setup: Clone dev-templates
git clone git@github.com:concord-consortium/dev-templates.git ~/dev-templates

# Create global skills directory if needed
mkdir -p ~/.claude/skills

# Symlink the skill directory
ln -s ~/dev-templates/claude/skills/cc-a11y ~/.claude/skills/
```

**Updating:** When the team updates the skill, run `git pull` in your `~/dev-templates` directory. The symlink automatically picks up changes.

### Per-Project Installation

For project-specific installation:

```bash
# From project root
mkdir -p .claude/skills
cp -r ~/dev-templates/claude/skills/cc-a11y .claude/skills/
```

### Verification

After installation, verify the skill is available:

```bash
# Should show cc-a11y in available skills
claude /cc-a11y review --help
```

---

## Workflow Examples

### Single File Review & Fix

Quick accessibility check on the current file:

```
1. Open a component file in VSCode
2. Run `/cc-a11y review`
3. Review the issues found
4. Run `/cc-a11y fix` to apply fixes
5. Run `/cc-a11y review` again to verify
```

**Example session:**
```
> /cc-a11y review

## Accessibility Review: LoginForm.tsx
**Date**: 2024-01-15

### Serious Issues (2)
- [ ] **Form input missing label** (WCAG 1.3.1) `#c3d4`
  - Line 45: `<input type="email">` lacks associated label
...

> /cc-a11y fix

Fix 1 of 2: Form input missing label
Proposed: Add aria-label="Email address" to input
[a]pply  [s]kip  [e]dit  [q]uit
> a

✓ Applied fix to line 45
...
```

### Pre-Commit Hook Integration

Block commits that introduce accessibility issues:

**Using Husky:**
```bash
# .husky/pre-commit
#!/bin/sh
claude /cc-a11y review --staged --severity critical
if [ $? -eq 1 ]; then
  echo "Critical accessibility issues found. Please fix before committing."
  exit 1
fi
```

**Using lint-staged:**
```json
// package.json
{
  "lint-staged": {
    "*.{tsx,jsx}": [
      "claude /cc-a11y review --severity critical"
    ]
  }
}
```

**Behavior:**
- Exit 0: No critical issues, commit proceeds
- Exit 1: Critical issues found, commit blocked
- Exit 2: Error occurred, commit blocked

### Pre-PR Audit

Review all changes in a feature branch before creating a PR:

```bash
# 1. Review all files changed in the branch
/cc-a11y review --branch --output a11y-review.md

# 2. Review the generated report
# (saved as a11y/2024-01-15-a11y-review.md)

# 3. Fix issues interactively
/cc-a11y fix --from a11y/2024-01-15-a11y-review.md --interactive

# 4. Verify fixes
/cc-a11y review --branch

# 5. Create PR with clean a11y status
```

**Include in PR description:**
```markdown
## Accessibility
- Ran `/cc-a11y review --branch` - no issues found
- [Link to review report if applicable]
```

### Quarterly Compliance Audit

Full repository audit for compliance tracking:

```bash
# 1. Run full repository audit
/cc-a11y review --repo --output audit.md

# 2. Generate formal compliance report
/cc-a11y report --from a11y/2024-01-15-audit.md --output compliance.md

# 3. Review and distribute report
# (saved as a11y/2024-01-15-compliance.md)

# 4. Create tickets for issues found
# 5. Track progress over time by comparing dated reports
```

**Quarterly tracking:**
```
Q1 Report: 25 issues (5 critical, 12 serious)
Q2 Report: 15 issues (2 critical, 8 serious)
Q3 Report: 8 issues (0 critical, 4 serious)
```

---

## Edge Cases & Error Handling

### Unsupported File Types

When reviewing a file type that isn't supported:

```
> /cc-a11y review  (on a .py file)

File type not supported for a11y review.
Supported: .tsx, .jsx, .html, .css, .scss
```

### Empty Repository / No Files

When no supported files are found:

```
> /cc-a11y review --repo

## Accessibility Review
**Date**: 2024-01-15
**Mode**: Full Repository

No files to review. No supported files (*.tsx, *.jsx, *.html, *.css, *.scss) found.
```

### No Selection in IDE

When running file mode without a file open:

```
> /cc-a11y review

No file is currently open. Please open a file to review, or use:
- `/cc-a11y review --repo` for full repository
- `/cc-a11y review --staged` for staged files
- `/cc-a11y review --branch` for branch changes
```

### Git Not Available

When git commands fail (not a git repo, etc.):

```
> /cc-a11y review --branch

Error: Not a git repository (or any parent up to mount point /)

This command requires git. Please run from within a git repository.
Exit code: 2
```

### Invalid Arguments

When unrecognized arguments are provided:

```
> /cc-a11y review --unknown-flag

Error: Unknown argument: --unknown-flag

Valid arguments for 'review':
  --repo        Full repository audit
  --staged      Review staged files
  --changed     Review modified files
  --branch      Review branch changes vs main
  --commit      Review specific commit
  --scope       Limit to path pattern
  --severity    Minimum severity threshold
  --output      Save report to file
  --fix         Fix issues after review

Exit code: 2
```

### Report File Not Found

When `--from` references a missing file:

```
> /cc-a11y fix --from missing-report.md

Error: File not found: missing-report.md

Please provide a valid path to an accessibility review report.
Exit code: 2
```

---

## Validation Checklist

Use this checklist to verify the skill is working correctly:

### Installation Verification

- [ ] Skill directory exists at expected location
- [ ] `SKILL.md` is readable
- [ ] Resource files are present (wcag-checklist.md, react-patterns.md, common-fixes.md)
- [ ] Running `/cc-a11y review` shows help or processes current file

### Review Verb

- [ ] File mode works with open file
- [ ] Selection mode works with selected text
- [ ] `--repo` scans all supported files
- [ ] `--staged` filters to staged files only
- [ ] `--branch` compares against main/master
- [ ] `--scope` filters by glob pattern
- [ ] `--severity` filters by threshold
- [ ] `--output` creates dated file
- [ ] Exit code 0 when no issues
- [ ] Exit code 1 when issues found
- [ ] Exit code 2 on error

### Fix Verb

- [ ] Branch safety check blocks fixes on main/master
- [ ] Default mode prompts for approval
- [ ] `--interactive` shows apply/skip/edit/quit options
- [ ] `--auto` applies without prompting
- [ ] `--from` reads issues from report file
- [ ] Report is updated with strikethrough when fixing from report
- [ ] Fixes preserve file functionality

### Report Verb

- [ ] Generates compliance report to stdout
- [ ] `--output` creates dated file
- [ ] `--from` uses existing review data
- [ ] Conformance status calculated correctly
- [ ] Issues categorized by type
- [ ] Executive summary included

### Edge Cases

- [ ] Unsupported file types show appropriate message
- [ ] Empty repos/no files handled gracefully
- [ ] Invalid arguments return exit code 2
- [ ] Missing files referenced in reports handled
- [ ] `.a11yignore` rules are respected

---

## Troubleshooting

### Skill Not Found

**Symptom:** `/cc-a11y` command not recognized

**Solutions:**
1. Verify skill is installed: `ls ~/.claude/skills/cc-a11y/`
2. Check symlink is valid: `readlink ~/.claude/skills/cc-a11y`
3. Restart Claude Code after installation

### Git Mode Returns No Files

**Symptom:** `--staged` or `--branch` returns "No files to review"

**Solutions:**
1. Verify files are staged: `git status`
2. Check file types are supported (.tsx, .jsx, .html, .css, .scss)
3. Verify you're on a feature branch (for `--branch`)

### Fixes Not Applied

**Symptom:** Fix command runs but files unchanged

**Solutions:**
1. Check branch - fixes blocked on main/master
2. Look for "skipped" issues in output
3. Verify file hasn't changed since review

### Report Missing Issues

**Symptom:** Known issues not appearing in report

**Solutions:**
1. Check `.a11yignore` for suppressed issues
2. Verify `--severity` isn't filtering them out
3. Check file type is supported

---

## Issue Identifier Generation

Each issue receives a stable ID (e.g., `#f3a1`) to enable reliable matching when fixing issues from saved reports.

### ID Format

- 4-character hexadecimal string prefixed with `#`
- Example: `#a7b2`, `#c3d4`, `#e5f6`

### Generation Algorithm

Generate the ID from a hash of these components:

```
function generateIssueId(issue):
  # Combine stable identifying information
  components = [
    issue.filePath,           # "src/components/Button.tsx"
    issue.wcagCriterion,      # "1.3.1"
    issue.issueType,          # "missing-label"
    issue.codeContext         # ~20 chars of surrounding code
  ]

  # Create hash
  combined = components.join("|")
  hash = md5(combined) or sha1(combined)

  # Take first 4 hex characters
  return "#" + hash.substring(0, 4)
```

### Code Context Extraction

To make IDs stable across line number changes:

1. Extract ~10 characters before and after the issue location
2. Normalize whitespace (collapse multiple spaces/newlines to single space)
3. Remove line numbers from the context

**Example:**
```jsx
// Line 45:
<input type="email" placeholder="Email" />

// Code context: "type=\"email\" placeholder=\"Email\""
```

### ID Stability Guarantees

IDs remain stable when:
- Line numbers change due to additions/deletions elsewhere in file
- Whitespace/formatting changes
- File is moved (ID will change, but that's expected)

IDs will change when:
- The issue type changes
- The WCAG criterion changes
- The surrounding code context changes significantly
- The file path changes

### Collision Handling

With 4 hex characters, collisions are rare but possible in large codebases. If two issues generate the same ID:
- Append a sequential suffix: `#a7b2`, `#a7b2-1`, `#a7b2-2`
- This is mainly for display; matching uses full context

### Usage in Fix Matching

When `/cc-a11y fix --from report.md` runs:

1. Parse issue IDs from report
2. For each ID:
   - Re-scan the file for potential issues
   - Compute ID for each found issue
   - Match by ID (not line number)
3. If ID not found:
   - Issue may have been fixed
   - Or code changed significantly
   - Prompt user: "Issue #a7b2 not found. Code may have changed. Skip or re-run review?"
