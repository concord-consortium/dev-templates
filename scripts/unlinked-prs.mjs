/**
 * Compiles a list of all PRs merged since the last release that do not have a linked Jira issue.
 * 
 * Required command-line parameters:
 * - Jira project key (e.g., "LARA")
 * - Jira fix version (e.g., "LARA v5.0.0")
 * - GitHub repo name (e.g., "lara")
 * - GitHub base ref (e.g., "v4.9.1")
 * - GitHub head ref (e.g., "v5.0.0")
 * 
 * Example usage:
 * node unlinked-prs.mjs LARA "LARA v5.0.0" lara v4.9.1 v5.0.0
 */

import "dotenv/config";
import fetch from "node-fetch";
import querystring from "querystring";
import { Octokit } from "@octokit/rest";
import { jiraApiBaseUrl, jiraDevApiBaseUrl, jiraRequestHeaders } from "./utils.mjs";

const jiraUser = process.env.JIRA_USER;
const jiraToken = process.env.JIRA_TOKEN;
const ghToken = process.env.GITHUB_TOKEN;

if (!jiraUser || !jiraToken) {
  console.error("Both the JIRA_USER and JIRA_TOKEN environment variables are required.");
  process.exit(1);
}

if (!ghToken) {
  console.error("GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

const jiraProjectKey = process.argv[2];
const jiraFixVersion = process.argv[3];
const gitRepo = process.argv[4];
const gitBase = process.argv[5];
const gitHead = process.argv[6];

const octokit = new Octokit({ auth: ghToken });

async function getJiraLinkedPRs() {
  const urlQuery = querystring.stringify({
    jql: `project=${jiraProjectKey} AND fixVersion in ("${jiraFixVersion}") AND issuetype in (Story, Bug, Chore)`,
    maxResults: 100
  });

  const url = `${jiraApiBaseUrl}/search?${urlQuery}`;
  const requestHeaders = jiraRequestHeaders(jiraUser, jiraToken);
  const response = await fetch(url, requestHeaders);
  const json = await response.json();
  const jiraPRs = new Set();

  await Promise.all(json.issues.map(async (issue, index) => {
    try {
      const prUrl = `${jiraDevApiBaseUrl}/issue/detail?issueId=${issue.id}&applicationType=GitHub&dataType=pullrequest`;
      const prResponse = await fetch(prUrl, requestHeaders);
      const prData = await prResponse.json();

      if (Array.isArray(prData.detail) && prData.detail.length > 0) {
        prData.detail[0].pullRequests.forEach(storyPr => {
          const match = storyPr.id.match(/\d+/);
          if (match) {
            const prNumber = parseInt(match[0], 10);
            jiraPRs.add(prNumber);
          } else {
            console.warn(`Skipping invalid PR ID format (${storyPr.id}) for issue ${issue.key} with title ${issue.fields.summary}`);
          }
        });
      }
    } catch (error) {
      console.error(`Error fetching PRs for Jira issue ${issue.key}:`, error);
    }
  }));

  return jiraPRs;
}

async function getMergedPRs() {
  const commits = await octokit.paginate(
    octokit.repos.compareCommits,
    {
      owner: "concord-consortium",
      repo: gitRepo,
      base: gitBase,
      head: gitHead
    },
    response => response.data.commits.map(commit => ({
      sha: commit.sha,
      date: commit.commit.author.date
    }))
  );

  if (!commits.length) {
    console.log("No commits found");
    process.exit(0);
  }

  const mergeBaseCommitDate = commits[0].date;

  const prs = await octokit.paginate(
    octokit.pulls.list,
    {
      owner: "concord-consortium",
      repo: gitRepo,
      state: "closed",
      sort: "updated",
      direction: "desc"
    },
    (response) => {
      return response.data
        .filter(pr => pr.merged_at && pr.merged_at > mergeBaseCommitDate)
        .map(pr => ({
          number: pr.number,
          merged_at: pr.merged_at,
          html_url: pr.html_url,
          title: pr.title,
          user: pr.user.login
        }));
    }
  );

  return prs;
}

async function getUnlinkedMergedPRs() {
  const [jiraPRs, mergedPRs] = await Promise.all([
    getJiraLinkedPRs(),
    getMergedPRs()
  ]);

  const unlinkedPRs = mergedPRs.filter(pr => !jiraPRs.has(pr.number));

  console.log(`\n🔎 PRs Merged Since Last Release Without a Linked Jira Issue:\n`);
  if (unlinkedPRs.length === 0) {
    console.log("✅ No untracked PRs found.");
  } else {
    unlinkedPRs.forEach(pr => {
      console.log(`❌ ${pr.html_url} - ${pr.title} (by ${pr.user})`);
    });
  }
}

getUnlinkedMergedPRs();
