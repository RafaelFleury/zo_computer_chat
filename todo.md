# High priority
[X] - model isnt receiving the context of the load chat after opening a loaded chat.
[X] - deleting a chat should update the sidebar imediatelly. it isnt.
[X] - the correct parsing of tool calls messages on the loading of the history isnt being done correctly. make sure it shows the same thing as when they were shown on streaming.
[x] - have a context tracker for the model and rate limit tracker. look at z.ai docs for this.
[X] - create initial persona file for the assistant
[X] - create memory files for the assistant.
[X] - allow assistant to update its own memory when needed.

[ ] - have a global save file for the logs. only delete history if user wants it manually
[ ] - Improve logs in the chat

# Low priority
[ ] - I cant delete 2 memories before hitting "save". Probably cand do other ones either, like edit or add.
[ ] - sync every site instance with each other
[ ] - resolve a bug of chat being kept expanded after sending a message
[ ] - The stop buttom only works on the frontend. the model doesnt actually stop. theres some backend stuff related but not working.
[ ] - Always do a forced '\n' when the model talks between tool calls.
[ ] - ensure the maximum token amount displayed is accurate (it probably is. just need a check)

# Proactive
[X] - Review the sub header in the proactive tab to be more consistent with the site theme
[ ] - Fix enabled button position on the settings
[ ] - Sync it with the face
[ ] - add the loading with 3 dots like in normal chat interface.
[ ] - See if proactive mode is off by default
[ ] - When doing manual trigger the face states are incorrect


==================================================================================================================

I want the tool calls display to be different and more informative. also as shown in the futureInterface image i want them to be shown in order as they are called, where the assistant sends a message, makes a tool call and sends another message, as an example.
this needs to happen in the chat mode and in proactive mode. the current expandable button only shows the names of the tool calls and is always at the end of the whole assistant message

the next one must have the label as the tool call name and when expanding must have a minimal style (compliant to the theme the interface already has) showing the Call and the Result in json like we have with the logs tab on the frontend.

they have to be saved on the backend in the order they are made so on a chat reload they are correctly shown the same way as when the stream was happening

when the tool call is being made it must show a loading state, with no opition to expand. after that must show a complete state, with the option to expand (or failed state if the tool call fails). Spinning wheel, green checkmark and red X (NOT emojis).

for the expandable button style, use something similar to the button of tool call we already have. 


==================================================================================================================

i want to create a new tab for the site that is called "Proactive". This tab features a chat like all the others but with an exclusive ID. Every X minutes the backend will trigger an api call to the assistant and the assistant will be able to do tasks by itself autonomosly. a custom and default system prompt must be added to the already existing initial system prompt and memories to tell the assistant about its capabilities in autonomous mode. The assistant can choose to do something or "go back to sleep" till the next backend trigger. the proactive mode (on/off. off by default) and trigger interval must be configurable on the settings tab. the new proactive tab must follow the current theme and style of the site. as well as the new sections on the settings channel.
since the proactive chat will be like all the others, the user can also choose to chat with it there. also, there must be a buttom on this tab called "Manual Trigger" to force the backend to trigger the api call (the timer to trigger doenst reset and will keep going normally).
Also since its a normal chat i expect it to be connected to the logs tab and the face tab.