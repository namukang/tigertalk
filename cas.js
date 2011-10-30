var https = require('https'),
qs = require('querystring');

var APP_URL = 'http://localhost:8001';
var HOST_URL = 'fed.princeton.edu';

exports.authenticate = function(req, res) {
  if (req.query.hasOwnProperty("ticket")) {
    res.cookie("ticket", req.query.ticket);
    res.redirect('home');
  } else if (req.cookies.ticket) {
    validate(req.cookies.ticket, res, function(netid) {
      res.clearCookie("ticket");
      res.cookie("netid", netid);
      res.sendfile(__dirname + '/index.html');
    });
  } else {
    login_url = "https://" + HOST_URL + "/cas/login?service=" + APP_URL
    res.redirect(login_url);
  }
};

function validate(ticket, server_res, callback) {
  var query = qs.stringify({
    service: APP_URL,
    ticket: ticket
  });
  var options = {
    host: HOST_URL,
    path: "/cas/validate?" + query
  };
  https.get(options, function(res) {
    res.on('data', function(chunk) {
      var data = chunk.toString().split("\n");
      var netid = (data[0] == 'yes') ? data[1] : null;
      if (netid === null) {
        login_url = "https://" + HOST_URL + "/cas/login?service=" + APP_URL
        server_res.redirect(login_url);
      } else {
        callback(netid);
      }
    });
  }).on('error', function(e) {
    console.log("Error during validation: " + e.message);
  });
}
