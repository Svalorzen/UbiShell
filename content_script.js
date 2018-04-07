chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        sendResponse({
            "documentText": document.body.innerText,
            "documentHtml": document.body.innerHTML,
            "selection": window.getSelection().toString(),
        });
    }
);
