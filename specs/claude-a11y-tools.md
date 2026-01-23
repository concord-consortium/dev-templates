# Claude Code Accessibility Review & Fix Tools Specification

## Overview

This spec defines a suite of Claude Code extensions to enable developers to perform accessibility (a11y) reviews and fixes across Concord Consortium repositories. The tools leverage Claude Code's **skills** feature (the modern replacement for custom commands).

## Problem Statement

Accessibility compliance requires specialized knowledge of WCAG guidelines, ARIA patterns, and assistive technology behavior. Developers need:
- Quick identification of a11y issues in their code
- Guidance on proper fixes following best practices
- Consistent application of a11y standards across repos

**Relationship to Existing Tools**: This skill complements existing automated tools (eslint-plugin-jsx-a11y, axe-core) by providing contextual analysis that understands component relationships, prop drilling, and dynamic behavior. It does not replace build-time linting or runtime testing, but adds an intelligent review layer.

## Success Criteria

- Developers can identify a11y issues without deep WCAG knowledge
- Common fixes can be applied in seconds, not minutes
- Consistent a11y standards across all Concord repos
- Reduced a11y bugs found in QA/production

## Proposed Solution

A set of Claude Code tools that developers can use in any repo by referencing the shared configuration from this dev-templates repo.

---

## Implementation Phases

### Phase 1: Foundation
- Create skill directory structure (`claude/skills/cc-a11y/`)
- Create `SKILL.md` with verb routing logic
- Implement branch safety check for `fix` verb

### Phase 2: Resource Files
- Create `wcag-checklist.md` with WCAG 2.1 AA criteria
- Create `react-patterns.md` with component-specific patterns
- Create `common-fixes.md` with issue-to-fix lookup table

### Phase 3: Review Verb (Core)
- Implement file mode review (current file/selection)
- Add severity categorization (critical/serious/moderate/minor)
- Create output format with issue identifiers
- Add `.a11yignore` support

### Phase 4: Review Verb (Advanced)
- Implement git modes (`--staged`, `--changed`, `--branch`, `--commit`)
- Add `--repo` mode for full repository audit
- Add `--scope` filtering and `--severity` threshold
- Implement `--output` with date prepending
- Add exit codes for scripting

### Phase 5: Fix Verb
- Implement basic fix functionality for current file
- Add `--from` to read issues from saved reports
- Implement report update (strikethrough fixed issues)
- Add `--interactive` mode with apply/skip/edit options
- Add `--auto` mode for unattended fixes

### Phase 6: Report Verb
- Implement compliance report generation
- Add `--from` to base report on existing review output
- Create executive summary and categorized output format

### Phase 7: Validation & Documentation
- Test all workflows (single file, pre-commit, pre-PR, quarterly)
- Validate installation instructions (global and per-project)
- Test edge cases (no issues, unsupported files, empty repos)

---

## Skill Structure

Claude Code uses **skills** (directories with `SKILL.md`) rather than single command files. Each skill directory contains the main instructions plus supporting resources.

All components will be placed in this repo at `claude/skills/cc-a11y/` as a single skill with verb-based routing:

```
dev-templates/
└── claude/
    └── skills/
        └── cc-a11y/
            ├── SKILL.md              # Main skill with verb routing (review, fix, report)
            ├── wcag-checklist.md     # WCAG 2.1 AA reference
            ├── react-patterns.md     # React-specific patterns
            └── common-fixes.md       # Issue → fix lookup table
```

**Key points**:
- Each skill is a **directory** containing `SKILL.md` (required) plus supporting files
- Resources are co-located with the skill that needs them
- Claude auto-loads referenced files when the skill runs
- No CLAUDE.md conflicts - skills don't use that file

---

## Skill: `/cc-a11y`

A single skill with a required verb parameter: `review`, `fix`, or `report`.

**Usage**: `/cc-a11y <verb> [options]`

**Safety: Branch Check**
The `fix` verb must verify the current git branch before running. If on `main` or `master`, it should:
1. Display a warning: "You are on the main/master branch. Fixes should be applied on a feature branch."
2. Stop execution and prompt the user to switch branches

The `review` and `report` verbs are read-only and can run on any branch.

---

### Verb: `review` - Review for Accessibility Issues

**Purpose**: Analyze code for accessibility issues - either current file/selection or full repository.

**Modes**:
- **File mode** (default): Review current file or selection
- **Repo mode**: Full repository audit with `--repo` flag
- **Git modes**: Review files based on git state

