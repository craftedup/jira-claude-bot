# JIRA Claude Code Bot - Project Specification

## Overview

A generalized automation system that integrates JIRA with Claude Code to automatically work tickets. The system can run as a 24/7 bot that monitors JIRA projects for new and updated tickets, works them using Claude Code, creates PRs, and updates JIRA with results.

## Core Features

### 1. JIRA Integration
- **Ticket Fetching**: Poll for tickets by status, project, assignee, or JQL query
- **Ticket Details**: Download full ticket data including attachments, comments, linked issues
- **Status Transitions**: Move tickets through workflow states
- **Comments**: Add formatted comments with links, code blocks, and structured content
- **Attachments**: Upload screenshots, logs, or other files as attachments

### 2. GitHub Integration
- **Branch Management**: Create feature branches following naming conventions
- **Commits**: Create commits with ticket references and co-author attribution
- **Pull Requests**: Create PRs with structured descriptions, link to tickets
- **PR Status**: Monitor PR checks, approvals, and merge status

### 3. Deployment Integration
- **Vercel**: Get preview deployment URLs from PRs
- **Generic Webhook**: Support custom deployment systems
- **Status Monitoring**: Wait for deployments to complete before updating tickets

### 4. Claude Code Integration
- **Ticket Processing**: Pass ticket context to Claude Code for implementation
- **Project-Specific Instructions**: Load custom instructions per project/repo
- **Skill Definitions**: Define reusable workflows as Claude Code skills
- **Context Management**: Provide relevant codebase context for each ticket

### 5. Bot/Daemon Mode
- **Polling**: Continuously monitor JIRA for actionable tickets
- **Queue Management**: Process tickets in priority order with concurrency limits
- **Auto-Assignment**: Optionally claim tickets before working them
- **Retry Logic**: Handle transient failures gracefully
- **Notifications**: Alert on completions, failures, or tickets requiring human intervention

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         JIRA Claude Bot                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │   Poller    │───▶│    Queue    │───▶│   Worker    │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│         │                                     │                 │
│         ▼                                     ▼                 │
│  ┌─────────────┐                      ┌─────────────┐          │
│  │    JIRA     │                      │ Claude Code │          │
│  │   Client    │                      │   Runner    │          │
│  └─────────────┘                      └─────────────┘          │
│         │                                     │                 │
│         ▼                                     ▼                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │   GitHub    │    │   Vercel    │    │  Notifier   │        │
│  │   Client    │    │   Client    │    │             │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Poller
- Runs on configurable interval (default: 5 minutes)
- Queries JIRA for tickets matching criteria
- Filters out tickets already in queue or recently processed
- Adds new tickets to the queue

#### 2. Queue
- Priority-based ordering (ticket priority, age, etc.)
- Persistence (survive restarts)
- Deduplication
- Status tracking (pending, in_progress, completed, failed)

#### 3. Worker
- Pulls tickets from queue
- Orchestrates the full workflow:
  1. Fetch ticket details
  2. Clone/update repo
  3. Create feature branch
  4. Run Claude Code with ticket context
  5. Commit changes
  6. Create PR
  7. Wait for deployment
  8. Update JIRA
- Handles errors and retries

#### 4. Claude Code Runner
- Spawns Claude Code CLI with appropriate context
- Passes ticket information as initial prompt
- Monitors progress and captures output
- Handles timeouts and failures

#### 5. Clients (JIRA, GitHub, Vercel)
- Encapsulated API interactions
- Authentication management
- Rate limiting
- Error handling

#### 6. Notifier
- Slack/Discord/Email notifications
- Configurable events (completion, failure, needs review)
- Daily/weekly summaries

---

## Configuration

### Global Configuration (`~/.jira-claude-bot/config.yaml`)

```yaml
# Global settings
bot:
  poll_interval: 300  # seconds
  max_concurrent_workers: 2
  log_level: info
  data_dir: ~/.jira-claude-bot/data

# Notification settings
notifications:
  slack:
    webhook_url: ${SLACK_WEBHOOK_URL}
    channel: "#dev-bot"
  events:
    - ticket_completed
    - ticket_failed
    - needs_human_review

# Default JIRA settings (can be overridden per project)
jira:
  host: ${JIRA_HOST}
  email: ${JIRA_EMAIL}
  api_token: ${JIRA_API_TOKEN}
```

