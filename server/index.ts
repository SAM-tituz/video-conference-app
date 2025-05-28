import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initMediasoup } from './mediasoup-server';


const app = express();
const port = process.env.PORT || 8000;



const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Import mediasoup logic
initMediasoup(io)
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});