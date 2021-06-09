# Scripts to populate templats

## General Install

    npm install

## Release Notes

This uses Pivotal Tracker to print out markdown like what is suggested in the `new-release.md` file.
- searches the Orange and Teal PT boards for stories with a specific label
- ignores chores and releases
- strips the `**[label]**` off of the front of the stories

To run this script need your PT token: https://www.pivotaltracker.com/help/articles/api_token/

Export this as an environment variable

    export PT_TOKEN=<token>

Run it with

    npm run release-notes <pt label>
