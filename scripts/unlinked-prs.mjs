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
 * Optional flags (anywhere on the command line):
 * - --details  also print every issue in the fix version with all of its linked PRs,
 *              not just the issues that need attention
 * - --json     print a single JSON report (every issue, its PRs and flags, and the
 *              classified merged PRs) instead of the text report
 *
 * Example usage:
 * node unlinked-prs.mjs LARA "LARA v5.0.0" lara v4.9.1 v5.0.0
 */

import "dotenv/config";
import { execFileSync } from "child_process";
import fetch from "node-fetch";
import querystring from "querystring";
import { Octokit } from "@octokit/rest";
import { jiraBaseUrl, jiraApiBaseUrl, jiraDevApiBaseUrl, jiraRequestHeaders } from "./utils.mjs";

const jiraUser = process.env.JIRA_USER;
const jiraToken = process.env.JIRA_TOKEN;

if (!jiraUser || !jiraToken) {
  console.error("Both the JIRA_USER and JIRA_TOKEN environment variables are required.");
  process.exit(1);
}

// Prefer an explicit GITHUB_TOKEN, otherwise borrow the GitHub CLI's login so most
// developers don't need to create and maintain a separate token.
let ghToken = process.env.GITHUB_TOKEN;
const ghTokenSource = ghToken ? "GITHUB_TOKEN" : "gh auth token";
if (!ghToken) {
  try {
    ghToken = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    // handled below
  }
}
if (!ghToken) {
  console.error("❌ No GitHub token: set GITHUB_TOKEN, or log in to the GitHub CLI with `gh auth login`.");
  process.exit(1);
}

const flags = new Set(process.argv.slice(2).filter(arg => arg.startsWith("--")));
const [jiraProjectKey, jiraFixVersion, gitRepo, gitBase, gitHead] =
  process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const showDetails = flags.has("--details");
// --json prints one machine-readable report instead of the text report. The text
// report goes through log() so it can be silenced; warnings still go to stderr.
const showJson = flags.has("--json");
const log = showJson ? () => {} : console.log;
const thisRepo = `concord-consortium/${gitRepo}`;

const octokit = new Octokit({ auth: ghToken });

async function verifyGitHubAuth() {
  try {
    await octokit.repos.get({ owner: "concord-consortium", repo: gitRepo });
  } catch (error) {
    if (error.status === 401) {
      console.error(`❌ GitHub authentication failed using ${ghTokenSource}.`);
      if (ghTokenSource === "GITHUB_TOKEN") {
        console.error("   Renew the token, or remove GITHUB_TOKEN to fall back to the GitHub CLI login.");
      }
      process.exit(1);
    }
    throw error;
  }
}

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

// "https://github.com/owner/repo/pull/123" -> { repo: "owner/repo", number: 123 }
function parsePullUrl(url) {
  const match = url?.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  return match ? { repo: match[1], number: parseInt(match[2], 10) } : null;
}

/**
 * Returns the PRs Jira's development panel has recorded for an issue, as
 * { number, repo, status } where status is Jira's (MERGED, OPEN, DECLINED, ...).
 *
 * The PR `id` Jira reports is just "#398" with no repository, so the repo comes
 * from the PR url. Issues can link PRs from other repositories (e.g. a
 * report-service change for a CLUE story), and those must not be mistaken for a
 * PR with the same number in this repo.
 *
 * The dev-status detail endpoint requires an `applicationType`, and it must be the
 * *instance type* key Jira uses internally — not the friendly name. For the GitHub
 * cloud integration that key is "oAuth-com.github.integration.production"; passing
 * "GitHub" returns `{"detail": []}` with a 200, so linked PRs silently disappear.
 *
 * Rather than hard-coding the key, ask the summary endpoint which instance types
 * this issue actually has PRs in, then fetch detail for each. That keeps working if
 * the key changes again or a project uses a different provider (Bitbucket, GitLab).
 */
