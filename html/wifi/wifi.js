var currAp = "";
var blockScan = 0;

function createInputForAp(ap) {
  if (ap.essid=="" && ap.rssi==0) return;

  var input = e("input");
  input.type = "radio";
  input.name = "essid";
  input.value=ap.essid;
  input.id   = "opt-" + ap.essid;
  if (currAp == ap.essid) input.checked = "1";

  var bars    = e("div");
  var rssiVal = -Math.floor(ap.rssi/51)*32;
  bars.className = "lock-icon";
  bars.style.backgroundPosition = "0px "+rssiVal+"px";

  var rssi = e("div");
  rssi.innerHTML = "" + ap.rssi +"dB";

  var encrypt = e("div");
  var encVal  = "-64"; //assume wpa/wpa2
  if (ap.enc == "0") encVal = "0"; //open
  if (ap.enc == "1") encVal = "-32"; //wep
  encrypt.className = "lock-icon";
  encrypt.style.backgroundPosition = "-32px "+encVal+"px";

  var label = e("div");
  label.innerHTML = ap.essid;

  var div = m('<label for=\"opt-' + ap.essid + '"></label>').childNodes[0];
  div.appendChild(input);
  div.appendChild(encrypt);
  div.appendChild(bars);
  div.appendChild(rssi);
  div.appendChild(label);
  return div;
}

function getSelectedEssid() {
  var e = document.forms.wifiform.elements;
  for (var i=0; i<e.length; i++) {
    if (e[i].type == "radio" && e[i].checked) {
      var v = e[i].value;
      if (v == "_hidden_ssid_") v = $("#hidden-ssid").value;
      return v;
    }
  }
  return currAp;
}

var scanTimeout = null;
var scanReqCnt = 0;

function scanResult() {
  if (scanReqCnt > 60) {
    return scanAPs();
  }
  scanReqCnt += 1;
  ajaxJson('GET', "scan", function(data) {
      currAp = getSelectedEssid();
      if (data.result.inProgress == "0" && data.result.APs.length > 0) {
        $("#aps").innerHTML = "";
        var n = 0;
        for (var i=0; i<data.result.APs.length; i++) {
          if (data.result.APs[i].essid == "" && data.result.APs[i].rssi == 0) continue;
          $("#aps").appendChild(createInputForAp(data.result.APs[i]));
          n = n+1;
        }
        enableNetworkSelection();
        showNotification("Scan found " + n + " networks");
        var cb = $("#connect-button");
        cb.className = cb.className.replace(" pure-button-disabled", "");
        if (scanTimeout != null) clearTimeout(scanTimeout);
        scanTimeout = window.setTimeout(scanAPs, 20000);
      } else {
        window.setTimeout(scanResult, 1000);
      }
    }, function(s, st) {
      window.setTimeout(scanResult, 5000);
  });
}

function scanAPs() {
//  console.log("scanning now");
  if (blockScan) {
    scanTimeout = window.setTimeout(scanAPs, 1000);
    return;
  }
  scanTimeout = null;
  scanReqCnt = 0;
  ajaxReq('POST', "scan", function(data) {
    //showNotification("Wifi scan started");
    window.setTimeout(scanResult, 1000);
  }, function(s, st) {
    //showNotification("Wifi scan may have started?");
    window.setTimeout(scanResult, 1000);
  });
}

function getStatus() {
  ajaxJsonSpin("GET", "connstatus", function(data) {
      if (data.status == "idle" || data.status == "connecting") {
        $("#aps").innerHTML = "Connecting...";
        showNotification("Connecting...");
        window.setTimeout(getStatus, 1000);
      } else if (data.status == "got IP address") {
        var txt = "Connected! Got IP "+data.ip;
        showNotification(txt);
        showWifiInfo(data);
        blockScan = 0;

  if (data.modechange == "yes") {
    var txt2 = "esp-link will switch to STA-only mode in a few seconds";
    window.setTimeout(function() { showNotification(txt2); }, 4000);
  }

        $("#reconnect").removeAttribute("hidden");
        $("#reconnect").innerHTML =
          "If you are in the same network, go to <a href=\"http://"+data.ip+
          "/\">"+data.ip+"</a>, else connect to network "+data.ssid+" first.";
      } else {
        blockScan = 0;
        showWarning("Connection failed: " + data.status + ", " + data.reason);
        $("#aps").innerHTML =
          "Check password and selected AP. <a href=\"wifi.tpl\">Go Back</a>";
      }
    }, function(s, st) {
      //showWarning("Can't get status: " + st);
      window.setTimeout(getStatus, 2000);
    });
}

