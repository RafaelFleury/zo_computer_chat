# High priority
[X] - model isnt receiving the context of the load chat after opening a loaded chat.
[X] - deleting a chat should update the sidebar imediatelly. it isnt.
[X] - the correct parsing of tool calls messages on the loading of the history isnt being done correctly. make sure it shows the same thing as when they were shown on streaming.
[x] - have a context tracker for the model and rate limit tracker. look at z.ai docs for this.
[X] - create initial persona file for the assistant
[X] - create memory files for the assistant.
[X] - allow assistant to update its own memory when needed.

[ ] - have a global save file for the logs. only delete history if user wants it manually


# Low priority
[ ] - resolve a bug of chat being kept expanded after sending a message
[ ] - The stop buttom only works on the frontend. the model doesnt actually stop. theres some backend stuff related but not working.
[ ] - Always do a forced '\n' when the model talks between tool calls.
[ ] - ensure the maximum token amount displayed is accurate (it probably is. just need a check)

i want to create a new tab for the site that is called "Proactive". This tab features a chat like all the others but with an exclusive ID. Every X minutes the backend will trigger an api call to the assistant and the assistant will be able to do tasks by itself autonomosly. a custom and default system prompt must be added to the already existing initial system prompt and memories to tell the assistant about its capabilities in autonomous mode. The assistant can choose to do something or "go back to sleep" till the next backend trigger. the proactive mode (on/off. off by default) and trigger interval must be configurable on the settings tab. the new proactive tab must follow the current theme and style of the site. as well as the new sections on the settings channel.
since the proactive chat will be like all the others, the user can also choose to chat with it there. also, there must be a buttom on this tab called "Manual Trigger" to force the backend to trigger the api call (the timer to trigger doenst reset and will keep going normally).
Also since its a normal chat i expect it to be connected to the logs tab and the face tab.