### Project Configuration (`.jira-claude-bot.yaml` in repo root)

```yaml
# Project identification
project:
  jira_key: CW2  # JIRA project key
  repo: craftedup/crafted-website-2022

# Ticket selection criteria
tickets:
  statuses:
    - "To Do"
    - "Ready for Dev"
  types:
    - Task
    - Bug
    - Story
  # Optional JQL for complex queries
  jql: "project = CW2 AND status = 'To Do' AND priority in (High, Medium)"

# Workflow configuration
workflow:
  # Branch naming pattern
  branch_pattern: "feature/{ticket_key}"

  # Commit message pattern
  commit_pattern: "{ticket_key}: {summary}"

  # PR settings
  pr:
    base_branch: develop
    title_pattern: "{ticket_key}: {summary}"
    body_template: |
      ## Jira Ticket
      {ticket_url}

      ## Summary
      {changes_summary}

      ## Testing
      {testing_instructions}

      🤖 Generated with JIRA Claude Bot

  # Status transitions
  transitions:
    on_pr_created: "PR to develop open"
    on_pr_merged: "Done"
    on_pr_failed: "To Do"  # Return to queue

# Deployment
deployment:
  platform: vercel
  wait_for_preview: true
  preview_timeout: 300  # seconds

# Claude Code settings
claude:
  model: sonnet  # or opus for complex tickets
  max_turns: 50

  # Custom instructions for this project
  instructions: |
    This is a Next.js website using TypeScript and Tailwind CSS.

    Key conventions:
    - Components are in src/components (atoms, molecules, organisms)
    - Pages are in src/pages
    - Use existing component patterns when possible
    - Run TypeScript checks before committing

  # Skills/commands available
  skills:
    - work-ticket

# Safety guardrails
guardrails:
  # Require human review for certain conditions
  require_review:
    - file_count > 10
    - lines_changed > 500
    - modifies_auth: true
    - modifies_payments: true

  # Skip tickets matching these conditions
  skip:
    - has_label: "needs-design"
    - has_label: "blocked"
    - story_points > 5
```

---

## CLI Interface

```bash
# Initialize a new project
jira-claude-bot init

# Run bot in daemon mode
jira-claude-bot start
jira-claude-bot start --detach  # Run in background

# Stop daemon
jira-claude-bot stop

# Process a single ticket (for testing)
jira-claude-bot work TICKET-123

# List tickets that would be processed
jira-claude-bot list-tickets
jira-claude-bot list-tickets --status "To Do"

# Show queue status
jira-claude-bot queue

# Show recent activity
jira-claude-bot history
jira-claude-bot history --ticket TICKET-123

# Validate configuration
jira-claude-bot validate

# Show bot status
jira-claude-bot status
```

---

## Directory Structure

