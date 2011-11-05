var express = require('express')
, sio = require('socket.io')
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

// Maps tickets to nicks
var ticketToNick = {};
// Maps nicks to their number of connections
var nickToNumConn = {};
// List of unique users
var nickList = [];
// Back log
var backLog = [];

// Routing
app.get('/', function(req, res) {
  // cas.authenticate(req, res, app.settings.address, ticketToNick);

  // Use the following when not using CAS
  randomAuth(res);
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

app.get('/part', function(req, res) {
  var ticket = req.query.ticket;
  var nick = ticketToNick[ticket];
  disconnectUser(ticket);
  res.end();
});

function randomAuth(res) {
  var randTicket = Math.floor(Math.random() * 999999999);
  while (ticketToNick.hasOwnProperty(randTicket)) {
    randTicket = Math.floor(Math.random() * 999999999);
  }
  var randNick = "Tiger #" + Math.floor(Math.random() * 9999);
  while (nickToNumConn.hasOwnProperty(randNick)) {
    randNick = "Tiger #" + Math.floor(Math.random() * 9999);
  }
  res.cookie("ticket", randTicket);
  ticketToNick[randTicket] = randNick;
  res.sendfile(__dirname + '/index.html');
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

function disconnectUser(ticket) {
  // Don't do anything if user has already been disconnected
  if (!ticketToNick.hasOwnProperty(ticket)) {
    return;
  }
  var nick = ticketToNick[ticket];
  // Remove binding from this ticket to its nick
  delete ticketToNick[ticket];
  // Reduce number of connections by 1
  nickToNumConn[nick] -= 1;
  // Only alert other users of disconnect if user has no more
  // connections
  if (nickToNumConn[nick] === 0) {
    // Remove binding from nick to number of connections
    delete nickToNumConn[nick];
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
  socket.on('identify', function(ticket) {
    // Occurs when user loses their connection but remains on the
    // application so they try to reconnect with an invalid ticket
    if (!ticketToNick.hasOwnProperty(ticket)) {
      socket.emit('reconnect');
      return;
    }
    socket.set('ticket', ticket);
    var nick = ticketToNick[ticket];
    socket.emit('populate', {
      nick_list: nickList,
      nick: nick,
      backlog: backLog
    });
    // Only alert other users of connect if this is user's initial
    // connection
    if (!nickToNumConn.hasOwnProperty(nick)) {
      // Number of connections for this user is 1
      nickToNumConn[nick] = 1;
      // Add to user list after populating client
      nickList.push(nick);
      var msg = {
        time: (new Date()).getTime(),
        nick: nick
      };
      io.sockets.emit('join', msg);
      addToBackLog('join', msg);
    } else {
      nickToNumConn[nick] += 1;
    }
  });

  // Forward received messages to all the clients
  socket.on('client_send', function(text) {
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
      disconnectUser(ticket);
    });
  });
});
