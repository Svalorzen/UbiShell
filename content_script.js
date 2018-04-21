chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        sendResponse({
            "documentText": document.body.innerText.replace(/\u00A0/g, ' '),
            "documentHtml": document.body.innerHTML,
            "selection": window.getSelection().toString(),
        });
    }
);
