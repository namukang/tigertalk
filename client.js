var socket = io.connect(document.location.hostname);

var MSG_TYPE = "msg";
var JOIN_TYPE = "join";
var PART_TYPE = "part";

var NICK;

// Seed number used to give nicks different colors for every session
var SEED;
var orange = '#FA7F00';
var COLORS = ['red', orange, 'green', 'blue', 'purple'];

var USERS = [];

var CONFIG = {
  focus: true, // whether document has focus
  unread: 0 // number of unread messages
}

function readCookie(name) {
  var nameEQ = name + "=";
  var cookies = document.cookie.split(';');
  for (var i = 0; i < cookies.length; i++) {
	var cookie = cookies[i];
	while (cookie.charAt(0) == ' ') {
      cookie = cookie.substring(1, cookie.length);
    }
	if (cookie.indexOf(nameEQ) == 0) {
      return cookie.substring(nameEQ.length, cookie.length);
    }
  }
  return null;
}

// Send nick upon connecting
socket.on('connect', function() {
  // var nick = readCookie("netid");
  var nick = null;
  while (nick === null || nick === "null" || nick.length === 0) {
    nick = prompt("Please enter your Princeton netID:");
  }
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
  addToUserList(data.nick);
  updateNumUsers();
});

// User left room
socket.on('part', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, null, PART_TYPE);
  removeFromUserList(data.nick);
  updateNumUsers();
});

// Populate the user list
socket.on('populate', function(data) {
  // data.user_list does not need to be sorted since the immediately
  // following 'join' will sort the list
  USERS = data.user_list;
  var userList = $('#users');
  for (var i = 0; i < USERS.length; i++) {
    var nick = USERS[i];
    var userElem = $(document.createElement('li'));
    userElem.addClass(nick);
    userElem.html(nick);
    userList.append(userElem);
  }
  updateNumUsers();
});

function addToUserList(nick) {
  USERS.push(nick);
  USERS.sort();
  var userList = $('#users');
  userList.empty();
  for (var i = 0; i < USERS.length; i++) {
    var curNick = USERS[i];
    var userElem = $(document.createElement('li'));
    userElem.addClass(curNick);
    if (curNick === NICK) {
      userElem.addClass('self');
    }
    userElem.html(curNick);
    userList.append(userElem);
  }
}

function removeFromUserList(nick) {
  for (var i = 0; i < USERS.length; i++) {
    if (USERS[i] === nick) {
      USERS.splice(i, 1);
      break;
    }
  }
  $('#users .' + nick).first().remove();
}

function updateNumUsers() {
  $(".num_users").html(USERS.length);
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
      msg = msg.replace(NICK, '<span class="self">' + NICK + '</span>');
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
      + '<td class="text">' + text + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;
  }
  // Scroll to bottom only if already scrolled to bottom
  var atBottom = scrolledToBottom();
  $("#log").append(messageElement);
  if (atBottom) {
    scrollDown();
  }
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

// Return true if content is scrolled to bottom
function scrolledToBottom() {
  var content = $('#content');
  return (content.scrollTop() === content.prop("scrollHeight") - content.height());
}

// Scroll to the newest messages
function scrollDown() {
  var content = $('#content');
  content.scrollTop(content.prop("scrollHeight") - content.height());
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

// Toggle showing the user list
function toggleUserList(e) {
  e.preventDefault();
  $('#entry').focus();
  var sidebar = $("#sidebar");
  var main = $(".main");
  main.width("85%");
  sidebar.animate({
    width: 'toggle'
  }, function() {
    if (sidebar.is(":hidden")) {
      main.width("100%");
    }
  });
}

// Show About content
function toggleAbout(e) {
  e.preventDefault();
  $('#entry').focus();
  var extra = $("#extra");
  var content = $("#content");
  var header = $("#header");
  content.offset({
    top: header.height() + extra.height()
  });
  extra.slideToggle(function() {
    if (extra.is(":hidden")) {
      content.offset({
        top: header.height()
      });
    }
  });
}

// Notify server of disconnection
$(window).unload(function() {
  $.get("/part", {
    nick: NICK
  });
  // socket.disconnect();
});

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
    var msg = entry.val();
    if (!isBlank(msg)) {
      sendMessage(msg);
    }
    entry.val(""); // clear entry field
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

  $('#user-link').click(toggleUserList);
  $('#about-link').click(toggleAbout);
});
