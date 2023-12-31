require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const mongoose = require('mongoose');
const Message = require('./components/models/Message');
const Room = require('./components/models/Room');
const updateUnreadCount = require('./components/functions/updateUnreadCount');
const resetUnreadMessages = require('./components/functions/resetUnreadMessages');

const app = express();
const server = http.createServer(app);

const corsOptions = {
    origin: process.env.CLIENT_URL,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE'
};

app.use(cors(corsOptions));
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_DB_URI = process.env.MONGO_DB_URI;
const CLIENT_URL = process.env.CLIENT_URL;

// Connecting to MongoDB database via Mongoose
// ===================================================================================
mongoose.connect(MONGO_DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Successful connection to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB', err));

const io = new Server(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ["GET", "POST"]
    }
});

const connections = {};
let unreadMessages = [];

// Function to retrieve userId array from connections object
const getUserIds = (obj) => {
    return Object.values(obj).map((connection) => connection.userId);
};

// Socket.io handler
// ===================================================================================
io.on('connection', async (socket) => {
    const socketId = socket.id;
    console.log(`User connected with socket ID: ${socketId}`);
    socket.on('setUserId', (userId) => {
        // console.log(`User connected with socket ID: ${socketId}`);
        connections[socket.id] = { socket, userId };

        // Extract all available ids into an array with active users
        const allUserIds = getUserIds(connections);

        // Send the userId array to the client when connecting a new socket
        socket.emit('set_online_user_ids', allUserIds);

        // Send the userId array to all connected users when connecting a new socket
        socket.broadcast.emit('set_online_user_ids', allUserIds);

        // Notify the connected user about new messages
        if (unreadMessages.length > 0) {
            const filteredNotifications = unreadMessages.filter(notification => notification.recipientId === userId);
            socket.emit('set_all_private_message_notifications', filteredNotifications);
        }
    });

    // When a client connects, receive all messages and send them to him
    try {
        const messages = await Message.find({roomId: null})
        socket.emit('get_public_all_messages', messages);
    } catch (err) {
        console.log('Возникла ошибка при обращении к БД: ', err)
    }

    // Handling socket events here
    // ============================================================================
    socket.on('save_public_message', (data) => {
        const message = new Message({
            userId: data.userId,
            login: data.login,
            text: data.text,
            recipient: data.recipient,
            timestamp: Date.now()
        });

        message.save()
            .then((savedMessage) => {
                io.emit('get_public_message', savedMessage);
            })
            .catch((err) => {
                console.error('Ошибка при сохранении сообщения:', err);
            });
    });

    socket.on('join_to_private_room_with_recepient', async ({ currentId, recipientId }) => {
        try {
            // Search for an existing room for these users
            const room = await Room.findOne({
                members: { $all: [currentId, recipientId] },
            });

            if (room) {
                socket.join(room._id);
                socket.emit('get_private_room_data', room);
                await Message.find({ roomId: room._id })
                    .then(messages => {
                        io.to(room._id)
                            .emit('get_all_private_room_messages', messages);
                    })
                    .catch(err => {
                        console.error('Failed to fetch messages:', err);
                    });
            } else {
                // Create a new room
                const newRoom = new Room({
                    members: [currentId, recipientId],
                });
                await newRoom.save()
                    .then((savedRoom) => {
                        const roomId = savedRoom._id;
                        socket.join(roomId);
                        socket.emit('get_private_room_data', savedRoom);
                    })
                    .catch((err) => {
                        console.error('Ошибка при сохранении комнаты:', err);
                    });
            }
        } catch (error) {
            console.error('Error creating room:', error);
        }
    });

    socket.on('set_new_private_message', async (data) => {
        const message = new Message({
            roomId: data.roomId,
            userId: data.userId,
            login: data.login,
            text: data.text,
            recipient: data.recipient,
            timestamp: Date.now()
        });

        message.save()
            .then((savedMessage) => {
                socket.join(data.roomId);
                io.to(data.roomId).
                    emit('get_new_private_message', savedMessage);
            })
            .catch((err) => {
                console.error('Ошибка при сохранении сообщения:', err);
            });

        // Recipient notification
        // ======================================================================== //
        const room = await Room.findOne({_id: data.roomId});
        const recipientId = room.members.find(userId => userId !== data.userId);
        const notification = updateUnreadCount(unreadMessages, data.userId, data.roomId, recipientId);
        // Here we look for the recipient socket by recipientId
        const recipientSocket = Object.values(connections).find(connection => connection.userId === recipientId);
        if (recipientSocket) {
        const recipientSocketId = recipientSocket.socket.id;
        io.to(recipientSocketId).emit('set_new_private_message_notification', notification);
        }
    });

    socket.on('get_favorite_users_ids', async (userId) => {
        console.log('get_favorite_users_ids')
        console.log('currentId: ', userId)
        const rooms = await Room.find({members: userId})
        const favoriteUserIds = rooms.map((room) => {
            return room.members.find((member) => member !== userId);
        });
        socket.emit('set_favorite_users_ids', favoriteUserIds)
    });

    // Resetting notifications
    // ============================================================================ //
    socket.on('reset_private_message_notification', async (ids) => {  
        unreadMessages = resetUnreadMessages(unreadMessages, ids.currentId, ids.recipientId);
        if (unreadMessages.length > 0) {
            const filteredNotifications = unreadMessages.filter(notification => notification.recipientId === ids.currentId);
            socket.emit('set_all_private_message_notifications', filteredNotifications);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected with socket ID: ${socketId}`);
        if (connections[socket.id]) {
            delete connections[socket.id];

            // Extract all available ids into an array with active users
            const allUserIds = getUserIds(connections);

            // Send the userId array to the client when connecting a new socket
            socket.emit('set_online_user_ids', allUserIds);

            // Send an updated userId array to all connected users when the socket is disconnected
            socket.broadcast.emit('set_online_user_ids', allUserIds);
        }
    });
});

server.listen(PORT, () => {
    console.log(`The server is running on the port ${PORT} using HTTPS`);
});