**Note**: File mode and selection features require VSCode with Claude Code extension. CLI users should use `--repo`, `--staged`, `--branch`, or `--scope` to specify files explicitly.

**Arguments**:
- No additional args: Review current file (or selection if text is selected). Selection mode reviews the smallest complete syntactic unit containing the selection (function, component, or entire file if selection spans multiple units).
- `--repo`: Full repository audit
- `--staged`: Review only staged files (git add)
- `--changed`: Review only modified uncommitted files (working directory)
- `--branch`: Review all files changed in current branch (vs main/master)
- `--commit <ref>`: Review all files changed in a specific commit (e.g., `HEAD`, `abc123`)
- `--scope <glob>`: Limit to specific paths (e.g., `src/components/**`, `"src/**/*.tsx"`, `"{src,lib}/**"` for multiple directories - note quotes for special characters)
- `--severity <level>`: Minimum severity to report. Ordering: critical > serious > moderate > minor (e.g., `--severity serious` reports serious and critical only)
- `--output <path>`: Save report to file. Behavior:
  - Automatically prepends date in ISO 8601 format (e.g., `report.md` becomes `2024-01-15-report.md`)
  - Automatically appends `.md` extension if not present (e.g., `report` becomes `2024-01-15-report.md`)
  - If no folder is specified, saves to `a11y/` folder (e.g., `report.md` becomes `a11y/2024-01-15-report.md`)
- `--fix`: Automatically fix issues after review (prompts for approval unless `--auto` is also specified). Equivalent to running `review` then `fix` in sequence.
- `--ignore-file <path>`: Path to file listing issues to ignore (default: `.a11yignore` if present)

**Example Usage**:
```
/cc-a11y review                              # Review current file
/cc-a11y review --repo                       # Audit entire repository
/cc-a11y review --staged                     # Review staged files (pre-commit check)
/cc-a11y review --changed                    # Review uncommitted changes
/cc-a11y review --branch                     # Review all files changed in this branch
/cc-a11y review --commit HEAD                # Review files in last commit
/cc-a11y review --commit abc123              # Review files in specific commit
/cc-a11y review --repo --scope src/**        # Audit src directory only
/cc-a11y review --repo --output report.md    # Saves as a11y/2024-01-15-report.md
/cc-a11y review --fix                        # Review and fix current file
/cc-a11y review --branch --fix               # Review and fix all branch changes
```

**Git Mode Technical Notes**:
```bash
--staged:  git diff --cached --name-only --diff-filter=ACMR
--changed: git diff --name-only --diff-filter=ACMR
--branch:  git diff origin/main...HEAD --name-only --diff-filter=ACMR
--commit:  git diff-tree --no-commit-id --name-only -r <ref>
```

File filtering:
- Respects `.gitignore` (excludes `node_modules/`, build outputs, etc.)
- Filters to supported file types only (see Behavior section)
- Excludes binary files
- If no matching files remain, displays "No files to review" and exits cleanly

**Ignore File Format** (`.a11yignore`):
```
# Format: <file>[:<line>] [WCAG:<criterion>] [# comment]

# Ignore entire file (all issues)
src/legacy/OldForm.tsx

# Ignore specific line (any issue at that line)
src/components/Hero.tsx:42                    # decorative background image

# Ignore specific WCAG criterion for entire file
src/components/Badge.tsx WCAG:1.4.3           # contrast intentional for design

# Ignore specific criterion at specific line
src/components/Modal.tsx:87 WCAG:2.4.3        # focus order intentional
```

**Behavior**:
- Identify WCAG 2.1 AA violations
- Categorize by severity (Critical, Serious, Moderate, Minor)
- Reference specific WCAG success criteria
- Note: Claude can identify structural issues (missing attributes, improper nesting) but cannot fully evaluate subjective criteria (alt text quality, meaningful link text, context-dependent contrast). These are flagged for human review.
- Respects `.a11yignore` file for suppressing known false positives or accepted exceptions
- In repo/git modes: group by file, identify patterns, generate summary
- Git modes automatically filter to relevant file types (*.tsx, *.jsx, *.html, *.css, *.scss)

**Severity Definitions**:
- **Critical**: Completely blocks access for users with disabilities (e.g., no keyboard access, missing alt text on functional images, form cannot be submitted)
- **Serious**: Significant barrier that makes tasks very difficult (e.g., missing form labels, inadequate focus indicators, missing heading structure)
- **Moderate**: Creates difficulty but workarounds exist (e.g., poor color contrast on non-essential text, redundant links, missing skip links)
- **Minor**: Best practice violations with minimal user impact (e.g., redundant ARIA roles, suboptimal heading order, missing landmark regions)

