function safeInnerHTML(str) {
    str = '' + str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').
      replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function errorHandler(msg, source, lineno, colno, err) {
    if (!source) source = '?';
    if (lineno == null) colno = '?';
    if (colno == null) colno = '?';
    var stack = 'none';
    try {
      stack = err ? 'none' : err.stack;
    }
    catch (x) {
      stack = 'browser internel error';
    }
    window.onerror = null;
    document.getElementById('alert').style.visibility = 'visible';
    var programName = document.title || 'This program';
    var des =
      programName +' has encountered an error' + '\n' +
      msg + '\n';
    if (msg.match(/script error/i)) {
        des += 'see Browser Console for more information';
    }
    else {
        des +=
          'source: ' + source + '\n' +
          'position: ' + lineno + ',' + colno + '\n' +
          'stack trace: \n' + stack;
    }
    document.getElementById('description').innerHTML = safeInnerHTML(des);
}

function closeErrorBox() {
    document.getElementById('alert').style.visibility = 'hidden';
    window.onerror = errorHandler;
}

// Add error handler
window.onerror = errorHandler;
document.getElementById('close').onclick = closeErrorBox;

function doesNothing() {}

var promptCallback = doesNothing;
function promptBox(message, defaultValue, callback) {
    var box = document.getElementById('prompt');
    var msg = document.getElementById('promptMessage')
    var input = document.getElementById('promptInput');
    if (typeof message == 'undefined') {
        message = '';
    }
    msg.innerHTML = safeInnerHTML(message);
    if (typeof defaultValue == 'undefined') {
        defaultValue = '';
    }
    if (!callback) {
        callback = function (result) {
            console.log(result);
        };
    }
    input.value = defaultValue;
    input.style.display = '';
    box.style.visibility = 'visible';
    input.focus();
    document.getElementById('promptCancel').style.display = '';
    promptCallback = function (ok) {
        box.style.visibility = 'hidden';
        promptCallback = doesNothing;
        if (ok) {
            callback(input.value);
        }
        else {
            callback(null);
        }
    };
}

function alertBox(message, callback) {
    var box = document.getElementById('prompt');
    var msg = document.getElementById('promptMessage')
    var input = document.getElementById('promptInput');
    var ok = document.getElementById('promptOK');
    if (typeof message == 'undefined') {
        message = '';
    }
    msg.innerHTML = safeInnerHTML(message);
    if (!callback) {
        callback = function () {};
    }
    input.style.display = 'none';
    box.style.visibility = 'visible';
    document.getElementById('promptCancel').style.display = 'none';
    promptCallback = function (ok) {
        box.style.visibility = 'hidden';
        promptCallback = doesNothing;
        callback();
    };
    ok.focus();
}

function confirmBox(message, callback) {
    var box = document.getElementById('prompt');
    var msg = document.getElementById('promptMessage');
    var input = document.getElementById('promptInput');
    var ok = document.getElementById('promptOK');
    if (typeof message == 'undefined') {
        message = '';
    }
    msg.innerHTML = safeInnerHTML(message);
    if (typeof defaultValue == 'undefined') {
        defaultValue = '';
    }
    if (!callback) {
        callback = function (result) {
            console.log(result);
        };
    }
    input.style.display = 'none';
    box.style.visibility = 'visible';
    ok.focus();
    document.getElementById('promptCancel').style.display = '';
    promptCallback = function (ok) {
        box.style.visibility = 'hidden';
        promptCallback = doesNothing;
        if (ok) {
            callback(true);
        }
        else {
            callback(false);
        }
    };
}

function errorbox(err) {
    lastError = err;
    if (err.target && err.target.error)
        errorbox(err.target.error);
    else
        onerror(err+'', err.filename, err.lineNumber, err.columnNumber, err);
}
