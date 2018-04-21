var ubiq_last_command = "";

function ubiq_preview_el() {
    return document.getElementById('ubiq-command-preview');
}

function ubiq_result_el() {
    return document.getElementById('ubiq-result-panel');
}

function ubiq_input_el() {
    return document.getElementById('ubiq_input');
}

function ubiq_set_preview(v) {
    if (!v) return;
    var el = ubiq_preview_el();
    if (!el) return;
    el.innerHTML = v;
}

function ubiq_set_result(v) {
    if (!v) return;
    var el = ubiq_result_el();
    if (!el) return;
    el.innerHTML = v;
}

function ubiq_focus() {
    el = ubiq_input_el();
    setTimeout("el.focus()", 50);
}

function ubiq_command() {
    var cmd = ubiq_input_el();

    if (!cmd) return '';
    return cmd.value;
}

function ubiq_basic_parse(text) {
    if (!text) return null;

    var words = text.trim().split(' ');
    var command = words.shift();

    var input = words.join(' ').trim();

    // Find command element
    var cmd_struct = CmdUtils.getcmd(command);
    if (!cmd_struct) return null;

    var parsed_object = {
        text: text,
        command: command,
        input: "",
        _cmd: cmd_struct
    };

    // Init the parsed object
    for (var key in cmd_struct["options"])
        parsed_object[key] = null;

    parsed_object["args"] = [];

    var current_key = null;
    var current_value = [];
    var value_open = false

    var string_token_to_string = function(str) {
        str = String(str).trim();
        if (str === "") return "";
        // If value is between quotes, keep it even if not trimmed
        if (str[0] === str[str.length - 1] &&
            (str[0] === "'" || str[0] === '"'))
        {
            str = str.slice(1, -1);
        }
        return str;
    };

    var update_parsed = function(key, value, set_default = false) {
        if (value === null) return;
        if (key !== null) {
            if (set_default) {
                parsed_object[key] = value;
            } else {
                switch (cmd_struct["options"][key]["type"]) {
                    case "boolean": {
                        parsed_object[key] = Boolean(value);
                        break;
                    }
                    case "string": {
                        value = String(value).trim();
                        if (value === "") return;
                        parsed_object[key] = value;
                        break;
                    }
                    case "list": {
                        value = string_token_to_string(value);
                        if (value === "") return;
                        if (!parsed_object[key]) parsed_object[key] = [value];
                        else parsed_object[key].push(value);
                        break;
                    }
                };
            }
            // Add the new key in the args, so that they are sorted by
            // apparition.
            if (parsed_object["args"].indexOf(key) === -1)
                parsed_object["args"].push(key);
        } else {
            parsed_object["input"] = parsed_object["input"].concat(" ").concat(value).trim();
        }
    };

    for (var i = 0; i < words.length; i++) {
        // Option names bypass quotes
        if (words[i].startsWith("-") && words[i].substr(1) in cmd_struct["options"]) {
            // If a multi-token word was open, but we got the option, we
            // add what we had anyway to the previous key.
            if (value_open !== false) {
                update_parsed(current_key, current_value.join(' '));
                value_open = false
                current_value = []
            }
            // Then we signal we're going to add a word to this key now.
            current_key = words[i].substr(1);
            // But if the key is a bool (matters only if it is present or
            // not), then we simply set it as true and we're done.
            if (cmd_struct["options"][current_key]["type"] === "boolean") {
                update_parsed(current_key, true);
                current_key = null;
            }
            continue;
        }
        // If in the middle of parsing a multi-word token
        if (value_open !== false) {
            // If it does not end with the same token with which it
            // started, we add it to the list.
            if (!words[i].endsWith(value_open)) {
                current_value.push(words[i]);
                continue;
            }
            // Otherwise we are done, and we merge the various tokens.
            current_value.push(words[i]);
            value_open = false

            current_value = current_value.join(' ');
        } else if ((words[i].startsWith("'") || words[i].startsWith('"')) && value_open === false) {
            // If the word starts with a quote, check if it also ends with
            // it, otherwise start a new multi-token word.
            if (words[i].endsWith(words[i][0])) {
                current_value = words[i];
            } else {
                value_open = words[i][0];

                current_value.push(words[i]);
                continue;
            }
        } else {
            // If no quotes, we simply add the word as-is
            current_value = words[i];
        }
        // Add value to key
        update_parsed(current_key, current_value);
        // Clear both value and key
        current_value = []
        current_key = null
    }
    // Add options that were defaulted and not specified
    for (key in cmd_struct["options"])
        if ("def" in cmd_struct["options"][key] && parsed_object["args"].indexOf(key) === -1)
            update_parsed(key, cmd_struct["options"][key]["def"], true);

    return parsed_object;
}

