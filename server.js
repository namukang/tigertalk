var express = require('express')
, sio = require('socket.io')
, cas = require('./cas');

var app = express.createServer();
var port = process.env.PORT || 3000;

// Configuration
app.configure(function() {
  app.use(express.bodyParser());
  app.use(express.cookieParser());
});

app.configure('development', function() {
  app.set('address', 'http://localhost:' + port);
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function() {
  app.set('address', 'http://www.tigertalk.me');
  app.use(express.errorHandler());
});

app.listen(port);
console.log("Server at %s listening on port %d", app.settings.address, port);

var io = sio.listen(app);
useLongPolling();

// Use long-polling since Heroku does not support WebSockets
function useLongPolling() {
  io.configure(function () {
    io.set("transports", ["xhr-polling"]);
    io.set("polling duration", 10);
  });
}

// Maps tickets to nicks one-to-one
var ticketToNick = {};
// Maps nicks to tickets one-to-one
var nickToTicket = {};
// Maps nicks to their sockets one-to-many
var nickToSockets = {};
// List of unique users
var nickList = [];

// Routing
app.get('/', function(req, res) {
  // cas.authenticate(req, res, app.settings.address, ticketToNick, nickToTicket);

  // Use the following when not using CAS
  randomAuth(req, res);
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

// app.post('/part', function(req, res) {
//   var ticket = req.query.ticket;
//   var nick = ticketToNick[ticket];
//   // Make sure user has connection before disconnecting them
//   if (nickToSockets.hasOwnProperty(nick)) {
//     disconnectSession(nick, socket);
//   }
//   res.end();
// });

function randomAuth(req, res) {
  var cookieTicket = req.cookies.ticket;
  if (cookieTicket && ticketToNick.hasOwnProperty(cookieTicket)) {
    res.sendfile(__dirname + '/index.html');
  } else {
    var randTicket = Math.floor(Math.random() * 999999999);
    while (ticketToNick.hasOwnProperty(randTicket)) {
      randTicket = Math.floor(Math.random() * 999999999);
    }
    var randNick = "Tiger #" + Math.floor(Math.random() * 9999);
    while (nickToSockets.hasOwnProperty(randNick)) {
      randNick = "Tiger #" + Math.floor(Math.random() * 9999);
    }
    res.cookie("ticket", randTicket);
    // Remove previous tickets for this user if any
    if (nickToTicket.hasOwnProperty(randNick)) {
      var oldTicket = nickToTicket[randNick];
      delete ticketToNick[oldTicket];
    }
    nickToTicket[randNick] = randTicket;
    ticketToNick[randTicket] = randNick;
    res.sendfile(__dirname + '/index.html');
  }
}

// Check if text only contains whitespace
function isBlank(text) {
  var blank = /^\s*$/;
  return (text.match(blank) !== null);
}

// Removes the first occurrence of 'element' in 'list'
function removeFromList(element, list) {
  for (var i = 0; i < list.length; i++) {
    if (list[i] === element) {
      list.splice(i, 1);
      break;
    }
  }
}

function disconnectSession(nick, socket) {
  if (!nickToSockets.hasOwnProperty(nick)) return;
  var sockets = nickToSockets[nick];
  removeFromList(socket, sockets);
  if (sockets.length === 0) {
    delete nickToSockets[nick];
    removeFromList(nick, nickList);
    io.sockets.emit('part', {
      time: (new Date()).getTime(),
      nick: nick
    });
  }
}

// Messaging
io.sockets.on('connection', function(socket) {
  socket.on('identify', function(ticket) {
    socket.set('ticket', ticket);
    var nick = ticketToNick[ticket];
    if (nick === undefined) {
      socket.emit('reconnect');
      return;
    }
    socket.emit('populate', {
      nick_list: nickList,
      nick: nick
    });
    // Only alert other users of connect if this is user's initial
    // connection
    if (!nickToSockets.hasOwnProperty(nick)) {
      nickToSockets[nick] = [socket];
      // Add to user list after populating client
      nickList.push(nick);
      io.sockets.emit('join', {
        time: (new Date()).getTime(),
        nick: nick
      });
    } else {
      nickToSockets[nick].push(socket);
    }
  });

  // Forward received messages to all the clients
  socket.on('client_send', function(msg) {
    if (!isBlank(msg)) {
      socket.get('ticket', function(err, ticket) {
        var nick = ticketToNick[ticket];
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
    socket.get('ticket', function(err, ticket) {
      if (ticketToNick.hasOwnProperty(ticket)) {
        var nick = ticketToNick[ticket];
        disconnectSession(nick, socket);
      }
    });
  });

  // Log out the user completely
  socket.on('logout', function() {
    socket.get('ticket', function(err, ticket) {
      if (!ticketToNick.hasOwnProperty(ticket)) return;
      var nick = ticketToNick[ticket];
      if (!nickToSockets.hasOwnProperty(nick)) return;
      var sockets = nickToSockets[nick];
      // Moving from back to front since disconnectSession removes socket
      // from sockets array
      for (var i = sockets.length - 1; i >= 0; i--) {
        var socket = sockets[i];
        socket.emit('logout', {
          time: (new Date()).getTime()
        });
        // Delete all tickets associated with this user
        socket.get('ticket', function(err, ticket) {
          if (ticketToNick.hasOwnProperty(ticket)) {
            delete ticketToNick[ticket];
          }
        });
        disconnectSession(nick, socket);
      }
      delete nickToTicket[nick];
    });
  });
});
