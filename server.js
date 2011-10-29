var app = require('express').createServer()
, io = require('socket.io').listen(app)

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

io.sockets.on('connection', function (socket) {
  socket.emit('news', { hello: 'world' });
  socket.on('my other event', function (data) {
    console.log(data);
  });
});