async function getIssuePullRequests(issueId, requestHeaders) {
  const summaryUrl = `${jiraDevApiBaseUrl}/issue/summary?issueId=${issueId}`;
  const summaryResponse = await fetch(summaryUrl, requestHeaders);
  if (!summaryResponse.ok) return [];
  const summary = await summaryResponse.json();
  const instanceTypes = Object.keys(summary.summary?.pullrequest?.byInstanceType ?? {});

  const prs = [];
  for (const instanceType of instanceTypes) {
    const detailUrl = `${jiraDevApiBaseUrl}/issue/detail?issueId=${issueId}` +
      `&applicationType=${encodeURIComponent(instanceType)}&dataType=pullrequest`;
    const detailResponse = await fetch(detailUrl, requestHeaders);
    if (!detailResponse.ok) continue;
    const detailData = await detailResponse.json();
    for (const detail of detailData.detail ?? []) {
      for (const pr of detail.pullRequests ?? []) {
        const parsed = parsePullUrl(pr.url);
        const number = parsed?.number ?? parseInt(pr.id?.match(/\d+/)?.[0], 10);
        if (!number) {
          console.warn(`Skipping PR with unrecognized id/url (${pr.id} ${pr.url}) for issue id ${issueId}`);
          continue;
        }
        prs.push({ number, repo: parsed?.repo ?? pr.repositoryName ?? thisRepo, status: pr.status });
      }
    }
  }
  return prs;
}

// Custom field ids differ between Jira sites, so look them up by name.
async function getJiraFieldIds(requestHeaders) {
  const response = await fetch(`${jiraApiBaseUrl}/field`, requestHeaders);
  const fields = response.ok ? await response.json() : [];
  const idOf = name => fields.find(field => field.name === name)?.id;
  return {
    projectTeamApprover: idOf("Project Team Approver"),
    sprint: idOf("Sprint")
  };
}

// The sprints an issue is in that haven't closed, e.g. ["FY26 Sprint 27 (future)"].
function openSprintNames(sprints) {
  return (sprints ?? [])
    .filter(sprint => sprint.state !== "closed")
    .map(sprint => `${sprint.name} (${sprint.state})`);
}

// "is blocked by" links to issues that are not Done, e.g. ["CLUE-659 [To Do]"].
function unresolvedBlockers(issueLinks) {
  return (issueLinks ?? [])
    .filter(link => link.type?.name === "Blocks" && link.inwardIssue)
    .filter(link => link.inwardIssue.fields?.status?.statusCategory?.key !== "done")
    .map(link => `${link.inwardIssue.key} [${link.inwardIssue.fields?.status?.name}]`);
}

// A user field may hold one user or a list of users.
function userNames(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(user => user.displayName).filter(Boolean);
}

