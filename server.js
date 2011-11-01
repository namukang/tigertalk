var express = require('express')
, sio = require('socket.io')
, cas = require('./cas');

var app = express.createServer();

// Configuration
app.configure(function() {
  app.use(express.cookieParser());
});

app.configure('development', function() {
  var port = process.env.PORT || 3000;
  app.set('port', port);
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function() {
  app.set('port', 80);
  app.use(express.errorHandler());
});

app.listen(app.settings.port);
console.log("Server listening on port %d", app.settings.port);

var io = sio.listen(app);

// Use long-polling since Heroku does not support WebSockets
io.configure(function () {
  io.set("transports", ["xhr-polling"]);
  io.set("polling duration", 10);
});

// Maps users to the number of connections they have
var userDict = {};
// List of unique users
var userList = [];

// Routing
app.get('/', function(req, res) {
  // cas.authenticate(req, res);
  res.sendfile(__dirname + '/index.html');
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

// Check if text only contains whitespace
function isBlank(text) {
  var blank = /^\s*$/;
  return (text.match(blank) !== null);
}

function removeFromUserList(nick) {
  for (var i = 0; i < userList.length; i++) {
    if (userList[i] === nick) {
      userList.splice(i, 1);
      break;
    }
  }
}

// Messaging
io.sockets.on('connection', function(socket) {
  // Set nick upon connection
  socket.on('set_nick', function(nick) {
    socket.get('nick', function(err, existing_nick) {
      // Only set nick if one has not been assigned
      if (existing_nick === null) {
        socket.set('nick', nick);
        // Populate the user list for the client
        socket.emit('populate', {
          user_list: userList
        });
        // Only alert other users of connect if this is user's initial
        // connection
        if (!userDict.hasOwnProperty(nick) || userDict[nick] === 0) {
          // Number of connections for this user is 1
          userDict[nick] = 1;
          // Add to user list after populating client
          userList.push(nick);
          io.sockets.emit('join', {
            time: (new Date()).getTime(),
            nick: nick
          });
        } else {
          userDict[nick] += 1;
        }
      }
    });
  });
  // Forward received messages to all the clients
  socket.on('client_send', function(msg) {
    if (!isBlank(msg)) {
      socket.get('nick', function(err, nick) {
        io.sockets.emit('server_send', {
          time: (new Date()).getTime(),
          nick: nick,
          msg: msg
        });
      });
    }
  });
  // Notify others that user has disconnected
  socket.on('disconnect', function() {
    socket.get('nick', function(err, nick) {
      // Reduce number of connections by 1
      userDict[nick] -= 1;
      // Only alert other users of disconnect if user has no more
      // connections
      if (userDict[nick] === 0) {
        removeFromUserList(nick);
        io.sockets.emit('part', {
          time: (new Date()).getTime(),
          nick: nick
        });
      }
    });
  });
});