**Edge Cases**:
- **No issues found**: Displays "No accessibility issues found" with a summary
- **Non-supported file type**: Displays "File type not supported for a11y review. Supported: .tsx, .jsx, .html, .css, .scss"

**Exit Codes** (for scripting and CI integration):
- `0`: No issues found at or above the specified severity (default: all severities)
- `1`: Issues found at or above the specified severity
- `2`: Error (invalid arguments, git errors, file not found)

Exit codes work consistently across all modes (`--staged`, `--changed`, `--branch`, `--commit`, `--repo`). Combine with `--severity` to control what triggers a non-zero exit:
```bash
# Fail only on critical issues
claude /cc-a11y review --branch --severity critical

# Fail on serious or critical issues
claude /cc-a11y review --repo --severity serious
```

**Output Format (File Mode)**:
```
## Accessibility Review: [filename]
**Date**: [YYYY-MM-DD]

### Critical Issues (0)
### Serious Issues (2)
- [ ] **Missing form labels** (WCAG 1.3.1, 4.1.2) `#f3a1`
  - Line 45: `<input type="text">` lacks associated label
  - Recommendation: Add `<label>` element or aria-label attribute

### Moderate Issues (1)
### Minor Issues (0)

### Summary
- Total issues: 3
- Files reviewed: 1
```

**Issue Identifiers**: Each issue is assigned a short, stable ID (e.g., `#f3a1`) generated from a hash of file path, WCAG criterion, and surrounding code context. These IDs enable reliable matching when fixing issues from saved reports, even after code refactoring shifts line numbers.

**Output Format (Repo Mode)**: Structured markdown report with executive summary, issues grouped by file, recurring patterns, and recommendations.

---

### Verb: `fix` - Fix Accessibility Issues

**Purpose**: Apply accessibility fixes to identified issues.

**Behavior**:
- Can be run after `review` to fix reported issues
- Can read issues from a saved review report file
- Presents fixes for approval before applying
- Explains the rationale for each fix
- When using `--from`, automatically updates the report to mark fixed issues

**Arguments**:
- No additional args: Fix all issues in current file. If existing review reports are found in the `a11y/` folder, prompts the user to select one or proceed without.
- `--from <path>`: Read issues from a review report file (and update it when fixed)
- `--line <number>`: Fix issue at specific line only
- `--critical`: Fix only critical issues
- `--interactive`: Step through each fix one by one
- `--auto`: Apply fixes without prompting for approval

**Example Usage**:
```
/cc-a11y fix                       # Fix all issues in current file
/cc-a11y fix --critical            # Fix only critical issues
/cc-a11y fix --line 45             # Fix issue at line 45
/cc-a11y fix --from report.md      # Fix issues from report and mark as fixed
```

**Auto-Discovery of Reports**:
When running `/cc-a11y fix` without `--from`, the skill checks the `a11y/` folder for existing review reports. If found, it prompts:
```
Found existing review reports:
  1. a11y/2024-01-15-a11y-review.md (12 issues, 3 fixed)
  2. a11y/2024-01-10-a11y-review.md (8 issues, 8 fixed)

Use a report? [1/2/n]: _
```
Selecting a report is equivalent to using `--from`. Selecting `n` proceeds with a fresh review of the current file.

**Interactive Mode** (`--interactive`):
```
Fix 1 of 3: Missing form label at line 45
Proposed: Add aria-label="Search" to <input>

[a]pply  [s]kip  [e]dit  [q]uit all
> _
```

**Output Format**:
```
## Accessibility Fixes Applied: [filename]

### Changes Made (3)
1. **Line 45**: Added `aria-label="Search"` to input element
   - Issue `#f3a1`: Missing form label (WCAG 1.3.1, 4.1.2)

2. **Line 72**: Added `alt="Product thumbnail"` to img element
   - Issue `#b7c2`: Missing alt text (WCAG 1.1.1)

3. **Line 103**: Added `aria-expanded` attribute to dropdown button
   - Issue `#d4e5`: Missing state indicator (WCAG 4.1.2)

### Summary
- Files modified: 1
- Issues fixed: 3
- Issues skipped: 0
```

**Report Update Format**:
When `--from` is used, the review report file is automatically updated. Fixed issues are marked with a checked checkbox:
```
- [x] **Missing form labels** (WCAG 1.3.1, 4.1.2) `#f3a1` ✓ Fixed [2024-01-15]
  - Line 45: `<input type="text">` lacks associated label
