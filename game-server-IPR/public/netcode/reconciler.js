class Reconciler {
    constructor(predictor) {
        this.predictor = predictor;
    }

    reconcile(serverState, lastProcessedInputSequence) {
        // Remove processed inputs
        this.predictor.pendingInputs = this.predictor.pendingInputs.filter(
            input => input.sequence > lastProcessedInputSequence
        );

        // Re-apply remaining inputs
        let reconciledState = { ...serverState };

        this.predictor.pendingInputs.forEach(({ input, deltaTime }) => {
            const moveAmount = PLAYER_SPEED * deltaTime;
            if (input.left) reconciledState.x -= moveAmount;
            if (input.right) reconciledState.x += moveAmount;
            if (input.up) reconciledState.y -= moveAmount;
            if (input.down) reconciledState.y += moveAmount;

            // Simple collision with canvas boundaries
            reconciledState.x = Math.max(0, Math.min(800 - 50, reconciledState.x));
            reconciledState.y = Math.max(0, Math.min(600 - 50, reconciledState.y));
        });

        return reconciledState;
    }
}
