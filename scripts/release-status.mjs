import 'dotenv/config'
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
  const fields = "fields=stories(stories(id,name,story_type,current_state,url,pull_requests))"
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

function logStory(story) {
  logStoryShort(story);
  const storyPrs = story.pull_requests.map(pr => pr.number);
  indent(() => {
    print(`PRs: ${storyPrs} State: ${story.current_state}`);
    print(story.url);
  });
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
  process.exit(0);
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
  print(`${pr.number}: ${pr.title}`);
  indent(() => {
    print(pr.html_url);
    if (pr.merged_at) {
      print(`merged_at: ${pr.merged_at}`);
    }  
  });
}

print(`commit date range: ${commits[0].date} - ${commits[commits.length-1].date}`);
print(`found ${updatedPrs.length} PRs updated after the oldest commit`);
print(`found ${mergedPrs.length} PRs with merge commits`);

const iconMap = {
  shouldBeEmpty: {empty: "✅", notEmpty: "❌" },
  required: {empty: "❌", notEmpty: "✅"}
}

function logList({header, icons, list, logItem}) {
  print("");
  if (list.length > 0) {
    print(`${icons.notEmpty} ${header}`);
    list.forEach(logItem);
  } else {
    print(`${icons.empty} No ${header}`);
  }
}

logList({
  header: `Stories with "${ptLabel}" `,
  icons: iconMap.required,
  list: stories, 
  logItem: logStory
});

logList({
  header: "Merged PRs",
  icons: iconMap.required,
  list: mergedPrs, 
  logItem: logPR
});

// logList({header: "Updated PRs", list: updatedPrs, logItem: logPR);

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
  logItem: logStory
});

// In most cases we shouldn't be do a release when there are un accepted stories.
logList({
  header: `Un Accepted stories with "${ptLabel}"`, 
  icons: iconMap.shouldBeEmpty,
  list: stories.filter(story => (story.current_state !== "accepted")), 
  logItem: logStory
});

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
logList({
  header: "Open PRs linked to stories", 
  icons: iconMap.shouldBeEmpty,
  list: openStoryPRs, 
  logItem: storyPr => {
    const story = stories.find(_story => _story.id == storyPr.story_id);
    logStoryShort(story);
    indent(() => {
      logPR(storyPr.ghPr);
    })
  }
})

// TODO: there could be PRs that are open that we might want to merge but
// they aren't linked to a story. So to be safe we might want to list the 
// open PRs that aren't from a dependabot and aren't listed otherwise. 
