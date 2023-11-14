function resetUnreadMessages(array, currentId, recipientId) {
    // Filter the array, leaving only those objects that do not match the passed identifiers
    const filteredNotifications = array.map(note => {
        if (note.userId === recipientId && note.recipientId === currentId) {
            note.countMessages = 0
        }
        return note;
    });
    return filteredNotifications;
}

module.exports = resetUnreadMessages;