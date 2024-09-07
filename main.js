// ==UserScript==
// @name         SnakeCharmer
// @version      0.1
// @description  Mess with Ren'PyWeb games!
// @author       one-some
// @match        https://*/
// @match        http://*/
// @match        file://*/
// @grant        none
// @run-at document-end
// ==/UserScript==

// Shuddup
window.crazy = 2;

// Command queuing copyright 2022 Teyut <teyut@free.fr>, MIT License.
let cmd_queue = [];
let cur_cmd = undefined;

function allocateString(string) {
    if (!string) return;

    let size = (string.length << 2) + 1;
    let pointer = window.stackAlloc(size);
    window.stringToUTF8(string, pointer, size);

    return pointer;
}


window._renpy_cmd_callback = function(result) {
    // console.log("out", result);

    if (cur_cmd === undefined) {
        console.error('Unexpected command result', result);
        return;
    }

    try {
        if (result.error !== undefined) {
            const e = new Error(result.error);

            //// Red!
            //for (const listener of errorListeners) {
            //    listener(result.error);
            //}

            e.name = result.name;
            e.traceback = result.traceback;
            cur_cmd.reject(e);
        } else {
            cur_cmd.resolve(result.data);
        }
    } finally {
        cur_cmd = undefined;
        send_next_cmd();
    }
}

/** Prepare and send the next command to be executed if any. */
function send_next_cmd() {
    if (cmd_queue.length == 0) return;

    cur_cmd = cmd_queue.shift();

    // Convert script to base64 to prevent having to escape
    // the script content as a Python string
    const script_b64 = btoa(cur_cmd.py_script);
    const wrapper = 'import base64, emscripten, json, traceback;\n'
        + 'try:'
        + "result = None;"
        + "exec(base64.b64decode('" + script_b64 + "').decode('utf-8'));"
        + "result = json.dumps(dict(data=result));"
        + "\n"
        + "except Exception as e:"
        + "result = json.dumps(dict(error=str(e), name=e.__class__.__name__, traceback=traceback.format_exc()));"
        + "\n"
        + "emscripten.run_script('_renpy_cmd_callback(%s)' % (result,));";


    let pointer = allocateString(wrapper);
    let ret = Module._PyRun_SimpleString(pointer);
}

/** Add a command to the queue and execute it if the queue was empty. */
function add_cmd(py_script, resolve, reject) {
    const cmd = { py_script: py_script, resolve: resolve, reject: reject };
    cmd_queue.push(cmd);

    if (cur_cmd === undefined) send_next_cmd();
}

const Renpy = {
    exec(py_script) {
        // console.log("RUN", py_script);
        return new Promise((resolve, reject) => {
            add_cmd(py_script, resolve, reject);
        });
    },

    getVar(name) {
        return new Promise((resolve, reject) => {
            this.exec('result = ' + name)
                .then(resolve).catch(reject);
        });
    },
    
    setVar(name, value, raw) {
        let script;
        if (raw) {
            script = name + " = " + value + "; result = True";
        } else {
            // Using base64 as it is unclear if we can use the output
            // of JSON.stringify() directly as a Python string
            script = 'import base64, json; '
                + name + " = json.loads(base64.b64decode('"
                + btoa(JSON.stringify(value))
                + "').decode('utf-8')); result = True";
        }
        return new Promise((resolve, reject) => {
            this.exec(script)
                .then(resolve).catch(reject);
        });
    }
}

document.addEventListener("keydown", function(event) {
    if (event.key != "R") return;
    if (!event.ctrlKey) return;
    window.location.reload(true);
});

if (typeof window.presplashEnd === "undefined") {
    console.log(window.RenPyWeb);
    console.info("Bye!");
} else {
    console.log("Okay !");
    const spinCheckId = setInterval(function() {
        if (!Module.calledRun) return;
        clearInterval(spinCheckId);
        init();
    }, 100);
}

window.Renpy = Renpy;

function init() {
    console.log("Ready!");
    window.Module.printErr("HI")
    Renpy.exec("print('HELLA WORLD')")
}