function ubiq_process_pipe(values, parsed) {
    for (var key in parsed) {
        for (var pipeKey in values) {
            var token = "{" + pipeKey + "}";
            // If we have to add this into a string
            if (typeof(parsed[key]) === "string") {
                var replacement = values[pipeKey];
                // If we have a list, we wrap it with quotes and stitch it with spaces.
                if (Array.isArray(values[pipeKey]))
                    replacement = values[pipeKey].join(' ');

                parsed[key] = parsed[key].replace(token, replacement);
            }
            // If we have to add it into a list
            else if (Array.isArray(parsed[key])) {
                // We merge ours in place of the token with splice
                var replacement = [values[pipeKey]];
                // If we also have a list, we don't need to wrap it into array.
                if (Array.isArray(values[pipeKey]))
                    replacement = values[pipeKey];

                for (var i = 0; i < parsed[key].length; ++i) {
                    // If an element in the list matches
                    if (parsed[key][i] === token) {
                        // Replace it with ours, and skip the ones we added
                        parsed[key].splice(i, 1, ...replacement);
                        i += replacement.length - 1;
                    }
                }
            }
        }
    }
    parsed['pipe'] = values;
}

function ubiq_command_icon(parsed) {
    var icon = parsed._cmd.icon;
    if (!icon)
        icon = 'res/spacer.png';

    return '<img src="' + icon + '" border="0" alt="" align="absmiddle"> ';
}

// html-escape
// todo: rewrite it without inline div creation...
var ubiq_html_encoder = null;
function ubiq_html_encode(text) {
    if (!ubiq_html_encoder)
        ubiq_html_encoder = $('<div>')
    return ubiq_html_encoder.html(text).text();
}

function ubiq_complete_command(text) {
    if (!text) text = ubiq_command();

    var words = text.split(' ');
    if (words.length > 1) return null;

    var command = words[0];
    if (command.length == 0) return null;

    matches = [];
    for (var c in CmdUtils.CommandList) {
        var cmdnames = CmdUtils.CommandList[c].names;
        for (var cmd of cmdnames)
            if (cmd.startsWith(command))
                matches.push(cmd);
    }

    if (matches.length == 0) return null;
    if (matches.length == 1) return matches[0];

    ubiq_set_preview(matches.join(', '));
    return null;
}

function ubiq_show_command_options(pipeVals, parsed) {
    function markValue(v) {
        var str;
        if (Array.isArray(v)) {
            if (v.length > 0) {
                str = "<mark>" + ubiq_html_encode(v[0]) + "</mark>";
                for (var i = 1; i < v.length; ++i)
                    str += ", <mark>" + String(v[i]) + "</mark>";
            }
        }
        else str = "<mark>" + String(v) + "</mark>";
        return str;
    }

    ubiq_set_result("");
    if (!pipeVals || !parsed) return;

    var cmd_struct = parsed._cmd;
    if (!("options" in cmd_struct)) return;

    var options_div = document.createElement('div');
    var options_list = document.createElement('ul');

    // PIPE VALUES (available for current command)
    if (Object.keys(pipeVals).length > 0) {
        li = document.createElement('LI');
        li.innerHTML = "AVAILABLE VALUES";
        li.setAttribute('class', 'pipe');
        options_list.appendChild(li);
    }
    for (var key in pipeVals) {
        li = document.createElement('LI');
        li.innerHTML = key + " => " + markValue(pipeVals[key]);

        options_list.appendChild(li);
    }

    // COMMAND VALUES (current values for current visualized command)
    li = document.createElement('LI');
    li.innerHTML = ubiq_command_icon(parsed) + ubiq_html_encode(parsed.command.toUpperCase());
    li.setAttribute('class', 'command');
    options_list.appendChild(li);
    for (var key in cmd_struct["options"]) {
        li = document.createElement('LI');
        var val = cmd_struct["options"][key]["type"];
        if (parsed[key] !== null)
            val = parsed[key];
        li.innerHTML = key + " => " + markValue(val);

        options_list.appendChild(li);
    }

    li = document.createElement('LI');
    li.innerHTML = "input => " + markValue(parsed["input"]);
    options_list.appendChild(li);

    options_div.appendChild(options_list);
    ubiq_set_result(options_div.innerHTML);
}

async function ubiq_generate_output(parsed) {
    var cmd_struct = parsed._cmd;

    var resultRequire = true;
    var resultRequirePopup = true;

    if (typeof cmd_struct.require !== 'undefined')
        resultRequire = CmdUtils.loadScripts(cmd_struct.require);
    if (typeof cmd_struct.requirePopup !== 'undefined')
        resultRequirePopup = CmdUtils.loadScripts( cmd_struct.requirePopup, window );

    var result = await resultRequire && await resultRequirePopup;

    if (result)
        return await cmd_struct.output(parsed);
    else
        return {};
}

