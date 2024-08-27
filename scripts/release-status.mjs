import 'dotenv/config';
import util from 'util';
import fetch from 'node-fetch';
import querystring from 'querystring';
import { Octokit } from "@octokit/rest";

const ptToken = process.env.PT_TOKEN;
const ghToken = process.env.GITHUB_TOKEN;
if (!ptToken) {
  console.error("PT_TOKEN environment variable is required");
  process.exit(1);
} 

if (!ghToken) {
  console.error("GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

// TODO: add help text and validate command line arguments
const ptLabel = process.argv[2];
// Assumes its in the concord-consortium organization
const gitRepo = process.argv[3];
const gitBase = process.argv[4];
const gitHead = process.argv[5];
const slack = process.argv[6];

const octokit = new Octokit({ 
  auth: ghToken,
});

const stories = [];

async function collectStories(projectId, search) {
  const urlQuery = querystring.stringify(
    {
      query: search
    }
  );

  // Documentation of this API is here: https://www.pivotaltracker.com/help/api/rest/v5#Search
  // The fields argument is added so the pull_requests are included in the stories response
  const reviewFields = "id,kind,story_id,review_type,status,updated_at"
  const storyFields = `id,name,story_type,current_state,url,pull_requests,reviews(${reviewFields}),tasks,owners`;
  const fields = `fields=stories(stories(${storyFields}))`
  const url = `https://www.pivotaltracker.com/services/v5/projects/${projectId}/search?${fields}&${urlQuery}`

  const response = await fetch(url, {
    headers: { 'X-TrackerToken': ptToken }
  });
  const json = await response.json();
  const projectStories = json.stories.stories.filter(
    story => ["feature", "bug", "chore"].includes(story.story_type)
  );
  stories.push(...projectStories);
}

const exampleStoryPR =   {
  id: 2828909,
  kind: 'pull_request',
  story_id: 187042217,
  owner: 'concord-consortium',
  repo: 'collaborative-learning',
  host_url: 'https://github.com/',
  status: 'closed',
  number: 2202,
  created_at: '2024-02-22T21:32:18Z',
  updated_at: '2024-02-22T22:21:46Z'
};

const search = `label:${ptLabel} includedone:true`;
const orangeProjectId = 2441249;
const tealProjectId = 2441242;
const codapProjectId = 2556922;
await collectStories(orangeProjectId, search);
await collectStories(tealProjectId, search);
await collectStories(codapProjectId, search);

// Print the first story
// console.log(util.inspect(stories[0], {depth: 5, colors: true}));

let printIndent = 0;
function print(msg) {
  console.log(`${" ".repeat(printIndent)}${msg}`);
}

function indent(callback){
  printIndent += 2;
  callback();
  printIndent -= 2;
}

function logStoryShort(story) {
  const name = story.name.replace(/\*\*\[[^\]]*\]\*\* ?/, "");
  const idString = `PT-${story.id}`;
  const prefix = slack
    ? `*[${idString}](${story.url})*`
    : idString;
  print(`${prefix}: ${name} (${story.story_type})`);
}

function storyPrsSummary(story) {
  if (!story.pull_requests?.length) {
    return "none";
  }
  return story.pull_requests.map(pr => pr.number);
}

function storyPRPath(storyPr) {
  const {owner, repo, number} = storyPr;
  return `${owner}/${repo}/${number}`;
}

function reviewSummary(story) {
  if (story.reviews.length === 0) {
    return "none";
  }
  return story.reviews.map(review => 
    `${review.review_type.name}|${review.status}`
  ).join(", ");
}

function printTasks(story) {
  if (!story.tasks.length) return;

  const unfinishedTasks = story.tasks.filter(task => !task.complete);
  if (!unfinishedTasks.length) return;

  print(`Unfinished Tasks: ${unfinishedTasks.length}`);
}

function logStory(story, expandPRs = false) {
  logStoryShort(story);
  indent(() => {
    !slack && print(story.url);
    print(`State: ${story.current_state}`);
    print(`Reviews: ${reviewSummary(story)}`);
    printTasks(story);
    print(`Owners: ${story.owners.map(owner => owner.username)}`);
    if (expandPRs && story.pull_requests?.length) {
      print("PRs:");
      indent(() => {
        story.pull_requests.forEach(storyPr => {
          if (storyPr.ghPr) {
            logPR(storyPr.ghPr);
          } else {
            print(`Missing PR: ${storyPRPath(storyPr)}`);
          }
        })
  
      })
    } else {
      print(`PRs: ${storyPrsSummary(story)}`)
    }
  });
}

// use paginate with a map function so we can handle more than 250 commits
// The result is an array of commits, even if multiple pages are returned
// There is additional compareInfo returned in the first response including
// the base_commit, merge_base_commit, and list of changed files
let firstResponse = true;
let compareInfo;
const commits = await octokit.paginate(
  octokit.repos.compareCommits, 
  {
    owner: "concord-consortium",
    repo: gitRepo,
    base: gitBase,
    head: gitHead
  },
  (response) => {
    if (firstResponse) {
      const {commits, ...everythingElse} = response.data;
      compareInfo = everythingElse;
      firstResponse = false;
    }
    return response.data.commits.map(commit => ({
      message: commit.commit.message.split("\n", 1)[0],
      sha: commit.sha,
      date: commit.commit.author.date
    }));
  }
);
  
if ( commits.length < 1 ) {
  console.log("No commits found");
}
if ( !compareInfo || !compareInfo.merge_base_commit) {
  console.error("Did not get valid compareInfo", {compareInfo});
  process.exit(1);
}

const mergeBaseCommitDate = compareInfo.merge_base_commit.commit.author.date;

// Get pull requests using pull request specific API
// - need a token with `pull_requests:read` permission
// - `state: all` - some might be merged and closed, default is open
// - `sort: updated` - this way we can find PRs that were created before the 
//   oldest commit, and then they were squashed merged. In this case their
//   single merge commit would leave a trail of old commits that would be
//   included in the list of commits.
let loggedFirstPR = false;
const prs = await octokit.paginate(
  octokit.pulls.list,
  {
    owner: "concord-consortium",
    repo: gitRepo,
    sort: "updated",
    state: "all",
    direction: "desc"
  },
  (response, done) => response.data.map((pr) => {
    // 30 PRs are requested at a time, the `done()` will prevent paginate
    // from continuing to the request more PRs once it finds one that was 
    // updated before the oldest commit.
    //
    // FIXME: when a long running branch is used, a PR could be merged into this
    // long running branch before mergeBaseCommitDate. If this PR is not updated
    // after that it will get excluded from the list.
    if(pr.updated_at < mergeBaseCommitDate) {
      done();
    }
    if (!loggedFirstPR) {
      // console.log(util.inspect(pr, {depth: 5, colors: true}));
      loggedFirstPR = true;
    }
    return {
      updated_at: pr.updated_at,
      html_url: pr.html_url,
      title: pr.title,
      state: pr.state,
      merged_at: pr.merged_at,
      merge_commit_sha: pr.merge_commit_sha,
      number: pr.number,
      user: pr.user.login,
      labels: pr.labels.map(label => label.name),
      requested_reviewers: pr.requested_reviewers.map(reviewer => reviewer.login)
    };
  }) 
)

// Print the first PR
// console.log(util.inspect(prs[0], {depth: 5, colors: true}));


// Using our typical pattern of comparing [previous version]...master,
// the mergeBaseCommit will be a commit that was part of the previous release.
// So we try to skip the PR that resulted in that commit by using `>` instead `>=`.
const updatedPrs = prs.filter(pr => pr.updated_at > mergeBaseCommitDate );

// We look for the reviews of all of the prs we downloaded.
// If a PR isn't merged yet, it might not be updated after the merge base
// FIXME: this means we might not be downloading some PRs that we should.
for (const pr of prs) {
  const response = await octokit.pulls.listReviews({
    owner: "concord-consortium",
    repo: gitRepo,
    pull_number: pr.number
  })
  // if (pr.number == 2211) {
  //   console.log(response);
  // }
  pr.reviews = response.data.map(review => ({
    user: review.user.login,
    body: review.body,
    state: review.state,
    submitted_at: review.submitted_at,
    commit_id: review.commit_id
  }));
}

// Add the github PR to the story PR to help with filtering and logging
function addGitHubPRToStoryPR(storyPr) {
  if (storyPr.owner !== "concord-consortium" || storyPr.repo !== gitRepo) {
    // This will happen for stories that span multiple repositories. It might
    // be better to just indicate them in logged lists
    console.warn("Story linked to PR in a different repo", storyPr);
    return;
  }

  const ghPr = prs.find(pr => (pr.number === storyPr.number));
  if (!ghPr) {
    // It is possible in some cases we won't have fetched this PR because of
    // how the dates are currently filtered. If this happens a lot then we 
    // can fix the filtering, or use a single PR fetch to get the GitHub PR
    console.warn("Cannot find PR that story is linked to", storyPr);
    return;
  }

  storyPr.ghPr = ghPr;
}

stories.forEach(story => {
  story.pull_requests?.forEach(addGitHubPRToStoryPR);
});

// Print the first updated PR
// console.log(util.inspect(updatedPrs[0], {depth: 5, colors: true}));

// Note: the mergeBaseCommit is not included in `commits`, so mergedPrs should 
// not include the previous PR even if the filtering above doesn't exclude it.
const mergedPrs = updatedPrs.filter(
  pr => commits.find(commit => commit.sha === pr.merge_commit_sha)
);

function prNumber(pr) {
  if (slack) {
    return `[#${pr.number}]:(${pr.html_url})`;
  } else {
    return `#${pr.number}`;
  }
}

function printPrReviewSummary(pr) {
  if (!pr.reviews?.length) return;
  const reviewMap = {};
  pr.reviews.forEach(review => reviewMap[review.user] = review.state);
  const reviewStatuses = Object.entries(reviewMap).map(([key,value]) => `${key}|${value}`)
  print(`reviews: ${reviewStatuses.join(", ")}`);

}

function logPR(pr) {
  print(`${prNumber(pr)}: ${pr.title}`);
  indent(() => {
    !slack && print(pr.html_url);
    print(`author: ${pr.user}`);
    if (pr.merged_at) {
      print(`merged_at: ${pr.merged_at}`);
    }
    if (pr.requested_reviewers?.length) {
      print(`requested_reviewers: ${pr.requested_reviewers}`);
    }
    printPrReviewSummary(pr);
  });
}

print(`commit date range: ${mergeBaseCommitDate} - ${commits[commits.length-1]?.date}`);
print(`found ${updatedPrs.length} PRs updated after the oldest commit`);
print(`found ${mergedPrs.length} PRs with merge commits`);

const iconMap = {
  shouldBeEmpty: {empty: "✅", notEmpty: "❌" },
  required: {empty: "❌", notEmpty: "✅"}
}

function logList({header, icons, list, logItem}) {
  print("");
  if (list.length > 0) {
    print(`${icons.notEmpty} ${header} (${list.length})`);
    list.forEach(logItem);
  } else {
    print(`${icons.empty} No ${header}`);
  }
}

logList({
  header: `Stories with "${ptLabel}" `,
  icons: iconMap.required,
  list: stories, 
  logItem: story => logStory(story)
});

logList({
  header: "Merged PRs",
  icons: iconMap.required,
  list: mergedPrs, 
  logItem: logPR
});

// logList({
//   header: "Updated PRs",
//   icons: iconMap.required,
//   list: updatedPrs, 
//   logItem: logPR});

// If a PR doesn't have a story, it won't show up in the output of the release-notes script.
logList({
  header: `Merged PRs without a story labeled with ${ptLabel}`, 
  icons: iconMap.shouldBeEmpty,
  list: mergedPrs.filter(pr =>
    ! stories.find(story => 
      story.pull_requests.find(storyPr => 
        storyPr.number == pr.number))), 
  logItem: logPR
});

// A story without a PR might mean the developer didn't add the Story id to the branch in
// GitHub. In this case the PR might not be merged and the release might go out claiming
// the work is done, but actually it isn't included in the release.
logList({
  header: `Stories with "${ptLabel}" without PRs`, 
  icons: iconMap.shouldBeEmpty,
  list: stories.filter(story => ! story.pull_requests?.length), 
  logItem: story => logStory(story)
});

// If there is an accepted story with an open PR we missed something
logList({
  header: "Accepted stories with open or unknown PRs", 
  icons: iconMap.shouldBeEmpty,
  list: stories.filter(story => 
    story.current_state === "accepted" &&
    story.pull_requests?.length &&
    story.pull_requests.find(storyPR => 
      !storyPR.ghPr || storyPR.ghPr.state === "open"
    )
  ),
  logItem: story => logStory(story, true)
});

// In most cases we shouldn't be do a release when there are un accepted stories.
logList({
  header: `Un Accepted stories with "${ptLabel}"`, 
  icons: iconMap.shouldBeEmpty,
  list: stories.filter(story => (story.current_state !== "accepted")), 
  logItem: story => logStory(story, true)
});

// TODO: there could be PRs that are open that we might want to merge but
// they aren't linked to a story. So to be safe we might want to list the 
// open PRs that aren't from a dependabot and aren't listed otherwise. 
