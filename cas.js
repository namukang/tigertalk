var https = require('https'),
qs = require('querystring');

var APP_URL = 'http://localhost:8001';
var HOST_URL = 'fed.princeton.edu';

exports.authenticate = function(req, res, callback) {
  query = req.query;
  if (query.hasOwnProperty("ticket")) {
    validate(query.ticket, res, callback);
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
        server_res.send("You are not authorized to use this appplication.");
      } else {
        callback(netid);
      }
    });
  }).on('error', function(e) {
    console.log("Error during validation: " + e.message);
  });
}
