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
  app.set('fb_auth', false);
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
io.configure(function() {
  io.set("transports", ["xhr-polling"]);
  io.set("polling duration", 1);
});

io.configure('production', function() {
  io.enable('browser client minification');  // send minified client
  io.enable('browser client etag');          // apply etag caching logic based on version number
  io.enable('browser client gzip');          // gzip the file
  io.set('log level', 1);                    // reduce logging
});

// Maps tickets to user data one-to-one
var ticketToData = {};
// Maps nicks to tickets one-to-one
var nickToTicket = {};
// Maps nicks to their sockets one-to-many
var nickToSockets = {};
// List of unique users
var userList = [];
// Back log
var backLog = [];

// Routing
app.get('/', function(req, res) {
  res.send("TigerTalk will be open soon. Join the conversation and meet new friends tonight at 11PM!");
  // if (app.settings.fb_auth) {
  //   // Facebook
  //   fb.handler(req, res, app.settings.address, ticketToData, nickToTicket);
  // } else {
  //   // Random
  //   randomAuth(req, res);
  // }
  // CAS
  // cas.authenticate(req, res, app.settings.address, ticketToData, nickToTicket);
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
  if (ticketToData.hasOwnProperty(ticket)) {
    var nick = ticketToData[ticket].nick;
    console.log("LOG: " + nick + " called part");
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

function randomAuth(req, res) {
  var cookieTicket = req.cookies.ticket;
  if (cookieTicket && ticketToData.hasOwnProperty(cookieTicket)) {
    var socket_id = Math.floor(Math.random() * 99999999999);
    res.cookie("socket_id", socket_id);
    res.sendfile(__dirname + '/index.html');
  } else {
    var randTicket = Math.floor(Math.random() * 999999999);
    while (ticketToData.hasOwnProperty(randTicket)) {
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
      delete ticketToData[oldTicket];
    }
    nickToTicket[randNick] = randTicket;
    ticketToData[randTicket] = {
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

// Remove the first occurent of an element based either on a direct
// match or a match with a property of the element
function removeFromList(target, list, property) {
  for (var i = 0; i < list.length; i++) {
    var curElem = list[i];
    var remove = (property && curElem[property] === target) || (curElem === target);
    if (remove) {
      list.splice(i, 1);
      return true;
    }
  }
  return false;
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
  var removed = removeFromList(socket, sockets, null);
  if (removed) {
    console.log("LOG: " + nick + " actually disconnecting");
    console.log("LOG: " + nick + " has " + sockets.length + " sockets left");
    if (sockets.length === 0) {
      delete nickToSockets[nick];
      removeFromList(nick, userList, 'nick');
      var msg = {
        time: (new Date()).getTime(),
        nick: nick
      };
      io.sockets.emit('part', msg);
      addToBackLog('part', msg);
    }
  }
}

// Messaging
io.sockets.on('connection', function(socket) {
  socket.on('identify', function(ticket, socket_id) {
    // Reconnect user if server restarts
    if (!ticketToData.hasOwnProperty(ticket)) {
      socket.emit('reconnect');
      return;
    }
    socket.set('ticket', ticket);
    socket.set('socket_id', socket_id);
    var user = ticketToData[ticket];
    var nick = user.nick;
    console.log("LOG: " + nick + " connected");
    socket.emit('populate', {
      user_list: userList,
      nick: nick,
      backlog: backLog
    });
    // Only alert other users of connect if this is user's initial
    // connection
    if (!nickToSockets.hasOwnProperty(nick)) {
      console.log("LOG: " + nick + " first connection");
      nickToSockets[nick] = [socket];
      // Add to user list after populating client
      userList.push(user);
      var msg = {
        time: (new Date()).getTime(),
        user: user
      };
      io.sockets.emit('join', msg);
      addToBackLog('join', msg);
    } else {
      nickToSockets[nick].push(socket);
    }
  });

  // Forward received messages to all the clients
  socket.on('client_send', function(text) {
    if (text && (typeof(text) === 'string' || typeof(text) === 'number')) {
      text = text.toString();
      if (!isBlank(text)) {
        socket.get('ticket', function(err, ticket) {
          if (ticketToData.hasOwnProperty(ticket)) {
            var nick = ticketToData[ticket].nick;
            var msg = {
              time: (new Date()).getTime(),
              nick: nick,
              msg: text
            };
            io.sockets.emit('msg', msg);
            addToBackLog('msg', msg);
          }
        });
      }
    }
  });

  // Notify others that user has disconnected
  socket.on('disconnect', function() {
    socket.get('ticket', function(err, ticket) {
      if (ticketToData.hasOwnProperty(ticket)) {
        var nick = ticketToData[ticket].nick;
        console.log("LOG: " + nick + " called disconnect");
        disconnectSocket(nick, socket);
      }
    });
  });

  // Log out the user completely
  socket.on('logout', function() {
    socket.get('ticket', function(err, ticket) {
      if (!ticketToData.hasOwnProperty(ticket)) return;
      var nick = ticketToData[ticket].nick;
      console.log("LOG: " + nick + " called logout");
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
          if (ticketToData.hasOwnProperty(ticket)) {
            delete ticketToData[ticket];
          }
        });
        disconnectSocket(nick, socket);
      }
      delete nickToTicket[nick];
    });
  });
});
