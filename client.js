// Get rid of fragment added by Facebook
var fb_trash = '#_=_';
if (window.location.href.indexOf(fb_trash) !== -1) {
  window.location.href = window.location.href.replace(fb_trash, '');
}

var socket = io.connect(document.location.hostname);

var TYPES = {
  msg: "msg",
  join: "join",
  part: "part",
  logout: "logout"
}

var url_re = /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s"]*(\?[^\s"]+)?)?)?/g
var orange = '#FA7F00';
var CONFIG = {
  focus: true, // whether document has focus
  unread: 0, // number of unread messages
  users: [], // online users
  room: null, // current room
  ticket: null, // user's ticket
  socket_id: null, // id of socket
  id: null, // user's id
  nick: null, // user's nick
  show_system: determineShowSystem(), // whether to show system messages
  seed: 0, // used to give nicks different colors for every session
  colors: ['red', 'green', 'blue', 'purple', 'maroon', 'navy', 'olive', 'teal', 'brown', 'blueviolet', 'chocolate'] // colors for nicks
}

// Return whether to show system messages
function determineShowSystem() {
  // Default setting for whether to show system messages
  var default_show_system = false;
  var show_system_setting = readCookie('show_system');
  if (show_system_setting === null) {
    show_system_setting = default_show_system;
  } else if (show_system_setting === 'true') {
    show_system_setting = true;
  } else {
    show_system_setting = false;
  }
  return show_system_setting;
}

// Cookie code!
// http://www.quirksmode.org/js/cookies.html
function createCookie(name,value,days) {
  if (days) {
	var date = new Date();
	date.setTime(date.getTime()+(days*24*60*60*1000));
	var expires = "; expires="+date.toGMTString();
  }
  else var expires = "";
  document.cookie = name+"="+value+expires+"; path=/";
}

function readCookie(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(';');
  for(var i=0;i < ca.length;i++) {
	var c = ca[i];
	while (c.charAt(0)==' ') c = c.substring(1,c.length);
	if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
  }
  return null;
}

function eraseCookie(name) {
  createCookie(name,"",-1);
}

// Need to reestablish identity
socket.on('reconnect', function() {
  window.location.reload();
});

// Identify the socket using its ticket
socket.on('connect', function() {
  CONFIG.ticket = readCookie("ticket");
  CONFIG.socket_id = readCookie("socket_id");
  CONFIG.room = document.location.pathname.substring(1);
  if (!CONFIG.room) {
    CONFIG.room = "main";
  }
  socket.emit('identify', CONFIG.ticket, CONFIG.socket_id, CONFIG.room);
});

// Receive a new message from the server
socket.on('msg', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.user, data.msg, TYPES.msg);
  if (!CONFIG.focus) {
    CONFIG.unread++;
    updateTitle();
  }
});

// New user has joined
socket.on('join', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.user, null, TYPES.join);
  CONFIG.users.push(data.user);
  refreshUserList();
  updateNumUsers();
});

// User left room
socket.on('part', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.user, null, TYPES.part);
  removeFromUserList(data.user.id);
  updateNumUsers();
});

// User logged out
socket.on('logout', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, null, null, TYPES.logout);
  $('#users').empty();
  $('.num_users').html('?');
  socket.disconnect();
});

// Populate the user list
socket.on('populate', function(data) {
  // data.user_list does not need to be sorted since the immediately
  // following 'join' will sort the list
  CONFIG.users = data.user_list;
  CONFIG.id = data.user.id;
  CONFIG.nick = data.user.nick;
  refreshUserList();
  updateNumUsers();
  // Remove loading message
  $("#loading").remove();
  // Populate log with backlog
  var backlog = data.backlog;
  for (var i = 0; i < backlog.length; i++) {
    var msg = backlog[i];
    var time = timeString(new Date(msg.time));
    addMessage(time, msg.user, msg.msg, msg.type);
  }
});

