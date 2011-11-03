var https = require('https'),
qs = require('querystring');

var HOST_URL = 'fed.princeton.edu';

exports.authenticate = function(req, res, app_url, ticketToNick, nickToTicket) {
  if (req.query.hasOwnProperty("ticket")) {
    res.cookie("ticket", req.query.ticket);
    res.redirect('home');
  } else if (req.cookies.ticket) {
    var cookieTicket = req.cookies.ticket;
    // Don't validate if we already know the user
    if (ticketToNick.hasOwnProperty(cookieTicket)) {
      res.sendfile(__dirname + '/index.html');
    } else {
      validate(cookieTicket, res, app_url, function(netid) {
        // Remove previous tickets for this user if any
        if (nickToTicket.hasOwnProperty(netid)) {
          var oldTicket = nickToTicket[netid];
          delete ticketToNick[oldTicket];
        }
        // Add a new user
        nickToTicket[netid] = cookieTicket;
        ticketToNick[cookieTicket] = netid;
        res.sendfile(__dirname + '/index.html');
      });
    }
    console.log(ticketToNick); // REMOVE
  } else {
    redirectToCAS(app_url, res);
  }
};

function validate(ticket, server_res, app_url, callback) {
  var query = qs.stringify({
    service: app_url,
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
        server_res.clearCookie("ticket");
        redirectToCAS(app_url, server_res);
      } else {
        callback(netid);
      }
    });
  }).on('error', function(e) {
    console.log("Error during validation: " + e.message);
  });
}

function redirectToCAS(app_url, res) {
  login_url = "https://" + HOST_URL + "/cas/login?service=" + app_url
  res.redirect(login_url);
}
