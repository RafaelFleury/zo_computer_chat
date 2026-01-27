[ ] - model isnt receiving the context of the load chat after opening a loaded chat.
[ ] - The stop buttom only works on the frontend. the model doesnt actually stop
[ ] - deleting a chat should update the sidebar imediatelly. it isnt.
[ ] - the correct parsing of tool calls messages on the loading of the history isnt being done correctly. make sure it shows the same thing as when they were shown on streaming.
[ ] - Always do a forced '\n' when the model talks between tool calls.
[ ] - have a global save file for the logs. only delete history if user wants it manually
[ ] - have a context tracker for the model and rate limit tracker. look at z.ai docs for this.