function refreshUserList() {
  // Sort list
  CONFIG.users.sort(function(a, b) {
    a = a.nick;
    b = b.nick;
    if (a === b) return 0;
    if (a > b) return 1;
    else return -1;
  });
  // Empty list
  var userList = $('#users');
  userList.empty();
  // Display new list
  for (var i = 0; i < CONFIG.users.length; i++) {
    var user = CONFIG.users[i];
    // Create user link
    var userLink = $(document.createElement('a'));
    userLink.attr('href', user.link);
    userLink.attr('target', '_blank');
    userLink.addClass(user.id.toString());
    // Create user row
    var userElem = $(document.createElement('tr'));
    userLink.html(userElem);
    // Create nick element
    var userNick = $(document.createElement('td'));
    userNick.addClass('nick');
    userNick.css('color', getColor(user.id));
    userNick.html(user.nick);
    // Create pic element
    var userPic = $(document.createElement('td'));
    userPic.addClass('pic');
    var img = $(document.createElement('img'));
    img.attr('src', getPicURL(user.id));
    userPic.html(img);
    // Add elements to row
    userElem.append(userPic);
    userElem.append(userNick);
    if (user.id === CONFIG.id) {
      userElem.addClass('self');
    }
    userList.append(userLink);
  }
}

function removeFromUserList(id) {
  for (var i = 0; i < CONFIG.users.length; i++) {
    if (CONFIG.users[i].id === id) {
      CONFIG.users.splice(i, 1);
      break;
    }
  }
  $('#users .' + id.toString()).remove();
}

function updateNumUsers() {
  $(".num_users").html(CONFIG.users.length);
}

// Assign a color to each id
function getColor(id) {
  if (id === CONFIG.id) {
    return orange;
  }
  var index = (id + CONFIG.seed) % CONFIG.colors.length;
  return CONFIG.colors[index];
}

function getPicURL(id) {
  return 'https://graph.facebook.com/' + id + '/picture?type=square';
}

// Add a message to the log
function addMessage(time, user, msg, type) {
  var messageElement = $(document.createElement("table"));
  messageElement.addClass("message");

  var time_html = '<td class="time">[' + time + ']</td>';
  switch (type) {
  case TYPES.join:
    messageElement.addClass("system");
    if (!CONFIG.show_system) {
      messageElement.hide();
    }
    if (user.id === CONFIG.id) {
      messageElement.addClass("self");
    }
    var text = user.nick + " joined the room.";
    var content = '<tr>'
      + time_html
      + '<td class="text">' + text + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;
    
  case TYPES.msg:
    // Sanitize input
    msg = toStaticHTML(msg);
    // Indicate if you are the owner of the message
    if (user.id === CONFIG.id) {
      messageElement.addClass("owner");
    }

    // Change addresses to links
    msg = msg.replace(url_re, '<a target="_blank" href="$&">$&</a>');

    // Bold your nickname if it is mentioned in a message
    var firstname_re = new RegExp("\\b" + CONFIG.nick.split(' ')[0] + "\\b", 'i');
    var firstname_match = firstname_re.exec(msg);
    if (firstname_match) {
      msg = msg.replace(firstname_match, '<span class="self">' + firstname_match + '</span>');
    }

    var color = getColor(user.id);
    var content = '<tr>'
      + time_html
      + '<td class="nick" style="color: ' + color + '">' + user.nick + ':</td>'
      + '<td class="text">' + msg + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;

  case TYPES.part:
    messageElement.addClass("system");
    if (!CONFIG.show_system) {
      messageElement.hide();
    }
    var text = user.nick + " left the room.";
    var content = '<tr>'
      + time_html
      + '<td class="text">' + text + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;

  case TYPES.logout:
    messageElement.addClass("system");
    var text = "You have been logged out.";
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
}

// Update the document title with number of unread messages
function updateTitle() {
  if (CONFIG.unread > 0) {
    document.title = "(" + CONFIG.unread.toString() + ") TigerTalk";
  } else {
    document.title = "TigerTalk";
  }
}

// Toggle showing the user list
function toggleUserList(e) {
  e.preventDefault();
  toggleSidebar('users');
  $('#entry').focus();
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
  scrollDown();
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
  $.ajax({
    url: "/part",
    type: "GET",
    async: false,
    data: {
      ticket: CONFIG.ticket,
      socket_id: CONFIG.socket_id
    }
  });
});

function logout(e) {
  e.preventDefault();
  socket.emit('logout');
}

function toggleShowSystem(e) {
  if (CONFIG.show_system) {
    createCookie('show_system', 'false');
    $('.system').hide();
    CONFIG.show_system = false;
    scrollDown();
  } else {
    createCookie('show_system', 'true');
    $('.system').show();
    CONFIG.show_system = true;
    scrollDown();
  }
}

// **********
// START ROOM LISTS
// **********
// Populate the room list
socket.on('room_list', function(roomToNumUsers) {
  var roomList = createRoomList(roomToNumUsers);
  roomList.sort(compareByNumUsers);
  showRoomList(roomList);
});

