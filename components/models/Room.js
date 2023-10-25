const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  members: [
    {
      type: String,
      required: true
    },
  ]
});

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;