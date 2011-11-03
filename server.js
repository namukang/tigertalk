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

// Maps tickets to nicks
var ticketDict = {};
// Maps nicks to their number of connections
var userDict = {};
// List of unique users
var userList = [];

// Routing
app.get('/', function(req, res) {
  // cas.authenticate(req, res, app.settings.address, ticketDict);

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

app.post('/part', function(req, res) {
  var ticket = req.body.ticket;
  var nick = ticketDict[ticket];
  // Make sure user has connection before disconnecting them
  if (userDict.hasOwnProperty(nick)) {
    disconnectUser(ticket);
  }
  res.end();
});

function randomAuth(res) {
  var randTicket = Math.floor(Math.random() * 999999999);
  while (ticketDict.hasOwnProperty(randTicket)) {
    randTicket = Math.floor(Math.random() * 999999999);
  }
  var randNick = "Tiger #" + Math.floor(Math.random() * 9999);
  while (userDict.hasOwnProperty(randNick)) {
    randNick = "Tiger #" + Math.floor(Math.random() * 9999);
  }
  res.cookie("ticket", randTicket);
  ticketDict[randTicket] = randNick;
  res.sendfile(__dirname + '/index.html');
}

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

function disconnectUser(ticket) {
  // Don't do anything if user has already been disconnected
  if (!ticketDict.hasOwnProperty(ticket)) {
    return;
  }
  var nick = ticketDict[ticket];
  // Remove binding from this ticket to its nick
  delete ticketDict[ticket];
  // Reduce number of connections by 1
  userDict[nick] -= 1;
  // Only alert other users of disconnect if user has no more
  // connections
  if (userDict[nick] === 0) {
    // Remove binding from nick to number of connections
    delete userDict[nick];
    removeFromUserList(nick);
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
    var nick = ticketDict[ticket];
    if (nick === undefined) {
      socket.emit('reconnect');
      return;
    }
    socket.emit('populate', {
      user_list: userList,
      nick: nick
    });
    // Only alert other users of connect if this is user's initial
    // connection
    if (!userDict.hasOwnProperty(nick)) {
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
  });

  // Forward received messages to all the clients
  socket.on('client_send', function(msg) {
    if (!isBlank(msg)) {
      socket.get('ticket', function(err, ticket) {
        var nick = ticketDict[ticket];
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
      disconnectUser(ticket);
    });
  });
});
