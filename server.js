// server.js - Final Version
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 40 }));

app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random()*1E9) + path.extname(file.originalname))
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp3|wav|ogg/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Invalid file type'));
  }
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ msg: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, url, type: req.file.mimetype.startsWith('image') ? 'image' : 'audio' });
});

const io = new Server(server, { cors: { origin: "*" } });

const activeRooms = {};
const deletedRoomIds = new Set();

function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', ({ nickname, isGroup, expiresInMinutes }) => {
    let roomId;
    do { roomId = generateRoomId(); } while (activeRooms[roomId] || deletedRoomIds.has(roomId));

    activeRooms[roomId] = { 
      users: [], 
      messages: [], 
      isGroup: isGroup,
      typingUsers: new Set()
    };

    if (expiresInMinutes) {
      setTimeout(() => {
        if (activeRooms[roomId]) {
          io.to(roomId).emit('room-closed', { reason: `Room expired after ${expiresInMinutes} minutes.` });
          delete activeRooms[roomId];
          deletedRoomIds.add(roomId);
        }
      }, expiresInMinutes * 60 * 1000);
    }

    handleJoin(socket, roomId, nickname, isGroup);
  });

  socket.on('join-room', ({ roomId, nickname }) => {
    roomId = roomId.toUpperCase();
    if (deletedRoomIds.has(roomId) || !activeRooms[roomId]) {
      return socket.emit('room-error', { msg: 'Room does not exist or was closed' });
    }
    handleJoin(socket, roomId, nickname, activeRooms[roomId].isGroup);
  });

  function handleJoin(socket, roomId, nickname, isGroup) {
    const ip = socket.handshake.address || 'Unknown';
    const room = activeRooms[roomId];

    if (!room.isGroup && room.users.length >= 2) {
      return socket.emit('room-error', { msg: 'Private room is full' });
    }

    room.users.push({ socketId: socket.id, nickname, ip });
    socket.roomId = roomId;
    socket.join(roomId);

    socket.emit('room-joined', {
      roomId, nickname, ip, users: room.users, messages: room.messages, isGroup
    });

    socket.to(roomId).emit('user-joined', { nickname, users: room.users });
  }

  socket.on('typing', (isTyping) => {
    const roomId = socket.roomId;
    if (!roomId || !activeRooms[roomId]) return;
    const room = activeRooms[roomId];
    if (isTyping) room.typingUsers.add(socket.id);
    else room.typingUsers.delete(socket.id);

    socket.to(roomId).emit('typing-update', {
      typingUsers: Array.from(room.typingUsers).map(id => {
        const user = room.users.find(u => u.socketId === id);
        return user ? user.nickname : '';
      }).filter(Boolean)
    });
  });

  socket.on('send-message', ({ text, fileUrl, fileType }) => {
    const roomId = socket.roomId;
    if (!roomId || !activeRooms[roomId]) return;

    const room = activeRooms[roomId];
    const sender = room.users.find(u => u.socketId === socket.id);
    if (!sender) return;

    const message = {
      id: Date.now(),
      sender: sender.nickname,
      ip: sender.ip,
      text: text ? text.trim() : null,
      fileUrl,
      fileType,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      delivered: true,
      seen: false
    };

    room.messages.push(message);
    io.to(roomId).emit('receive-message', message);
  });

  socket.on('message-seen', (messageId) => {
    const roomId = socket.roomId;
    if (!roomId || !activeRooms[roomId]) return;
    const msg = activeRooms[roomId].messages.find(m => m.id === messageId);
    if (msg) msg.seen = true;
    io.to(roomId).emit('message-status-update', { messageId, seen: true });
  });

  socket.on('exit-room', () => {
    const roomId = socket.roomId;
    if (!roomId || !activeRooms[roomId]) return;

    const room = activeRooms[roomId];
    room.users = room.users.filter(u => u.socketId !== socket.id);

    if (room.users.length === 0 || !room.isGroup) {
      io.to(roomId).emit('room-closed', { reason: 'Room has been closed permanently.' });
      delete activeRooms[roomId];
      deletedRoomIds.add(roomId);
    } else {
      io.to(roomId).emit('user-left', { users: room.users });
    }
  });

  socket.on('disconnect', () => {
    // Do nothing - room stays alive until Exit button is pressed
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`IP Chat Name is running on http://localhost:${PORT}`);
});
