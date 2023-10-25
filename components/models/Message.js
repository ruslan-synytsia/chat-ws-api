const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    roomId: { type: String, required: false },
    userId: { type: String, required: true },
    login: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Number, default: 0 },
    recipient: { type: String, default: null }
});

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;