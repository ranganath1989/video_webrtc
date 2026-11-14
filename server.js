// Signaling server: only relays SDP/ICE between peers. Media flows peer-to-peer.
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const twilio = require('twilio');
 
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/config.js', async (req, res) => {
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (accountSid && authToken) {
      const client = twilio(accountSid, authToken);
      const token = await client.tokens.create();
      if (Array.isArray(token.iceServers) && token.iceServers.length) {
        iceServers = token.iceServers;
      }
    } else {
      const turnUrl = process.env.TURN_URL;
      if (turnUrl) {
        const turnServer = { urls: turnUrl };
        if (process.env.TURN_USERNAME) turnServer.username = process.env.TURN_USERNAME;
        if (process.env.TURN_PASSWORD) turnServer.credential = process.env.TURN_PASSWORD;
        iceServers.push(turnServer);
      }
    }
  } catch (err) {
    // Fall back to Google STUN if Twilio config is unavailable.
  }

  res.type('application/javascript').send(`window.__ICE_CONFIG__ = ${JSON.stringify({ iceServers })};`);
});

app.use(express.static(path.join(__dirname, 'public')));
 
io.on('connection', (socket) => {
  socket.on('join', ({ room, name }) => {
    socket.data.room = room;
    socket.data.name = name;
    const existing = [...(io.sockets.adapter.rooms.get(room) || [])].map((id) => ({
      id,
      name: io.sockets.sockets.get(id).data.name,
    }));
    socket.join(room);
    socket.emit('peers', existing); // newcomer will send offers to these peers
  });
 
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, name: socket.data.name, data });
  });
 
  socket.on('disconnect', () => {
    if (socket.data.room) socket.to(socket.data.room).emit('peer-left', socket.id);
  });
});
 
server.listen(process.env.PORT || 3000, () => console.log('Running on http://localhost:3000'));
 