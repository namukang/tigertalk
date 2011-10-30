var socket = io.connect('http://localhost');

var MSG_TYPE = "msg";
var JOIN_TYPE = "join";
var PART_TYPE = "part";

var NICK;

// Seed number used to give nicks different colors for every session
var SEED;
var orange = '#FA7F00';
var COLORS = ['red', orange, 'green', 'blue', 'purple'];

var CONFIG = {
  focus: true, // whether document has focus
  unread: 0 // number of unread messages
}

// Send nick upon connecting
socket.on('connect', function() {
  var cookieName = "netid=";
  var nick = document.cookie.substring(cookieName.length);
  NICK = nick;
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

// Assign a color to each nick
function getColor(nick) {
  var nickNum = 0;
  for (var i = 0; i < nick.length; i++) {
    nickNum += nick.charCodeAt(i);
  }
  var index = (nickNum + SEED) % COLORS.length;
  return COLORS[index];
}

// Add a message to the log
function addMessage(time, nick, msg, type) {
  var messageElement = $(document.createElement("table"));
  messageElement.addClass("message");

  var time_html = '<td class="time">[' + time + ']</td>';
  switch (type) {
  case JOIN_TYPE:
    messageElement.addClass("system");
    var text = nick + " joined the room.";
    var content = '<tr>'
      + time_html
      + '<td class="text">' + text + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;
    
  case MSG_TYPE:
    // Indicate if you are the owner of the message
    if (nick === NICK) {
      messageElement.addClass("owner");
    }

    // Bold your nickname if it is mentioned in a message
    var nick_re = new RegExp(NICK);
    if (nick_re.test(msg)) {
      msg = msg.replace(NICK, '<span style="font-weight: bold">' + NICK + '</span>');
    }

    var color = getColor(nick);
    var content = '<tr>'
      + time_html
      + '<td class="nick" style="color: ' + color + '">' + nick + ':</td>'
      + '<td class="text">' + msg + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;

  case PART_TYPE:
    messageElement.addClass("system");
    var text = nick + " left the room.";
    var content = '<tr>'
      + time_html
      + '<td class="text">' + msg + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;
  }
  $("#log").append(messageElement);
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
  // Set seed
  SEED = Math.floor(Math.random() * COLORS.length);

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
