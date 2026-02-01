import { execSync, spawn } from 'child_process';

export interface PullRequest {
  number: number;
  url: string;
  title: string;
  state: string;
  headSha: string;
}

export interface Deployment {
  id: number;
  environment: string;
  url: string;
  state: string;
}

export class GitHubClient {
  private repo: string;

  constructor(repo: string) {
    this.repo = repo;
  }

  async createBranch(branchName: string, baseBranch: string = 'develop'): Promise<void> {
    this.exec(`git checkout ${baseBranch}`);
    this.exec(`git pull origin ${baseBranch}`);

    // Check if branch already exists locally
    const branchExists = await this.getBranchExists(branchName);
    if (branchExists) {
      // Delete the existing branch and start fresh
      this.exec(`git branch -D ${branchName}`);
    }

    // Also check for remote branch and delete if exists
    try {
      this.exec(`git push origin --delete ${branchName}`);
    } catch {
      // Remote branch doesn't exist, that's fine
    }

    this.exec(`git checkout -b ${branchName}`);
  }

  async commitChanges(message: string, files?: string[]): Promise<void> {
    if (files && files.length > 0) {
      this.exec(`git add ${files.join(' ')}`);
    } else {
      this.exec('git add -A');
    }

    // Use heredoc for commit message to handle special characters
    const commitCmd = `git commit -m "${message.replace(/"/g, '\\"')}"`;
    this.exec(commitCmd);
  }

  async pushBranch(branchName: string): Promise<void> {
    this.exec(`git push -u origin ${branchName}`);
  }

  async createPullRequest(
    title: string,
    body: string,
    baseBranch: string = 'develop'
  ): Promise<PullRequest> {
    // Create PR using gh CLI
    const result = this.exec(
      `gh pr create --base ${baseBranch} --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --json number,url,title,state,headRefOid`
    );

    // Parse the JSON output
    try {
      const pr = JSON.parse(result);
      return {
        number: pr.number,
        url: pr.url,
        title: pr.title,
        state: pr.state,
        headSha: pr.headRefOid,
      };
    } catch {
      // gh pr create outputs the URL on success
      const urlMatch = result.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
      if (urlMatch) {
        const prNumber = parseInt(urlMatch[0].split('/').pop() || '0');
        return {
          number: prNumber,
          url: urlMatch[0],
          title,
          state: 'open',
          headSha: '',
        };
      }
      throw new Error(`Failed to parse PR creation result: ${result}`);
    }
  }

  async getPullRequest(prNumber: number): Promise<PullRequest> {
    const result = this.exec(
      `gh pr view ${prNumber} --json number,url,title,state,headRefOid`
    );

    const pr = JSON.parse(result);
    return {
      number: pr.number,
      url: pr.url,
      title: pr.title,
      state: pr.state,
      headSha: pr.headRefOid,
    };
  }

  async getDeploymentUrl(prNumber: number, maxAttempts: number = 18): Promise<string | null> {
    const pr = await this.getPullRequest(prNumber);
    const headSha = pr.headSha;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Get deployments for this SHA
        const deploymentsResult = this.exec(
          `gh api repos/${this.repo}/deployments?sha=${headSha}&environment=Preview --jq '.[0].id'`
        );

        const deploymentId = deploymentsResult.trim();
        if (deploymentId && deploymentId !== 'null') {
          // Get deployment status with URL
          const statusResult = this.exec(
            `gh api repos/${this.repo}/deployments/${deploymentId}/statuses --jq '.[0].environment_url'`
          );

          const url = statusResult.trim();
          if (url && url !== 'null') {
            return url;
          }
        }
      } catch {
        // Deployment not ready yet
      }

      if (attempt < maxAttempts - 1) {
        await this.sleep(5000);
      }
    }

    return null;
  }

  async getCurrentBranch(): Promise<string> {
    return this.exec('git rev-parse --abbrev-ref HEAD').trim();
  }

  async checkoutBranch(branchName: string): Promise<void> {
    this.exec(`git checkout ${branchName}`);
  }

  async getBranchExists(branchName: string): Promise<boolean> {
    try {
      this.exec(`git rev-parse --verify ${branchName}`);
      return true;
    } catch {
      return false;
    }
  }

  async hasNewCommits(baseBranch: string): Promise<boolean> {
    try {
      // Check if current branch has commits that aren't in base branch
      const result = this.exec(`git log ${baseBranch}..HEAD --oneline`);
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<{ staged: string[]; unstaged: string[]; untracked: string[] }> {
    const result = this.exec('git status --porcelain');
    const lines = result.split('\n').filter(l => l.trim());

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      const status = line.substring(0, 2);
      const file = line.substring(3);

      if (status.startsWith('?')) {
        untracked.push(file);
      } else if (status[0] !== ' ') {
        staged.push(file);
      }
      if (status[1] !== ' ' && status[1] !== '?') {
        unstaged.push(file);
      }
    }

    return { staged, unstaged, untracked };
  }

  private exec(command: string): string {
    return execSync(command, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }).toString();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
