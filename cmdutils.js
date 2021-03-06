// CmdUtils
// jshint esversion: 6

if (!CmdUtils) var CmdUtils = {
    VERSION: chrome.runtime.getManifest().version,
    DEBUG: false,
    CommandList: [],
    jQuery: jQuery,
    backgroundWindow: window,
    popupWindow: null,
    log: console.log,
    active_tab: null,   // tab that is currently active, updated via background.js
    pageData: "",   // currently selected text, update via content script selection.js
    setPreview: function setPreview(message, prepend) { console.log(message); },
};

// debug log
CmdUtils.deblog = function () {
    if(CmdUtils.DEBUG){
        console.log.apply(console, arguments);
    }
}

// creates command and adds it to command array, name or names must be provided and preview execute functions
CmdUtils.CreateCommand = function CreateCommand(args) {
    if (Array.isArray(args.name)) {
        args.names = args.name;
        args.name = args.name[0];
    } else {
        args.name = args.name || args.names[0];
        args.names = args.names || [args.name];
    }
    if (CmdUtils.getcmd(args.name)) {
        // remove previously defined command with this name
        CmdUtils.CommandList = CmdUtils.CommandList.filter( cmd => cmd.name !== args.name );
    }
    //console.log("command created ", args.name);
    var to = parseFloat(args.timeout || 0);
    if (to>0) {
        args.timeoutFunc = null;
        if (typeof args.preview == 'function') {
            args.preview_timeout = args.preview;
            args.preview = function(b,a) {
                if (args.preview_timeoutFunc !== null) clearTimeout(args.preview_timeoutFunc);
                args.preview_timeoutFunc = setTimeout(function () {
                    args.preview_timeout(b, a);
                }, to);
            };
        }
        if (typeof args.execute == 'function') {
            args.execute_timeout = args.execute;
            args.execute = function(a) {
                if (args.execute_timeoutFunc !== null) clearTimeout(args.execute_timeoutFunc);
                args.execute_timeoutFunc = setTimeout(function () {
                    args.execute_timeout(a);
                }, to);
            };
        }
    }
    if (!("options" in args)) args.options = {};
    if (!("output" in args)) args.output = function(){ return {}; };

    CmdUtils.CommandList.push(args);
};

// create search command using url
CmdUtils.makeSearchCommand = function makeSearchCommand(args) {
    args.execute = function(a) {
        var url = args.url.replace(/\{QUERY\}/g, encodeURIComponent(a.text));
        CmdUtils.addTab(url);
    }
    if ((typeof args.preview != 'function') && args.preview != 'none') {
        args.preview = CmdUtils._searchCommandPreview;
        if (args.prevAttrs == null) {
            args.prevAttrs = {zoom: 0.85};
        }
    }
    CmdUtils.CreateCommand(args);
};

// helper to avoid stealing focus in preview
CmdUtils._restoreFocusToInput = function(event) {
    var wnd = event.currentTarget || event.view;
    var doc;
    if (!wnd.closed && !((doc = wnd.document).hidden || doc.webkitHidden || doc.mozHidden || doc.msHidden)) {
        wnd.setTimeout( function() {
            wnd.document.getElementById('ubiq_input').focus();
        }, 0);
        var self = wnd._ubiq_recent_cmd;
        // may be scrolled by set of focus - so restore it now:
        if (self.prevAttrs.scroll) {
            var scrollOffs = self.prevAttrs.scroll;
            wnd.setTimeout( function() {
                var pblock = wnd.document.getElementById('ubiq-preview-div');
                pblock.scrollLeft = scrollOffs[0];
                pblock.scrollTop = scrollOffs[1];
            }, 0);
        }
        wnd.setTimeout(function() {
            wnd.removeEventListener("blur", CmdUtils._restoreFocusToInput, { capture: true });
        }, 150);
    } else {
        wnd.removeEventListener("blur", CmdUtils._restoreFocusToInput, { capture: true });
    }
};

