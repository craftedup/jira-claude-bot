# JIRA Claude Bot

Automated JIRA ticket processing with Claude Code. This bot can automatically work through JIRA tickets, implement changes, create PRs, and update tickets with results.

## Features

- 🎫 **JIRA Integration**: Fetch tickets (with attachments and comment history), update comments, transition statuses
- 🔀 **Git Host Integration**: GitHub (with PRs) and Bitbucket (push-only) support
- 🚀 **Deployment Integration**: Get Vercel preview URLs
- 🤖 **Claude Code Integration**: Automatically implement ticket requirements, or drop into an interactive session with ticket context pre-loaded
- 📸 **Before/After Screenshots**: Capture screenshots of referenced URLs before and after Claude's changes, attached to the JIRA ticket
- 🏷️ **Label & Status Filtering**: Pick up only tickets matching configured statuses and labels
- ⚙️ **Configurable**: Per-project configuration for workflows, transitions, and more

## Prerequisites

Set these up **before** installing — the install step and `jira-claude-bot init` both assume they're already in place.

### 1. Local tools

- **Node.js 18+** — verify with `node -v`
- **[Claude Code CLI](https://claude.ai/cli)** — install and authenticate (`claude --version` should work)
- **[GitHub CLI](https://cli.github.com/)** — install and run `gh auth login` (needed for PR creation and deployment URL lookup)

### 2. JIRA API token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens while signed in to your Atlassian account
2. Click **Create API token** — give it a label like `jira-claude-bot`
3. **Copy the token immediately** — Atlassian only shows it once

Now set three environment variables so the bot can talk to JIRA. Your host, email, and token are the same for every project you run the bot in, so **set them globally once** rather than copying them into every project's `.env`.

**macOS / Linux (zsh — default on modern macOS):**

Open `~/.zshrc` in your editor (e.g. `open -e ~/.zshrc` or `code ~/.zshrc`) and append:

```bash
export JIRA_HOST="https://yourcompany.atlassian.net"
export JIRA_EMAIL="your@email.com"
export JIRA_API_TOKEN="<paste-token-here>"
```

Then reload your shell:

```bash
source ~/.zshrc
```

If you're on bash, use `~/.bashrc` (Linux) or `~/.bash_profile` (older macOS) instead.

Verify:

```bash
echo $JIRA_API_TOKEN   # should print your token
```

> **Note:** the bot also picks up a per-project `.env` file via `dotenv`, but that's only worth using if a specific project needs different JIRA credentials. For the common case (same JIRA account across all your projects), the shell profile is one-and-done.

### 3. GitHub Personal Access Token (only for npm install path)

Skip this if you're installing from source. If you want to `npm install -g @craftedup/jira-claude-bot`, you'll need a GitHub PAT with `read:packages` scope — details in [Via npm](#via-npm-crafted-org-members) below.

## Installation

Pick whichever path fits — from source if you want to hack on the bot, npm if you just want to use it.

### From source (local development)

Use this when you want to edit the bot itself or test unreleased changes.

```bash
# Clone the repository
git clone https://github.com/craftedup/jira-claude-bot.git
cd jira-claude-bot

# Install dependencies
npm install

# Build
npm run build

# Link globally (makes `jira-claude-bot` available on your PATH)
npm link
```

After any code change, run `npm run build` (or `npm run dev` for watch mode) and the linked binary picks up the new `dist/` output automatically.

### Via npm (Crafted org members)

The package is published to GitHub Packages, which is private to the Crafted org and requires authentication to install.

**1. Create a GitHub Personal Access Token** at https://github.com/settings/tokens/new?scopes=read:packages with the `read:packages` scope.

**2. Configure npm** by adding this to `~/.npmrc`:

```
@craftedup:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN_HERE
```

**3. Install globally:**

```bash
npm install -g @craftedup/jira-claude-bot
jira-claude-bot --version
```

To upgrade later: `npm install -g @craftedup/jira-claude-bot@latest`.

## Configuration

Environment variables (`JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) should already be set — see [Prerequisites](#prerequisites) if not.

### Project configuration

Initialize in your project:

```bash
cd your-project
jira-claude-bot init
```

This creates `.jira-claude-bot.yaml`:

```yaml
project:
  jiraKey: PROJ
  repo: owner/repo-name       # GitHub: owner/repo   Bitbucket: workspace/repo-slug

tickets:
  statuses:
    - "To Do"
  labels:                     # optional — only pick up tickets with these labels
    - "claude-bot"

workflow:
  branchPattern: "feature/{ticket_key}"
  skipPullRequest: false      # true for Bitbucket workflows (push branch, no PR)
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

`jira-claude-bot init` detects whether `origin` points at GitHub or Bitbucket and sets `skipPullRequest` accordingly. For Bitbucket, the bot pushes the branch and updates JIRA with the branch name instead of opening a PR.

## Usage

### Process a Single Ticket

```bash
jira-claude-bot work PROJ-123
```

### Interactive Session with Ticket Context

Fetch a ticket (plus its attachments) and drop into an interactive Claude Code session with that context pre-loaded as a system prompt. Useful when you want to explore or discuss a ticket without running the full automated workflow.

```bash
jira-claude-bot context PROJ-123
jira-claude-bot ctx PROJ-123 --model opus
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

1. **Fetch Ticket**: Downloads ticket details, attachments, and recent comments from JIRA
2. **Before Screenshots**: Captures screenshots of any URLs referenced in the ticket (current production state)
3. **Create Branch**: Creates a feature branch from the base branch
4. **Run Claude Code**: Passes ticket context to Claude Code for implementation
5. **Commit & Push**: Commits changes and pushes to the git host (GitHub or Bitbucket)
6. **Create PR**: Creates a pull request with ticket link and description (skipped for Bitbucket)
7. **After Screenshots**: Captures screenshots of the same URLs against the preview deployment
8. **Get Preview URL**: Waits for deployment and gets preview URL
9. **Update JIRA**: Adds comment with PR/branch link, preview URL, and before/after screenshots; transitions status

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
