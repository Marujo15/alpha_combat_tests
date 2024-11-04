class Interpolator {
    constructor() {
        this.playerBuffers = new Map(); // Separate buffer for each player
        this.interpolationDelay = 100; // 100ms interpolation delay
    }

    addState(playerId, state, timestamp) {
        if (!this.playerBuffers.has(playerId)) {
            this.playerBuffers.set(playerId, []);
        }
        const buffer = this.playerBuffers.get(playerId);
        buffer.push({ state, timestamp });

        // Keep only last second of states
        const bufferDuration = 1000;
        const cutoff = timestamp - bufferDuration;
        this.playerBuffers.set(
            playerId,
            buffer.filter(item => item.timestamp > cutoff)
        );
    }

    interpolate(playerId, renderTimestamp) {
        const buffer = this.playerBuffers.get(playerId);
        if (!buffer || buffer.length < 2) return null;

        // Target time is current time minus interpolation delay
        const targetTime = renderTimestamp - this.interpolationDelay;

        // Find the two states to interpolate between
        let beforeState = null;
        let afterState = null;

        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i].timestamp > targetTime) {
                afterState = buffer[i];
                beforeState = buffer[i - 1];
                break;
            }
        }

        if (!beforeState || !afterState) {
            return buffer[buffer.length - 1]?.state;
        }

        // Calculate interpolation factor
        const totalTime = afterState.timestamp - beforeState.timestamp;
        const currentTime = targetTime - beforeState.timestamp;
        const t = Math.max(0, Math.min(1, currentTime / totalTime));

        // Linear interpolation between states
        return {
            x: beforeState.state.x + (afterState.state.x - beforeState.state.x) * t,
            y: beforeState.state.y + (afterState.state.y - beforeState.state.y) * t,
            color: beforeState.state.color
        };
    }
}