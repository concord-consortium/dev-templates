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
  for(const story of stories) {
    if(story.story_type === "feature"){
      features.push(story);
    }
    if(story.story_type === "bug"){
      bugs.push(story);
    }
  }
}

const ptLabel = process.argv[2];
const search = `label:${ptLabel} includedone:true`;
const orangeProjectId = 2441249;
const tealProjectId = 2441242;
await collectStories(orangeProjectId, search)
await collectStories(tealProjectId, search)

function storyItem(story) {
  const name = story.name.replace(/\*\*\[[^\]]*\]\*\* ?/, "")
  return `PT-${story.id}: ${name}`
}

if (features.length > 0) {
  console.log("### Features/Improvements");
  for(const feature of features) {
    console.log(`- ${storyItem(feature)}`);
  }
  console.log("");
}
if (bugs.length > 0) {
  console.log("### Bug Fixes");
  for(const bug of bugs) {
    console.log(`- ${storyItem(bug)}`);
  }
}
