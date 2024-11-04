import { onConnect } from "./game/onConection.js";
import { onMessage } from "./game/onMessage.js";

export function initWebSocket(wss) {
    wss.on('connection', (ws) => {
        console.log('> Connection established');
        ws.on('open', (ws) => {
            onConnect()
        })

        ws.on('message', (message) => {
            onMessage(ws, message)
        });

        ws.on('close', () => {
            console.log('Cliente desconectado');
        });
    });

    console.log('Servidor WebSocket rodando em ws://localhost:3000');
}