async function getJiraLinkedPRs() {
  const requestHeaders = jiraRequestHeaders(jiraUser, jiraToken);
  const fieldIds = await getJiraFieldIds(requestHeaders);
  const urlQuery = querystring.stringify({
    jql: `project=${jiraProjectKey} AND fixVersion in ("${jiraFixVersion}") AND issuetype in (Story, Bug, Chore, Task)`,
    fields: ["summary", "status", "assignee", "issuetype", "issuelinks", fieldIds.projectTeamApprover, fieldIds.sprint]
      .filter(Boolean).join(","),
    maxResults: 100
  });

  const url = `${jiraApiBaseUrl}/search/jql?${urlQuery}`;
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
  // Maps each Jira issue key to its summary, state and linked PRs so callers can
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
    // PRs in other repositories, as { repo, number, status }. They are reported
    // but never matched against this repo's merge history.
    const otherRepoPRs = [];
    const addPR = ({ repo, number, status }) => {
      if (repo === thisRepo) {
        if (issuePrNumbers.includes(number)) return;
        jiraPRs.add(number);
        issuePrNumbers.push(number);
      } else if (!otherRepoPRs.some(pr => pr.repo === repo && pr.number === number)) {
        otherRepoPRs.push({ repo, number, status });
      }
    };
    try {
      const prs = await getIssuePullRequests(issue.id, requestHeaders);
      prs.forEach(addPR);

      // Also check web links (remote links) for GitHub PR URLs.
      // This catches PRs that were linked manually after the fact.
      const remoteLinksUrl = `${jiraApiBaseUrl}/issue/${issue.id}/remotelink`;
      const remoteLinksResponse = await fetch(remoteLinksUrl, requestHeaders);
      if (remoteLinksResponse.ok) {
        const remoteLinks = await remoteLinksResponse.json();
        for (const link of remoteLinks) {
          const parsed = parsePullUrl(link.object?.url);
          if (parsed) addPR({ ...parsed, status: null });
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
      status: issue.fields?.status?.name,
      isDone: issue.fields?.status?.statusCategory?.key === "done",
      assignee: issue.fields?.assignee?.displayName,
      type: issue.fields?.issuetype?.name,
      projectTeamApprovers: userNames(issue.fields?.[fieldIds.projectTeamApprover]),
      sprints: openSprintNames(issue.fields?.[fieldIds.sprint]),
      blockers: unresolvedBlockers(issue.fields?.issuelinks),
      prNumbers: issuePrNumbers,
      otherRepoPRs
    });
  }));

  // Remote links carry no PR state, so look up any other-repo PRs that only
  // came from a remote link.
  const unknownOtherRepoPRs = [...jiraIssuePRs.values()]
    .flatMap(({ otherRepoPRs }) => otherRepoPRs)
    .filter(pr => !pr.status);
  await Promise.all(unknownOtherRepoPRs.map(async (pr) => {
    try {
      const [owner, repo] = pr.repo.split("/");
      const { data } = await octokit.pulls.get({ owner, repo, pull_number: pr.number });
      pr.status = data.merged ? "MERGED" : data.state === "closed" ? "DECLINED" : data.draft ? "DRAFT" : "OPEN";
    } catch {
      pr.status = "UNKNOWN";
    }
  }));

  return { jiraPRs, jiraIssuePRs };
}