function changeWifiMode(m) {
  blockScan = 1;
  hideWarning();
  ajaxSpin("POST", "setmode?mode=" + m, function(resp) {
    showNotification("Mode changed");
    window.setTimeout(getWifiInfo, 100);
    blockScan = 0;
    enableNetworkSelection();
  }, function(s, st) {
    showWarning("Error changing mode: " + st);
    window.setTimeout(getWifiInfo, 100);
    blockScan = 0;
    enableNetworkSelection();
  });
}

function changeWifiAp(e) {
  e.preventDefault();
  var passwd = $("#wifi-passwd").value;
  var essid = getSelectedEssid();
  showNotification("Connecting to " + essid);
  var url = "connect?essid="+encodeURIComponent(essid)+"&passwd="+encodeURIComponent(passwd);

  hideWarning();
  $("#reconnect").setAttribute("hidden", "");
  $("#wifi-passwd").value = "";
  var cb = $("#connect-button");
  var cn = cb.className;
  cb.className += ' pure-button-disabled';
  blockScan = 1;
  ajaxSpin("POST", url, function(resp) {
      $("#spinner").removeAttribute('hidden'); // hack
      showNotification("Waiting for network change...");
      window.scrollTo(0, 0);
      window.setTimeout(getStatus, 2000);
    }, function(s, st) {
      showWarning("Error switching network: "+st);
      cb.className = cn;
      window.setTimeout(scanAPs, 1000);
    });
}

function changeSpecial(e) {
  e.preventDefault();
  var url = "special";
  url += "?dhcp=" + document.querySelector('input[name="dhcp"]:checked').value;
  url += "&staticip=" + encodeURIComponent($("#wifi-staticip").value);
  url += "&netmask=" + encodeURIComponent($("#wifi-netmask").value);
  url += "&gateway=" + encodeURIComponent($("#wifi-gateway").value);

  hideWarning();
  var cb = $("#special-button");
  addClass(cb, 'pure-button-disabled');
  ajaxSpin("POST", url, function(resp) {
      removeClass(cb, 'pure-button-disabled');
      //getWifiInfo(); // it takes 1 second for new settings to be applied
    }, function(s, st) {
      showWarning("Error: "+st);
      removeClass(cb, 'pure-button-disabled');
      getWifiInfo();
    });
}

function changeHostname(){
    var h = $("#change-hostname-input").value;
    if (h == "")
        alert ("Insert hostname!")
    else{
        ajaxSpin("POST", "/system/update?name="+h, function() { showHostnameModal(h); });
    }
}

function showHostnameModal(hostname){
    var txt = "Hostname changed in : " + hostname + "\nYour board will be reboot to apply change";
    var res = confirm(txt);
    if(res == true){
      ajaxSpin('POST', "/log/reset",
        function (resp) { showNotification("Resetting esp-link"); document.title = "UNO WiFi - " + hostname;},
        function (s, st) { showWarning("Error resetting esp-link"); }
      );
    }
    else {
      alert("Reboot your board manually to apply change")
    }
}

function hostnameLimitations(keyEvent){
    var regex = new RegExp("^[a-zA-Z0-9\b]+$");
    var key = String.fromCharCode(!keyEvent.charCode ? keyEvent.which : keyEvent.charCode);
    if (!regex.test(key)) {
       keyEvent.preventDefault();
       return false;
    }
}

