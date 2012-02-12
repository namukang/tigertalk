(function () {
  "use strict";

  var express = require('express'),
  sio = require('socket.io'),
  fb = require('./facebook'),
  cas = require('./cas');

  var app = express.createServer();
  var port = process.env.PORT || 3000;

  var BACKLOG_SIZE = 100;

  // Maps tickets to user data one-to-one
  // An entry is only deleted when a user explicitly logs out
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
  // Maps room to last used time
  var roomToTime = {};
  // Maps rooms to number of users
  var roomToNumUsers = {};

  // Maps ids to anon users
  var idToAnonUser = {};
  // Maps anon IDs to real IDs
  var anonIDToRealID = {};

  // Configuration
  app.configure(function () {
    app.use(express.bodyParser());
    app.use(express.cookieParser());
  });

  app.configure('development', function () {
    app.set('address', 'http://localhost:' + port);
    app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
  });

  app.configure('production', function () {
    app.set('address', 'http://www.tigertalk.me');
    app.use(express.errorHandler());
  });

  app.listen(port);
  console.log("Server at %s listening on port %d", app.settings.address, port);

  var io = sio.listen(app);
  io.configure('development', function () {
    io.set("transports", ["xhr-polling"]);
    io.set("polling duration", 10);
  });

  io.configure('production', function () {
    // Heroku requires long polling
    io.set("transports", ["xhr-polling"]);
    io.set("polling duration", 10);

    io.enable('browser client minification');  // send minified client
    io.enable('browser client etag');          // apply etag caching logic based on version number
    io.enable('browser client gzip');          // gzip the file
    io.set('log level', 1);                    // reduce logging
  });

  // Routing
  app.get('/', function (req, res) {
    var room = "main";
    fb.handler(req, res, app.settings.address, ticketToUser, idToTicket, room, idToAnonUser, anonIDToRealID);
    // CAS
    // cas.authenticate(req, res, app.settings.address, ticketToUser, idToTicket);
  });

  app.get(/main$/i, function (req, res) {
    if (Object.keys(req.query).length === 0) {
      res.redirect('/');
    } else {
      var room = "main";
      fb.handler(req, res, app.settings.address, ticketToUser, idToTicket, room, idToAnonUser, anonIDToRealID);
    }
  });

  // FIXME: Move to express.static
  app.get('/js/client.js', function (req, res) {
    res.sendfile(__dirname + '/js/client.js');
  });

  app.get('/style.css', function (req, res) {
    res.sendfile(__dirname + '/style.css');
  });

  app.get('/js/jquery-1.6.4.min.js', function (req, res) {
    res.sendfile(__dirname + '/js/jquery-1.6.4.min.js');
  });

  app.get('/js/jquery.jplayer.min.js', function (req, res) {
    res.sendfile(__dirname + '/js/jquery.jplayer.min.js');
  });

  app.get('/audio/chat-ding.mp3', function (req, res) {
    res.sendfile(__dirname + '/audio/chat-ding.mp3');
  });

  app.get('/favicon.ico', function (req, res) {
    res.sendfile(__dirname + '/favicon.ico');
  });

  app.get('/part', function (req, res) {
    var ticket = req.query.ticket;
    if (ticketToUser.hasOwnProperty(ticket)) {
      var id = ticketToUser[ticket].id;
      // Make sure user has connection before disconnecting them
      if (idToSockets.hasOwnProperty(id)) {
        var sockets = idToSockets[id];
        var socket_id = req.query.socket_id;
        var callback = function (err, id) {
          if (id === socket_id) {
            disconnectSocket(socket);
          }
        };
        for (var i = 0; i < sockets.length; i++) {
          var socket = sockets[i];
          socket.get('socket_id', callback);
        }
      }
    }
    res.end();
  });

  app.get('/:room', function (req, res) {
    var room = (req.params.room).toString();
    var room_lowercase = room.toLowerCase();
    if (room !== room_lowercase) {
      res.redirect('/' + room_lowercase);
      return;
    }
    if (room.length > 50) {
      res.send("Room names must be under 50 characters.");
      return;
    }
    if (/[^\w_\-]/.test(room)) {
      res.send("Room names may only contains letters, numbers, underscores, and dashes.");
      return;
    }
    fb.handler(req, res, app.settings.address, ticketToUser, idToTicket, room, idToAnonUser, anonIDToRealID);
  });

  function getRandomNick() {
    // Generate random nick
    var randNum = Math.floor(Math.random() * 9999);
    var randNick = "Tiger #" + randNum;
    var nick = {
      name: randNick,
      first_name: randNum
    };
    return nick;
  }
  exports.getRandomNick = getRandomNick;

  function getRandomID() {
    var randID = Math.floor(Math.random() * 99999999999);
    while (anonIDToRealID.hasOwnProperty(randID)) {
      randID = Math.floor(Math.random() * 99999999999);
    }
    return randID;
  }
  exports.getRandomID = getRandomID;

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

  // Check if text only contains whitespace
  function isBlank(text) {
    var blank = /^\s*$/;
    return (text.match(blank) !== null);
  }

  // Check if text is valid
  function isValid(text) {
    return (text &&
            (typeof(text) === 'string' || typeof(text) === 'number') &&
            !isBlank(text.toString()));
  }

  // Get the backlog for a room or create one if it does not already
  // exist
  function getBackLog(room) {
    var backLog;
    if (roomToLog.hasOwnProperty(room)) {
      backLog = roomToLog[room];
    } else {
      backLog = {
        log: [],
        mapping: {} // id to user mapping for client's use
      };
      roomToLog[room] = backLog;
    }
    return backLog;
  }

  // Add to the backlog for a room
  // NOTE: This is a bit complex b/c we're trying to send the least
  // amount of data over the network as possible
  function addToBackLog(type, msg, room) {
    if (room === 'anon') {
      return;
    }
    var backLog = getBackLog(room);
    // Add id to user mapping if user joined
    if (type === 'join') {
      backLog.mapping[msg.user.id] = msg.user;
      msg.user_id = msg.user.id;
      // Eliminate information already stored in mapping
      delete msg.user;
    }
    msg.type = type;
    backLog.log.push(msg);
    while (backLog.log.length > BACKLOG_SIZE) {
      // Eliminate user mapping if no more records of user in log
      var removed = backLog.log.shift();
      if (removed.type === 'part') {
        var inLog = false;
        for (var i = 0; i < backLog.log.length; i++) {
          var currMsg = backLog.log[i];
          if (currMsg.user_id === removed.user_id) {
            inLog = true;
            break;
          }
        }
        if (!inLog) {
          delete backLog.mapping[removed.user_id];
        }
      }
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
    delete roomToTime[room];
  }

  // If no one has used a room for 5 minutes, delete it
  setInterval(function () {
    var now = new Date();
    for (var room in roomToTime) {
      if (roomToTime.hasOwnProperty(room)) {
        // Special rooms that should not be deleted
        if (room === 'main' ||
            room === 'anon') {
          continue;
        }
        var timestamp = roomToTime[room];
        // Room must have no connections and not been used for 5 minutes
        var limit = 5 * 60 * 1000;
        if (roomToNumUsers[room] === 0 &&
            now - timestamp > limit) {
          deleteRoom(room);
        }
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
    var callback = function (err, room) {
      if (room === targetRoom) {
        inRoom = true;
      }
    };
    for (var i = 0; i < sockets.length; i++) {
      sockets[i].get('room', callback);
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
  function disconnectSocket(socket) {
    socket.get('ticket', function (err, ticket) {
      // Make sure ticket is valid
      if (!ticketToUser.hasOwnProperty(ticket)) {
        socket.emit('reconnect');
        return;
      }
      var user = ticketToUser[ticket];
      var real_id = user.id;
      // Make sure user has sockets to disconnect
      if (!idToSockets.hasOwnProperty(real_id)) {
        socket.emit('reconnect');
        return;
      }
      socket.get('room', function (err, room) {
        if (room === 'anon') {
          user = idToAnonUser[real_id];
        }
        // Make sure user is in room before disconnecting
        if (!isUserInList(user.id, room)) {
          return;
        }
        // Remove socket
        var sockets = idToSockets[real_id];
        removeFromList(socket, sockets);
        // FIXME: socket.leave(room) causes an error if user is
        // disconnected by /part when other sockets in room... why?
        socket.leave(room);
        // Disassociate socket from ticket so if socket is not really
        // disconnected, it will reconnect
        socket.set('ticket', null);
        // Update room timestamp
        roomToTime[room] = new Date();
        if (!hasConnectionsInRoom(real_id, room)) {
          // Check if users have no more connections to TigerTalk
          if (sockets.length === 0) {
            delete idToSockets[real_id];
          }
          removeUserFromList(user.id, room);
          var msg = {
            time: (new Date()).getTime(),
            user_id: user.id
          };
          io.sockets.in(room).emit('part', msg);
          if (room === 'anon') {
            msg.user = user;
          }
          addToBackLog('part', msg, room);
        }
      });
    });
  }

  // Messaging
  io.sockets.on('connection', function (socket) {
    socket.on('identify', function (ticket, room, socket_id) {
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
      var real_id = user.id;
      var userList = getUsers(room);
      socket.join(room);
      var backLog = getBackLog(room);
      // Use anon user if in anon room
      if (room === 'anon') {
        user = idToAnonUser[real_id];
      }
      socket.emit('populate', {
        user_list: userList,
        user: user,
        backlog: backLog
      });
      addSocketToId(socket, real_id);
      // Only alert other users of connect if this is user's initial
      // connection into the room
      if (!isUserInList(user.id, room)) {
        // Add user to room
        addUserToList(user, room);
        var msg = {
          time: (new Date()).getTime(),
          user: user
        };
        io.sockets.in(room).emit('join', msg);
        addToBackLog('join', msg, room);
      }
    });

    // Notify others that user has disconnected
    socket.on('disconnect', function () {
      disconnectSocket(socket);
    });

    // Forward received messages to all the clients
    socket.on('client_send', function (text) {
      if (isValid(text)) {
        text = text.toString();
        socket.get('ticket', function (err, ticket) {
          // Make sure ticket is still valid
          if (ticketToUser.hasOwnProperty(ticket)) {
            socket.get('room', function (err, room) {
              var user = ticketToUser[ticket];
              if (room === 'anon') {
                user = idToAnonUser[user.id];
              }
              var msg = {
                time: (new Date()).getTime(),
                user_id: user.id,
                msg: text
              };
              io.sockets.in(room).emit('msg', msg);
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
    socket.on('logout', function () {
      socket.get('ticket', function (err, ticket) {
        // Make sure ticket is valid
        if (!ticketToUser.hasOwnProperty(ticket)) {
          return;
        }
        var id = ticketToUser[ticket].id;
        // Make sure user still has sockets
        if (!idToSockets.hasOwnProperty(id)) {
          return;
        }
        var sockets = idToSockets[id];
        // Moving from back to front since disconnectSocket removes socket
        // from sockets array
        for (var i = sockets.length - 1; i >= 0; i--) {
          var socket = sockets[i];
          socket.emit('logout', {
            time: (new Date()).getTime()
          });
          disconnectSocket(socket);
        }
        var anon_id = idToAnonUser[id].id;
        delete anonIDToRealID[anon_id];
        delete idToAnonUser[id];

        delete ticketToUser[ticket];
        delete idToTicket[id];
      });
    });

    // Send the user the list of rooms
    socket.on('room_list', function () {
      socket.emit('room_list', roomToNumUsers);
    });

    // Change nick for anon room
    socket.on('nick', function (nick) {
      // Make sure nick is what we expect
      if (!nick || !nick.name || !nick.first_name ||
          typeof(nick.name) !== 'string' ||
          typeof(nick.first_name) !== 'string') {
        return;
      }
      // Nick must be less than 25 characters
      if (nick.name.length > 25) {
        return;
      }
      // Nicks may only contain letters, numbers, spaces, underscores,
      // and dashes
      if (/[^\w\s_\-]/.test(nick.name)) {
        return;
      }
      socket.get('room', function (err, room) {
        // Cannot change nick outside of anon room
        if (room !== 'anon') {
          return;
        }
        socket.get('ticket', function (err, ticket) {
          if (!ticketToUser.hasOwnProperty(ticket)) {
            socket.emit('reconnect');
            return;
          }
          var user = ticketToUser[ticket];
          // NOTE: You can always offload the sanitization to the
          // client if need be
          var new_nick = {
            name: toStaticHTML(trim(nick.name)).replace(/\s+/g, ' '),
            first_name: toStaticHTML(trim(nick.first_name))
          };
          var anonUser = idToAnonUser[user.id];
          if (anonUser.nick.name !== new_nick.name) {
            anonUser.nick = new_nick;
            var data = {
              user_id: anonUser.id,
              time: (new Date()).getTime(),
              new_nick: new_nick
            };
            io.sockets.in(room).emit('nick', data);
          }
        });
      });
    });

    // NOTE: DO NOT USE. USE ONLY WHEN ABSOLUTELY NEEDED.
    socket.on('whois', function (id) {
      socket.get('ticket', function (err, ticket) {
        if (!ticketToUser.hasOwnProperty(ticket)) {
          socket.emit('reconnect');
          return;
        }
        var user = ticketToUser[ticket];
        if (user.id === '1355672641') {
          socket.emit('whois', anonIDToRealID[id]);
        }
      });
    });
  });

  // Used to sanitize user nick changes
  function toStaticHTML(input) {
    return input.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Trim out whitespace
  function trim(input) {
    return input.replace(/^\s+|\s+$/g, '');
  }
})();
