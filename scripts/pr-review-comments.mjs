/**
 * Downloads all review comments from a GitHub pull request.
 * Default output is formatted for pasting into an LLM to help resolve issues.
 *
 * Required command-line parameters (either):
 * - GitHub PR URL (e.g., "https://github.com/concord-consortium/collaborative-learning/pull/123")
 * OR
 * - GitHub repo name (e.g., "collaborative-learning")
 * - Pull request number (e.g., "123")
 * - Owner (optional, defaults to "concord-consortium")
 *
 * Flags:
 * - --show-resolved: Include resolved conversations (hidden by default)
 * - --raw: Output all data in detailed markdown format (not LLM-optimized)
 *
 * Example usage:
 * node pr-review-comments.mjs https://github.com/concord-consortium/collaborative-learning/pull/123
 * node pr-review-comments.mjs collaborative-learning 123
 * node pr-review-comments.mjs collaborative-learning 123 some-other-org
 * node pr-review-comments.mjs collaborative-learning 123 --show-resolved
 */

import "dotenv/config";
import { Octokit } from "@octokit/rest";

const ghToken = process.env.GITHUB_TOKEN;

if (!ghToken) {
  console.error("GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

// Parse arguments - separate flags from positional args
const args = process.argv.slice(2);
const flags = args.filter(arg => arg.startsWith("--"));
const positionalArgs = args.filter(arg => !arg.startsWith("--"));

const showResolved = flags.includes("--show-resolved");
const rawOutput = flags.includes("--raw");

// Parse PR URL or positional args
let owner, gitRepo, prNumber;

const prUrlMatch = positionalArgs[0]?.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
if (prUrlMatch) {
  owner = prUrlMatch[1];
  gitRepo = prUrlMatch[2];
  prNumber = prUrlMatch[3];
} else {
  gitRepo = positionalArgs[0];
  prNumber = positionalArgs[1];
  owner = positionalArgs[2] || "concord-consortium";
}

if (!gitRepo || !prNumber) {
  console.error("Usage: node pr-review-comments.mjs <pr-url> [--show-resolved] [--raw]");
  console.error("       node pr-review-comments.mjs <repo> <pr-number> [owner] [--show-resolved] [--raw]");
  console.error("Example: node pr-review-comments.mjs https://github.com/concord-consortium/collaborative-learning/pull/123");
  console.error("         node pr-review-comments.mjs collaborative-learning 123");
  console.error("         node pr-review-comments.mjs collaborative-learning 123 --show-resolved");
  process.exit(1);
}

const octokit = new Octokit({ auth: ghToken });

async function getPRReviewComments() {
  // Use GraphQL to get review threads with resolution status
  const query = `
    query($owner: String!, $repo: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          title
          url
          state
          merged
          author {
            login
          }
          reviews(first: 100) {
            nodes {
              author {
                login
              }
              state
              body
              submittedAt
            }
          }
          reviewThreads(first: 100) {
            nodes {
              isResolved
              path
              line
              comments(first: 100) {
                nodes {
                  author {
                    login
                  }
                  body
                  createdAt
                  url
                }
              }
            }
          }
          comments(first: 100) {
            nodes {
              author {
                login
              }
              body
              createdAt
              url
            }
          }
        }
      }
    }
  `;

  const result = await octokit.graphql(query, {
    owner,
    repo: gitRepo,
    prNumber: parseInt(prNumber, 10)
  });

  const pr = result.repository.pullRequest;

  const reviews = pr.reviews.nodes;
  const reviewThreads = pr.reviewThreads.nodes;
  const issueComments = pr.comments.nodes;

  // Filter threads based on resolution status
  const filteredThreads = showResolved
    ? reviewThreads
    : reviewThreads.filter(thread => !thread.isResolved);

  const resolvedCount = reviewThreads.filter(thread => thread.isResolved).length;
  const unresolvedCount = reviewThreads.length - resolvedCount;

  if (rawOutput) {
    outputRaw(pr, reviews, filteredThreads, issueComments, resolvedCount, unresolvedCount);
  } else {
    outputLLM(pr, filteredThreads, resolvedCount);
  }
}

function outputLLM(pr, threads, resolvedCount) {
  console.log(`The following are unresolved code review comments from PR #${prNumber}: "${pr.title}"`);
  console.log(`URL: ${pr.url}`);
  console.log(`Please address each of these review comments one by one, with you giving me an overview of what you will change and then waiting for me to ok the change or enter into a chat about a different change.`);
  console.log(`Each issue includes the file path and line number where the change is requested.`);
  console.log(`Note: Line numbers are from the reviewed code and may have shifted due to other changes.`);
  console.log("");

  if (threads.length === 0) {
    console.log("No unresolved review comments to address.");
    if (resolvedCount > 0) {
      console.log(`(${resolvedCount} resolved conversation${resolvedCount === 1 ? "" : "s"} hidden)`);
    }
    return;
  }

  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const comments = thread.comments.nodes;

    console.log(`## Issue ${i + 1}`);
    console.log(`File: ${thread.path}`);
    if (thread.line) {
      console.log(`Line: ${thread.line}`);
    }

    for (const comment of comments) {
      const author = comment.author?.login || "ghost";
      console.log(`Commenter: ${author}`);
      console.log("");
      console.log(comment.body);
      console.log("");
    }
  }

  console.log("---");
  console.log(`${threads.length} issue${threads.length === 1 ? "" : "s"} to address${resolvedCount > 0 ? ` (${resolvedCount} resolved hidden)` : ""}`);
}

function outputRaw(pr, reviews, filteredThreads, issueComments, resolvedCount, unresolvedCount) {
  console.log(`# PR #${prNumber}: ${pr.title}`);
  console.log(`Author: ${pr.author.login}`);
  console.log(`URL: ${pr.url}`);
  console.log(`State: ${pr.state.toLowerCase()}${pr.merged ? " (merged)" : ""}`);
  if (!showResolved) {
    console.log(`(Resolved conversations are hidden. Use --show-resolved to show them.)`);
  }
  console.log("");

  // Output reviews
  if (reviews.length > 0) {
    console.log(`## Reviews (${reviews.length})`);
    console.log("");
    for (const review of reviews) {
      const state = review.state.replace(/_/g, " ");
      console.log(`### ${review.author?.login || "ghost"} - ${state}`);
      console.log(`Submitted: ${review.submittedAt}`);
      if (review.body) {
        console.log("");
        console.log(review.body);
      }
      console.log("");
    }
  }

  // Output review threads (code comments)
  if (filteredThreads.length > 0) {
    const headerSuffix = showResolved ? "" : ` (${resolvedCount} resolved hidden)`;
    console.log(`## Review Threads (${filteredThreads.length})${headerSuffix}`);
    console.log("");
    for (const thread of filteredThreads) {
      const resolvedTag = thread.isResolved ? " ✓ RESOLVED" : "";
      console.log(`### Thread on \`${thread.path}\`${resolvedTag}`);
      console.log(`Line: ${thread.line || "N/A"}`);
      console.log("");
      for (const comment of thread.comments.nodes) {
        console.log(`**${comment.author?.login || "ghost"}** (${comment.createdAt}):`);
        console.log(comment.body);
        console.log("");
      }
    }
  }

  // Output issue comments (general discussion)
  if (issueComments.length > 0) {
    console.log(`## Discussion Comments (${issueComments.length})`);
    console.log("");
    for (const comment of issueComments) {
      console.log(`### ${comment.author?.login || "ghost"}`);
      console.log(`URL: ${comment.url}`);
      console.log(`Created: ${comment.createdAt}`);
      console.log("");
      console.log(comment.body);
      console.log("");
    }
  }

  // Summary
  console.log("---");
  const threadSummary = showResolved
    ? `${filteredThreads.length} threads (${resolvedCount} resolved, ${unresolvedCount} unresolved)`
    : `${unresolvedCount} unresolved threads (${resolvedCount} resolved hidden)`;
  console.log(`Total: ${reviews.length} reviews, ${threadSummary}, ${issueComments.length} discussion comments`);
}

getPRReviewComments();
