[X] - model isnt receiving the context of the load chat after opening a loaded chat.
[X] - deleting a chat should update the sidebar imediatelly. it isnt.
[X] - the correct parsing of tool calls messages on the loading of the history isnt being done correctly. make sure it shows the same thing as when they were shown on streaming.
[x] - have a context tracker for the model and rate limit tracker. look at z.ai docs for this.
[X] - create initial persona file for the assistant
[X] - create memory files for the assistant.
[X] - allow assistant to update its own memory when needed.
[X] - Improve logs in the chat
[X] - Fix enabled button position on the settings
[X] - Review the sub header in the proactive tab to be more consistent with the site theme
[X] - Sync it with the face
[X] - When doing manual trigger the face states are incorrect
[X] - add the loading with 3 dots like in normal chat interface.

# High priority
[ ] - have a global save file for the logs. only delete history if user wants it manually

# Low priority
[ ] - I cant delete 2 memories before hitting "save". Probably cand do other ones either, like edit or add.
[ ] - sync every site instance with each other
[ ] - resolve a bug of chat being kept expanded after sending a message
[ ] - The stop buttom only works on the frontend. the model doesnt actually stop. theres some backend stuff related but not working.
[ ] - ensure the maximum token amount displayed is accurate (it probably is. just need a check)

# Proactive
[ ] - See if proactive mode is off by default