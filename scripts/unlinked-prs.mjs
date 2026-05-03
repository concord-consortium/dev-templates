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
import { jiraBaseUrl, jiraApiBaseUrl, jiraDevApiBaseUrl, jiraRequestHeaders } from "./utils.mjs";

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
    fields: "summary",
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
  // Maps each Jira issue key to { summary, prNumbers[] } so callers can
  // check whether an issue's linked PRs actually landed in a given release.
  const jiraIssuePRs = new Map();

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

  const idOnlyIssues = json.issues.filter(i => !i.key);
  if (idOnlyIssues.length > 0) {
    console.warn(`⚠️  ${idOnlyIssues.length} of ${json.issues.length} Jira issues returned without key/fields (ids: ${idOnlyIssues.map(i => i.id).join(", ")}). This is likely a permissions issue with the API token.`);
  }

  await Promise.all(json.issues.map(async (issue) => {
    const issuePrNumbers = [];
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
            issuePrNumbers.push(prNumber);
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
            const prNumber = parseInt(prMatch[2], 10);
            jiraPRs.add(prNumber);
            issuePrNumbers.push(prNumber);
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching PRs for Jira issue ${issue.key}:`, error);
    }
    // Some issues only have `id` (no `key` or `fields`), likely due to
    // restricted permissions. We still track them using `id` as the map key
    // so we can detect unmerged PRs; the display label falls back to the id.
    const issueLabel = issue.key ?? `id:${issue.id}`;
    jiraIssuePRs.set(issueLabel, {
      summary: issue.fields?.summary ?? issueLabel,
      prNumbers: issuePrNumbers
    });
  }));

  return { jiraPRs, jiraIssuePRs };
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
      date: commit.commit.author.date,
      message: commit.commit.message,
      committer: commit.committer?.login
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

  const [{ jiraPRs, jiraIssuePRs }, {commits, prs}] = await Promise.all([
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

  const prShape = pr => ({
    number: pr.number,
    merged_at: pr.merged_at,
    merge_commit_sha: pr.merge_commit_sha,
    html_url: pr.html_url,
    title: pr.title,
    user: pr.user?.login ?? "unknown",
    body: pr.body || "",
    branch: pr.head?.ref || "",
    labels: (pr.labels ?? []).map(l => l.name)
  });

  // When a PR is squash-merged, GitHub creates a new commit whose message
  // contains the PR title followed by the PR number, e.g. "Some title (#1234)".
  // The committer is "web-flow" (GitHub). These commits won't match any
  // merge_commit_sha from the PR listing, so we detect them from the commit
  // message and fetch the PR to verify.
  const mergedPRNumbers = new Set(mergedPRs.map(pr => pr.number));
  const squashPrPattern = /\(#(\d+)\)\s*$/;

  const squashCandidates = commits
    .filter(c => c.committer === "web-flow" && squashPrPattern.test(c.message.split("\n")[0]))
    .map(c => {
      const match = c.message.split("\n")[0].match(squashPrPattern);
      return { prNumber: parseInt(match[1], 10), commitSha: c.sha };
    })
    .filter(({ prNumber }) => !mergedPRNumbers.has(prNumber));

  if (squashCandidates.length > 0) {
    const squashPRs = await Promise.all(
      squashCandidates.map(async ({ prNumber, commitSha }) => {
        try {
          const { data: pr } = await octokit.pulls.get({
            owner: "concord-consortium",
            repo: gitRepo,
            pull_number: prNumber
          });
          // Verify the PR was actually merged and the squash commit SHA matches
          // what GitHub recorded as the merge_commit_sha for this PR.
          if (pr.merged && pr.merge_commit_sha === commitSha) {
            return prShape(pr);
          }
        } catch (error) {
          console.warn(`⚠️  Could not fetch PR #${prNumber} referenced in squash commit: ${error.message}`);
        }
        return null;
      })
    );

    for (const pr of squashPRs) {
      if (pr) {
        mergedPRs.push(pr);
        mergedPRNumbers.add(pr.number);
      }
    }
  }

  // When a PR is squash-merged, any sub-PRs that were merged into its branch
  // are flattened into the squash commit. Their original merge_commit_sha is
  // orphaned and won't appear in the gitBase..gitHead range. To find these
  // sub-PRs, we list closed PRs that targeted each merged PR's head branch,
  // then recurse in case sub-PRs themselves had sub-PRs.
  let branchesToSearch = mergedPRs
    .map(pr => pr.branch)
    .filter(branch => branch);

  while (branchesToSearch.length > 0) {
    const subPRs = (await Promise.all(
      branchesToSearch.map(async (branch) => {
        try {
          const { data } = await octokit.pulls.list({
            owner: "concord-consortium",
            repo: gitRepo,
            state: "closed",
            base: branch,
            per_page: 100
          });
          return data
            .filter(pr => pr.merged_at && !mergedPRNumbers.has(pr.number))
            .map(prShape);
        } catch (error) {
          console.warn(`⚠️  Could not list sub-PRs for branch ${branch}: ${error.message}`);
          return [];
        }
      })
    )).flat();

    if (subPRs.length === 0) break;

    branchesToSearch = [];
    for (const pr of subPRs) {
      mergedPRs.push(pr);
      mergedPRNumbers.add(pr.number);
      if (pr.branch) branchesToSearch.push(pr.branch);
    }
  }

  // Find Jira issues tagged with this fixVersion whose linked PRs have not
  // been merged into gitHead. This surfaces stories that claim to be part of
  // the release but whose code hasn't actually landed.
  //
  // PRs that were closed without merging don't count as "unmerged" — they
  // shouldn't cause an issue to appear in this list. But if the issue appears
  // for other reasons, closed PRs are still shown with a "closed" status.

  // Collect all non-merged PR numbers across all issues and fetch their status
  // in parallel so we know which are closed, merged before gitBase, or still open.
  const allNonMergedPRs = new Set();
  for (const [, { prNumbers }] of jiraIssuePRs) {
    for (const n of prNumbers) {
      if (!mergedPRNumbers.has(n)) allNonMergedPRs.add(n);
    }
  }
  const closedPRNumbers = new Set();
  const mergedBeforeBasePRNumbers = new Set();
  const mergedAfterHeadPRNumbers = new Set();
  if (allNonMergedPRs.size > 0) {
    await Promise.all([...allNonMergedPRs].map(async (prNum) => {
      try {
        const { data: pr } = await octokit.pulls.get({
          owner: "concord-consortium",
          repo: gitRepo,
          pull_number: prNum
        });
        if (pr.state === "closed" && !pr.merged) {
          closedPRNumbers.add(prNum);
        } else if (pr.merged && pr.merge_commit_sha) {
          // The PR was merged but its commit isn't in gitBase..gitHead.
          // Use the compare API to determine if it was merged before gitBase
          // or after gitHead.
          try {
            const { data: baseCmp } = await octokit.repos.compareCommits({
              owner: "concord-consortium",
              repo: gitRepo,
              base: pr.merge_commit_sha,
              head: gitBase
            });
            if (baseCmp.status === "ahead" || baseCmp.status === "identical") {
              mergedBeforeBasePRNumbers.add(prNum);
              return;
            }
          } catch {
            // Compare failed — try the head check anyway.
          }
          try {
            const { data: headCmp } = await octokit.repos.compareCommits({
              owner: "concord-consortium",
              repo: gitRepo,
              base: gitHead,
              head: pr.merge_commit_sha
            });
            // "ahead": PR was merged after gitHead on the same branch.
            // "diverged": PR was merged on a different branch (e.g. master)
            //   that diverged from gitHead (e.g. a release branch). The
            //   common ancestor is the branch point, and the PR's code
            //   isn't in gitHead either way.
            if (headCmp.status === "ahead" || headCmp.status === "identical" || headCmp.status === "diverged") {
              mergedAfterHeadPRNumbers.add(prNum);
            }
          } catch {
            // If the compare fails (e.g. force-pushed branch), we can't
            // determine ancestry — leave it as "not merged".
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not fetch PR #${prNum}: ${error.message}`);
      }
    }));
  }

  const unmergedJiraIssues = [];
  const wrongVersionJiraIssues = [];
  for (const [issueKey, { summary, prNumbers }] of jiraIssuePRs) {
    if (prNumbers.length === 0) continue;
    // An issue needs attention if any PR is not in the release range and
    // wasn't simply closed. "Merged after head" still counts — the code
    // hasn't landed in the release yet.
    const hasUnmerged = prNumbers.some(n =>
      !mergedPRNumbers.has(n) && !closedPRNumbers.has(n) &&
      !mergedBeforeBasePRNumbers.has(n)
    );
    if (hasUnmerged) {
      unmergedJiraIssues.push({ issueKey, summary, prNumbers });
    } else if (!prNumbers.some(n => mergedPRNumbers.has(n))) {
      // No PRs landed in this release — they were all merged before gitBase
      // or closed. The fixVersion may be wrong.
      if (prNumbers.some(n => mergedBeforeBasePRNumbers.has(n))) {
        wrongVersionJiraIssues.push({ issueKey, summary, prNumbers });
      }
    }
  }

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
  // Jira caps JQL results at 100 per request, so fetch in chunks.
  const chunkSize = 100;
  for (let i = 0; i < allReferencedKeys.length; i += chunkSize) {
    const chunk = allReferencedKeys.slice(i, i + chunkSize);
    const jql = `key in (${chunk.join(",")})`;
    const jqlQuery = querystring.stringify({
      jql,
      fields: "fixVersions,summary,labels",
      maxResults: chunkSize
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
    } else {
      console.warn(`⚠️  JQL classification lookup failed (${jqlResponse.status}) — some unlinked PRs may be misclassified.`);
    }
  }
  if (allReferencedKeys.length > 0) {
    const missing = allReferencedKeys.filter(k => !issueInfo.has(k));
    if (missing.length > 0) {
      console.warn(`⚠️  Could not resolve ${missing.length} referenced issue(s) via JQL: ${missing.join(", ")} — classification may be incomplete.`);
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

  if (unmergedJiraIssues.length > 0) {
    console.log(`\n⚠️  Jira issues tagged with fixVersion "${jiraFixVersion}" whose PRs are NOT merged into ${gitHead}:\n`);
    unmergedJiraIssues
      .sort((a, b) => a.issueKey.localeCompare(b.issueKey))
      .forEach(({ issueKey, summary, prNumbers }) => {
        console.log(`- ${issueKey}: ${summary}`);
        console.log(`    ${jiraBaseUrl}/browse/${issueKey}`);
        prNumbers.forEach(prNum => {
          const status = mergedPRNumbers.has(prNum)
            ? "merged"
            : mergedBeforeBasePRNumbers.has(prNum)
            ? `merged < ${gitBase}`
            : mergedAfterHeadPRNumbers.has(prNum)
            ? `merged > ${gitHead}`
            : closedPRNumbers.has(prNum)
            ? "closed"
            : "not merged";
          console.log(`  ${status}: https://github.com/concord-consortium/${gitRepo}/pull/${prNum}`);
        });
      });
  }

  if (wrongVersionJiraIssues.length > 0) {
    console.log(`\n📦 Jira issues tagged with fixVersion "${jiraFixVersion}" whose PRs were all merged outside ${gitBase}..${gitHead} (fixVersion may be wrong):\n`);
    wrongVersionJiraIssues
      .sort((a, b) => a.issueKey.localeCompare(b.issueKey))
      .forEach(({ issueKey, summary, prNumbers }) => {
        console.log(`- ${issueKey}: ${summary}`);
        console.log(`    ${jiraBaseUrl}/browse/${issueKey}`);
        prNumbers.forEach(prNum => {
          const status = mergedBeforeBasePRNumbers.has(prNum)
            ? `merged < ${gitBase}`
            : mergedAfterHeadPRNumbers.has(prNum)
            ? `merged > ${gitHead}`
            : "closed";
          console.log(`  ${status}: https://github.com/concord-consortium/${gitRepo}/pull/${prNum}`);
        });
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
