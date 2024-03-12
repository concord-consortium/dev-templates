import 'dotenv/config'
import { Octokit } from "@octokit/rest";

const ghToken = process.env.GITHUB_TOKEN;

const octokit = new Octokit({ 
  auth: ghToken,
});

// const result = await octokit.rest.repos.compareCommitsWithBasehead({
//     owner: "concord-consortium",
//     repo: "collaborative-learning",
//     basehead: "v5.3.0...master",
// });


// use paginate with a map function so we can handle more than 250 commits
// The result is an array of strings, even if multiple pages are returned
const commits = await octokit.paginate(
  octokit.repos.compareCommits, 
  {
    owner: "concord-consortium",
    repo: "collaborative-learning",
    base: "v5.3.0",
    head: "master"
  },
  (response) => response.data.commits.map(commit => ({
    message: commit.commit.message.split("\n", 1)[0],
    sha: commit.sha,
    date: commit.commit.author.date
  }))
);

// console.log(result);
// console.log(result.data.commits);
// const messages = result.data.commits.map(commit => commit.commit.message.split("\n", 1)[0])
if ( commits.length < 1 ) {
    console.log("No commits found!");
    exit(0);
}
const oldestCommitDate = commits[0].date;
const prCommits = commits.filter(commit => commit.message.includes("#"));
console.log(prCommits);

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
    repo: "collaborative-learning",
    sort: "updated",
    state: "all",
    direction: "desc"
  },
  (response, done) => response.data.map((pr) => {
    if(pr.updated_at < oldestCommitDate) {
      done();
    }
    return {
      updated_at: pr.updated_at,
      html_url: pr.html_url,
      title: pr.title,
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
console.log(mergedPrs);
console.log(`commit date range: ${commits[0].date} - ${commits[commits.length-1].date}`);
console.log(`found ${prCommits.length} commits with messages that look like PR merges`);
console.log(`found ${updatedPrs.length} PRs updated after the oldest commit`);
console.log(`found ${mergedPrs.length} PRs with merge commits`);
