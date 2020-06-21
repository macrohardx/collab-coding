require.config({ paths: { 'vs': 'vs' } });

const urlParams = new URLSearchParams(window.location.search);

require(['vs/editor/editor.main', 'MonacoCollabExt'], function (monaco, MonacoCollabExt) {

    const editor = monaco.editor.create(document.getElementById('container'), {
        value: [ '' ].join('\n'),
        language: 'javascript',
        theme: 'vs-dark'
    });
    window.editor = editor

    const remoteSelectionManager = new MonacoCollabExt.RemoteSelectionManager({ editor: editor });
    const remoteCursorManager = new MonacoCollabExt.RemoteCursorManager({
        editor: editor,
        tooltips: true,
        tooltipDuration: 2
    });

    editor.onDidChangeCursorPosition(e => {
        const offset = editor.getModel().getOffsetAt(e.position);
        socket.emit('update-position', {
            room: 'foo',
            offset,
            position: e.position,
            type: 'cursor'
        })
    });

    editor.onDidChangeCursorSelection(e => {
        const startOffset = editor.getModel().getOffsetAt(e.selection.getStartPosition());
        const endOffset = editor.getModel().getOffsetAt(e.selection.getEndPosition());
        socket.emit('update-position', {
            room: 'foo',
            startOffset,
            endOffset,
            startPosition: e.selection.getStartPosition(),
            endPosition: e.selection.getEndPosition(),
            type: 'selection'
        })
    });

    editor.onKeyDown((evt) => {
        if (evt.ctrlKey) { return true }
        if (!Object.keys(userCursors).length) { return true }
        if (/^\s*$/.test(editor.getValue())) { return true }
        let myPosition = editor.getPosition()
        let myOffset = editor.getModel().getOffsetAt(myPosition)
        let isInsideUserSelection = _.some(userCursors, (c) => {
            if (myPosition.lineNumber === c.position.lineNumber) { return true }
            if (myOffset > c.startOffset && myOffset < c.endOffset) { return true }
            return false
        })
        if (isInsideUserSelection) {
            evt.preventDefault()
            return false;
        }
    })

    const contentManager = new MonacoCollabExt.EditorContentManager({
        editor: editor,
        onInsert(index, text) {
            if (initializing) { return }
            socket.emit('update-content-insert', { index, text, content: editor.getValue() })
        },
        onReplace(index, length, text) {
            socket.emit('update-content-replace', { index, length, text, content: editor.getValue() })
        },
        onDelete(index, length) {
            socket.emit('update-content-delete', { index, length, content: editor.getValue() })
        }
    });

    window.socket = io('http://localhost:5000/', {
        path: '/macro-code/socket-connection',
        transports: ['websocket']
    })

    let initializing = true
    socket.emit('add user', { room: urlParams.has('id') ? urlParams.get('id') : null }, (data) => {
        if (!urlParams.has('id')) {
            let newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?id=' + data.room;
            window.history.pushState({path:newurl},'',newurl);
        }        
        editor.setValue(data.content)
        setTimeout(() => initializing = false, 1000)

        let div = document.getElementById('logged-users')
        div.innerHTML = _.join(_.map(data.users, (user) => 
            `<span class="username" style="color: ${user.color}">${user.username}</span>`),
            '')
    })

    socket.on('user-joined', (user) => {
        console.log(`User ${user.username} joined the room`)
    })

    let userCursors = {}
    window.userCursors = userCursors

    socket.on('position-updated', (data) => {
        if (!userCursors[data.username]) {
            userCursors[data.username] = {
                cursor: remoteCursorManager.addCursor(data.username, data.color, data.username),
                selection: remoteSelectionManager.addSelection(data.username, data.color, data.username)
            }
        }

        if (data.type === 'cursor') {
            userCursors[data.username].cursor.setOffset(data.offset)
            userCursors[data.username].position = data.position
            userCursors[data.username].offset = data.offset
        }
        if (data.type === 'selection') {
            remoteSelectionManager.setSelectionOffsets(data.username, data.startOffset, data.endOffset);
            userCursors[data.username].startOffset = data.startOffset
            userCursors[data.username].endOffset = data.endOffset
            userCursors[data.username].startPosition = data.startPosition
            userCursors[data.username].endPosition = data.endPosition
        }
    })
    window.cm = contentManager
    socket.on('content-deleted', (data) => {
        contentManager.delete(data.index, data.length);
    })

    socket.on('content-replaced', (data) => {
        contentManager.replace(data.index, data.length, data.text);
    })

    socket.on('content-inserted', (data) => {
        contentManager.insert(data.index, data.text);
    })

    socket.on('user-logged-out', (data) => {
        if (_.get(userCursors, `[${data.username}].cursor`)) {
            userCursors[data.username].cursor.dispose()
            userCursors[data.username].selection.dispose()        
            delete userCursors[data.username]
        }
    })


    window.addEventListener('resize', _.throttle(() => {
        editor.layout()
    }, 1000));

    //monaco.setModelLanguage(editor.getModel(), 'csharp')
});