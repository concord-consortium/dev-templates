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

async function verifyJiraAuth() {
  // /myself returns 401 cleanly when a token is expired or invalid,
  // whereas search endpoints often return 200 with empty results instead.
  // Check it first so we can fail with a clear message.
  const url = `${jiraApiBaseUrl}/myself`;
  const response = await fetch(url, jiraRequestHeaders(jiraUser, jiraToken));
  if (response.status === 401) {
    console.error("❌ Jira authentication failed. Your JIRA_TOKEN is expired or invalid.");
    console.error("   Generate a new API token at: https://id.atlassian.com/manage-profile/security/api-tokens");
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`❌ Jira /myself preflight failed with status ${response.status}: ${response.statusText}`);
    process.exit(1);
  }
}

async function getJiraLinkedPRs() {
  const urlQuery = querystring.stringify({
    jql: `project=${jiraProjectKey} AND fixVersion in ("${jiraFixVersion}") AND issuetype in (Story, Bug, Chore, Task)`,
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

  if (!json.issues || json.issues.length === 0) {
    console.error(`❌ Jira returned 0 issues for project=${jiraProjectKey} fixVersion="${jiraFixVersion}".`);
    console.error("   This usually means your JIRA_TOKEN lacks access to the project,");
    console.error("   or the fixVersion name is wrong. The API returns 200 OK with empty");
    console.error("   results instead of 401 in this case, so it can't be caught as an auth error.");
    console.error("");
    console.error("   To fix: regenerate a token with full account scope at");
    console.error("   https://id.atlassian.com/manage-profile/security/api-tokens");
    console.error("   and confirm the fixVersion name matches exactly what Jira shows.");
    process.exit(1);
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

      // Also check web links (remote links) for GitHub PR URLs.
      // This catches PRs that were linked manually after the fact.
      const remoteLinksUrl = `${jiraApiBaseUrl}/issue/${issue.id}/remotelink`;
      const remoteLinksResponse = await fetch(remoteLinksUrl, requestHeaders);
      if (remoteLinksResponse.ok) {
        const remoteLinks = await remoteLinksResponse.json();
        for (const link of remoteLinks) {
          const linkUrl = link.object?.url;
          if (!linkUrl) continue;
          const prMatch = linkUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
          if (prMatch && prMatch[1] === `concord-consortium/${gitRepo}`) {
            jiraPRs.add(parseInt(prMatch[2], 10));
          }
        }
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
          user: pr.user?.login ?? "unknown",
          body: pr.body || "",
          branch: pr.head?.ref || "",
          labels: (pr.labels ?? []).map(l => l.name)
        }));
    }
  );

  return {commits, prs};
}