// Render the room list
function showRoomList(rooms) {
  var roomList = $('#rooms');
  // Clear the room list
  roomList.empty();
  // Populate the room list
  for (var i = 0; i < rooms.length; i++) {
    var roomElem = $(document.createElement('li'));
    var room = rooms[i].room;
    var numUsers = rooms[i].numUsers;
    // Create user link
    var roomLink = $(document.createElement('a'));
    roomLink.attr('href', '/' + room);
    roomLink.html(room + ' (' + numUsers + ' users)');
    if (CONFIG.room === room) {
      roomLink.addClass('self');
    }
    roomElem.html(roomLink);
    roomList.append(roomElem);
  }
}

// Sort the array of rooms by number of users
function compareByNumUsers(a, b) {
  return b.numUsers - a.numUsers;
}

// Convert the roomToNumUsers object to an array
function createRoomList(roomToNumUsers) {
  var roomList = [];
  for (room in roomToNumUsers) {
    roomList.push({
      room: room,
      numUsers: roomToNumUsers[room]
    });
  }
  return roomList;
}

// Toggle showing the room list
function toggleRoomList(e) {
  e.preventDefault();
  toggleSidebar('rooms');
  $('#entry').focus();
}
// **********
// END ROOM LISTS
// **********

// Toggle the current type in the sidebar
// If sidebar is hidden, show type
// If type is already showing, hide
// If sidebar is showing another type, switch
function toggleSidebar(type) {
  var main = $(".main");
  var sidebar = $('#sidebar');
  var currentShowing = getCurrentList();
  if (sidebar.is(":hidden")) {
    // Only pull room list if sidebar is going to be shown
    if (type === 'rooms') {
      socket.emit('room_list');
    }
    // Just show the sidebar
    showInSidebar(type);
    main.width("80%");
    scrollDown();
    sidebar.animate({
      width: 'toggle'
    });
  } else if (currentShowing === type) {
    // Just hide the sidebar
    sidebar.animate({
      width: 'toggle'
    }, function() {
      main.width("100%");
      showInSidebar(type);
    });
  } else {
    // Only pull room list if sidebar is going to be shown
    if (type === 'rooms') {
      socket.emit('room_list');
    }
    // First hide sidebar
    sidebar.animate({
      width: 'toggle'
    }, function() {
      showInSidebar(type);
    });
    // Now show sidebar
    sidebar.animate({
      width: 'toggle'
    });
  }
}

// Return the list that is currently being shown in the sidebar
function getCurrentList() {
  var roomList = $('#room-list');
  var userList = $('#user-list');
  if (roomList.is(":visible")) {
    return 'rooms';
  } else if (userList.is(":visible")) {
    return 'users';
  } else {
    return "ERROR";
  }
}

// Hide other lists and only show list 'type'
function showInSidebar(type) {
  var roomList = $('#room-list');
  var userList = $('#user-list');
  var prefs = $('#prefs');
  $('#sidebar div').hide();
  if (type === 'rooms') {
    roomList.show();
  } else if (type === 'users') {
    userList.show();
    prefs.show();
  }
}

// Create/join a room
function createRoom(e) {
  e.preventDefault();
  var room = $.trim($('#room-input').val());
  if (!room || room.length > 50) {
    alert("Room names must be between 1 and 50 characters.");
    return;
  }
  if (/[^\w_\-]/.test(room)) {
    alert("Room names may only contains letters, numbers, underscores, and dashes.");
    return;
  }
  document.location.pathname = room;
}

$(function() {
  // Set seed
  CONFIG.seed = Math.floor(Math.random() * CONFIG.colors.length);

  // Check or uncheck system messages checkbox appropriately
  if (CONFIG.show_system) {
    $("#system-link").attr("checked", "checked");
  } else {
    $("#system-link").removeAttr("checked");
  }

  // Only show user list at beginning
  $('#room-list').hide();

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
  $(window).blur(function() {
    CONFIG.focus = false;
  });

  $(window).focus(function() {
    CONFIG.focus = true;
    CONFIG.unread = 0;
    updateTitle();
  });

  // Set up click handlers
  $('#user-link').click(toggleUserList);
  $('#room-link').click(toggleRoomList);
  $('#about-link').click(toggleAbout);
  $('#logout-link').click(logout);
  $('#system-link').click(toggleShowSystem);
  $('#room-button').click(createRoom);

  // Showing loading message
  $("#log").append("<table class='system' id='loading'><tr><td>Connecting...</td></tr></table>");
});
