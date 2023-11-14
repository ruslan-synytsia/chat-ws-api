// Function to update the number of unread messages
function updateUnreadCount(array, userId, roomId, recipientId) {
  const userRoomIndex = array.findIndex(entry => entry.userId === userId && entry.roomId === roomId);
  if (userRoomIndex !== -1) {
    array[userRoomIndex].countMessages += 1;
    return array[userRoomIndex];
  } else {
    array.push({ 
      userId,
      roomId,
      recipientId,
      countMessages: 1 
    });
    return array[array.length - 1];
  }
};

module.exports = updateUnreadCount;