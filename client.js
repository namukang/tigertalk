var socket = io.connect('http://localhost');

var MSG_TYPE = "msg";
var JOIN_TYPE = "join";
var PART_TYPE = "part";

var CONFIG = {
  focus: true, // whether document has focus
  unread: 0 // number of unread messages
}

// Send nick upon connecting
socket.on('connect', function() {
  // FIXME: set nick from cookie.netid
  var nick = "dskang";
  socket.emit('set_nick', nick);
});

// Receive a new message from the server
socket.on('server_send', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, toStaticHTML(data.msg), MSG_TYPE);
  if (!CONFIG.focus) {
    CONFIG.unread++;
    updateTitle();
  }
  scrollDown();
});

// New user has joined
socket.on('join', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, null, JOIN_TYPE);
  updateNumUsers(data.num_users);
});

// User left room
socket.on('part', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, null, PART_TYPE);
  updateNumUsers(data.num_users);
});

function updateNumUsers(num_users) {
  $("#num_users").html(num_users);
}

// Add a message to the log
function addMessage(time, nick, msg, type) {
  var logElement = $("#log");
  var msg_html = null;
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

// Sanitize HTML
function toStaticHTML(input) {
  return input.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Check if text only contains whitespace
function isBlank(text) {
  var blank = /^\s*$/;
  return (text.match(blank) !== null);
}

// Send a new message to the server
function sendMessage(msg) {
  socket.emit('client_send', msg);
}

// Scroll to the newest messages
function scrollDown() {
  // FIXME: scroll only when user is already scrolled to the bottom
  window.scrollBy(0, 100000000000);
  $("#entry").focus();
}

// Update the document title with number of unread messages
function updateTitle() {
  if (CONFIG.unread) {
    document.title = "(" + CONFIG.unread.toString() + ") TigerTalk";
  } else {
    document.title = "TigerTalk";
  }
}

$(function() {
  // Focus on entry element upon page load
  var entry = $("#entry");
  entry.focus();

  // Send a message if enter is pressed in entry
  var ENTER = 13; // keycode for enter
  entry.keypress(function(e) {
    if (e.keyCode != ENTER) return;
    var msg = entry.attr("value");
    if (!isBlank(msg)) {
      sendMessage(msg);
    }
    entry.attr("value", ""); // clear entry field
  });

  // Listen for browser events to update unread messages correctly
  $(window).bind("blur", function() {
    CONFIG.focus = false;
  });

  $(window).bind("focus", function() {
    CONFIG.focus = true;
    CONFIG.unread = 0;
    updateTitle();
  });
});
