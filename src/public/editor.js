import { EventEmitter } from './event-emitter.js'

const init = (monaco, MonacoCollabExt) => {

    
}

export const createEditor = (monaco, MonacoCollabExt, element, emitter) => {
    monaco.editor.create(element, {
        value: [ '' ].join('\n'),
        language: 'javascript',
        theme: 'vs-dark'
    });

    
}

