var https = require('https'),
qs = require('querystring');

var APP_ID = '216415578426810';
var APP_URL = null;
var APP_SECRET = 'ed06e7f5c6805820c36c573e6146fdb5';

exports.handler = function(req, res, app_url, ticketToUser, nickToTicket, room) {
  APP_URL = app_url + '/';
  if (req.query.hasOwnProperty("error_reason")) {
    // User pressed "Don't Allow"
    res.send('You must allow TigerTalk to access your basic information.');
  } else if (req.query.hasOwnProperty("code")) {
    // User pressed "Allow"
    var code = req.query.code;
    authenticate(code, res, function(access_token) {
      res.cookie("ticket", access_token);
      res.redirect('/' + room);
    });
  } else if (req.cookies.hasOwnProperty('ticket')) {
    var socket_id = Math.floor(Math.random() * 99999999999);
    res.cookie("socket_id", socket_id);
    var cookieTicket = req.cookies.ticket;
    // Don't validate if we already know the user
    if (ticketToUser.hasOwnProperty(cookieTicket)) {
      res.sendfile(__dirname + '/index.html');
    } else {
      var token = cookieTicket;
      validate(token, res, function(nick, id, link) {
        // Remove previous ticket for this user if one exists
        // Effects: User is disconnected from any other sessions not
        // using this cookie but this is okay since most users will be
        // using the same cookie
        if (nickToTicket.hasOwnProperty(nick)) {
          var oldTicket = nickToTicket[nick];
          delete ticketToUser[oldTicket];
        }
        // Add a new user
        nickToTicket[nick] = cookieTicket;
        ticketToUser[cookieTicket] = {
          nick: nick,
          id: id,
          link: link
        };
        res.sendfile(__dirname + '/index.html');
      });
    }
  } else {
    redirectToFB(res);
  }
};

// Obtain the access token for the user
function authenticate(code, res, callback) {
  var args = qs.stringify({
    client_id: APP_ID,
    redirect_uri: APP_URL,
    client_secret: APP_SECRET,
    code: code
  });
  var options = {
    host: 'graph.facebook.com',
    path: '/oauth/access_token?' + args
  };
  https.get(options, function(fb_res) {
    var data = '';
    fb_res.on('data', function(chunk) {
      data += chunk.toString();
    });
    fb_res.on('end', function() {
      if (data.indexOf('error') !== -1) {
        var response = JSON.parse(data);
        res.send(response.error.type + ": " + response.error.message);
      } else {
        var response = qs.parse(data);
        var access_token = response.access_token;
        callback(access_token);
      }
    });
  });
}

// Validate that the user associated with this ticket is a valid
// Princeton student
function validate(token, res, callback) {
  var args = qs.stringify({
    q: "SELECT affiliations FROM user WHERE uid = me()",
    access_token: token
  });
  var options = {
    host: 'graph.facebook.com',
    path: '/fql?' + args
  };
  https.get(options, function(fb_res) {
    var data = '';
    fb_res.on('data', function(chunk) {
      data += chunk.toString();
    });
    fb_res.on('end', function() {
      var response = JSON.parse(data);
      if (response.hasOwnProperty("error") || response.data.length === 0) {
        res.clearCookie('ticket');
        redirectToFB(res);
      } else {
        var affiliations = response.data[0].affiliations;
        var valid = false;
        for (var i = 0; i < affiliations.length; i++) {
          if (affiliations[i].name === 'Princeton') {
            valid = true;
            break;
          }
        }
        if (valid) {
          getData(token, callback);
        } else {
          res.send("You must be in the Princeton network to use TigerTalk. If you are a Princeton student, add Princeton to your networks in Account Settings -> Networks");
        }
      }
    }).on('error', function(e) {
      console.log("Error in validate: " + e.message);
    });
  });
}

function getData(token, callback) {
  var args = qs.stringify({
    access_token: token
  });
  var options = {
    host: 'graph.facebook.com',
    path: '/me?' + args
  };
  https.get(options, function(fb_res) {
    var data = '';
    fb_res.on('data', function(chunk) {
      data += chunk.toString();
    });
    fb_res.on('end', function() {
      var response = JSON.parse(data);
      if (response.hasOwnProperty("error")) {
        res.send(response.error.type + ": " + response.error.message);
      } else {
        callback(response.name, response.id, response.link);
      }
    });
  }).on('error', function(e) {
    console.log("Error in getData: " + e.message);
  });
}

function redirectToFB(res) {
  var args = qs.stringify({
    client_id: APP_ID,
    redirect_uri: APP_URL
  });
  var login_url = "https://www.facebook.com/dialog/oauth?" + args;
  res.redirect(login_url);
}