async function getMergedPRs() {
  // Setting per_page makes the endpoint emit Link headers so octokit.paginate walks every page.
  const commits = await octokit.paginate(
    octokit.repos.compareCommits,
    {
      owner: "concord-consortium",
      repo: gitRepo,
      base: gitBase,
      head: gitHead,
      per_page: 100
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
  await verifyGitHubAuth();

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

  // The `prs` listing above can miss PRs whose merge commit is actually in the
  // release range. The usual cause is the updated_at cutoff in getMergedPRs():
  // a PR merged into a long-lived branch before the release window, and not
  // touched since, is dropped from the listing even though the long-lived
  // branch later landed in the range. Squash merges are also missed when their
  // PR falls outside the listing.
  //
  // To recover these, scan the range's commits for the two shapes GitHub uses
  // to record a merge in the commit message:
  //   - merge commits:  "Merge pull request #1234 from owner/branch"
  //   - squash commits: "Some title (#1234)"
  // For each referenced PR we don't already have, fetch it and confirm its
  // recorded merge_commit_sha matches the commit we found before counting it as
  // merged. That check guards against an unrelated "(#1234)" mention.
  const mergedPRNumbers = new Set(mergedPRs.map(pr => pr.number));
  const mergeCommitPattern = /^Merge pull request #(\d+) /;
  const squashPrPattern = /\(#(\d+)\)\s*$/;

  // First commit message occurrence wins; the merge_commit_sha check validates it.
  const prCommitCandidates = new Map(); // prNumber -> commitSha
  for (const commit of commits) {
    const firstLine = commit.message.split("\n")[0];
    const match = firstLine.match(mergeCommitPattern) ?? firstLine.match(squashPrPattern);
    if (!match) continue;
    const prNumber = parseInt(match[1], 10);
    if (mergedPRNumbers.has(prNumber) || prCommitCandidates.has(prNumber)) continue;
    prCommitCandidates.set(prNumber, commit.sha);
  }

  if (prCommitCandidates.size > 0) {
    const recoveredPRs = await Promise.all(
      [...prCommitCandidates].map(async ([prNumber, commitSha]) => {
        try {
          const { data: pr } = await octokit.pulls.get({
            owner: "concord-consortium",
            repo: gitRepo,
            pull_number: prNumber
          });
          // Verify the PR was actually merged and the commit we found is the
          // merge_commit_sha GitHub recorded for this PR.
          if (pr.merged && pr.merge_commit_sha === commitSha) {
            return prShape(pr);
          }
        } catch (error) {
          console.warn(`⚠️  Could not fetch PR #${prNumber} referenced in commit ${commitSha}: ${error.message}`);
        }
        return null;
      })
    );

    for (const pr of recoveredPRs) {
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
  // Done issues with an open PR linked. Usually a later PR mentions the issue
  // (e.g. follow-up work built on it), so this is informational.
  const doneWithOpenPRIssues = [];
  const wrongVersionJiraIssues = [];
  for (const [issueKey, issue] of jiraIssuePRs) {
    const { summary, prNumbers, otherRepoPRs } = issue;
    if (prNumbers.length === 0 && otherRepoPRs.length === 0) continue;
    // An issue needs attention if any PR is not in the release range and
    // wasn't simply closed. "Merged after head" still counts — the code
    // hasn't landed in the release yet. For PRs in other repos there's no
    // release range to check, so only an open PR counts.
    const hasUnmerged = prNumbers.some(n =>
      !mergedPRNumbers.has(n) && !closedPRNumbers.has(n) &&
      !mergedBeforeBasePRNumbers.has(n)
    ) || otherRepoPRs.some(pr => pr.status === "OPEN" || pr.status === "DRAFT");
    if (hasUnmerged && issue.isDone) {
      doneWithOpenPRIssues.push({ issueKey, ...issue });
    } else if (hasUnmerged) {
      unmergedJiraIssues.push({ issueKey, ...issue });
    } else if (!prNumbers.some(n => mergedPRNumbers.has(n))) {
      // No PRs landed in this release — they were all merged before gitBase
      // or closed. The fixVersion may be wrong.
      if (prNumbers.some(n => mergedBeforeBasePRNumbers.has(n))) {
        wrongVersionJiraIssues.push({ issueKey, summary, prNumbers });
      }
    }
  }

  log(`🔍 Found ${mergedPRs.length} PRs merged between ${gitBase} and ${gitHead}.`);
  mergedPRs.forEach(pr => {
    log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})`);
  });

  log(`\n🔍 Found ${jiraPRs.size} PRs linked to Jira issues in project ${jiraProjectKey} with fix version "${jiraFixVersion}".`);
  jiraPRs.forEach(prNumber => {
    log(`- jiraPR #${prNumber}`);
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
  //
  // Keys from other Jira projects (e.g. a DEV ticket) are collected too. They
  // don't make a PR linked — the work still needs an issue in this project —
  // but they help explain what the PR is. Only prefixes that are real project
  // keys count, so text like "UTF-8" is not taken for an issue key.
  const requestHeaders = jiraRequestHeaders(jiraUser, jiraToken);
  const projectKeys = await getJiraProjectKeys(requestHeaders);
  projectKeys.add(jiraProjectKey);
  const issueKeyPattern = /\b([A-Z][A-Z0-9]+)-\d+\b/g;
  const isThisProjectKey = key => key.startsWith(`${jiraProjectKey}-`);

  // Collect every referenced issue key across all unlinked PRs so we can
  // fetch their fixVersions in a single JQL search. The direct /issue/{key}
  // GET endpoint returns 404 for API tokens that can still run JQL searches,
  // so batching through /search/jql is both more robust and faster.
  const prReferencedKeys = unlinkedPRs.map(pr => {
    const searchText = `${pr.title} ${pr.body} ${pr.branch}`;
    return [...new Set(
      [...searchText.matchAll(issueKeyPattern)]
        .filter(m => projectKeys.has(m[1]))
        .map(m => m[0])
    )];
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
      fields: "fixVersions,summary,labels,status",
      maxResults: chunkSize
    });
    const jqlUrl = `${jiraApiBaseUrl}/search/jql?${jqlQuery}`;
    const jqlResponse = await fetch(jqlUrl, requestHeaders);
    if (jqlResponse.ok) {
      const jqlJson = await jqlResponse.json();
      for (const issue of jqlJson.issues ?? []) {
        issueInfo.set(issue.key, {
          summary: issue.fields?.summary,
          status: issue.fields?.status?.name,
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
    const issueKeys = prReferencedKeys[i].filter(isThisProjectKey);
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
    log(`\n📦 PRs Merged but have different fix versions:\n`);
    previouslyReleased.forEach(({ pr, issueKey, summary, versions }) => {
      log(`-  ${pr.html_url} - ${pr.title} (by ${pr.user})`);
      log(`   └─ ${issueKey}: ${summary} (fixVersion ${versions.join(", ")})`);
    });
  }

  if (referencedCurrentVersion.length > 0) {
    log(`\n🔗 PRs referencing a Jira issue with fixVersion "${jiraFixVersion}" (not auto-linked by Jira):\n`);
    referencedCurrentVersion.forEach(({ pr, issueKey, noReleaseConflict }) => {
      const conflict = noReleaseConflict ? ` ⚠️ (${issueKey} also labeled "no-release" — conflict)` : "";
      log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})${conflict}`);
    });
  }

  if (linkedNeedsAction.length > 0) {
    log(`\n🗒  PRs linked to a Jira issue that has no fixVersion — assign "${jiraFixVersion}" or add the "no-release" label:\n`);
    linkedNeedsAction.forEach(({ pr, issueKey }) => {
      log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})`);
      log(`   └─ ${issueKey}: ${jiraBaseUrl}/browse/${issueKey}`);
    });
  }

  if (noReleaseLabeled.length > 0) {
    log(`\n🚫 PRs whose Jira issue is labeled "no-release" (skipped):\n`);
    noReleaseLabeled
      .sort((a, b) => a.pr.number - b.pr.number)
      .forEach(({ pr, issueKey }) => {
        log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})`);
        log(`   └─ ${issueKey}: ${jiraBaseUrl}/browse/${issueKey}`);
      });
  }

  if (longLivedBranchPRs.length > 0) {
    log(`\n🌿 Long-lived branch merges (skipped — individual work tracked elsewhere):\n`);
    longLivedBranchPRs
      .sort((a, b) => a.number - b.number)
      .forEach(pr => {
        log(`- ${pr.html_url} - ${pr.title} (by ${pr.user})`);
      });
  }

  const prStatusLabel = prNum => mergedPRNumbers.has(prNum)
    ? "merged"
    : mergedBeforeBasePRNumbers.has(prNum)
    ? `merged < ${gitBase}`
    : mergedAfterHeadPRNumbers.has(prNum)
    ? `merged > ${gitHead}`
    : closedPRNumbers.has(prNum)
    ? "closed"
    : "not merged";
  // For each open PR linked to an issue, who it is waiting on.
  const openPRs = [...jiraIssuePRs.values()].flatMap(({ prNumbers, otherRepoPRs }) => [
    ...prNumbers
      .filter(n => prStatusLabel(n) === "not merged")
      .map(number => ({ repo: thisRepo, number })),
    ...otherRepoPRs.filter(pr => pr.status === "OPEN" || pr.status === "DRAFT")
  ]);
  const prReviewStates = new Map(); // "owner/repo#123" -> description
  const uniqueOpenPRs = new Map(openPRs.map(pr => [`${pr.repo}#${pr.number}`, pr]));
  await Promise.all([...uniqueOpenPRs].map(async ([id, { repo, number }]) => {
    prReviewStates.set(id, await getPRReviewState(repo, number));
  }));

  const printIssuePRs = ({ prNumbers, otherRepoPRs }) => {
    const reviewState = (repo, number) => {
      const state = prReviewStates.get(`${repo}#${number}`);
      return state ? ` — ${state}` : "";
    };
    prNumbers.forEach(prNum => {
      log(`  ${prStatusLabel(prNum)}: https://github.com/${thisRepo}/pull/${prNum}${reviewState(thisRepo, prNum)}`);
    });
    otherRepoPRs.forEach(({ repo, number, status }) => {
      log(`  ${status?.toLowerCase() ?? "unknown"} (other repo): https://github.com/${repo}/pull/${number}${reviewState(repo, number)}`);
    });
  };

  // True when at least one PR landed in this release and nothing linked is still
  // open or only merged after gitHead.
  const allCodeLanded = ({ prNumbers, otherRepoPRs }) => {
    const landed = ["merged", `merged < ${gitBase}`, "closed"];
    return prNumbers.some(n => prStatusLabel(n) === "merged") &&
      prNumbers.every(n => landed.includes(prStatusLabel(n))) &&
      !otherRepoPRs.some(pr => pr.status === "OPEN" || pr.status === "DRAFT");
  };

  // Lines explaining where an issue that isn't Done stands and who it waits on.
  const printIssueProgress = (issue) => {
    if (issue.isDone) return;
    log(`    status: ${issue.status} (${issue.assignee ?? "unassigned"})`);
    if (/project team review/i.test(issue.status ?? "")) {
      const approvers = issue.projectTeamApprovers.join(", ") || "no Project Team Approver set";
      log(`    waiting on project team review: ${approvers}`);
    } else if (allCodeLanded(issue)) {
      log(`    all PRs are merged — should this issue be Done?`);
    }
    if (issue.prNumbers.length === 0 && issue.otherRepoPRs.length === 0) {
      log(`    no PRs linked`);
    }
    if (issue.sprints.length > 0) {
      log(`    sprint: ${issue.sprints.join(", ")}`);
    }
    if (issue.blockers.length > 0) {
      log(`    blocked by: ${issue.blockers.join(", ")}`);
    }
  };

  if (unmergedJiraIssues.length > 0) {
    log(`\n⚠️  Jira issues tagged with fixVersion "${jiraFixVersion}" whose PRs are NOT merged into ${gitHead}:\n`);
    unmergedJiraIssues
      .sort((a, b) => a.issueKey.localeCompare(b.issueKey, undefined, { numeric: true }))
      .forEach((issue) => {
        log(`- ${issue.issueKey}: ${issue.summary}`);
        log(`    ${jiraBaseUrl}/browse/${issue.issueKey}`);
        printIssueProgress(issue);
        printIssuePRs(issue);
      });
  }

  if (doneWithOpenPRIssues.length > 0) {
    log(`\nℹ️  Done Jira issues that still have open PRs linked (often a later PR that mentions the issue):\n`);
    doneWithOpenPRIssues
      .sort((a, b) => a.issueKey.localeCompare(b.issueKey, undefined, { numeric: true }))
      .forEach((issue) => {
        log(`- ${issue.issueKey}: ${issue.summary}`);
        log(`    ${jiraBaseUrl}/browse/${issue.issueKey}`);
        printIssuePRs(issue);
      });
  }

  const unmergedIssueKeys = new Set(unmergedJiraIssues.map(issue => issue.issueKey));
  const otherNotDoneIssues = [...jiraIssuePRs]
    .filter(([issueKey, issue]) => !issue.isDone && !unmergedIssueKeys.has(issueKey))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  if (otherNotDoneIssues.length > 0) {
    log(`\n⏳ Other Jira issues tagged with fixVersion "${jiraFixVersion}" that are not Done:\n`);
    otherNotDoneIssues.forEach(([issueKey, issue]) => {
      log(`- ${issueKey}: ${issue.summary}`);
      log(`    ${jiraBaseUrl}/browse/${issueKey}`);
      printIssueProgress(issue);
      printIssuePRs(issue);
    });
  }

  if (wrongVersionJiraIssues.length > 0) {
    log(`\n📦 Jira issues tagged with fixVersion "${jiraFixVersion}" whose PRs were all merged outside ${gitBase}..${gitHead} (fixVersion may be wrong):\n`);
    wrongVersionJiraIssues
      .sort((a, b) => a.issueKey.localeCompare(b.issueKey))
      .forEach(({ issueKey, summary, prNumbers }) => {
        log(`- ${issueKey}: ${summary}`);
        log(`    ${jiraBaseUrl}/browse/${issueKey}`);
        prNumbers.forEach(prNum => {
          const status = mergedBeforeBasePRNumbers.has(prNum)
            ? `merged < ${gitBase}`
            : mergedAfterHeadPRNumbers.has(prNum)
            ? `merged > ${gitHead}`
            : "closed";
          log(`  ${status}: https://github.com/concord-consortium/${gitRepo}/pull/${prNum}`);
        });
      });
  }

  log(`\n🔎 PRs Merged Since Last Release Without a Linked Jira Issue:\n`);
  if (trulyUnlinked.length === 0) {
    log("✅ No untracked PRs found.");
  } else {
    trulyUnlinked.forEach(pr => {
      log(`❌ ${pr.html_url} - ${pr.title} (by ${pr.user})`);
      const otherProjectKeys = prReferencedKeys[unlinkedPRs.indexOf(pr)].filter(key => !isThisProjectKey(key));
      otherProjectKeys.forEach(key => {
        const info = issueInfo.get(key);
        const detail = info ? `${info.summary} [${info.status}]` : "(not found)";
        log(`   └─ references ${key}: ${detail} ${jiraBaseUrl}/browse/${key}`);
      });
    });
  }

  if (showDetails) {
    log(`\n📋 All issues with fixVersion "${jiraFixVersion}" and their PRs:\n`);
    [...jiraIssuePRs]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach(([issueKey, issue]) => {
        log(`- ${issueKey} [${issue.type}] ${issue.status} (${issue.assignee ?? "unassigned"}): ${issue.summary}`);
        if (issue.prNumbers.length === 0 && issue.otherRepoPRs.length === 0) {
          log("  (no PRs)");
        }
        printIssuePRs(issue);
      });
  }

  if (showJson) {
    const prSummary = pr => ({ number: pr.number, title: pr.title, user: pr.user, url: pr.html_url });
    const otherProjectRefs = pr => prReferencedKeys[unlinkedPRs.indexOf(pr)]
      .filter(key => !isThisProjectKey(key))
      .map(key => ({ key, summary: issueInfo.get(key)?.summary, status: issueInfo.get(key)?.status }));
    const keysOf = list => new Set(list.map(issue => issue.issueKey));
    const unmergedKeys = keysOf(unmergedJiraIssues);
    const doneWithOpenPRKeys = keysOf(doneWithOpenPRIssues);
    const wrongVersionKeys = keysOf(wrongVersionJiraIssues);

    const report = {
      jiraProject: jiraProjectKey,
      fixVersion: jiraFixVersion,
      repo: thisRepo,
      base: gitBase,
      head: gitHead,
      mergedPRs: mergedPRs.map(prSummary),
      issues: [...jiraIssuePRs]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([key, issue]) => ({
          key,
          url: `${jiraBaseUrl}/browse/${key}`,
          type: issue.type,
          summary: issue.summary,
          status: issue.status,
          isDone: issue.isDone,
          assignee: issue.assignee ?? null,
          projectTeamApprovers: issue.projectTeamApprovers,
          sprints: issue.sprints,
          blockers: issue.blockers,
          flags: {
            prsNotMerged: unmergedKeys.has(key),
            doneWithOpenPRs: doneWithOpenPRKeys.has(key),
            allCodeLandedButNotDone: !issue.isDone && !/project team review/i.test(issue.status ?? "") &&
              allCodeLanded(issue),
            noPRs: issue.prNumbers.length === 0 && issue.otherRepoPRs.length === 0,
            fixVersionMayBeWrong: wrongVersionKeys.has(key)
          },
          prs: [
            ...issue.prNumbers.map(number => ({
              repo: thisRepo,
              number,
              url: `https://github.com/${thisRepo}/pull/${number}`,
              state: prStatusLabel(number),
              review: prReviewStates.get(`${thisRepo}#${number}`) ?? null
            })),
            ...issue.otherRepoPRs.map(({ repo, number, status }) => ({
              repo,
              number,
              url: `https://github.com/${repo}/pull/${number}`,
              state: status?.toLowerCase() ?? "unknown",
              review: prReviewStates.get(`${repo}#${number}`) ?? null
            }))
          ]
        })),
      mergedPRsWithoutIssueInVersion: {
        previouslyReleased: previouslyReleased.map(({ pr, issueKey, versions }) =>
          ({ ...prSummary(pr), issueKey, versions })),
        referencedCurrentVersion: referencedCurrentVersion.map(({ pr, issueKey, noReleaseConflict }) =>
          ({ ...prSummary(pr), issueKey, noReleaseConflict })),
        issueHasNoFixVersion: linkedNeedsAction.map(({ pr, issueKey }) => ({ ...prSummary(pr), issueKey })),
        noRelease: noReleaseLabeled.map(({ pr, issueKey }) => ({ ...prSummary(pr), issueKey })),
        longLivedBranch: longLivedBranchPRs.map(prSummary),
        unlinked: trulyUnlinked.map(pr => ({ ...prSummary(pr), otherProjectRefs: otherProjectRefs(pr) }))
      }
    };
    console.log(JSON.stringify(report, null, 2));
  }
}

// Describes who an open PR is waiting on, e.g.
// "by kswenson; approved by emcelroy; review requested from lbondaryk".
// Comment-only reviews (including bots like Copilot) don't count as a decision.
async function getPRReviewState(repoFullName, number) {
  const [owner, repo] = repoFullName.split("/");
  try {
    const [{ data: pr }, reviews] = await Promise.all([
      octokit.pulls.get({ owner, repo, pull_number: number }),
      octokit.paginate(octokit.pulls.listReviews, { owner, repo, pull_number: number, per_page: 100 })
    ]);
    // Reviews come oldest first, so the last decision per reviewer wins.
    const decisions = new Map();
    for (const review of reviews) {
      if (review.user?.type === "Bot") continue;
      if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) {
        decisions.set(review.user.login, review.state);
      }
    }
    const reviewersWith = state => [...decisions].filter(([, s]) => s === state).map(([login]) => login);
    const requested = [
      ...(pr.requested_reviewers ?? []).map(user => user.login),
      ...(pr.requested_teams ?? []).map(team => `team ${team.name}`)
    ];

    const parts = [`by ${pr.user?.login ?? "unknown"}`];
    if (pr.draft) parts.push("draft");
    const changesRequested = reviewersWith("CHANGES_REQUESTED");
    const approved = reviewersWith("APPROVED");
    if (changesRequested.length) parts.push(`changes requested by ${changesRequested.join(", ")}`);
    if (approved.length) parts.push(`approved by ${approved.join(", ")}`);
    if (requested.length) parts.push(`review requested from ${requested.join(", ")}`);
    if (!pr.draft && !changesRequested.length && !approved.length && !requested.length) {
      parts.push("no reviewer requested");
    }
    return parts.join("; ");
  } catch (error) {
    return `could not read review state: ${error.message}`;
  }
}

// Returns the keys of every Jira project the token can see, e.g. {"CLUE", "DEV"}.
async function getJiraProjectKeys(requestHeaders) {
  const keys = new Set();
  let startAt = 0;
  for (;;) {
    const url = `${jiraApiBaseUrl}/project/search?startAt=${startAt}&maxResults=100`;
    const response = await fetch(url, requestHeaders);
    if (!response.ok) {
      console.warn(`⚠️  Could not list Jira projects (${response.status}); only ${jiraProjectKey} keys will be recognized.`);
      break;
    }
    const json = await response.json();
    (json.values ?? []).forEach(project => keys.add(project.key));
    if (json.isLast || !json.values?.length) break;
    startAt += json.values.length;
  }
  return keys;
}

getUnlinkedMergedPRs();