async function ubiq_show_preview(parsed_promise) {
    if (!parsed_promise) return;
    parsed = await parsed_promise;

    var pblock = ubiq_preview_el();

    var cmd_struct = parsed._cmd;
    var preview_func = cmd_struct.preview;

    switch(typeof preview_func) {
        case 'undefined':
            ubiq_set_preview(cmd_struct.description);
            break;

        case 'string':
            ubiq_set_preview(preview_func);
            break;

        default:
            var resultRequire = true;
            var resultRequirePopup = true;

            if (typeof cmd_struct.require !== 'undefined')
                resultRequire = CmdUtils.loadScripts(cmd_struct.require);
            if (typeof cmd_struct.requirePopup !== 'undefined')
                resultRequirePopup = CmdUtils.loadScripts( cmd_struct.requirePopup, window );

            var result = await resultRequire && await resultRequirePopup;
            if (!result) {
                ubiq_set_preview("Failed to load some scripts...");
                return;
            }

            // zoom overflow dirty fix
            CmdUtils.popupWindow.jQuery("#ubiq-command-preview").css("overflow-y", "auto");
            try {
                await cmd_struct.preview(pblock, parsed);
            } catch (e) {
                CmdUtils.notify(e.toString(), "preview function error")
                console.error(e.stack);
                if (CmdUtils.backgroundWindow && CmdUtils.backgroundWindow.error) {
                    CmdUtils.backgroundWindow.error(e.stack);
                }
            }
            break;
    }
    return;
}

async function ubiq_execute(parsed_promise) {
    if (!parsed_promise)
        return;
    var parsed = await parsed_promise;
    var cmd_func = parsed._cmd.execute;

    // Run command's "execute" function
    try {
        CmdUtils.deblog("executing [", parsed.cmd ,"] [", parsed.input ,"]");
        cmd_func(parsed);
        CmdUtils.closePopup();
    } catch (e) {
        CmdUtils.notify(e.toString(), "execute function error")
        console.error(e.stack);
        CmdUtils.backgroundWindow.error(e.stack);
    }

    return;
}

async function ubiq_process_input() {
    var text = ubiq_command();
    var texts = text.split('|').map(str => str.trim()).filter(str => str !== "");

    var sel = null;
    if (CmdUtils.active_tab) {
        var s = CmdUtils.active_tab.selection.trim();
        if (s !== "") sel = s;
    }

    var pipeVals = {};
    for (var i = 0; i < texts.length - 1; i++) {
        var t = texts[i];

        if (sel) pipeVals["sel"] = sel;

        var parsed = ubiq_basic_parse(t);
        if (!parsed) return;
        ubiq_process_pipe(pipeVals, parsed);

        pipeVals = await ubiq_generate_output(parsed);
    }
    if (sel) pipeVals["sel"] = sel;

    var parsed = ubiq_basic_parse(texts[i]);
    if (!parsed) return;
    ubiq_process_pipe(pipeVals, parsed);
    ubiq_show_command_options(pipeVals, parsed);
    return parsed;
}

// Main loop, everything begins from here.
function ubiq_keyup_handler(evt) {
    // measure the input
    CmdUtils.inputUpdateTime = performance.now();
    var ubiq_input_changed = ubiq_save_input();

    if (evt) {
        var kc = evt.keyCode;

        // On ENTER, execute the given command
        if (kc == 13) {
            var parsed = ubiq_process_input();
            ubiq_execute(parsed);
            CmdUtils.closePopup();
            return;
        }

        // On TAB, try to autocomplete command
        else if (kc == 9) {
            command = ubiq_complete_command();
            if (command !== null) {
                ubiq_input_el().value = command;
                ubiq_input_changed = ubiq_save_input();
            }
            ubiq_focus();
        }

        // On F5 restart extension
        else if (kc == 116) {
            chrome.runtime.reload();
            return;
        }

        // Ctrl+C copies preview to clipboard
        else if (kc == 67 && evt.ctrlKey) {
            backgroundPage.console.log("copy to clip");
            var el = ubiq_preview_el();
            if (!el) return;
            CmdUtils.setClipboard( el.innerText );
        }
    }

    if (ubiq_input_changed) {
        var parsed = ubiq_process_input();
        ubiq_show_preview(parsed);
    }
}

function ubiq_save_input() {
    var cmd = ubiq_input_el().value;

    ubiq_input_changed = cmd.trim() !== ubiq_last_command.trim();
    ubiq_last_command = cmd;

    if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.set({ 'lastCmd': cmd });

    return ubiq_input_changed;
}

function ubiq_load_input() {
    var cmd = ubiq_input_el();
    if (typeof chrome === 'undefined' || !chrome.storage)
        return;

    return new Promise(function(resolve, reject) {
        chrome.storage.local.get('lastCmd', function(result) {
            lastCmd = result.lastCmd || "";
            cmd.value = lastCmd;
            cmd.select();
            return resolve();
        });
    });
}

$(window).on('load', async function() {
    if (typeof CmdUtils !== 'undefined' && typeof Utils !== 'undefined' && typeof backgroundPage !== 'undefined' ) {
        CmdUtils.setPreview = ubiq_set_preview;
        CmdUtils.popupWindow = window;

        await CmdUtils.updateActiveTab();

        await ubiq_load_input();
        ubiq_keyup_handler(null);

        // Add event handler to window
        document.addEventListener('keyup', function(e) { ubiq_keyup_handler(e); }, false);

        console.log("hello from UbiChr");
    } else {
        chrome.tabs.create({ "url": "chrome://extensions" });
        chrome.notifications.create({
            "type": "basic",
            "iconUrl": chrome.extension.getURL("res/icon-128.png"),
            "title": "UbiChr",
            "message": "there is something wrong, try restarting UbiChr"
        });
    }
});