```

The output will also note:
```
Updated report: a11y-review.md (3 issues marked as fixed)
```

**Issue Matching**: The `fix` verb matches issues from reports using the stable issue ID (e.g., `#f3a1`). This ID is generated from a hash of file path, WCAG criterion, and code context, making it resilient to line number changes from refactoring. If an ID cannot be matched (e.g., the code was significantly rewritten), the user is prompted to confirm or re-run review.

---

### Verb: `report` - Generate Compliance Report

**Purpose**: Generate a formal accessibility compliance report.

**Behavior**:
- Summarizes current a11y state of the codebase
- Lists conformance level (A, AA, AAA)
- Documents known issues and remediation status
- Suitable for stakeholder communication

**Arguments**:
- No additional args: Generate report to stdout
- `--output <path>`: Save report to file. Behavior:
  - Automatically prepends date in ISO 8601 format YYYY-MM-DD
  - Automatically appends `.md` extension if not present
  - If no folder is specified, saves to `a11y/` folder
- `--from <path>`: Base report on existing review output file

**Example Usage**:
```
/cc-a11y report                    # Generate compliance report
/cc-a11y report --output compliance.md  # Saves as a11y/2024-01-15-compliance.md
```

**Output Format**:
```
# Accessibility Compliance Report
**Repository**: [repo-name]
**Date**: [YYYY-MM-DD]
**Target Level**: WCAG 2.1 AA

## Executive Summary
- **Conformance Status**: Partial (AA)
- **Total Issues**: 12 (3 critical, 5 serious, 4 moderate)
- **Files Analyzed**: 47

## Issues by Category
| Category | Critical | Serious | Moderate | Minor |
|----------|----------|---------|----------|-------|
| Forms    | 2        | 3       | 1        | 0     |
| Images   | 1        | 1       | 2        | 0     |
| Navigation | 0      | 1       | 1        | 0     |

## Critical Issues Requiring Immediate Attention
1. **Missing form labels** - 2 occurrences
   - src/components/LoginForm.tsx
   - src/components/SearchBar.tsx

## Recommendations
1. Prioritize critical issues blocking keyboard users
2. Add automated a11y testing to CI pipeline
3. Schedule quarterly compliance reviews

## Appendix: Full Issue List
[Detailed issues grouped by file...]
```

**Tracking Progress**: All `--output` files are automatically dated, making it easy to compare issues over time and track reduction across quarters.

---

## Installation for Developers

**Prerequisites**:
- Claude Code CLI installed (v1.x or later - TBD)
- Git for version management

### Recommended: Global Installation

Install skills globally so they're available in any repository:

```bash
# One-time setup
git clone git@github.com:concord-consortium/dev-templates.git ~/dev-templates

# Create global skills directory if needed
mkdir -p ~/.claude/skills

# Symlink the skill directory to global location
ln -s ~/dev-templates/claude/skills/cc-a11y ~/.claude/skills/
```

**Updating**: When the team updates the skills, developers just run `git pull` in their `~/dev-templates` directory. Symlinks automatically pick up changes.

**Versioning**: The skill follows semantic versioning via git tags (e.g., `cc-a11y-v1.0.0`). Major version changes may include breaking changes to output format or command syntax. Minor and patch versions are backwards compatible. To pin to a specific version:
```bash
cd ~/dev-templates && git checkout cc-a11y-v1.0.0
```
For latest updates, stay on `main` branch.

### Alternative: Per-Project Installation

If global installation isn't desired, copy skills to a specific project:

```bash
# From project root
mkdir -p .claude/skills
cp -r ~/dev-templates/claude/skills/cc-a11y .claude/skills/
```

---

## Workflow Examples

### Getting Started (First-Time Users)
```
1. Complete installation (see above)
2. Open any React component file in VSCode
3. Run `/cc-a11y review` to see the tool in action
4. Review the output to understand issue categorization
5. Try `/cc-a11y fix` on a file with issues to see fix proposals
```

### Single File Review & Fix
```
1. Developer opens component file
2. Runs `/cc-a11y review`
3. Claude reports: "Found 3 issues: 1 critical (missing button label), 2 moderate"
4. Developer runs `/cc-a11y fix`
5. Claude shows proposed changes, developer approves
6. Fixes applied, developer commits
```

### Pre-commit Hook Integration
```bash
# .git/hooks/pre-commit or via husky/lint-staged
claude /cc-a11y review --staged --severity critical
```
Uses exit codes (see Exit Codes section above) to block commits when issues are found. Adjust `--severity` to control strictness.

