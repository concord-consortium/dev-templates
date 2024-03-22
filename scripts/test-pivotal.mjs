import 'dotenv/config';
import fetch from 'node-fetch';

const ptToken = process.env.PT_TOKEN;
if (!ptToken) {
  console.error("PT_TOKEN environment variable is required");
  process.exit(1);
} 

const tealProjectId = 2441242;
const projectId = tealProjectId;
const storyId = 187285911;

// Documentation of this API is here: https://www.pivotaltracker.com/help/api/rest/v5#Search
// The fields argument is added so the pull_requests are included in the stories response
const url = `https://www.pivotaltracker.com/services/v5/projects/${projectId}/stories/${storyId}`

const response = await fetch(url, {
  headers: { 'X-TrackerToken': ptToken }
});
const json = await response.json();
console.log(json);

const blurbMatch = json.description.match(/\*\*Blurb:\*\* (.*)/);
console.log(blurbMatch[1]);