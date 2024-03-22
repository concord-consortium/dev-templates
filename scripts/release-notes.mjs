import 'dotenv/config'
import fetch from 'node-fetch';
import querystring from 'querystring';

const ptToken = process.env.PT_TOKEN;

const features = [];
const bugs = [];
const underTheHood = [];

function isUnderTheHood(story) {
  return story.labels.find(label => label.name === "under-the-hood");
}

async function collectStories(projectId, search) {
  const urlQuery = querystring.stringify(
    {
      query: search
    }
  );

  // Documentation of this API is here: https://www.pivotaltracker.com/help/api/rest/v5#Search
  // story_type,description,name,id,labels
  const storyFields = `id,name,story_type,description,labels`;
  const fields = `fields=stories(stories(${storyFields}))`;
  const url = `https://www.pivotaltracker.com/services/v5/projects/${projectId}/search?${fields}&${urlQuery}`

  const response = await fetch(url, {
    headers: { 'X-TrackerToken': ptToken }
  });
  const json = await response.json();
  const stories = json.stories.stories
  for (const story of stories) {
    if (isUnderTheHood(story)) {
      underTheHood.push(story);
    } else {
      if (story.story_type === "feature") {
        features.push(story);
      }
      if (story.story_type === "bug") {
        bugs.push(story);
      }  
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

function storyText(story) {
  const blurbMatch = story.description?.match(/\*\*Blurb:\*\* (.*)/);
  if (blurbMatch?.length === 2) {
    return blurbMatch[1];
  }
  return story.name.replace(/\*\*\[[^\]]*\]\*\* ?/, "").trim();
}

function storyItem(story) {
  const text = storyText(story);
  return slack 
    ? `*[PT-${story.id}](https://pivotaltracker.com/story/show/${story.id}):* ${text}` 
    : `**PT-${story.id}:** ${text}`;
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

function printSection(msg, stories) {
  if (stories.length > 0) {
    printHeader(msg);
    for (const story of stories) {
      print(`- ${storyItem(story)}`);
    }
    print("");
  }  
}

printSection("✨ Features & Improvements:", features);
printSection("🐞 Bug Fixes:", bugs);
printSection("🛠 Under the Hood:", underTheHood);
