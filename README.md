# JIRA Claude Bot

Automated JIRA ticket processing with Claude Code. This bot can automatically work through JIRA tickets, implement changes, create PRs, and update tickets with results.

## Features

- 🎫 **JIRA Integration**: Fetch tickets, update comments, transition statuses
- 🔀 **GitHub Integration**: Create branches, commit changes, create PRs
- 🚀 **Deployment Integration**: Get Vercel preview URLs
- 🤖 **Claude Code Integration**: Automatically implement ticket requirements
- ⚙️ **Configurable**: Per-project configuration for workflows, transitions, and more

## Installation

### Via npm (for Crafted org members)

```bash
# Authenticate with GitHub Packages (one-time setup)
npm login --registry=https://npm.pkg.github.com --scope=@craftedup

# Install globally
npm install -g @craftedup/jira-claude-bot
```

### From source

```bash
# Clone the repository
git clone https://github.com/craftedup/jira-claude-bot.git
cd jira-claude-bot

# Install dependencies
npm install

# Build
npm run build

# Link globally
npm link
```

## Prerequisites

- Node.js 18+
- [Claude Code CLI](https://claude.ai/cli) installed and authenticated
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- JIRA API token

## Configuration

### Environment Variables

Set these environment variables:

```bash
export JIRA_HOST="https://yourcompany.atlassian.net"
export JIRA_EMAIL="your@email.com"
export JIRA_API_TOKEN="your-api-token"
```

### Project Configuration

Initialize in your project:

```bash
cd your-project
jira-claude-bot init
```

This creates `.jira-claude-bot.yaml`:

```yaml
project:
  jiraKey: PROJ
  repo: owner/repo-name

tickets:
  statuses:
    - "To Do"

workflow:
  branchPattern: "feature/{ticket_key}"
  pr:
    baseBranch: develop
  transitions:
    onPrCreated: "PR to develop open"

deployment:
  platform: vercel
  waitForPreview: true

claude:
  model: sonnet
  maxTurns: 50
```

## Usage

### Process a Single Ticket

```bash
jira-claude-bot work PROJ-123
```

### List Available Tickets

```bash
jira-claude-bot list-tickets
jira-claude-bot list-tickets --status "Ready for Dev"
```

### Validate Configuration

```bash
jira-claude-bot validate
```

### Show Status

```bash
jira-claude-bot status
```

### Run in Daemon Mode (24/7)

```bash
# Start with default 5-minute poll interval
jira-claude-bot start

# Start with custom interval (e.g., 60 seconds)
jira-claude-bot start --interval 60
```

The daemon will continuously poll JIRA for tickets matching your configured statuses, work them one at a time, and update JIRA with the results. Press Ctrl+C to stop gracefully.

## How It Works

1. **Fetch Ticket**: Downloads ticket details and attachments from JIRA
2. **Create Branch**: Creates a feature branch from the base branch
3. **Run Claude Code**: Passes ticket context to Claude Code for implementation
4. **Commit & Push**: Commits changes and pushes to GitHub
5. **Create PR**: Creates a pull request with ticket link and description
6. **Get Preview URL**: Waits for deployment and gets preview URL
7. **Update JIRA**: Adds comment with PR link and preview URL, transitions status

## Development

```bash
# Watch mode
npm run dev

# Run CLI directly
npx ts-node src/cli/index.ts work PROJ-123
```

## Roadmap

- [x] Bot daemon mode (24/7 polling)
- [ ] Queue management with persistence
- [ ] Slack/Discord notifications
- [ ] Web dashboard
- [ ] Multiple project support
- [ ] Parallel workers

See [SPEC.md](./SPEC.md) for the full project specification.

## License

MIT
