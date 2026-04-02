# Speckit Workflow Guide

This guide documents how we use [Speckit](https://speckit.dev) to drive feature development from specification through implementation. It covers the commands available, the workflow we followed for ANSTRAT-1806 (Portal Admin Onboarding), and conventions for team members to follow.

## What is Speckit?

Speckit is a specification-driven development toolkit that integrates with Claude Code. It provides slash commands (`/speckit.*`) that generate and maintain structured design artifacts — specs, plans, tasks, checklists — and then drive implementation from those artifacts.

**Version**: 0.4.2 (see `.specify/init-options.json`)

## Project Setup

Speckit was initialized in this repo with:

```bash
npx speckit init --ai claude --here
```

This created:

```
.specify/                          # Speckit configuration
  init-options.json                # Init settings (AI provider, branch numbering)
  scripts/bash/                    # Helper scripts (prerequisite checks)
  templates/                       # Templates for plan, tasks, checklists

.claude/commands/                  # Claude Code slash commands
  speckit.specify.md               # /speckit.specify
  speckit.clarify.md               # /speckit.clarify
  speckit.plan.md                  # /speckit.plan
  speckit.tasks.md                 # /speckit.tasks
  speckit.checklist.md             # /speckit.checklist
  speckit.analyze.md               # /speckit.analyze
  speckit.implement.md             # /speckit.implement
  speckit.taskstoissues.md         # /speckit.taskstoissues
  speckit.constitution.md          # /speckit.constitution
```

## Available Commands

| Command | Purpose | Input | Output |
|---------|---------|-------|--------|
| `/speckit.specify` | Create or update feature spec | Natural language description | `specs/<feature>/spec.md` |
| `/speckit.clarify` | Find gaps in the spec | Existing `spec.md` | Up to 5 clarification questions, answers encoded back into spec |
| `/speckit.plan` | Generate architecture and design plan | `spec.md` | `specs/<feature>/plan.md` |
| `/speckit.tasks` | Break plan into ordered tasks | `spec.md` + `plan.md` | `specs/<feature>/tasks.md` |
| `/speckit.checklist` | Generate quality checklists | User requirements | `specs/<feature>/checklists/*.md` |
| `/speckit.analyze` | Cross-artifact consistency check | `spec.md` + `plan.md` + `tasks.md` | Analysis report (non-destructive) |
| `/speckit.implement` | Execute all tasks | `tasks.md` + `plan.md` | Code changes, tasks marked `[X]` |
| `/speckit.taskstoissues` | Convert tasks to GitHub issues | `tasks.md` | GitHub issues via `gh` CLI |
| `/speckit.constitution` | Define project principles | Interactive input | `.specify/constitution.md` |

## Feature Directory Structure

Each feature lives under `specs/<feature-id>/`:

```
specs/001-portal-admin-onboarding/
  spec.md                          # Feature specification (what to build)
  plan.md                          # Architecture & design (how to build it)
  tasks.md                         # Task breakdown (ordered implementation steps)
  contracts/
    api-spec.yaml                  # OpenAPI spec (API contracts)
  checklists/                      # Quality checklists (UX, security, etc.)
  adrs/                            # Architecture Decision Records
    README.md                      # ADR index
    001-db-config-source-...md     # Individual ADRs
    002-proxy-authenticator-...md
    ...
```

The `adrs/` directory is not part of the standard Speckit flow — we added it manually to capture key architectural decisions with diagrams.

## Workflow: How We Built ANSTRAT-1806

Here is the step-by-step workflow we followed, with the actual commands used:

### Step 1: Specify

Created the feature specification from a Jira ticket description and Figma mockups.

```
/speckit.specify specs/001-portal-admin-onboarding
```

**Input**: Natural language description of the setup wizard and admin pages feature, referencing Figma screens 1-14 and Jira ANSTRAT-1806.

**Output**: `specs/001-portal-admin-onboarding/spec.md` — A structured spec covering problem statement, goals, scope, functional requirements, UI mockup references, API endpoints, security considerations, and deployment modes.

**Tips**:
- Reference Figma mockup filenames in the spec so the plan and implementation can trace back to designs
- Include deployment constraints (RHEL vs OpenShift) early — they affect architecture decisions
- Mark the spec version and status at the top for traceability

### Step 2: Clarify

Identified underspecified areas and resolved ambiguities.

```
/speckit.clarify specs/001-portal-admin-onboarding
```

**What it does**: Reads the spec and asks up to 5 targeted clarification questions about gaps, edge cases, or ambiguities. Answers are encoded back into the spec.

**Example questions it asked**:
- How should the setup wizard handle a partially completed setup if the user navigates away?
- Should SCM configuration be required or optional in the wizard?
- What happens if the AAP controller URL changes after setup — does it require re-running the wizard?

### Step 3: Plan

Generated the architecture and implementation plan.

```
/speckit.plan specs/001-portal-admin-onboarding
```

**Input**: `spec.md`

**Output**: `specs/001-portal-admin-onboarding/plan.md` — Detailed architecture covering package structure, database design, config merging strategy, encryption module, auth flow, permission model, frontend component hierarchy, and deployment integration.

**Tips**:
- Review the plan before proceeding to tasks — this is the best time to catch architectural issues
- The plan is where "extend vs create new package" decisions are made
- Key code snippets in the plan become the reference for implementation

### Step 4: Tasks

Generated the ordered task breakdown.

```
/speckit.tasks specs/001-portal-admin-onboarding
```

**Input**: `spec.md` + `plan.md`

**Output**: `specs/001-portal-admin-onboarding/tasks.md` — 34 tasks organized into 7 phases, with dependencies, file lists, acceptance criteria, and complexity ratings.

**Task format**:

```markdown
### [ ] T1.3 — Implement database migration and DatabaseHandler

**Files to create**: ...
**Acceptance criteria**: ...
**Complexity**: Medium
**Dependencies**: T1.2
**Blocked by**: T1.2
```

**Tips**:
- Tasks are marked `[ ]` (pending) or `[X]` (done) — speckit.implement updates these as it works
- The `[P]` marker indicates tasks that can run in parallel
- Review the dependency graph before implementing — wrong dependencies waste time

### Step 5: Implement

Executed the implementation plan, processing tasks in dependency order.

```
/speckit.implement specs/001-portal-admin-onboarding
```

**What it does**:
1. Reads `tasks.md` and `plan.md`
2. Checks checklists (if any) — blocks on incomplete checklists unless you confirm
3. Executes tasks phase by phase, respecting dependency order
4. Marks each task `[X]` in `tasks.md` as it completes
5. Runs lint/type checks after major changes
6. Reports progress after each task

**Important**: We ran `/speckit.implement` multiple times across sessions, targeting remaining tasks:

```
# First session: Phases 1-3 (backend, config merging, wizard)
/speckit.implement specs/001-portal-admin-onboarding

# Later session: Phase 4 remaining tasks (T4.3, T4.4, T4.5)
/speckit.implement specs/001-portal-admin-onboarding
```

The command detects which tasks are already `[X]` and only processes remaining ones.

### Step 6: Analyze (optional)

Checks consistency across all artifacts.

```
/speckit.analyze specs/001-portal-admin-onboarding
```

**What it checks**:
- Spec requirements covered by plan sections
- Plan decisions reflected in task breakdown
- Task file paths matching plan file structure
- Missing or orphaned tasks

### Step 7: ADRs (manual addition)

We manually added Architecture Decision Records to capture key decisions:

```
specs/001-portal-admin-onboarding/adrs/
  001-db-config-source-over-env-vars.md
  002-proxy-authenticator-for-local-admin.md
  003-extend-existing-plugins-over-new-packages.md
  004-sync-proxy-to-catalog-module.md
  005-deployment-aware-restart.md
  006-partial-secret-updates-on-edit.md
```

Each ADR follows the format: **Status, Context, Decision (with diagrams), Consequences (positive/negative), Related files**.

ADRs are not part of the standard Speckit flow but are a recommended complement — they capture the *why* behind decisions that the plan captures the *what* of.

### Design Evolution During Implementation

Not all decisions from the original spec survived implementation. Some were changed based on testing feedback:

- **General page removed**: The spec defined a General page with a local admin toggle. During manual testing, we found that enabling local admin from the UI created a broken logout flow (auto-re-authentication). Following enterprise patterns (AWS, GitLab, Vault), we moved local admin to CLI-only access and removed the page entirely.
- **Sign-in modes expanded**: The spec described two modes (setup vs normal). Implementation revealed that a third "dual mode" was needed post-setup when local admin is re-enabled — showing both a password form and AAP OAuth without auto-authentication.
- **Partial secret updates added**: The spec required all fields on edit. Testing showed this forced re-entry of secrets the admin didn't have, so we added `allowPartialSecrets` for connection edit endpoints.
- **Sync proxy implemented**: The spec listed sync as delegated to the catalog module but the initial implementation was a stub. We wired it to the real catalog sync endpoints via service-to-service auth.

These changes were captured in ADRs and the spec/plan files were updated as historical records.

## Commands Not Used (Available for Future Features)

### `/speckit.checklist`

Generates quality checklists for a feature. Useful for UX review, security review, or accessibility audits.

```
/speckit.checklist specs/002-new-feature
```

Creates files like `specs/002-new-feature/checklists/ux.md`, `security.md`, etc. The `/speckit.implement` command checks these before starting and blocks if any items are incomplete.

### `/speckit.taskstoissues`

Converts tasks into GitHub issues with proper labels and dependency references.

```
/speckit.taskstoissues specs/001-portal-admin-onboarding
```

Creates GitHub issues via the `gh` CLI, preserving the task dependency order.

### `/speckit.constitution`

Defines project-wide development principles that guide all feature specs. Interactive command that captures team preferences (e.g., "prefer extending existing packages over creating new ones").

```
/speckit.constitution
```

Creates `.specify/constitution.md` which is referenced by other Speckit commands.

## Conventions

### Feature Numbering

Features use sequential numbering: `001-feature-name`, `002-feature-name`, etc. (configured in `.specify/init-options.json`).

### Branch Naming

Feature branches should correspond to spec directories. For ANSTRAT-1806, the branch was `settings_mgmt`.

### Spec Lifecycle

```
Draft → /speckit.specify
  ↓
Gaps? → /speckit.clarify (iterate until clear)
  ↓
Architecture → /speckit.plan (review with team)
  ↓
Tasks → /speckit.tasks (review dependency order)
  ↓
Checklists → /speckit.checklist (optional, for quality gates)
  ↓
Implementation → /speckit.implement (can be run incrementally)
  ↓
Consistency → /speckit.analyze (verify spec ↔ plan ↔ tasks alignment)
  ↓
Issues → /speckit.taskstoissues (optional, for GitHub tracking)
```

### Updating Artifacts

Specs, plans, and tasks can be updated at any point. When you modify the spec:

1. Update `spec.md` directly
2. Run `/speckit.plan` to regenerate the plan if architecture changed
3. Run `/speckit.tasks` to regenerate tasks if scope changed
4. Run `/speckit.analyze` to verify consistency

### Context File

For multi-session work, we maintained a `.claude/CONTEXT.md` file that captures the current implementation state, remaining work, and key patterns. This is read at the start of each Claude Code session to restore context.

## Quick Reference

```bash
# Start a new feature
/speckit.specify specs/002-my-feature

# Refine the spec
/speckit.clarify specs/002-my-feature

# Design the architecture
/speckit.plan specs/002-my-feature

# Break into tasks
/speckit.tasks specs/002-my-feature

# Add quality gates (optional)
/speckit.checklist specs/002-my-feature

# Verify consistency
/speckit.analyze specs/002-my-feature

# Implement everything
/speckit.implement specs/002-my-feature

# Create GitHub issues (optional)
/speckit.taskstoissues specs/002-my-feature
```
