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

  const url = `${jiraApiBaseUrl}/search/jql?${urlQuery}`;
  const requestHeaders = jiraRequestHeaders(jiraUser, jiraToken);
  const response = await fetch(url, requestHeaders);

  if (response.status === 401) {
    console.error("❌ Jira authentication failed. Your JIRA_TOKEN may be expired or invalid.");
    console.error("   Please generate a new API token at: https://id.atlassian.com/manage-profile/security/api-tokens");
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`❌ Jira API request failed with status ${response.status}: ${response.statusText}`);
    process.exit(1);
  }

  const json = await response.json();
  const jiraPRs = new Set();

  if (!json.issues) {
    console.error("❌ No issues found in Jira response.", json);
  }

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
    (response, done) => {
      return response.data
        .filter(pr => {
          // FIXME: when a long running branch is used, a PR could be merged into this
          // long running branch before mergeBaseCommitDate. If this PR is not updated
          // after that it will get excluded from the list. However we also don't want
          // to check every PR in the repository because it makes the script slow.
          //
          // The updated_at field is used instead of merged_at just to pick up a few
          // more PRs. If a PR was merged into a long running branch before the previous
          // version was tagged, using the merged_at time means we'll never pick up this
          // PR. With updated_at if a developer modifies the PR before the release, now
          // the PR will be picked up by the script.
          //
          // A better approach would be to iterate over the commits and identify any
          // PR merge commits and then make sure their PRs are in the list.
          const possiblyPartOfRelease = pr.updated_at >= mergeBaseCommitDate

          // 30 PRs are requested at a time, the `done()` will prevent paginate
          // from continuing to the request more PRs once it finds one that was
          // updated before the oldest commit. This prevents the script from running too
          // slowly.
          if (!possiblyPartOfRelease) done();
          return possiblyPartOfRelease
        })
        .map(pr => ({
          number: pr.number,
          merged_at: pr.merged_at,
          merge_commit_sha: pr.merge_commit_sha,
          html_url: pr.html_url,
          title: pr.title,
          user: pr.user.login
        }));
    }
  );

  return {commits, prs};
}

async function getUnlinkedMergedPRs() {
  const [jiraPRs, {commits, prs}] = await Promise.all([
    getJiraLinkedPRs(),
    getMergedPRs()
  ]);

  // We find the merged PRs by looking to see if the PR's merge_commit_sha is part
  // of the commits since the last version was released. This is more accurate than
  // looking at the merged_at or updated_at time of the PR. A PR could be merged
  // into a long running branch different than main or master. And then this
  // long running branch might not be merged into main or master for a few releases.
  //
  // Note: the mergeBaseCommit is not included in `commits`, so mergedPrs will
  // not include the last PR of the previous version even if the filtering
  // above doesn't exclude it.
  const mergedPRs = prs.filter(
    pr => commits.find(commit => commit.sha === pr.merge_commit_sha)
  );

  console.log(`🔍 Found ${mergedPRs.length} PRs merged between ${gitBase} and ${gitHead}.`);
  mergedPRs.forEach(pr => {
    console.log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})`);
  });

  console.log(`\n🔍 Found ${jiraPRs.size} PRs linked to Jira issues in project ${jiraProjectKey} with fix version "${jiraFixVersion}".`);
  jiraPRs.forEach(prNumber => {
    console.log(`- jiraPR #${prNumber}`);
  });

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
