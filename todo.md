# High priority
[X] - model isnt receiving the context of the load chat after opening a loaded chat.
[X] - deleting a chat should update the sidebar imediatelly. it isnt.
[X] - the correct parsing of tool calls messages on the loading of the history isnt being done correctly. make sure it shows the same thing as when they were shown on streaming.
[ ] - have a global save file for the logs. only delete history if user wants it manually
[ ] - have a context tracker for the model and rate limit tracker. look at z.ai docs for this.

# Low priority
[ ] - The stop buttom only works on the frontend. the model doesnt actually stop
[ ] - Always do a forced '\n' when the model talks between tool calls.