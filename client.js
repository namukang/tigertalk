var socket = io.connect('http://localhost');

// Receive a new message from the server
socket.on('server_send', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, data.msg);
});

// Add a message to the log
function addMessage(time, nick, msg) {
  var logElement = $("#log");
  var new_msg_html = '<tr>'
    + '<td class="time">' + time + '</td>'
    + '<td class="nick">' + nick + '</td>'
    + '<td class="msg">' + msg + '</td>'
    + '</tr>';
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

$(function() {
  var entry = $("#entry");
  var ENTER = 13; // keycode for enter
  entry.keypress(function(e) {
    if (e.keyCode != ENTER) return;
    var msg = entry.attr("value");
    sendMessage(msg);
    entry.attr("value", ""); // clear entry field
  });
});