### Pre-PR Audit
```
1. Developer finishes feature branch
2. Runs `/cc-a11y review --branch --output a11y-review.md`
3. Reviews generated report (saved as a11y/2024-01-15-a11y-review.md)
4. Runs `/cc-a11y fix --from a11y/2024-01-15-a11y-review.md`
5. Creates PR with a11y-clean code
```

### Quarterly Compliance Check
```
1. Lead runs `/cc-a11y review --repo` on full repo
2. Runs `/cc-a11y report` to generate stakeholder summary
3. Creates tickets for identified issues
4. Tracks remediation progress
```

---

## Resource Files

All resources are co-located in the `claude/skills/cc-a11y/` skill directory. SKILL.md can reference them with relative paths like `[wcag-checklist.md](wcag-checklist.md)` and Claude will auto-load them.

Each resource file follows a consistent structure to enable reliable parsing.

### wcag-checklist.md

Quick reference of WCAG 2.1 AA success criteria.

**Structure**:
```markdown
---
version: "2.1"
level: "AA"
---

# WCAG 2.1 AA Checklist

## 1. Perceivable

### 1.1.1 Non-text Content (Level A)
**Description**: All non-text content has a text alternative.

**Common Violations**:
- Images missing alt attributes
- Icon buttons without accessible names
- Decorative images not marked as such

**Fix Patterns**:
- Add descriptive `alt` text for informative images
- Use `alt=""` or `role="presentation"` for decorative images
- Add `aria-label` to icon-only buttons

### 1.3.1 Info and Relationships (Level A)
...

## 2. Operable
...
```

### react-patterns.md

React-specific accessibility patterns grouped by component type.

**Structure**:
```markdown
---
framework: "react"
last_updated: "2024-01"
---

# React Accessibility Patterns

## Forms

### Text Input with Label
**Problem**: Input lacks programmatic label association.

**Solution**:
```jsx
// Preferred: explicit label association
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// Alternative: aria-label for icon inputs
<input type="search" aria-label="Search products" />
```

**Testing**: Verify label is announced by screen reader on focus.

### Form Validation Errors
**Problem**: Errors not announced to screen readers.
...

## Modals

### Focus Management
**Problem**: Focus not trapped within modal.
...

## Navigation
...
```

### common-fixes.md

Lookup table mapping issue types to fix templates.

**Structure**:
```markdown
---
format_version: "1.0"
---

# Common Accessibility Fixes

## Missing Alt Text

**Issue**: `<img>` element lacks alt attribute.

**Detection**: `img:not([alt])`

**Fix Template**:
```jsx
// Before
<img src="photo.jpg" />

// After (informative image)
<img src="photo.jpg" alt="[descriptive text]" />

// After (decorative image)
<img src="photo.jpg" alt="" />
```

**Edge Cases**:
- Complex images may need extended description via `aria-describedby`
- CSS background images conveying information need text alternative

**WCAG**: 1.1.1

---

## Missing Form Label

**Issue**: Form control lacks associated label.

**Detection**: `input:not([aria-label]):not([aria-labelledby])` without `<label>`

**Fix Template**:
```jsx
// Before
<input type="text" placeholder="Name" />

// After
<label htmlFor="name">Name</label>
<input id="name" type="text" />
```

**Edge Cases**:
- Search inputs may use `aria-label` instead of visible label
- Groups of related inputs should use `fieldset`/`legend`

**WCAG**: 1.3.1, 4.1.2

---

## Insufficient Color Contrast
...
```

---

## Future Enhancements

1. **axe-core Integration**: Run automated testing and incorporate results
2. **Component Library Audit**: Pre-audit shared components
3. **Training Mode**: `/cc-a11y learn` verb to teach developers about issues found
4. **Custom Rules**: Org-specific rules beyond WCAG
5. **Performance**: Progress indicator for `--repo` on large codebases
6. **Feedback Loop**: Mechanism to report false positives and improve detection accuracy
7. **i18n Considerations**: Guidance for internationalized alt text, labels, and ARIA content
8. **Skill Testing**: Test suite to verify skill behavior doesn't regress across updates

---

## Design Decisions

1. **CI/CD Integration**: Not in scope - this is a developer tool only
2. **Tech Stack**: React-focused (no Vue/Angular variants needed)
3. **Architecture**: Simple skill approach (no MCP server)
4. **Fix Approval**: Require approval by default, with `--auto` option to skip prompts
5. **IDE Support**: Designed for VSCode with Claude Code extension. "Current file" and "selection" features require IDE integration; CLI-only users should specify file paths explicitly.
