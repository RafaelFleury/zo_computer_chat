# High priority
[X] - model isnt receiving the context of the load chat after opening a loaded chat.
[X] - deleting a chat should update the sidebar imediatelly. it isnt.
[X] - the correct parsing of tool calls messages on the loading of the history isnt being done correctly. make sure it shows the same thing as when they were shown on streaming.
[x] - have a context tracker for the model and rate limit tracker. look at z.ai docs for this.
[X] - create initial persona file for the assistant

[ ] - have a global save file for the logs. only delete history if user wants it manually

[ ] - create memory files for the assistant.
[ ] - allow assistant to update its own memory when needed.

[ ] - theres a problem when loading json from the database. look into it seeing the terminal api call logs


# Low priority
[ ] - The stop buttom only works on the frontend. the model doesnt actually stop
[ ] - Always do a forced '\n' when the model talks between tool calls.
[ ] - ensure the maximum token amount displayed is accurate