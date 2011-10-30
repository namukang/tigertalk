var socket = io.connect('http://localhost');

// Send nick upon connecting
socket.on('connect', function() {
  // FIXME: set nick from cookie.netid
  var nick = "dskang";
  socket.emit('set_nick', nick);
});

// Receive a new message from the server
socket.on('server_send', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, data.msg);
  scrollDown();
});

// Add a message to the log
function addMessage(time, nick, msg) {
  var logElement = $("#log");
  var new_msg_html = '<table class="message">'
    + '<tr>'
    + '<td class="time"><' + time + '></td>'
    + '<td class="nick">' + nick + ':</td>'
    + '<td class="text">' + msg + '</td>'
    + '</tr>'
    + '</table>';
  logElement.append(new_msg_html);
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
