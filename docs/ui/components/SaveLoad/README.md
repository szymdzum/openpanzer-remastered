The save and load window (`#smState`). Today it is four orange buttons, a "last saved" line, an ID field and an empty black box. Nothing changes in what it can do.

- **File:** Save to file (the primary action) and Load from file. Below them is the name of the last file saved in this session (`#disksaveupdate`), in the game's own format: "(Campaign) Ciechanow Turn 4 …json".
- **Cloud:** the ID field (`#cloudid`) with Save and Load beside it. One line explains the rule the code already follows: an ID in the field is overwritten, an empty field makes a new save.
- **Recent cloud saves** (`#cloudid_lastsaves`): the last three from `uiSettings.lastCloudSave` as list rows with name and ID. Picking a row puts its ID in the field, as today. With none, the list says "No cloud saves on this device yet." instead of an empty box.
- The footer says that the game is also kept in this browser after every turn (`state.save` in `endTurn`), which is what Continue uses.

**States:**

- **Load error:** `#diskloaderror` in `critical` with its icon. The text is plainer than today's "Cannot parse save game data".
- **Cloud error:** today the field is emptied and its placeholder reads "Cannot create save !". The design keeps the ID in the field, outlines it in `critical`, and puts the message under it.
- **Saving:** the button reads "Saving…" and both cloud buttons wait. Today the field's value is replaced with "Creating new cloud save ...".

Cloud saves go to GitHub gists and the source has no token, so saving to the cloud fails today (#33). The design is for the behaviour once #33 replaces the gists; the error state above is what players see until then.

The header names the game that a save would write.
