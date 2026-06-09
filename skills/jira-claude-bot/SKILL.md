---
name: jira-claude-bot
description: Work a JIRA ticket from inside a Claude Code session using the jira-claude-bot CLI. Use when the user references a JIRA ticket key (e.g. PROJ-123), asks to "work on", "pick up", "look at", or "load" a ticket, or pastes an Atlassian ticket URL and wants to implement it. Fetches ticket context (description, comments, attachments, embedded links) into the session, then works it conversationally and reports back.
---

# Working a JIRA ticket with jira-claude-bot

`jira-claude-bot` is a CLI (`@craftedup/jira-claude-bot`) that fetches a JIRA ticket and
drops you into Claude Code with the ticket pre-loaded as context. **You are already inside
Claude Code**, so you don't spawn another session — you use the CLI to pull the ticket's
context into *this* session, then do the work yourself.

## The one thing that matters

Running `jira-claude-bot context <TICKET>` from inside a session would normally try to spawn
a *nested* `claude` subprocess, which is useless here. The CLI detects the non-TTY environment
(the Bash tool has no TTY) and instead just **writes the ticket to a file and exits 0**. Your
job is to read that file. The reliable, explicit way to do this is `--print` (or `--no-spawn`),
which never attempts a spawn.

## Workflow

### 1. Fetch the ticket

Accept either a ticket key (`PROJ-123`) or an Atlassian URL — extract the key from the URL if
given. Run:

```bash
jira-claude-bot context PROJ-123 --print
```

This:
- writes the rendered prompt to `.jira-tickets/PROJ-123/ticket.md`,
- downloads attachments to `.jira-tickets/PROJ-123/attachments/`,
- prints the prompt to stdout (which you also capture from the Bash result).

`context` does **not** require `jira-claude-bot init` — it works in any folder that has JIRA
credentials. Credentials come from either a `.env` file in the current folder (holding
`JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) or those same vars exported in the shell. Run the
command from the folder that contains the `.env`, since it's read from the current directory.

If the command fails:
- **"JIRA configuration is incomplete"** → the three `JIRA_*` vars aren't visible. Check that
  there's a `.env` in this folder with all three, or that they're exported in the shell. Never
  echo the token value back.
- **`command not found`** → the CLI isn't on PATH. From the bot's source dir, `npm link`; or
  install via `npm install -g @craftedup/jira-claude-bot`.

(`jira-claude-bot init` and a `.jira-claude-bot.yaml` are only needed for the automated `work`/
daemon path — the interactive context flow ignores them.)

### 2. Read the ticket into context

`Read` `.jira-tickets/PROJ-123/ticket.md`. It contains the summary, type/priority/status, full
description (with ADF links, inline cards, and Figma/media URLs preserved), recent comments, and
a list of attachments. If there are image attachments relevant to the task, `Read` them from
`.jira-tickets/PROJ-123/attachments/` too — they're often the actual spec (mockups, screenshots
of bugs).

### 3. Work the ticket

Treat the ticket as the requirements. Standard engineering loop:
- Understand what's being asked from the description **and** the recent comments (comments often
  contain the latest clarifications or scope changes — don't skip them).
- Explore the relevant code, make the changes.
- Run the project's typecheck/lint/tests before declaring done.
- Follow the project's `CLAUDE.md` and `.jira-claude-bot.yaml` (the `claude.instructions` and
  branch/commit conventions there apply).

Keep the user in the loop on anything ambiguous in the ticket rather than guessing — the ticket
is a starting point, not a spec to follow blindly.

### 4. Report back to the ticket

When work is done (or when the user wants to leave an update), post a comment to JIRA. Use the
`jira-comment` skill if available:

```
/jira-comment PROJ-123 <summary of what changed, PR link if any>
```

Otherwise post via the REST API with the same `JIRA_*` env vars. Don't transition ticket status
or open PRs unless the user asks — the interactive flow is deliberately hands-off about that
(the automated `jira-claude-bot work` / daemon path handles full automation separately).

## Notes

- `.jira-tickets/` is a scratch dir for fetched context; it's typically gitignored. Re-running
  `context` for the same key refreshes it.
- Use `--model opus` (or `sonnet`/`haiku`) only matters when actually spawning a session; with
  `--print` it's a no-op, so ignore it here.
- Never print or echo `JIRA_API_TOKEN`.
- This skill is for the **interactive / explore-and-implement** path. For unattended batch
  processing (auto branch + commit + PR + status transition), that's `jira-claude-bot work
  PROJ-123` or daemon mode (`jira-claude-bot start`) — different tool, run outside an
  interactive session.
