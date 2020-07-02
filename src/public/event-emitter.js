export class EventEmitter {

    constructor() {
        this.callbacks = {}
    }

    emit(event, data) {
        guardForValidEvent(event)
        let cbs = this.callbacks[event]
        if (Array.isArray(cbs)) {
            cbs.forEach((cb) =>
                cb(data))
        }
    }

    on(event, eventHandler) {
        guardForValidEvent(event)
        let cbs = this.callbacks[event]
        if (!Array.isArray(cbs)) {
            cbs = this.callbacks[event] = []
        }
        cbs.push(eventHandler)
    }

    off(event, eventHandler) {
        guardForValidEvent(event)

        if (eventHandler) {
            delete this.callbacks[event]
            return;
        }

        let cbs = this.callbacks[event]
        if (Array.isArray(cbs)) {
            let handlerIndex = cbs.findIndex((cb) => cb === eventHandler)
            cbs.splice(handlerIndex, 1)
        }
    }
}

function guardForValidEvent(event) {
    if (typeof event !== 'string') {
        throw new Error('event must be a string')
    }
}