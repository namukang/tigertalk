var express = require('express')
, sio = require('socket.io')
, fb = require('./facebook')
, cas = require('./cas')
, sanitize = require('validator').sanitize;

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
// Back log
var backLog = [];

// Routing
app.get('/', function(req, res) {
  // Facebook
  fb.handler(req, res, app.settings.address, ticketToNick, nickToTicket);

  // CAS
  // cas.authenticate(req, res, app.settings.address, ticketToNick, nickToTicket);

  // Random
  // randomAuth(req, res);
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
  var nick = ticketToNick[ticket];
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
  res.end();
});

function randomAuth(req, res) {
  var cookieTicket = req.cookies.ticket;
  if (cookieTicket && ticketToNick.hasOwnProperty(cookieTicket)) {
    var socket_id = Math.floor(Math.random() * 99999999999);
    res.cookie("socket_id", socket_id);
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
    var socket_id = Math.floor(Math.random() * 99999999999);
    res.cookie("socket_id", socket_id);
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

function addToBackLog(type, msg) {
  msg['type'] = type;
  backLog.push(msg);
  while (backLog.length > BACKLOG_SIZE) {
    backLog.shift();
  }
}

function disconnectSocket(nick, socket) {
  if (!nickToSockets.hasOwnProperty(nick)) return;
  var sockets = nickToSockets[nick];
  removeFromList(socket, sockets);
  if (sockets.length === 0) {
    delete nickToSockets[nick];
    removeFromList(nick, nickList);
    var msg = {
      time: (new Date()).getTime(),
      nick: nick
    };
    io.sockets.emit('part', msg);
    addToBackLog('part', msg);
  }
}

// Messaging
io.sockets.on('connection', function(socket) {
  socket.on('identify', function(ticket, socket_id) {
    // Reconnect user if server restarts
    if (!ticketToNick.hasOwnProperty(ticket)) {
      socket.emit('reconnect');
      return;
    }
    socket.set('ticket', ticket);
    socket.set('socket_id', socket_id);
    var nick = ticketToNick[ticket];
    socket.emit('populate', {
      nick_list: nickList,
      nick: nick,
      backlog: backLog
    });
    // Only alert other users of connect if this is user's initial
    // connection
    if (!nickToSockets.hasOwnProperty(nick)) {
      nickToSockets[nick] = [socket];
      // Add to user list after populating client
      nickList.push(nick);
      var msg = {
        time: (new Date()).getTime(),
        nick: nick
      };
      io.sockets.emit('join', msg);
      addToBackLog('join', msg);
    } else {
      nickToSockets[nick].push(socket);
    }
  });

  // Forward received messages to all the clients
  socket.on('client_send', function(text) {
    text = sanitize(text).xss();
    text = sanitize(text).entityEncode();
    if (!isBlank(text)) {
      socket.get('ticket', function(err, ticket) {
        var nick = ticketToNick[ticket];
        var msg = {
          time: (new Date()).getTime(),
          nick: nick,
          msg: text
        };
        io.sockets.emit('msg', msg);
        addToBackLog('msg', msg);
      });
    }
  });

  // Notify others that user has disconnected
  socket.on('disconnect', function() {
    socket.get('ticket', function(err, ticket) {
      if (ticketToNick.hasOwnProperty(ticket)) {
        var nick = ticketToNick[ticket];
        disconnectSocket(nick, socket);
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
      // Moving from back to front since disconnectSocket removes socket
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
        disconnectSocket(nick, socket);
      }
      delete nickToTicket[nick];
    });
  });
});