CmdUtils._afterLoadPreview = function(ifrm) {
    var doc = ifrm.ownerDocument;
    var wnd = doc.defaultView || doc.parentWindow;
    wnd.focus();
    // jump to anchor (try multiple one by one):
    if (this.prevAttrs.anchor != null) {
      var url = ifrm.src;
      for (var ha of this.prevAttrs.anchor) {
        ifrm.src = url.replace(/(?:\#[^#]+)?$/, '#' + ha);
      }
    }
    // restore focus:
    wnd.focus();
    wnd.removeEventListener("blur", CmdUtils._restoreFocusToInput, { capture: true });
}

// default common preview for search commands
CmdUtils._searchCommandPreview = function _searchCommandPreview( pblock, {input: text} ) {
    var q = text;
    var code = (this.description || "Search") + " for <b> '" + (q || "...") + "'</b>";
    pblock.innerHTML = code;
    if (q == null || q == '') {
      return;
    }
    if (!this.prevAttrs) this.prevAttrs = {};
    var url = (this.prevAttrs.url || this.url).replace(/\{QUERY\}/g, q);
    // hash-anchor:
    var hashanch = null;
    if (this.prevAttrs.anchor != null) {
      var hashanch = this.prevAttrs.anchor;
      if (!Array.isArray(hashanch)) {
        hashanch = this.prevAttrs.anchor = [hashanch];
      }
      url += '#'+hashanch[0];
    }
    var zoom = this.prevAttrs.zoom || 0.85;
    //pblock.style.overflow = 'hidden';
    var doc = pblock.ownerDocument;
    var wnd = doc.defaultView || doc.parentWindow;
    if (wnd._ubi_prevTO != null) {
      wnd.clearTimeout(wnd._ubi_prevTO);
      wnd._ubi_prevTO = null;
    }
    var to = 300;
    var self = this;
    // show it:
    wnd._ubi_prevTO = wnd.setTimeout(function () {
      // avoid stealing focus (and re-scroll):
      wnd.removeEventListener("blur", CmdUtils._restoreFocusToInput, { capture: true });
      wnd.addEventListener("blur", CmdUtils._restoreFocusToInput, { capture: true });
      wnd._ubiq_recent_cmd = self;
      // parent block in order to handle scroll ("cross origin" issue) and to provide zoom
      pblock.innerHTML =
    '<div id="ubiq-preview-div" style="--zoom:'+ zoom +'">'+ code +'</div>';
      pblock = pblock.lastChild;
      // scrollTo in frame cross origin not allowed in some browsers - scroll later inside parent div:
      var scrollOffs = [0, 0];
      if (self.prevAttrs.scroll) {
        scrollOffs = self.prevAttrs.scroll;
      }
      pblock.innerHTML =
     '<iframe id="ubiq-preview-frm"' +
       ' sandbox="allow-same-origin allow-scripts allow-popups allow-forms"' +
       ' style="--scrollX:'+ scrollOffs[0] +'px; --scrollY:'+ scrollOffs[1] +'px; "'+
       ' src="' + url + '"/>';
      var ifrm = pblock.lastChild;
      ifrm.onload = function() {
        (CmdUtils._afterLoadPreview.bind(self))(pblock.lastChild);
      };
      // zoom overflow dirty fix
      CmdUtils.popupWindow.jQuery("#ubiq-command-preview").css("overflow-y", "hidden");
      if (scrollOffs[0] || scrollOffs[1]) {
        wnd.setTimeout(function() {
          pblock.scrollLeft = scrollOffs[0];
          pblock.scrollTop = scrollOffs[1];
        }, 10);
      }
    }, to);
}

// closes current tab
CmdUtils.closeTab = function closeTab() {
    chrome.tabs.query({active:true,currentWindow:true},function(tabs){
        if (tabs && tabs[0])
            chrome.tabs.remove(tabs[0].id, function() { });
        else
            console.error("closeTab failed because 'tabs' is not set");
    });
};

// returns active tabs URL if avaiable
CmdUtils.getLocation = function getLocation() {
    if (CmdUtils.active_tab && CmdUtils.active_tab.tab.url)
        return CmdUtils.active_tab.tab.url;
    else
        return "";
};

// opens new tab with provided url
CmdUtils.addTab = function addTab(url) {
    if (typeof browser !== 'undefined') {
        browser.tabs.create({ "url": url });
    } else
    if (typeof chrome !== 'undefined' && typeof chrome.tabs !== 'undefined') {
        chrome.tabs.create({ "url": url });
    } else {
        window.open(url);
    }
};

// opens new tab with post request and provided data
CmdUtils.postNewTab
 = function postNewTab(url, data) {
    var form = document.createElement("form");
    form.setAttribute("method", "post");
    form.setAttribute("action", url);
    form.setAttribute("target", "_blank");

    if (typeof data === 'string') data = Utils.urlToParams(data);
    for (var i in data) {
        if (data.hasOwnProperty(i)) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = i;
            input.value = data[i];
            form.appendChild(input);
        }
    }

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
}

// returns a function that opens new tab with substituted {text} and {location}
CmdUtils.SimpleUrlBasedCommand = function SimpleUrlBasedCommand(url) {
    if (!url) return;
    var search_func = function(directObj) {
        if (!directObj) return;
        var text = directObj.input;
        text = encodeURIComponent(text);
        var finalurl = url;
        finalurl = finalurl.replace('{text}', text);
        finalurl = finalurl.replace('{location}', CmdUtils.getLocation());
        CmdUtils.addTab(finalurl);
    };
    return search_func;
};

// closes ubiquity popup
CmdUtils.closePopup = function closePopup(w) {
    if (typeof popupWindow !== "undefined") popupWindow.close();
};

// gets json with xhr
CmdUtils.ajaxGetJSON = function ajaxGetJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            var resp = JSON.parse(xhr.responseText);
            callback(resp, xhr);
        }
    };
    xhr.send();
};

