import 'dotenv/config'
import fetch from 'node-fetch';
import querystring from 'querystring';
import { Octokit } from "@octokit/rest";

const ptToken = process.env.PT_TOKEN;
const ghToken = process.env.GITHUB_TOKEN;
if (!ptToken) {
  console.error("PT_TOKEN environment variable is required");
  exit(1);
} 

if (!ghToken) {
  console.error("GITHUB_TOKEN environment variable is required");
  exit(1);
}

// TODO: add help text and validate command line arguments
const ptLabel = process.argv[2];
// Assumes its in the concord-consortium organization
const gitRepo = process.argv[3];
const gitBase = process.argv[4];
const gitHead = process.argv[5];

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
  const fields = "fields=stories(stories(id,name,story_type,current_state,url,pull_requests))"
  const url = `https://www.pivotaltracker.com/services/v5/projects/${projectId}/search?${fields}&${urlQuery}`

  const response = await fetch(url, {
    headers: { 'X-TrackerToken': ptToken }
  });
  const json = await response.json();
  const projectStories = json.stories.stories.filter(
    story => ["feature", "bug"].includes(story.story_type)
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

function logStory(story) {
  const name = story.name.replace(/\*\*\[[^\]]*\]\*\* ?/, "");
  const storyPrs = story.pull_requests.map(pr => pr.number);
  const msg = 
    `PT-${story.id}: ${story.story_type}: ${name}\n` +
    `  PRs: ${storyPrs} State: ${story.current_state}\n` +
    `  ${story.url}`;
  console.log(msg);
}

// use paginate with a map function so we can handle more than 250 commits
// The result is an array of strings, even if multiple pages are returned
// - need a git token with something like `content:read`
const commits = await octokit.paginate(
  octokit.repos.compareCommits, 
  {
    owner: "concord-consortium",
    repo: gitRepo,
    base: gitBase,
    head: gitHead
  },
  (response) => response.data.commits.map(commit => ({
    message: commit.commit.message.split("\n", 1)[0],
    sha: commit.sha,
    date: commit.commit.author.date
  }))
);
  
if ( commits.length < 1 ) {
  console.log("No commits found!");
  exit(0);
}
const oldestCommitDate = commits[0].date;
const prCommits = commits.filter(commit => commit.message.includes("#"));

// Get pull requests using pull request specific API
// - need a token with `pull_requests:read` permission
// - `state: all` - some might be merged and closed, default is open
// - `sort: updated` - this way we can find PRs that were created before the 
//   oldest commit, and then they were squashed merged. In this case their
//   single merge commit would leave a trail of old commits that would be
//   included in the list of commits.
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
    // updated before the oldest commit
    if(pr.updated_at < oldestCommitDate) {
      done();
    }
    // console.log(pr);
    return {
      updated_at: pr.updated_at,
      html_url: pr.html_url,
      title: pr.title,
      state: pr.state,
      merged_at: pr.merged_at,
      merge_commit_sha: pr.merge_commit_sha,
      number: pr.number,
      labels: pr.labels.map(label => label.name)
    };
  }) 
)
const updatedPrs = prs.filter(pr => pr.updated_at >= oldestCommitDate );
const mergedPrs = updatedPrs.filter(
  pr => commits.find(commit => commit.sha === pr.merge_commit_sha)
);

function logPR(pr) {
  console.log(`${pr.number}: ${pr.title}`);
  console.log(`  ${pr.html_url}`);
  console.log(`  merged_at: ${pr.merged_at}`);
}

console.log(`commit date range: ${commits[0].date} - ${commits[commits.length-1].date}`);
console.log(`found ${prCommits.length} commits with messages that look like PR merges`);
console.log(`found ${updatedPrs.length} PRs updated after the oldest commit`);
console.log(`found ${mergedPrs.length} PRs with merge commits`);

function logList(label, list, logFunction) {
  console.log("");
  if (list.length > 0) {
    console.log(label)
    list.forEach(logFunction);
  } else {
    console.log(`No ${label}`);
  }
}

logList(`Stories with "${ptLabel}" `, stories, logStory);

logList("Merged PRs", mergedPrs, logPR);

// logList("Updated PRs", updatedPrs, logPR);

// If a PR doesn't have a story, it won't show up in the output of the release-notes script.
const unStoriedPrs = mergedPrs.filter(pr =>
  ! stories.find(story => 
    story.pull_requests.find(storyPr => 
      storyPr.number == pr.number)));
logList(`Merged PRs without a story labeled with ${ptLabel}`, unStoriedPrs, logPR);

// A story without a PR might mean the developer didn't add the Story id to the branch in
// GitHub. In this case the PR might not be merged and the release might go out claiming
// the work is done, but actually it isn't included in the release.
const unPRdStories = stories.filter(story => ! story.pull_requests?.length);
logList(`Stories with "${ptLabel}" without PRs`, unPRdStories, logStory);

// In most cases we shouldn't be do a release when there are un accepted stories.
const unAcceptedStories = stories.filter(story => (story.current_state !== "accepted"));
logList(`Un Accepted stories with "${ptLabel}"`, unAcceptedStories, logStory);

// Open PRs linked to stories
// If the story still has an open PR we can't make the release candidate branch
const storyPRs = [];
stories.forEach(story => {
  story.pull_requests?.forEach(storyPr => {
    storyPRs.push(storyPr);
  });
})
const openStoryPRs = storyPRs.filter(storyPr => {
  if (storyPr.owner !== "concord-consortium" || storyPr.repo !== gitRepo) {
    console.warn("Story linked to PR in a different repo", storyPr);
    return false;
  }

  const ghPr = prs.find(pr => (pr.number === storyPr.number));
  if (!ghPr) {
    console.warn("Cannot find PR that story is linked to", storyPr);
    return false;
  }

  // Add the github PR to the story Pr to make logging easier
  storyPr.ghPr = ghPr;
  return ghPr.state === "open";
});
logList("Open PRs linked to stories", openStoryPRs, storyPr => {
  console.log(`Story: ${storyPr.story_id} has open PR: ${storyPr.number}`);
})

// TODO: there could be PRs that are open that we might want to merge but
// they aren't linked to a story. So to be safe we might want to list the 
// open PRs that aren't from a dependabot and aren't listed otherwise. 