function enableNetworkSelection(){
  ajaxJson('GET', "/wifi/info", function(data) {
    var b = (data['mode'] == "STA") ;

    var wifiform = document.getElementById('wifiform'),
    items = wifiform.getElementsByTagName('input'),
    btn = $("#connect-button");

    var inp, i=0;
    while(inp=items[i++]) {
      inp.disabled = b;
    }
    btn.disabled = b;

    if(b){
      bnd(wifiform, "mouseover", displayWiFiModeAlert);
      bnd(wifiform, "mouseout", hideWiFiModeAlert);

      $("#APSettings-box").style.display = "none";
    }
    else {
      ubnd(wifiform, "mouseover", displayWiFiModeAlert);
      ubnd(wifiform, "mouseout", hideWiFiModeAlert);

      $("#APSettings-box").style.display = "inherit";
    }
  });
}

function displayWiFiModeAlert()
{
  $("#alertWiFiMode").style.display = "inherit";
}

function hideWiFiModeAlert()
{
  $("#alertWiFiMode").style.display = "none";
}

function doDhcp() {
  $('#dhcp-on').removeAttribute('hidden');
  $('#dhcp-off').setAttribute('hidden', '');
}

function doStatic() {
  $('#dhcp-off').removeAttribute('hidden');
  $('#dhcp-on').setAttribute('hidden', '');
}









function fetchApSettings() {
  ajaxJson("GET", "/wifi/apinfo", displayApSettings, function () {
    window.setTimeout(fetchApSettings, 1000);
  });
}

function displayApSettings(data) {
  Object.keys(data).forEach(function (v) {
    el = $("#" + v);
    if (el != null) {
      if (el.nodeName === "INPUT") el.value = data[v];
      else el.innerHTML = data[v];
      return;
    }

    el = document.querySelector('input[name="' + v + '"]');
    if (el == null)
      el = document.querySelector('select[name="' + v + '"]');

    if (el != null) {
      if (el.type == "checkbox") {
        el.checked = data[v] == "enabled";
      } else el.value = data[v];
    }
  });

  $("#AP_Settings-spinner").setAttribute("hidden", "");
  $("#AP_Settings-form").removeAttribute("hidden");
  showWarning("Don't modify SOFTAP parameters with active connections");
  window.setTimeout(hideWarning(), 2000);
}


function changeApSettings(e) {
  e.preventDefault();
  var url = "/wifi/apchange?100=1";
  var i, inputs = document.querySelectorAll("#" + e.target.id + " input,select");
  for (i = 0; i < inputs.length; i++) {
    if (inputs[i].type == "checkbox") {
      var val = (inputs[i].checked) ? 1 : 0;
      url += "&" + inputs[i].name + "=" + val;
    } else {
      var clean = inputs[i].value.replace(/[^!-~]/g, "");
      var comp = clean.localeCompare(inputs[i].value);
      if ( comp != 0 ){
        showWarning("Invalid characters in " + specials[inputs[i].name]);
        return;
      }
      url += "&" + inputs[i].name + "=" + clean;
    }
  };

  hideWarning();
  var n = e.target.id.replace("-form", "");
  var cb = $("#" + n + "-button");
  addClass(cb, "pure-button-disabled");
  ajaxSpin("POST", url, function (resp) {
    showNotification(n + " updated");
    removeClass(cb, "pure-button-disabled");
    window.setTimeout(getWifiInfo, 100);
  }, function (s, st) {
    showWarning(st);
    removeClass(cb, "pure-button-disabled");
    window.setTimeout(fetchApSettings, 2000);
  });
}


function doApAdvanced() {
  $('#AP_Settings-on').removeAttribute('hidden');
  $("#AP_Settings-off").setAttribute("hidden", "");
  $("#AP_Settings-roff").removeAttribute("checked");
}

function undoApAdvanced(){
  $("#AP_Settings-on").setAttribute("hidden", "");
  $("#AP_Settings-off").removeAttribute("hidden");
  $("#AP_Settings-roff").setAttribute("checked", "");
}
