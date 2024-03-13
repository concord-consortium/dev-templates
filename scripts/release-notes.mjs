import 'dotenv/config'
import fetch from 'node-fetch';
import querystring from 'querystring';

const ptToken = process.env.PT_TOKEN;

const features = [];
const bugs = [];


async function collectStories(projectId, search) {
  const urlQuery = querystring.stringify(
    {
      query: search
    }
  );

  // Documentation of this API is here: https://www.pivotaltracker.com/help/api/rest/v5#Search
  const url = `https://www.pivotaltracker.com/services/v5/projects/${projectId}/search?${urlQuery}`

  const response = await fetch(url, {
    headers: { 'X-TrackerToken': ptToken }
  });
  const json = await response.json();
  const stories = json.stories.stories
  for (const story of stories) {
    if (story.story_type === "feature") {
      features.push(story);
    }
    if (story.story_type === "bug") {
      bugs.push(story);
    }
  }
}

const ptLabel = process.argv[2];
const slack = process.argv?.[3];
const search = `label:${ptLabel} includedone:true`;
const orangeProjectId = 2441249;
const tealProjectId = 2441242;
const codapProjectId = 2556922;
await collectStories(orangeProjectId, search)
await collectStories(tealProjectId, search)
await collectStories(codapProjectId, search)

function storyItem(story) {
  const name = story.name.replace(/\*\*\[[^\]]*\]\*\* ?/, "").trim();
  return slack 
    ? `*[PT-${story.id}](https://pivotaltracker.com/story/show/${story.id}):* ${name}` 
    : `**PT-${story.id}:** ${name}`;
}

const prefix = slack ? '> ' : '';
function print(msg) {
  console.log(`${prefix}${msg}`);
}
function printHeader(msg) {
  if (slack) {
    print(`*${msg}*`);
  } else {
    print(`### ${msg}`);
  }
}

if (features.length > 0) {
  printHeader("✨ Features & Improvements:");
  for (const feature of features) {
    print(`- ${storyItem(feature)}`);
  }
  print("");
}
if (bugs.length > 0) {
  printHeader("🐞 Bug Fixes:");
  for (const bug of bugs) {
    print(`- ${storyItem(bug)}`);
  }
}
