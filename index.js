var Service, Characteristic;
var net = require('net');

const QUERY_POWER = '?P\r\n';
const QUERY_INPUT = '?F\r\n';
const STATUS_POWER_OFF = "PWR1";
const STATUS_POWER_ON = "PWR0";
const REQUEST_POWER_OFF = 'PF\r\n';
const REQUEST_POWER_ON = 'PO\r\n';
const INPUT_PREFIX = "FN";
const REQUEST_INPUT = INPUT_PREFIX + '\r\n';
const TIMEOUT = 8000;

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-vsx-2", "VSX", VSX);
};

function VSX(log, config) {
  this.log = log;
  this.name = config.name;
  this.ip = config.ip;
  this.port = parseInt(config.port);
  this.input = config.input;
  this.timeout = TIMEOUT;
  if (config.timeout !== undefined) {
    this.timeout = parseInt(config.timeout);
  }
}

VSX.prototype.getServices = function () {
  this.informationService = new Service.AccessoryInformation();
  this.informationService.setCharacteristic(
      Characteristic.Manufacturer, "Pioneer");

  this.switchService = new Service.Switch(this.name);
  this.switchService.getCharacteristic(Characteristic.On)
  .on('set', this.setOn.bind(this))
  .on('get', this.getOn.bind(this));

  return [this.switchService, this.informationService];
};

function connectionErrorHandler(client, me, callback) {
  client.on('error', function (ex) {
    me.log("Received an error while communicating" + ex);
    client.destroy();
    callback(ex);
  });
  client.on('timeout', function () {
    me.log("Received a timeout while communicating");
    client.destroy();
    callback({});
  });
}

VSX.prototype.getOn = function (callback) {

  const me = this;

  var client = new net.Socket();
  client.setTimeout(me.timeout);
  connectionErrorHandler(client, me, callback);

  // Query Power
  client.connect(me.port, me.ip, function () {
    me.log('Query Power Status on ' + me.ip + ':' + me.port + " input "
        + me.input);
    client.write(QUERY_POWER);
  });

  // Handle Response
  client.on('data', function (data) {
    // me.log('Received data: ' + data);

    var response = data.toString();

    function reportSwitchOff() {
      me.log("Switch Off");
      client.destroy();
      callback(null, false);
    }

    function reportSwitchOn() {
      me.log("Switch On")
      client.destroy();
      callback(null, true);
    }

    function queryInput() {
      me.log("Power is On");
      if (me.input) {
        me.log("Setting input to " + me.input);
        client.write(QUERY_INPUT); // Request input
      } else {
        reportSwitchOn();
      }
    }

    function reportOnIfInputMatches() {
      if (response.includes(me.input)) {
        me.log("Receiver has correct input selected")
        reportSwitchOn();
      } else {
        me.log("Receiver has different input selected");
        reportSwitchOff()
      }
    }

    if (response.includes(STATUS_POWER_OFF)) {
      reportSwitchOff();
    }
    if (response.includes(STATUS_POWER_ON)) {
      queryInput();
    }
    if (response.includes(INPUT_PREFIX)) {
      reportOnIfInputMatches();
    }
  });
};

VSX.prototype.setOn = function (on, callback) {

  const me = this;
  var client = new net.Socket();
  client.setTimeout(me.timeout);
  connectionErrorHandler(client, me, callback);

  if (on) {
    // Request Power On
    client.connect(me.port, me.ip, function () {
      me.log('Set Power On on ' + me.ip + ':' + me.port + " input " + me.input);
      client.write(REQUEST_POWER_ON);
    });

    // Register Response Handler
    client.on('data', function (data) {
      if (me.input != null) {
        me.log("Change input to " + me.input);
        client.write(me.input + REQUEST_INPUT);
      }
      callback();
      client.destroy();
    });
  }

  if (!on) {
    // Request Power Off
    client.connect(me.port, me.ip, function () {
      me.log('Set Power Off on ' + me.ip + ':' + me.port);
      client.write(REQUEST_POWER_OFF);
    });

    client.on('data', function (data) {
      callback();
      client.destroy();
    });
  }
};