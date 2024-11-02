import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { initWebSocket } from './network/index.js';

const PORT = 3000;
const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

initWebSocket(wss, PORT)

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
