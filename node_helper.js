var NodeHelper = require('node_helper');
const { Freebox } = require("freebox");
var _ = require("underscore");

FB = (...args) => { /* do nothing */ }

async function Freebox_OS(token,id,domain,port) {
  var rate
  var output
  const freebox = new Freebox({
    app_token: token,
    app_id: id,
    api_domain: domain,
    https_port: port,
    api_base_url: "/api/",
    api_version: "6.0"
  })

  await freebox.login()

  const xdsl = await freebox.request({
    method: "GET",
    url: "connection/xdsl",
  });

  const clients = await freebox.request({
    method: "GET",
    url: "lan/browser/pub/",
  });

  const cnx = await freebox.request({
    method: "GET",
    url: "connection/",
  });

  const calls = await freebox.request({
    method: "GET",
    url:"call/log/",
  }),
  
  sync = (xdsl.data.result.down.rate/1000).toFixed(2) + "/" + (xdsl.data.result.up.rate/1000).toFixed(2)
  debit = (cnx.data.result.rate_down/1000).toFixed(2) + "/" + (cnx.data.result.rate_up/1000).toFixed(2)
  state = cnx.data.result.state
  ip = cnx.data.result.ipv4

  output = {
    Sync: sync,
    Debit: debit,
    State : cnx.data.result.state,
    IP: cnx.data.result.ipv4,
    Client: clients.data.result,
    Calls: calls.data.result
  }

  await freebox.logout()
  return output
};

module.exports = NodeHelper.create({

  start: function() {
    console.log("[Freebox] Starting...")
    this.freebox = null
    this.init = false
  },

  Freebox: function (token,id,domain,port) {
    Freebox_OS(token,id,domain,port).then(
      (res) => {
        if (!this.init) this.makeCache(res)
        //else this.sendInfo("RESULT", res)
        else this.makeResult(res)
      },
      (err) => { 
        console.log("[Freebox] " + err)
        if (!this.init) this.scan() 
      }
    )
  },

  scan: function() {
   this.Freebox(
     this.config.app_token,
     this.config.app_id,
     this.config.api_domain,
     this.config.https_port
   )
  },

  socketNotificationReceived: function(notification, payload) {
    switch(notification) {
      case "INIT":
        this.config = payload
        if (this.config.debug) {
          FB = (...args) => { console.log("[Freebox]", ...args) }
        }
        this.scan()
        break
      case "SCAN":
        this.init = true
        this.scan()
        break
      case "CACHE":
        this.init = false
        this.scan()
        break
    }
  },

  sendInfo: function (noti, payload) {
    FB("Send notification: " + noti, payload)
    if(!this.config.dev) this.sendSocketNotification(noti, payload)
  },

  makeCache: function (res) {
    console.log (res)
    this.cache = {}
    if (Object.keys(res.Client).length > 0) {
      for (let [item, client] of Object.entries(res.Client)) {
        this.cache[client.l2ident.id] = {
          name: client.primary_name ? client.primary_name : "(Appareil sans nom)",
          type: client.host_type,
          show: (!this.config.showPlayer && client.vendor_name == "Freebox SAS") ? false : this.config.showClient
        }
      }
    }
    this.cache = this.sortBy(this.cache, this.config.sortBy)
    this.sendInfo("INITIALIZED", this.cache)
/*
    var filtered = _.where(res.Calls, {type: "missed"})
    var missed = 0
    if (filtered.length) missed = filtered.length

    var msg = {
      who:  filtered,
      missed: missed
    }
    FB("msg:",msg)
*/
  },

  sortBy: function (data, sort) {
    var result = {}
    /** sort by type or by name **/
    if (sort == "type" || sort == "name") {
      FB("Sort cache by" , sort)
      var arr = []
      for (var mac in data) {
        if (data.hasOwnProperty(mac)) {
            var obj = {}
            obj[mac] = data[mac]
            obj.Sort = data[mac][sort].toLowerCase()
            arr.push(obj)
        }
      }

      arr.sort((a, b)=> {
        var at = a.Sort
        var bt = b.Sort
        return at > bt ? 1 : ( at < bt ? -1 : 0 )
      })

      for (var i=0, l=arr.length; i<l; i++) {
        var obj = arr[i];
        delete obj.Sort
        for (var mac in obj) {
          if (obj.hasOwnProperty(mac)) {
              var id = mac
          }
        }

        result[mac] = obj[id]
      }
    } else if (sort == "mac") {
      /** sort by MAC **/
      FB("Sort cache by", sort)
      var mac = Object.keys(data)
      mac.sort()
      mac.forEach((macSort)=> {
        result[macSort] = data[macSort]
      })
    } else {
      /** other return the same **/
      FB("Cache not sorted")
      result = data
    }
    return result
  },

  makeResult: function(res) {
    res.Clients = []
    var device = {}
    if (Object.keys(res.Client).length > 0) {
      for (let [item, client] of Object.entries(res.Client)) {
        device = {
          mac: client.l2ident.id,
          name: client.primary_name ? client.primary_name : "(Appareil sans nom)",
          type: client.host_type,
          vendor: client.vendor_name,
          active: client.active
        }
        res.Clients.push(device)
      }
    }
    delete res.Client
    this.sendInfo("RESULT", res)
  }
});
