var https = require('https'),
qs = require('querystring');

var APP_ID = '216415578426810';
var APP_URL = null;
var APP_SECRET = 'ed06e7f5c6805820c36c573e6146fdb5';

exports.handler = function(req, res, app_url, ticketToNick) {
  APP_URL = app_url;
  if (req.query.hasOwnProperty("error_reason")) {
    // User pressed "Don't Allow"
    res.send('You must allow TigerTalk to access your basic information.');
  } else if (req.query.hasOwnProperty("code")) {
    // User pressed "Allow"
    var code = req.query.code;
    authenticate(code, res, function(access_token) {
      res.cookie("ticket", access_token);
      res.redirect('home');
    });
  } else if (req.cookies.hasOwnProperty(ticket)) {
    var ticket = req.cookies.ticket;
    validate(ticket, res, function(nick) {
      ticketToNick[ticket] = nick;
      res.sendfile(__dirname + '/index.html');
    });
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
    fb_res.on('data', function(chunk) {
      var response = JSON.parse(chunk.toString());
      if (response.hasOwnProperty("error")) {
        res.send(response.error.type + ": " + response.error.message);
      } else {
        response = qs.parse(chunk.toString());
        var access_token = response.access_token;
        console.log("Access token: " + access_token);
        // callback(access_token);
      }
    });
  });
}

// Validate that the user associated with this ticket is a valid
// Princeton student
function validate(ticket, res, callback) {
  
}
// function validate(ticket, server_res, app_url, callback) {
//   var query = qs.stringify({
//     service: app_url,
//     ticket: ticket
//   });
//   var options = {
//     host: HOST_URL,
//     path: "/cas/validate?" + query
//   };
//   https.get(options, function(res) {
//     res.on('data', function(chunk) {
//       var data = chunk.toString().split("\n");
//       var netid = (data[0] == 'yes') ? data[1] : null;
//       if (netid === null) {
//         server_res.clearCookie("ticket");
//         redirectToCAS(app_url, server_res);
//       } else {
//         callback(netid);
//       }
//     });
//   }).on('error', function(e) {
//     console.log("Error during validation: " + e.message);
//   });
// }

function redirectToFB(res) {
  var login_url = "https://www.facebook.com/dialog/oauth?client_id=" + APP_ID + "&redirect_uri=" + APP_URL;
  console.log("Redirecting to: " + login_url);
  res.redirect(login_url);
}