// gets page with xhr
CmdUtils.ajaxGet = function ajaxGet(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            callback(xhr.responseText, xhr);
        }
    };
    xhr.send();
};

// performs jQuery get and returns jqXHR that implements Promise
CmdUtils.get = function get(url) {
    return jQuery.ajax({
        url: url,
        async: true
    });
};

// performs jQuery post and return jsXHR
CmdUtils.post = function post(url, data) {
    return jQuery.ajax({
        url: url,
        data: data,
        async: true
    });
};

// loads remote scripts into specified window (or backround if not specified)
CmdUtils.loadScripts = async function loadScripts(url, wnd=window) {
    // this array will hold all loaded scripts into this window
    wnd.loadedScripts = wnd.loadedScripts || [];
    url = url || [];
    if (url.constructor === String) url = [url];

    if (url.length == 0)
        return true;

    var thisurl = url.shift();
    if (wnd.loadedScripts.indexOf(thisurl)!==-1)
        return true;

    if (typeof wnd.jQuery === "undefined") {
        console.error("there's no jQuery at "+wnd+".");
        return false;
    }

    console.log("loading :::: ", thisurl);
    try {
        await wnd.jQuery.ajax({
            url: thisurl,
            dataType: 'script',
        });
        console.log("Loaded require :::", thisurl);
        wnd.loadedScripts.push(thisurl);
        return true;
    } catch (e) {}
    return false;
};

CmdUtils.getPageObject = function getPageObject() {
    return new Promise(function(resolve, reject) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (chrome.runtime.lastError || tabs.length == 0) {
                console.log("No active tabs.");
                return resolve(null);
            }

            chrome.tabs.sendMessage(tabs[0].id, {}, function(response) {
                if (chrome.runtime.lastError || response === undefined) {
                    console.log("Received no response from active tab");
                    return resolve(null);
                }

                response.tab = tabs[0];
                return resolve(response);
            });
        });
    });
};

// called when tab is switched or changed, updates selectedText and activeTab
CmdUtils.updateActiveTab = async function () {
    CmdUtils.active_tab = null;
    CmdUtils.active_tab = await CmdUtils.getPageObject();
};

