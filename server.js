var app = require('express').createServer()
, io = require('socket.io').listen(app);

app.listen(8001);

// Routing
app.get('/', function(req, res) {
  res.sendfile(__dirname + '/index.html');
});

app.get('/client.js', function(req, res) {
  res.sendfile(__dirname + '/client.js');
});

app.get('/style.css', function(req, res) {
  res.sendfile(__dirname + '/style.css');
});

// Messaging
io.sockets.on('connection', function(socket) {
  // Forward a received message to all the clients
  socket.on('client_send', function(msg) {
    io.sockets.emit('server_send', {
      time: (new Date()).getTime(),
      nick: "DK",
      msg: msg
    });
  });
});
