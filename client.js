var socket = io.connect('http://localhost');

var MSG_TYPE = "msg";
var JOIN_TYPE = "join";
var PART_TYPE = "part";

// Send nick upon connecting
socket.on('connect', function() {
  // FIXME: set nick from cookie.netid
  var nick = "dskang";
  socket.emit('set_nick', nick);
});

// Receive a new message from the server
socket.on('server_send', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, data.msg, MSG_TYPE);
});

// New user has joined
socket.on('join', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, null, JOIN_TYPE);
});

// User left room
socket.on('part', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, null, PART_TYPE);
});

// Add a message to the log
function addMessage(time, nick, msg, type) {
  var logElement = $("#log");
  var msg_html;
  switch (type) {
  case JOIN_TYPE:
    msg = nick + " joined the room.";
    msg_html = '<table class="message system">'
      + '<tr>'
      + '<td class="time"><' + time + '></td>'
      + '<td class="text">' + msg + '</td>'
      + '</tr>'
      + '</table>';
    break;
    
  case MSG_TYPE:
    msg_html = '<table class="message">'
      + '<tr>'
      + '<td class="time"><' + time + '></td>'
      + '<td class="nick">' + nick + ':</td>'
      + '<td class="text">' + msg + '</td>'
      + '</tr>'
      + '</table>';
    break;

  case PART_TYPE:
    msg = nick + " left the room.";
    msg_html = '<table class="message system">'
      + '<tr>'
      + '<td class="time"><' + time + '></td>'
      + '<td class="text">' + msg + '</td>'
      + '</tr>'
      + '</table>';
    break;
  }
  logElement.append(msg_html);
  scrollDown();
}

// Convert date to military time
function timeString(date) {
  var hour = date.getHours().toString();
  if (hour.length == 1) {
    hour = '0' + hour;
  }
  var min = date.getMinutes().toString();
  if (min.length == 1) {
    min = '0' + min;
  }
  return hour + ":" + min;
}

// Send a new message to the server
function sendMessage(msg) {
  socket.emit('client_send', msg);
}

function scrollDown() {
  // FIXME: scroll only when user is already scrolled to the bottom
  window.scrollBy(0, 100000000000);
  $("#entry").focus();
}

$(function() {
  // Send a message if enter is pressed in entry
  var entry = $("#entry");
  var ENTER = 13; // keycode for enter
  entry.keypress(function(e) {
    if (e.keyCode != ENTER) return;
    var msg = entry.attr("value");
    sendMessage(msg);
    entry.attr("value", ""); // clear entry field
  });
});
