var express = require('express')
, sio = require('socket.io')
, fb = require('./facebook')
, cas = require('./cas');

var app = express.createServer();
var port = process.env.PORT || 3000;

var BACKLOG_SIZE = 100;

// Maps tickets to user data one-to-one
// These mappings are never deleted, only replaced
var ticketToUser = {};
// Maps ids to tickets one-to-one
// Used to make sure we only keep one ticket for each user
var idToTicket = {};
// Maps ids to their sockets one-to-many
var idToSockets = {};
// Maps rooms to a list of unique users
var roomToUsers = {};
// Maps rooms to backlog
var roomToLog = {};
// Maps room to sockets one-to-many
// NOTE: A single user may have multiple sockets
var roomToSockets = {};
// Maps room to last used time
var roomToTime = {};
// Maps rooms to number of users
var roomToNumUsers = {};

// Configuration
app.configure(function() {
  app.use(express.bodyParser());
  app.use(express.cookieParser());
});

app.configure('development', function() {
  app.set('address', 'http://localhost:' + port);
  // app.set('fb_auth', false);
  app.set('fb_auth', true);
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function() {
  app.set('address', 'http://www.tigertalk.me');
  app.set('fb_auth', true);
  app.use(express.errorHandler());
});

app.listen(port);
console.log("Server at %s listening on port %d", app.settings.address, port);

var io = sio.listen(app);
io.configure('development', function() {
  io.set("transports", ["xhr-polling"]);
  io.set("polling duration", 10);
});

io.configure('production', function() {
  // Heroku requires long polling
  io.set("transports", ["xhr-polling"]);
  io.set("polling duration", 1);

  io.enable('browser client minification');  // send minified client
  io.enable('browser client etag');          // apply etag caching logic based on version number
  io.enable('browser client gzip');          // gzip the file
  io.set('log level', 1);                    // reduce logging
});

// Routing
app.get('/', function(req, res) {
  var room = "main";
  if (app.settings.fb_auth) {
    // Facebook
    fb.handler(req, res, app.settings.address, ticketToUser, idToTicket, room);
  } else {
    // Random
    randomAuth(req, res, room);
  }
  // CAS
  // cas.authenticate(req, res, app.settings.address, ticketToUser, idToTicket);
});

app.get(/main$/i, function (req, res) {
  if (Object.keys(req.query).length === 0) {
    res.redirect('/');
  } else {
    var room = "main";
    if (app.settings.fb_auth) {
      // Facebook
      fb.handler(req, res, app.settings.address, ticketToUser, idToTicket, room);
    } else {
      // Random
      randomAuth(req, res, room);
    }
  }
});

app.get('/client.js', function(req, res) {
  res.sendfile(__dirname + '/client.js');
});

app.get('/style.css', function(req, res) {
  res.sendfile(__dirname + '/style.css');
});

app.get('/jquery-1.6.4.min.js', function(req, res) {
  res.sendfile(__dirname + '/jquery-1.6.4.min.js');
});

app.get('/favicon.ico', function(req, res) {
  res.sendfile(__dirname + '/favicon.ico');
});

app.get('/part', function(req, res) {
  var ticket = req.query.ticket;
  if (ticketToUser.hasOwnProperty(ticket)) {
    var id = ticketToUser[ticket].id;
    // Make sure user has connection before disconnecting them
    if (idToSockets.hasOwnProperty(id)) {
      var sockets = idToSockets[id];
      var socket_id = req.query.socket_id;
      for (var i = 0; i < sockets.length; i++) {
        var socket = sockets[i];
        socket.get('socket_id', function(err, id) {
          if (id === socket_id) {
            disconnectSocket(ticket, socket);
          }
        });
      }
    }
  }
  res.end();
});

app.get('/:room', function(req, res) {
  var room = (req.params.room).toString().toLowerCase();
  if (app.settings.fb_auth) {
    fb.handler(req, res, app.settings.address, ticketToUser, idToTicket, room);
  } else {
    randomAuth(req, res, room);
  }
});

exports.getRandomNick = function getRandomNick() {
  // Generate random nick
  var randNick = "Tiger #" + Math.floor(Math.random() * 9999);
  return randNick;
}

function randomAuth(req, res, room) {
  var cookieTicket = req.cookies.ticket;
  var socket_id = Math.floor(Math.random() * 99999999999);
  res.cookie("socket_id", socket_id);
  if (cookieTicket && ticketToUser.hasOwnProperty(cookieTicket)) {
    res.sendfile(__dirname + '/index.html');
  } else {
    // Generate random ticket
    var randTicket = Math.floor(Math.random() * 999999999);
    while (ticketToUser.hasOwnProperty(randTicket)) {
      randTicket = Math.floor(Math.random() * 999999999);
    }
    // Generate random nick
    var randNick = getRandomNick();
    res.cookie("ticket", randTicket);
    ticketToUser[randTicket] = {
      nick: randNick,
      id: 'dk',
      link: 'http://www.facebook.com/dk'
    };
    res.sendfile(__dirname + '/index.html');
  }
}

// Check if text is valid
function isValid(text) {
  return (text &&
          (typeof(text) === 'string' || typeof(text) === 'number') &&
          !isBlank(text.toString()));
}

// Check if text only contains whitespace
function isBlank(text) {
  var blank = /^\s*$/;
  return (text.match(blank) !== null);
}

function emitToSockets(type, msg, room) {
  var sockets = roomToSockets[room];
  for (var i = 0; i < sockets.length; i++) {
    sockets[i].emit(type, msg);
  }
}

// Get the backlog for a room or create one if it does not already
// exist
function getBackLog(room) {
  var backLog;
  if (roomToLog.hasOwnProperty(room)) {
    backLog = roomToLog[room];
  } else {
    backLog = [];
    roomToLog[room] = backLog;
  }
  return backLog;
}

// Add to the backlog for a room
function addToBackLog(type, msg, room) {
  var backLog = getBackLog(room);
  msg['type'] = type;
  backLog.push(msg);
  while (backLog.length > BACKLOG_SIZE) {
    backLog.shift();
  }
}

// Remove an element from a list
function removeFromList(target, list) {
  for (var i = 0; i < list.length; i++) {
    if (target === list[i]) {
      list.splice(i, 1);
    }
  }
}

// Get the users in a room
function getUsers(room) {
  var userList;
  if (roomToUsers.hasOwnProperty(room)) {
    userList = roomToUsers[room];
  } else {
    // Initialize rooms and user list
    roomToNumUsers[room] = 0;
    userList = [];
    roomToUsers[room] = userList;
  }
  return userList;
}

// Add a socket to the room
function addSocketToRoom(socket, room) {
  if (roomToSockets.hasOwnProperty(room)) {
    roomToSockets[room].push(socket);
  } else {
    roomToSockets[room] = [socket];
  }
}

// Remove socket from the room
function removeSocketFromRoom(socket, room) {
  if (roomToSockets.hasOwnProperty(room)) {
    var sockets = roomToSockets[room];
    removeFromList(socket, sockets);
  }
}

// Add user to room list
function addUserToList(user, room) {
  roomToNumUsers[room]++;
  var userList = getUsers(room);
  userList.push(user);
}

// Remove user from the room list
function removeUserFromList(id, room) {
  roomToNumUsers[room]--;
  var userList = getUsers(room);
  for (var i = 0; i < userList.length; i++) {
    var user = userList[i];
    if (user.id === id) {
      userList.splice(i, 1);
    }
  }
}

// Delete all data for a room
function deleteRoom(room) {
  delete roomToNumUsers[room];
  delete roomToUsers[room];
  delete roomToLog[room];
  delete roomToSockets[room];
  delete roomToTime[room];
}

// If no one has used a room for 5 minutes, delete it
setInterval(function() {
  var now = new Date();
  for (room in roomToTime) {
    // Special rooms that should not be deleted
    if (room === 'main' ||
        room === 'anon') continue;
    var timestamp = roomToTime[room];
    // Room must have no connections and not been used for 5 minutes
    var limit = 5 * 60 * 1000;
    if (roomToSockets[room].length === 0 &&
        now - timestamp > limit) {
      deleteRoom(room);
    }
  }
}, 60 * 1000);

// Check if user is in room list
function isUserInList(id, room) {
  var userList = roomToUsers[room];
  for (var i = 0; i < userList.length; i++) {
    var user = userList[i];
    if (user.id === id) {
      return true;
    }
  }
  return false;
}

// Check if user has any connections in room
function hasConnectionsInRoom(id, targetRoom) {
  var sockets = idToSockets[id];
  var inRoom = false;
  for (var i = 0; i < sockets.length; i++) {
    sockets[i].get('room', function(err, room) {
      if (room === targetRoom) {
        inRoom = true;
      }
    });
  }
  return inRoom;
}

// Add socket to id
function addSocketToId(socket, id) {
  if (idToSockets.hasOwnProperty(id)) {
    idToSockets[id].push(socket);
  } else {
    idToSockets[id] = [socket];
  }
}

// Disconnect the socket
function disconnectSocket(ticket, socket) {
  if (!ticketToUser.hasOwnProperty(ticket)) return;
  var user = ticketToUser[ticket];
  var id = user.id;
  // Make sure user has sockets to disconnect
  if (!idToSockets.hasOwnProperty(id)) return;
  socket.get('room', function(err, room) {
    // Make sure user is in room before disconnecting
    if (!isUserInList(id, room)) return;
    // Remove socket
    var sockets = idToSockets[id];
    removeFromList(socket, sockets);
    removeSocketFromRoom(socket, room);
    // Update room timestamp
    roomToTime[room] = new Date();
    if (!hasConnectionsInRoom(id, room)) {
      // Check if users have no more connections to TigerTalk
      if (sockets.length === 0) {
        delete idToSockets[id];
      }
      removeUserFromList(id, room);
      var msg = {
        time: (new Date()).getTime(),
        user: user
      };
      emitToSockets('part', msg, room);
      addToBackLog('part', msg, room);
    }
  });
}

// Messaging
io.sockets.on('connection', function(socket) {
  socket.on('identify', function(ticket, socket_id, room) {
    // Reconnect user if server restarts
    if (!ticketToUser.hasOwnProperty(ticket)) {
      socket.emit('reconnect');
      return;
    }
    socket.set('ticket', ticket);
    socket.set('socket_id', socket_id);
    if (!room) {
      room = "main";
    }
    socket.set('room', room);
    var user = ticketToUser[ticket];
    var id = user.id;
    var userList = getUsers(room);
    addSocketToRoom(socket, room);
    var backLog = getBackLog(room);
    socket.emit('populate', {
      user_list: userList,
      user: user,
      backlog: backLog
    });
    addSocketToId(socket, id);
    // Only alert other users of connect if this is user's initial
    // connection into the room
    if (!isUserInList(id, room)) {
      // Add user to room
      addUserToList(user, room);
      var msg = {
        time: (new Date()).getTime(),
        user: user
      };
      emitToSockets('join', msg, room);
      addToBackLog('join', msg, room);
    }
  });

  // Notify others that user has disconnected
  socket.on('disconnect', function() {
    socket.get('ticket', function(err, ticket) {
      disconnectSocket(ticket, socket);
    });
  });

  // Forward received messages to all the clients
  socket.on('client_send', function(text) {
    if (isValid(text)) {
      text = text.toString();
      socket.get('ticket', function(err, ticket) {
        // Make sure ticket is still valid
        if (ticketToUser.hasOwnProperty(ticket)) {
          socket.get('room', function(err, room) {
            var user = ticketToUser[ticket];
            var msg = {
              time: (new Date()).getTime(),
              user: user,
              msg: text
            };
            emitToSockets('msg', msg, room);
            addToBackLog('msg', msg, room);
          });
        } else {
          socket.emit('reconnect');
          return;
        }
      });
    }
  });

  // Log out the user completely
  socket.on('logout', function() {
    socket.get('ticket', function(err, ticket) {
      if (!ticketToUser.hasOwnProperty(ticket)) return;
      var id = ticketToUser[ticket].id;
      if (!idToSockets.hasOwnProperty(id)) return;
      var sockets = idToSockets[id];
      // Moving from back to front since disconnectSocket removes socket
      // from sockets array
      for (var i = sockets.length - 1; i >= 0; i--) {
        var socket = sockets[i];
        socket.emit('logout', {
          time: (new Date()).getTime()
        });
        // Delete all tickets associated with this user
        socket.get('ticket', function(err, ticket) {
          if (ticketToUser.hasOwnProperty(ticket)) {
            delete ticketToUser[ticket];
          }
        });
        disconnectSocket(ticket, socket);
      }
      delete idToTicket[id];
    });
  });

  // Send the user the list of rooms
  socket.on('room_list', function() {
    socket.emit('room_list', roomToNumUsers);
  });
});