// replaces current selection with string provided
CmdUtils.setSelection = function setSelection(s) {
    console.log("CmdUtils.setSelection"+s)
    if (typeof s!=='string') s = s+'';
    s = s.replace(/(['"])/g, "\\$1");
    // http://jsfiddle.net/b3Fk5/2/
    var insertCode = `
    function replaceSelectedText(replacementText) {
        var sel, range;
        if (window.getSelection) {
            sel = window.getSelection();
            var activeElement = document.activeElement;
            if (activeElement.nodeName == "TEXTAREA" ||
                (activeElement.nodeName == "INPUT" && activeElement.type.toLowerCase() == "text")) {
                    var val = activeElement.value, start = activeElement.selectionStart, end = activeElement.selectionEnd;
                    activeElement.value = val.slice(0, start) + replacementText + val.slice(end);
            } else {
                if (sel.rangeCount) {
                    range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(replacementText));
                } else {
                    sel.deleteFromDocument();
                }
            }
        } else if (document.selection && document.selection.createRange) {
            range = document.selection.createRange();
            range.text = replacementText;
        }
    }
    replaceSelectedText("`+s+`");`;
    if (CmdUtils.active_tab && CmdUtils.active_tab.tab.id)
        return chrome.tabs.executeScript( CmdUtils.active_tab.tab.id, { code: insertCode } );
    else
        return chrome.tabs.executeScript( { code: insertCode } );
};

// for measuring time the input is changed
CmdUtils.inputUpdateTime = performance.now();
CmdUtils.timeSinceInputUpdate = function timeSinceInputUpdate() {
    return (performance.now() - CmdUtils.inputUpdateTime)*0.001;
};

// returns command with this name
CmdUtils.getcmd = function getcmd(cmdname) {
    for (var c in CmdUtils.CommandList)
        if (CmdUtils.CommandList[c].name == cmdname || CmdUtils.CommandList[c].names.indexOf(cmdname)>-1) return CmdUtils.CommandList[c];
    return null;
};

// sets clipboard
CmdUtils.setClipboard = function setClipboard (t) {
    var input = document.createElement('textarea');
    document.body.appendChild(input);
    input.value = t;
    input.focus();
    input.select();
    document.execCommand('Copy');
    input.remove();
};

CmdUtils.unloadCustomScripts = function unloadCustomScripts() {
    CmdUtils.CommandList = CmdUtils.CommandList.filter((c)=>{
        return c['builtIn']==true;
    });

}

CmdUtils.loadCustomScripts = function loadCustomScripts() {
    CmdUtils.unloadCustomScripts();
    // mark built-int commands
    CmdUtils.CommandList.forEach((c)=>{c['builtIn']=true;});

    // load custom scripts
    chrome.storage.local.get('customscripts', function(result) {
        try {
            eval(result.customscripts || "");
        } catch (e) {
            console.error("custom scripts eval failed", e);
        }
    });
};

// show browser notification with simple limiter
CmdUtils.lastNotification = "";
CmdUtils.notify = function (message, title) {
    if (CmdUtils.lastNotification == title+"/"+message) return;
    chrome.notifications.create({
        "type": "basic",
        "iconUrl": chrome.extension.getURL("res/icon-128.png"),
        "title": title || "UbiChr",
        "message": message
    });
    CmdUtils.lastNotification = title+"/"+message;
};

(function ( $ ) {
    $.fn.blankify = function( url ) {
        console.log("tryeing to blnk",this.find("a"));
        return this.find("a").not('[href^="http"],[href^="//:"],[href^="mailto:"],[href^="#"]').each(function() {
            console.log("bln");
            $(this).attr("target", "_blank").attr('href', function(index, value) {
                if (value.substr(0,1) !== "/") value = "/"+value;
                return url + value;
            });
});
        };
}( jQuery ));

// https://stackoverflow.com/questions/8498592/extract-hostname-name-from-string
function url_domain(data) {
    var    a      = document.createElement('a');
           a.href = data;
    return a.hostname;
}

(function ( $ ) {
    $.fn.loadAbs = function( url, complete ) {
        var result = this;
        return this.load(url, function() {
            url = "http://"+url_domain( url );
            result.find("a")
                    .not('[href^="http"],[href^="//:"],[href^="mailto:"],[href^="#"]')
                    .attr("target", "_blank")
                    .attr('href', function(index, value) {
                if (typeof value === "undefined") return url;
                if (value.substr(0,1) !== "/") value = "/" + value;
                return url + value;
            });
            result.find("img")
                    .not('[src^="http"],[src^="//:"],[src^="mailto:"],[src^="#"]')
                    .attr('src', function(index, value) {
                if (typeof value === "undefined") return url;
                if (value.substr(0,1) !== "/") value = "/" + value;
                return url + value;
            });
            if (typeof complete === 'function') complete();
        });
    };
}( jQuery ));
