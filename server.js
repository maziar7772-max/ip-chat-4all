// server.js
// =============================================
// IP Chat Name - Backend (Node.js + Express + Socket.IO)
// Beginner-friendly + heavily commented
// =============================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }   // Allow all origins for simplicity
});

// Serve all frontend files from the "public" folder
app.use(express.static('public'));

// ==================== IN-MEMORY STORAGE ====================
// As required: rooms stored only in memory (no database)
const activeRooms = {};        // roomId → room object
const deletedRoomIds = new Set(); // permanently deleted rooms

// Helper: generate 8-character unique Room ID
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

// ==================== CORE JOIN LOGIC ====================
function handleJoin(socket, roomId, nickname) {
    const ip = socket.handshake.address || '127.0.0.1';

    // Create room if it doesn't exist yet
    if (!activeRooms[roomId]) {
        activeRooms[roomId] = { users: [], messages: [] };
    }

    const room = activeRooms[roomId];

    // Only 2 users allowed per room
    if (room.users.length >= 2) {
        socket.emit('room-error', { msg: 'Room is full (maximum 2 users)' });
        return;
    }

    // Add user to room
    const user = { socketId: socket.id, ip, nickname };
    room.users.push(user);

    // Store roomId on socket so we can find it on disconnect
    socket.roomId = roomId;
    socket.join(roomId);

    // Send success + current users + message history to this user
    socket.emit('room-joined', {
        roomId,
        myNickname: nickname,
        myIP: ip,
        users: room.users,
        messages: room.messages
    });

    // Notify the other user that someone joined
    if (room.users.length > 1) {
        socket.to(roomId).emit('user-joined', {
            nickname,
            ip,
            users: room.users
        });
    }
}

// ==================== SOCKET.IO EVENTS ====================
io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // CREATE ROOM
    socket.on('create-room', ({ nickname }) => {
        let roomId;
        do {
            roomId = generateRoomId();
        } while (activeRooms[roomId] || deletedRoomIds.has(roomId));

        // Create the room and auto-join the creator
        activeRooms[roomId] = { users: [], messages: [] };
        handleJoin(socket, roomId, nickname);
    });

    // JOIN EXISTING ROOM
    socket.on('join-room', ({ roomId, nickname }) => {
        roomId = roomId.toUpperCase();

        // Room was permanently deleted
        if (deletedRoomIds.has(roomId)) {
            socket.emit('room-error', { msg: 'Room Closed - This ID can never be used again' });
            return;
        }

        if (!activeRooms[roomId]) {
            socket.emit('room-error', { msg: 'Room does not exist or was already deleted' });
            return;
        }

        handleJoin(socket, roomId, nickname);
    });

    // SEND MESSAGE
    socket.on('send-message', ({ text }) => {
        const roomId = socket.roomId;
        if (!roomId || !activeRooms[roomId]) return;

        const room = activeRooms[roomId];
        const sender = room.users.find(u => u.socketId === socket.id);
        if (!sender) return;

        const message = {
            sender: sender.nickname,
            ip: sender.ip,
            text: text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        room.messages.push(message);

        // Broadcast to everyone in the room (real-time)
        io.to(roomId).emit('receive-message', message);
    });

    // DISCONNECT → PERMANENTLY DELETE ROOM (Requirements 7 & 8)
    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (!roomId || !activeRooms[roomId]) return;

        const room = activeRooms[roomId];

        // Remove the user who left
        room.users = room.users.filter(u => u.socketId !== socket.id);

        // Notify anyone still in the room
        if (room.users.length > 0) {
            io.to(roomId).emit('room-closed', {
                reason: 'The other participant disconnected.<br>This room has been permanently deleted.'
            });
        }

        // Permanently delete the room
        delete activeRooms[roomId];
        deletedRoomIds.add(roomId);

        console.log(`🗑️ Room ${roomId} permanently deleted`);
    });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`\n✅ IP Chat Name is running!`);
    console.log(`   🌐 Running on port: ${PORT}`);
});
