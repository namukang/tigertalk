var https = require('https'),
qs = require('querystring');

var APP_URL = 'http://localhost:8001';
var HOST_URL = 'fed.princeton.edu';

exports.authenticate = function(req, res) {
  query = req.query;
  if (query.hasOwnProperty("ticket")) {
    validate(query.ticket, res);
  } else {
    login_url = "https://" + HOST_URL + "/cas/login?service=" + APP_URL
    res.redirect(login_url);
  }
};

function validate(ticket, server_res) {
  var query = qs.stringify({
    service: APP_URL,
    ticket: ticket
  });
  var options = {
    host: HOST_URL,
    path: "/cas/validate?" + query
  };
  var req = https.get(options, function(res) {
    res.on('data', function(chunk) {
      var data = chunk.toString().split("\n");
      var netid = (data[0] == 'yes') ? data[1] : null;
      // server_res.sendfile(__dirname + '/index.html');
      server_res.send(netid);
    });
  }).on('error', function(e) {
    console.log("Error during validation: " + e.message);
  });
}
