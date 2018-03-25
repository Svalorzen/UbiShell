chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        sendResponse({
            "document": document.body.innerHTML,
            "selection": window.getSelection().toString(),
        });
    }
);
