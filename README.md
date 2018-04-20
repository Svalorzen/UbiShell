Introduction
============

UbiShell is a fork of [ubichr](https://github.com/rostok/ubichr), created with
the approval of the author. It's a port of the original
[Ubiquity](https://wiki.mozilla.org/Labs/Ubiquity) addon to WebExtension.

UbiShell has the goal of creating a shell-like interface to the Web. While the
original Ubiquity tried to create a natural language interface, we believe that
it's better to have a deterministic, easy-to-understand interface for this tool.

![Example](https://user-images.githubusercontent.com/1609228/39069575-7a1780e8-44e0-11e8-96a6-f4ee7e8b7599.gif)

How Does It Work?
=================

UbiShell executes JavaScript commands that are defined by you, and can provide
instantaneous feedback. A very simple example would be to search on a given
website, without the need to first access the website.

But UbiShell can be much more powerful than that. It can run arbitrary commands,
and can pipe the result from a command to another, and all this while having
access to both the Web, and the webpages rendered in your browser. You can look
for certain strings in a webpage, pipe them to a mapping service, and send the
resulting image by email to a friend! And all this without having to do any
operation manually.

Installation
============

As it is based on WebExtensions, UbiShell supports both Chrome and Firefox.

This version of the addon has not yet been published, so you'll have to load it
as a developer extension at the moment. You can do it by following the
instructions below.

- [Install for Chrome](https://developer.chrome.com/extensions/getstarted)
- [Install for Firefox](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Temporary_Installation_in_Firefox)

License
=======

MIT license

Adding Commands
===============

The main power of Ubiquity, which is also shared by UbiShell, is that you can
define your own commands (and copy them from other people!). This allows your
shell interface to grow depending on the commands that *you* find useful.

You can add your own custom commands using the built-in editor (CodeMirror) or
by modifying the `commands.js` file directly. Below is an example to get you
started. You can use *any* JavaScript in the commands!

```javascript
// You can add a new command to UbiShell by using the CreateCommand function.
CmdUtils.CreateCommand({
    // You have to give a name to your command, and can optionally add some more
    // informations in it.
    name: "example",
    description: "A short description of your command.",
    author: "Your Name",
    icon: "http://www.mozilla.com/favicon.ico",
    // You can define options to your command. They will be called by typing
    // their name preceded by '-' (so for example -from).
    //
    // For each option, you can define its type as 'list', 'string' or
    // 'boolean'. A boolean option is true if it has been typed by the user.
    // If needed, the option can be given a default value.
    options: {
        from: { type: "list", def: ["London", "Paris"] },
        to: { type: "string" },
        time: { type: "string", def: "now" },
    },
    // This simple command opens a webpage when executed (pressing Enter).
    execute: CmdUtils.SimpleUrlBasedCommand(
        "http://www.google.com/search?client=opera&num=1&q={text}&ie=utf-8&oe=utf-8"
    ),
    // Otherwise, you can define a proper JavaScript function by hand (note that
    // the 'execute' function does not get the 'pblock' parameter). This is
    // executed every time the input changes.
    preview: async function preview(pblock, args) {
        // The args parameter contains all the inputs of your program. In
        // particular it contains:
        //
        // - text: The whole command as typed by the user
        // - command: The command name as typed by the user
        // - input: The free input to your command
        // - A series of keys, one for each option you defined. In this case the
        //   options would be 'from', 'to' and 'time.
        input = args.input

        // You can request content from outside using async and await.
        var doc = await CmdUtils.get("http://www.imdb.com/find?q="+encodeURIComponent(input)+"&s=tt&ref_=fn_al_tt_mr" );

        // In the preview function, you can show results by writing to the
        // innerHTML field of the pblock parameter.
        pblock.innerHTML = "<table>"+jQuery("table.findList", doc).html()+"</table>";
    },
});
```

Contributing
============

There is a *ton* to do to improve UbiShell. You can add more commands to the
default set, improve existing commands or add functionality to them, improve the
design and GUI of UbiShell..

Additionally, you can help test the system on both Firefox and Chrome, so that
it can run smoothly on both platforms.

The old Ubiquity used to have a huge community making commands, and that was one
of its core strengths. This project really needs your help if it is to succeed.