async function getUnlinkedMergedPRs() {
  await verifyJiraAuth();

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

  // PRs carrying the "long lived branch" label are umbrella merges of a
  // long-running development branch whose individual changes are already
  // tracked by their own Jira issues and PRs. Surface them separately rather
  // than classifying them as unlinked.
  const longLivedBranchPRs = mergedPRs.filter(
    pr => pr.labels.includes("long lived branch") && !jiraPRs.has(pr.number)
  );
  const unlinkedPRs = mergedPRs.filter(
    pr => !jiraPRs.has(pr.number) && !pr.labels.includes("long lived branch")
  );

  // For unlinked PRs, check if they reference a Jira issue that was already
  // released in a previous version (e.g. hotfixes merged into both a release
  // branch and master).
  const issueKeyPattern = new RegExp(`${jiraProjectKey}-(\\d+)`, "g");
  const requestHeaders = jiraRequestHeaders(jiraUser, jiraToken);

  // Collect every referenced issue key across all unlinked PRs so we can
  // fetch their fixVersions in a single JQL search. The direct /issue/{key}
  // GET endpoint returns 404 for API tokens that can still run JQL searches,
  // so batching through /search/jql is both more robust and faster.
  const prReferencedKeys = unlinkedPRs.map(pr => {
    const searchText = `${pr.title} ${pr.body} ${pr.branch}`;
    return [...new Set([...searchText.matchAll(issueKeyPattern)].map(m => m[0]))];
  });
  const allReferencedKeys = [...new Set(prReferencedKeys.flat())];

  const issueInfo = new Map();
  if (allReferencedKeys.length > 0) {
    const jql = `key in (${allReferencedKeys.join(",")})`;
    const jqlQuery = querystring.stringify({
      jql,
      fields: "fixVersions,summary,labels",
      maxResults: 100
    });
    const jqlUrl = `${jiraApiBaseUrl}/search/jql?${jqlQuery}`;
    const jqlResponse = await fetch(jqlUrl, requestHeaders);
    if (jqlResponse.ok) {
      const jqlJson = await jqlResponse.json();
      for (const issue of jqlJson.issues ?? []) {
        issueInfo.set(issue.key, {
          summary: issue.fields?.summary,
          versionNames: (issue.fields?.fixVersions ?? []).map(v => v.name),
          labels: issue.fields?.labels ?? []
        });
      }
      const missing = allReferencedKeys.filter(k => !issueInfo.has(k));
      if (missing.length > 0) {
        console.warn(`⚠️  Could not resolve ${missing.length} referenced issue(s) via JQL: ${missing.join(", ")} — classification may be incomplete.`);
      }
    } else {
      console.warn(`⚠️  JQL classification lookup failed (${jqlResponse.status}) — all unlinked PRs will be reported as truly unlinked.`);
    }
  }

  const classificationResults = unlinkedPRs.map((pr, i) => {
    const issueKeys = prReferencedKeys[i];
    if (issueKeys.length === 0) {
      return { type: "trulyUnlinked", pr };
    }

    let bestPreviousRelease = null;
    let currentVersionIssueKey = null;
    let currentVersionHasNoRelease = false;
    let noReleaseIssueKey = null;
    let unversionedIssueKey = null;

    for (const issueKey of issueKeys) {
      const info = issueInfo.get(issueKey);
      if (!info) continue;
      if (info.versionNames.includes(jiraFixVersion)) {
        currentVersionIssueKey = issueKey;
        currentVersionHasNoRelease = info.labels.includes("no-release");
        break;
      }
      if (!noReleaseIssueKey && info.labels.includes("no-release")) {
        noReleaseIssueKey = issueKey;
      }
      if (info.versionNames.length > 0 && !bestPreviousRelease) {
        bestPreviousRelease = {
          issueKey,
          summary: info.summary,
          versions: info.versionNames
        };
      }
      if (!unversionedIssueKey && info.versionNames.length === 0 && !info.labels.includes("no-release")) {
        unversionedIssueKey = issueKey;
      }
    }

    if (currentVersionIssueKey) {
      return {
        type: "referencedCurrentVersion",
        pr,
        issueKey: currentVersionIssueKey,
        noReleaseConflict: currentVersionHasNoRelease
      };
    }

    if (noReleaseIssueKey) {
      return { type: "noRelease", pr, issueKey: noReleaseIssueKey };
    }

    if (bestPreviousRelease) {
      return { type: "previouslyReleased", pr, ...bestPreviousRelease };
    }

    if (unversionedIssueKey) {
      return { type: "linkedNeedsAction", pr, issueKey: unversionedIssueKey };
    }

    return { type: "trulyUnlinked", pr };
  });

  const previouslyReleased = [];
  const referencedCurrentVersion = [];
  const noReleaseLabeled = [];
  const linkedNeedsAction = [];
  const trulyUnlinked = [];

  for (const result of classificationResults) {
    if (result.type === "previouslyReleased") {
      previouslyReleased.push({
        pr: result.pr,
        issueKey: result.issueKey,
        summary: result.summary,
        versions: result.versions
      });
    } else if (result.type === "referencedCurrentVersion") {
      referencedCurrentVersion.push({
        pr: result.pr,
        issueKey: result.issueKey,
        noReleaseConflict: result.noReleaseConflict
      });
    } else if (result.type === "noRelease") {
      noReleaseLabeled.push({ pr: result.pr, issueKey: result.issueKey });
    } else if (result.type === "linkedNeedsAction") {
      linkedNeedsAction.push({ pr: result.pr, issueKey: result.issueKey });
    } else {
      trulyUnlinked.push(result.pr);
    }
  }

  previouslyReleased.sort((a, b) => a.pr.number - b.pr.number);
  referencedCurrentVersion.sort((a, b) => a.pr.number - b.pr.number);
  linkedNeedsAction.sort((a, b) => a.pr.number - b.pr.number);
  trulyUnlinked.sort((a, b) => a.number - b.number);

  if (previouslyReleased.length > 0) {
    console.log(`\n📦 PRs Merged but have different fix versions:\n`);
    previouslyReleased.forEach(({ pr, issueKey, summary, versions }) => {
      console.log(`-  ${pr.html_url} - ${pr.title} (by ${pr.user})`);
      console.log(`   └─ ${issueKey}: ${summary} (fixVersion ${versions.join(", ")})`);
    });
  }

  if (referencedCurrentVersion.length > 0) {
    console.log(`\n🔗 PRs referencing a Jira issue with fixVersion "${jiraFixVersion}" (not auto-linked by Jira):\n`);
    referencedCurrentVersion.forEach(({ pr, issueKey, noReleaseConflict }) => {
      const conflict = noReleaseConflict ? ` ⚠️ (${issueKey} also labeled "no-release" — conflict)` : "";
      console.log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})${conflict}`);
    });
  }

  if (linkedNeedsAction.length > 0) {
    console.log(`\n🗒  PRs linked to a Jira issue that has no fixVersion — assign "${jiraFixVersion}" or add the "no-release" label:\n`);
    linkedNeedsAction.forEach(({ pr, issueKey }) => {
      console.log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})`);
      console.log(`   └─ ${issueKey}`);
    });
  }

  if (noReleaseLabeled.length > 0) {
    console.log(`\n🚫 PRs whose Jira issue is labeled "no-release" (skipped):\n`);
    noReleaseLabeled
      .sort((a, b) => a.pr.number - b.pr.number)
      .forEach(({ pr, issueKey }) => {
        console.log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})`);
        console.log(`   └─ ${issueKey}`);
      });
  }

  if (longLivedBranchPRs.length > 0) {
    console.log(`\n🌿 Long-lived branch merges (skipped — individual work tracked elsewhere):\n`);
    longLivedBranchPRs
      .sort((a, b) => a.number - b.number)
      .forEach(pr => {
        console.log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})`);
      });
  }

  console.log(`\n🔎 PRs Merged Since Last Release Without a Linked Jira Issue:\n`);
  if (trulyUnlinked.length === 0) {
    console.log("✅ No untracked PRs found.");
  } else {
    trulyUnlinked.forEach(pr => {
      console.log(`❌ ${pr.html_url} - ${pr.title} (by ${pr.user})`);
    });
  }
}

getUnlinkedMergedPRs();
