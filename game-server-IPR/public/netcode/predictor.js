class Predictor {
    constructor() {
        this.pendingInputs = [];
    }

    predictMovement(player, input, sequence, deltaTime) {
        const predictedState = {
            x: player.x,
            y: player.y,
            color: player.color
        };

        // Apply input to get predicted state with delta time
        const moveAmount = PLAYER_SPEED * deltaTime;
        if (input.left) predictedState.x -= moveAmount;
        if (input.right) predictedState.x += moveAmount;
        if (input.up) predictedState.y -= moveAmount;
        if (input.down) predictedState.y += moveAmount;

        // Simple collision with canvas boundaries
        predictedState.x = Math.max(0, Math.min(800 - 50, predictedState.x));
        predictedState.y = Math.max(0, Math.min(600 - 50, predictedState.y));

        this.pendingInputs.push({
            input,
            sequence,
            predictedState: { ...predictedState },
            deltaTime
        });

        return predictedState;
    }
}