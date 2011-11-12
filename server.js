var express = require('express')
, sio = require('socket.io')
, fb = require('./facebook')
, cas = require('./cas');

var app = express.createServer();
var port = process.env.PORT || 3000;

var BACKLOG_SIZE = 50;

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

// Maps tickets to user data one-to-one
// These mappings are never deleted, only replaced
var ticketToUser = {};
// Maps nicks to tickets one-to-one
// Used to only keep one ticket for each user
var nickToTicket = {}; // FIXME: change to user ids
// Maps nicks to their sockets one-to-many
var nickToSockets = {}; // FIXME: change to user ids
// Maps rooms to a list of unique users
var roomToUsers = {};
// Maps rooms to backlog
var roomToLog = {};
// Maps room to sockets one-to-many
// NOTE: A single user may have multiple sockets
var roomToSockets = {};
// Map room to last used time
var roomToTime = {};

// Routing
app.get('/', function(req, res) {
  var room = "main";
  if (app.settings.fb_auth) {
    // Facebook
    fb.handler(req, res, app.settings.address, ticketToUser, nickToTicket, room);
  } else {
    // Random
    randomAuth(req, res, room);
  }
  // CAS
  // cas.authenticate(req, res, app.settings.address, ticketToUser, nickToTicket);
});

app.get(/main$/i, function (req, res) {
  if (Object.keys(req.query).length === 0) {
    res.redirect('/');
  } else {
    var room = "main";
    if (app.settings.fb_auth) {
      // Facebook
      fb.handler(req, res, app.settings.address, ticketToUser, nickToTicket, room);
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
    var nick = ticketToUser[ticket].nick;
    // Make sure user has connection before disconnecting them
    if (nickToSockets.hasOwnProperty(nick)) {
      var sockets = nickToSockets[nick];
      var socket_id = req.query.socket_id;
      for (var i = 0; i < sockets.length; i++) {
        var socket = sockets[i];
        socket.get('socket_id', function(err, id) {
          if (id === socket_id) {
            disconnectSocket(nick, socket);
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
    fb.handler(req, res, app.settings.address, ticketToUser, nickToTicket, room);
  } else {
    randomAuth(req, res, room);
  }
});

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
    var randNick = "Tiger #" + Math.floor(Math.random() * 9999);
    while (nickToSockets.hasOwnProperty(randNick)) {
      randNick = "Tiger #" + Math.floor(Math.random() * 9999);
    }
    res.cookie("ticket", randTicket);
    // Remove previous tickets for this user if any
    if (nickToTicket.hasOwnProperty(randNick)) {
      var oldTicket = nickToTicket[randNick];
      delete ticketToUser[oldTicket];
    }
    nickToTicket[randNick] = randTicket;
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

// Remove user from the room list
function removeUserFromList(nick, room) {
  var userList = getUsers(room);
  for (var i = 0; i < userList.length; i++) {
    var user = userList[i];
    if (user.nick === nick) {
      userList.splice(i, 1);
    }
  }
}

// Delete all data for a room
function deleteRoom(room) {
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
        room === 'anon' ||
        room === 'public') continue;
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
function isUserInList(nick, room) {
  var userList = roomToUsers[room];
  for (var i = 0; i < userList.length; i++) {
    if (nick === userList[i].nick) {
      return true;
    }
  }
  return false;
}

// Check if user has any connections in room
function hasConnectionsInRoom(nick, targetRoom) {
  var sockets = nickToSockets[nick];
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

// Add socket to nick
function addSocketToNick(socket, nick) {
  if (nickToSockets.hasOwnProperty(nick)) {
    nickToSockets[nick].push(socket);
  } else {
    nickToSockets[nick] = [socket];
  }
}

// Disconnect the socket
function disconnectSocket(nick, socket) {
  // Make sure user has sockets to disconnect
  if (!nickToSockets.hasOwnProperty(nick)) return;
  socket.get('room', function(err, room) {
    // Make sure user is in room before disconnecting
    if (!isUserInList(nick, room)) return;
    // Remove socket
    var sockets = nickToSockets[nick];
    removeFromList(socket, sockets);
    removeSocketFromRoom(socket, room);
    // Update room timestamp
    roomToTime[room] = new Date();
    if (!hasConnectionsInRoom(nick, room)) {
      if (sockets.length === 0) {
        delete nickToSockets[nick];
      }
      console.log("LOG: " + nick + " left " + room);
      removeUserFromList(nick, room);
      var msg = {
        time: (new Date()).getTime(),
        nick: nick
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
    var nick = user.nick;
    console.log("LOG: " + nick + " joined " + room);
    var userList = getUsers(room);
    addSocketToRoom(socket, room);
    var backLog = getBackLog(room);
    socket.emit('populate', {
      user_list: userList,
      nick: nick,
      backlog: backLog
    });
    addSocketToNick(socket, nick);
    // Only alert other users of connect if this is user's initial
    // connection into the room
    if (!isUserInList(nick, room)) {
      // Add to user list after populating client
      userList.push(user);
      var msg = {
        time: (new Date()).getTime(),
        user: user
      };
      emitToSockets('join', msg, room);
      addToBackLog('join', msg, room);
    }
  });

  // Forward received messages to all the clients
  socket.on('client_send', function(text) {
    if (isValid(text)) {
      text = text.toString();
      socket.get('ticket', function(err, ticket) {
        // Make sure ticket is still valid
        if (ticketToUser.hasOwnProperty(ticket)) {
          socket.get('room', function(err, room) {
            var nick = ticketToUser[ticket].nick;
            var msg = {
              time: (new Date()).getTime(),
              nick: nick,
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

  // Notify others that user has disconnected
  socket.on('disconnect', function() {
    socket.get('ticket', function(err, ticket) {
      // Make sure ticket is still valid
      if (ticketToUser.hasOwnProperty(ticket)) {
        var nick = ticketToUser[ticket].nick;
        disconnectSocket(nick, socket);
      }
    });
  });

  // Log out the user completely
  socket.on('logout', function() {
    socket.get('ticket', function(err, ticket) {
      if (!ticketToUser.hasOwnProperty(ticket)) return;
      var nick = ticketToUser[ticket].nick;
      if (!nickToSockets.hasOwnProperty(nick)) return;
      var sockets = nickToSockets[nick];
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
        disconnectSocket(nick, socket);
      }
      delete nickToTicket[nick];
    });
  });
});
