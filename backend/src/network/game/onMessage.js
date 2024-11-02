// import { enterNewMatch } from "./matches/enterNewMatch";

import { enterNewMatch } from "./matches/enterNewMatch.js";

export function onMessage(ws, message) {
    try {
        console.log(message.toString());
        const data = JSON.parse(message.toString());
        console.log('Dados recebidos do cliente:', data);

        switch (data.type) {
            case 'enterNewMatch':
                enterNewMatch(ws, data)
                const newMatch = { position1: 31.51, position2: 31.51, time: "5:00" }
                ws.send(JSON.stringify({ state: newMatch }));
                break;
            case 'movePlayer':
                console.log(`Jogador ${data.player.name} se movendo para ${data.direction}`);
                ws.send(JSON.stringify({ 
                    type: 'validate',
                    message: 'Movimento validado'
                 }))
                break;
            case 'shoot':
                console.log(`Jogador ${data.player.name} atirou na posição x:${data.x} e y:${data.y} no angulo: ${data.direction}`);
                break;
            case 'connectPlayer': {
                console.log('Player conectado:', data.player);
                break;
            }
            default:
                console.log('Tipo de mensagem não reconhecido:', data);
        }
    } catch (error) {
        console.error('Erro ao parsear mensagem:', error);
    }
}