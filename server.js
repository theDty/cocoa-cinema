const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public', { index: 'lobby.html' }));

let broadcaster = '';

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    if (broadcaster) {
        socket.emit('broadcaster-ready', broadcaster);
    }

    socket.on('broadcaster-ready', () => {
        broadcaster = socket.id;
        socket.broadcast.emit('broadcaster-ready', broadcaster);
    });

    socket.on('watcher-request', (broadcasterId) => {
        if (broadcasterId) {
            io.to(broadcasterId).emit('watcher-request', socket.id);
        }
    });

    // WebRTC Signaling
    socket.on('offer', (data, targetId) => {
        if (targetId) {
            io.to(targetId).emit('offer', socket.id, data);
        } else {
            socket.broadcast.emit('offer', socket.id, data);
        }
    });

    socket.on('answer', (data, targetId) => {
        if (targetId) {
            io.to(targetId).emit('answer', socket.id, data);
        } else {
            socket.broadcast.emit('answer', socket.id, data);
        }
    });

    socket.on('ice-candidate', (data, targetId) => {
        if (targetId) {
            io.to(targetId).emit('ice-candidate', socket.id, data);
        }
    });

    // Chat functionality
    socket.on('chat-message', (data) => {
        io.emit('chat-message', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.id === broadcaster) {
            broadcaster = '';
        }
        socket.broadcast.emit('peer-disconnected', { peerId: socket.id });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
