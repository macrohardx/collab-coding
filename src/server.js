const express = require('express')
const app = express()
const server = require('http').createServer(app)
const path = require('path')
const io = require('socket.io')(server, {
    path: '/macro-code/socket-connection',
    transports: ['websocket']
})
const cookie = require('cookie')
const jwt = require('jsonwebtoken')
const config = require('./config')
const uuid = require('uuid').v4
const { get } = require('lodash/fp')
const NodeCache = require('node-cache')

app.use('/macro-code', express.static(path.join(__dirname, 'public')))

// Adds endpoints to load front-end dependencies
app.use('/macro-code/vs', express.static(path.join(__dirname, '../node_modules/monaco-editor/min/vs')))
app.use('/macro-code/script/monaco-collab-ext', express.static(path.join(__dirname, '../node_modules/@convergencelabs/monaco-collab-ext')))

server.listen(4001, () => {
    console.log('listening to 4001')
})

const appCache = new NodeCache()
appCache.set('logged-users', {})
appCache.set('rooms', {})

const colors = ['blue', 'green', 'red', 'orange', 'purple', 'yellow', 'aqua', 'magenta']
let colorIndex = 0

const getUser = (room, username) => {
    return get(`[${room}].users[${username}]`, appCache.get('rooms'))
}

io.on('connection', async (socket) => {

    const cookies = cookie.parse(socket.handshake.headers.cookie)
    const userData = await decodeJwt(cookies['x-access-token'])

    socket.on('error', (error) => { console.log(error) });

    let room = null
    let addedUser = false
    socket.on('add user', (data, cb) => {
        // ignore event if user is already registered
        if (addedUser) { return }

        // Generate new room id if no number is informed
        room = get('room', data)
        if (!room) {
            room = uuid()
        }

        // Create room inside cache if it doesn't exists
        let appRooms = appCache.get('rooms') || {}
        if (!appRooms[room]) {
            appRooms[room] = {
                id: room,
                content: '',
                users: {}
            }
        }
        
        let loggedUsers = appRooms[room].users || {}
        if (!loggedUsers[userData.username]) {
            let color = colors[(colorIndex++ % colors.length)]            
            loggedUsers[userData.username] = { 
                ...userData, 
                connectedAt: new Date(),
                color: color
            }
        }
        userData.color = loggedUsers[userData.username].color

        appCache.set('rooms', appRooms)

        socket.join(room)        

        addedUser = true
        socket.in(room).emit('user-joined', { username: userData.username })
        return cb && cb({ room, content: appRooms[room].content, users: appRooms[room].users })
    })

    socket.on('update-position', (data) => {
        if (!data) { return }

        socket.in(room).emit('position-updated', {
            username: userData.username,
            color: userData.color,
            ...data
        })
    })

    socket.on('update-content-insert', (data) => {
        let appRooms = appCache.get('rooms') || {}
        if (!appRooms[room]) { return }

        appRooms[room].content = data.content
        appCache.set('rooms', appRooms)

        socket.in(room).emit('content-inserted', {
            username: userData.username,
            color: userData.color,
            ...data 
        })
    })

    socket.on('update-content-replace', (data) => {
        let appRooms = appCache.get('rooms') || {}
        if (!appRooms[room]) { return }

        appRooms[room].content = data.content
        appCache.set('rooms', appRooms)

        socket.in(room).emit('content-replaced', {
            username: userData.username,
            color: userData.color,
            ...data 
        })
    })

    socket.on('update-content-delete', (data) => {
        let appRooms = appCache.get('rooms') || {}
        if (!appRooms[room]) { return }

        appRooms[room].content = data.content
        appCache.set('rooms', appRooms)

        socket.in(room).emit('content-deleted', {
            username: userData.username,
            color: userData.color,
            ...data 
        })
    })


    socket.on('disconnect', () => {
        let loggedUsers = appCache.get('logged-users') || {}
        delete loggedUsers[userData.username]
        appCache.set('logged-users', loggedUsers)
        //clean up cursors
        socket.in(room).emit('user-logged-out', {
            username: userData.username
        })
    })
})

const decodeJwt = (token) => {
    return new Promise((resolve, reject) => {
        jwt.verify(token, config.secret, (err, decoded) => {
            return err ? reject(err) : resolve(decoded)
        })
    })
}