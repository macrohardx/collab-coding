require.config({ paths: { 'vs': 'vs' } });

require(['vs/editor/editor.main', 'MonacoCollabExt'], function (monaco, MonacoCollabExt) {

    const urlParams = new URLSearchParams(window.location.search);

    const socket = io('{{gateway_ip}}', {
        path: '/macro-code/socket-connection',
        transports: ['websocket']
    })

    let myUserName = null
    let initializing = true
    socket.emit('add user', { room: urlParams.has('id') ? urlParams.get('id') : null }, (data) => {
        if (!urlParams.has('id')) {
            let newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?id=' + data.room;
            window.history.pushState({ path: newurl }, '', newurl);
        }
        editor.setValue(data.content)
        setTimeout(() => {
            myUserName = data.username
            const otherUsers = _.filter(data.users, (u) => u.username !== myUserName) || []
            otherUsers.forEach(updateOtherUsersCursor)
            initializing = false
        }, 1000)
    })

    const editor = monaco.editor.create(document.getElementById('container'), {
        value: [''].join('\n'),
        language: 'javascript',
        theme: 'vs-dark'
    });

    const remoteSelectionManager = new MonacoCollabExt.RemoteSelectionManager({ editor: editor });
    const remoteCursorManager = new MonacoCollabExt.RemoteCursorManager({
        editor: editor,
        tooltips: true,
        tooltipDuration: 2
    })

    // When user cursor change position inform other users
    editor.onDidChangeCursorPosition(e =>
        socket.emit('update-position', {
            offset: editor.getModel().getOffsetAt(e.position),
            position: e.position,
            type: 'cursor'
        })
    )

    // When user selection change inform other users
    editor.onDidChangeCursorSelection(e =>
        socket.emit('update-position', {
            startOffset: getEditorStartOffset(editor, e.selection),
            endOffset: getEditorEndOffset(editor, e.selection),
            startPosition: e.selection.getStartPosition(),
            endPosition: e.selection.getEndPosition(),
            type: 'selection'
        })
    )

    const getEditorStartOffset = (editor, selection) =>
        editor.getModel().getOffsetAt(selection.getStartPosition())

    const getEditorEndOffset = (editor, selection) =>
        editor.getModel().getOffsetAt(selection.getEndPosition())

    const blockEditingOnAnotherUserSelection = (evt) => {
        // If CTRL is down user is not writing any code break out of the validation
        if (evt.ctrlKey) { return true }

        // If there aren't any users logged in break out of the validation
        if (!Object.keys(userCursors).length) { return true }

        // If editor doesn't have any code on it let user break out of the validation
        const isEditorBlank = /^\s*$/.test(editor.getValue())
        if (isEditorBlank) { return true }

        // Verifies if local user cursor intercepts another user's selection or cursor's current line
        const myPosition = editor.getPosition()
        const myOffset = editor.getModel().getOffsetAt(myPosition)
        const isInsideUserSelection = _.some(userCursors, (c) => {
            const isInSameLine = false//myPosition.lineNumber === c.position.lineNumber
            const isInsideSelection = myOffset > c.startOffset && myOffset < c.endOffset
            return isInSameLine || isInsideSelection
        })
        if (isInsideUserSelection) {
            evt.preventDefault()
            return false;
        }
    };

    editor.onKeyDown(blockEditingOnAnotherUserSelection)

    const contentManager = new MonacoCollabExt.EditorContentManager({
        editor: editor,
        onInsert(index, text) {
            if (initializing) { return }
            socket.emit('update-content-insert', { index, text, content: editor.getValue() })
        },
        onReplace(index, length, text) {
            if (initializing) { return }
            socket.emit('update-content-replace', { index, length, text, content: editor.getValue() })
        },
        onDelete(index, length) {
            if (initializing) { return }
            socket.emit('update-content-delete', { index, length, content: editor.getValue() })
        }
    });

    socket.on('user-joined', (data) => {
        const otherUsers = _.filter(data.users, (u) => u.username !== myUserName) || []
        otherUsers.forEach(updateOtherUsersCursor)
    })

    let userCursors = {}

    const updateOtherUsersCursor = (data) => {
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
    }

    socket.on('position-updated', updateOtherUsersCursor)

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

    // Resize the code editor when window is resized
    window.addEventListener('resize', _.throttle(() => {
        editor.layout()
    }, 1000));

    //monaco.setModelLanguage(editor.getModel(), 'csharp')
});