```
jira-claude-bot/
├── src/
│   ├── cli/
│   │   ├── index.ts           # CLI entry point
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── start.ts
│   │   │   ├── stop.ts
│   │   │   ├── work.ts
│   │   │   ├── list-tickets.ts
│   │   │   ├── queue.ts
│   │   │   └── status.ts
│   │   └── utils.ts
│   │
│   ├── core/
│   │   ├── bot.ts             # Main bot orchestrator
│   │   ├── poller.ts          # JIRA polling logic
│   │   ├── queue.ts           # Ticket queue management
│   │   ├── worker.ts          # Ticket processing worker
│   │   └── config.ts          # Configuration loading
│   │
│   ├── clients/
│   │   ├── jira.ts            # JIRA API client
│   │   ├── github.ts          # GitHub API client
│   │   ├── vercel.ts          # Vercel API client
│   │   └── claude.ts          # Claude Code CLI wrapper
│   │
│   ├── notifications/
│   │   ├── index.ts
│   │   ├── slack.ts
│   │   ├── discord.ts
│   │   └── email.ts
│   │
│   └── utils/
│       ├── logger.ts
│       ├── templates.ts       # PR/comment templates
│       └── git.ts             # Git operations
│
├── templates/
│   ├── pr-body.md
│   ├── jira-comment.md
│   └── skills/
│       └── work-ticket.md     # Default skill template
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## Workflow Example

### Automated Ticket Processing

1. **Poller** finds ticket `CW2-100` in "To Do" status
2. **Queue** adds ticket with priority based on JIRA priority
3. **Worker** picks up ticket:
   - Fetches full ticket details and attachments
   - Clones/updates the repository
   - Creates branch `feature/CW2-100`
   - Spawns Claude Code with ticket context
4. **Claude Code** implements the ticket:
   - Reads requirements from ticket
   - Makes code changes
   - Runs tests/type checks
   - Commits changes
5. **Worker** continues:
   - Pushes branch to GitHub
   - Creates PR with structured description
   - Waits for Vercel preview deployment
   - Updates JIRA with PR link, preview URL, and changes summary
   - Transitions ticket to "PR to develop open"
6. **Notifier** sends Slack message with completion summary

### Error Handling

- **Claude Code fails**: Log error, add JIRA comment explaining failure, leave ticket in queue for retry
- **PR creation fails**: Retry with backoff, notify on persistent failure
- **Deployment fails**: Add JIRA comment, transition to blocked status
- **Guardrail triggered**: Skip ticket, add comment explaining why human review needed

---

## Security Considerations

1. **Credentials**: All API tokens stored as environment variables or in secure credential store
2. **Code Review**: Bot-created PRs still require human approval before merge
3. **Guardrails**: Configurable limits on what the bot can do (file changes, sensitive areas)
4. **Audit Trail**: All bot actions logged with timestamps and ticket references
5. **Scope Limits**: Bot only has access to configured repositories and JIRA projects

---

## Implementation Phases

### Phase 1: Core Scripts (MVP)
- [x] JIRA fetch ticket script
- [x] JIRA update comment script
- [x] JIRA transition status script
- [x] JIRA fetch by status script
- [x] Vercel preview URL script
- [x] Claude Code work-ticket skill

### Phase 2: CLI Tool
- [ ] Package as installable CLI (`npm install -g jira-claude-bot`)
- [ ] Configuration file support
- [ ] `work` command for single ticket
- [ ] `list-tickets` command
- [ ] Per-project configuration

### Phase 3: Bot Mode
- [ ] Polling mechanism
- [ ] Queue management with persistence
- [ ] Worker with full workflow
- [ ] Error handling and retries
- [ ] Basic notifications (Slack)

### Phase 4: Advanced Features
- [ ] Multiple project support
- [ ] Parallel workers
- [ ] Web dashboard for monitoring
- [ ] Advanced guardrails and rules
- [ ] Custom deployment platform support
- [ ] Metrics and analytics

---

## Getting Started

### Prerequisites
- Node.js 18+
- Claude Code CLI installed and authenticated
- Git configured with SSH access to repositories
- JIRA API token
- GitHub CLI (`gh`) installed and authenticated
- Vercel CLI (optional, for deployment integration)

### Quick Start

```bash
# Install the CLI
npm install -g jira-claude-bot

# Set up credentials
export JIRA_HOST="https://yourcompany.atlassian.net"
export JIRA_EMAIL="your@email.com"
export JIRA_API_TOKEN="your-api-token"

# Initialize in a project
cd your-repo
jira-claude-bot init

# Edit the generated .jira-claude-bot.yaml

# Test with a single ticket
jira-claude-bot work PROJ-123

# Start the bot
jira-claude-bot start
```

---

## Future Enhancements

1. **Learning**: Track which types of tickets succeed/fail to improve ticket selection
2. **Complexity Estimation**: Use Claude to estimate ticket complexity before processing
3. **Multi-repo**: Support tickets that span multiple repositories
4. **Code Review Bot**: Separate mode for reviewing PRs created by humans
5. **Chat Interface**: Slack/Discord bot for interacting with the system
6. **Custom Workflows**: Support for non-standard JIRA workflows
7. **Team Assignment**: Route tickets to specific bot instances based on expertise
