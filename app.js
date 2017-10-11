var Status = {
    DEADLOCK: {name: 'DEADLOCK', raw: '', icon: 'fa-question-circle'},
    RUNNABLE: {name: 'RUNNABLE', raw: 'runnable', icon: 'fa-play-circle-o'},
    WAIT_CONDITION: {name: 'WAIT_CONDITION', raw: 'waiting on condition', icon: 'fa-moon-o'},
    WAIT_MONITOR: {name: 'WAIT_MONITOR', raw: '', icon: 'fa-clock-o'},
    SUSPENDED: {name: 'SUSPENDED', raw: '', icon: 'fa-question-circle'},
    OBJECT_WAIT: {name: 'OBJECT_WAIT', raw: 'in Object.wait()', icon: 'fa-clock-o'},
    BLOCKED: {name: 'BLOCKED', raw: '', icon: 'fa-question-circle'},
    PARKED: {name: 'PARKED', raw: '', icon: 'fa-question-circle'},
    UNKNOWN: {name: 'UNKNOWN', raw: '', icon: 'fa-times'},
    SLEEPING: {name: 'SLEEPING', raw: 'sleeping', icon: 'fa-times'},

    get: function (text) {
        switch (text) {
            case Status.RUNNABLE.raw:
                return Status.RUNNABLE;
            case Status.WAIT_CONDITION.raw:
                return Status.WAIT_CONDITION;
            case Status.OBJECT_WAIT.raw:
                return Status.OBJECT_WAIT;
            case Status.SLEEPING.raw:
                return Status.SLEEPING;
        }
        console.warn('Unknown status text: ' + text);
        return Status.UNKNOWN;
    }
};

Vue.component('dump-list-pane', {
    template: document.getElementById('dump-list-tpl').textContent,
    props: ['dumps', 'threadMap'],

    data: function () {
        return {
            activeDump: null
        };
    },

    computed: {

        hangSuspects: function () {
            var hangSuspects = [];

            for (var threadName in this.threadMap) {
                if (!this.threadMap.hasOwnProperty(threadName)) continue;
                var threads = this.threadMap[threadName];

                if (!threads[threads.length - 1])
                    continue;

                for (var i = threads.length; i-- > 0;) {
                    var thread = threads[i];
                    if (thread !== '=DO=' && thread.status.name.indexOf('WAIT') >= 0)
                        hangSuspects.push(thread);
                }
            }

            hangSuspects.sort(function (t1, t2) {
                return t1.name < t2.name ? -1 : 1;
            });
            return hangSuspects;
        }

    }

});

Vue.component('compare-thread-pane', {
    template: document.getElementById('compare-thread-tpl').textContent,
    props: ['dumps', 'threadMap'],

    data: function () {
        return {
            activeThread: null,
            threadsFilter: '',
            stackFilter: '',
            hideEmptyThreads: false,
            threadEmptiness: {}
        }
    },

    computed: {

        emptyThreads: function () {
            console.log('Building empty thread list.');
            var emptyThreadNames = [];

            for (var threadName in this.threadMap) {
                if (!this.threadMap.hasOwnProperty(threadName)) continue;
                var threads = this.threadMap[threadName], isEmpty = true;
                for (var i = threads.length; i-- > 0;) {
                    if (threads[i] && threads[i].stack) {
                        isEmpty = false;
                        break;
                    }
                }
                if (isEmpty)
                    emptyThreadNames.push(threadName);
            }

            return emptyThreadNames;
        },

        stackIndex: function () {
            console.log('Building stack index.');
            var words = [], map = {};

            for (var threadName in this.threadMap) {
                if (!this.threadMap.hasOwnProperty(threadName)) continue;
                var threads = this.threadMap[threadName];
                for (var i = 0; i <= threads.length; ++i) {
                    var thread = threads[i];
                    if (!thread)
                        continue;

                    var tokens = thread.stack.split(/\W+/);
                    for (var k = tokens.length; k-- > 0;) {
                        var tok = tokens[k].toLowerCase();

                        if (!tok || tok === 'at' || tok.match(/^\d+$/))
                            continue;

                        if (!map[tok]) {
                            map[tok] = {};
                            words.push(tok);
                        }

                        map[tok][thread.name] = 1;
                    }

                    if (thread.span)
                        i += thread.span - 1;
                }
            }

            console.log('Words in index:', words.length);
            console.log(map);
            words.sort();

            return {
                words: words,
                map: map
            };
        },

        threadMapFiltered: function () {
            console.log('Filtering thread map.');

            // TODO: Search among previous search results, when possible.

            if (this.stackFilter) {
                var index = this.stackIndex, needle = this.stackFilter.toLowerCase();
                var stackMatchedThreads = {};
                for (var i = index.words.length; i-- > 0;) {
                    if (index.words[i].indexOf(needle) >= 0) {
                        var matched = index.map[index.words[i]];
                        for (var key in matched)
                            if (matched.hasOwnProperty(key))
                                stackMatchedThreads[key] = 1;
                    }
                }
            }

            for (var threadName in this.threadMap) {
                if (!this.threadMap.hasOwnProperty(threadName)) continue;

                var show = true;
                if (this.hideEmptyThreads && this.emptyThreads.indexOf(threadName) >= 0)
                    show = false;

                else if (this.threadsFilter && threadName.indexOf(this.threadsFilter) < 0)
                    show = false;

                else if (this.stackFilter && !stackMatchedThreads[threadName])
                    show = false;

                this.threadMap[threadName]._show = show;
            }

            console.log('Done filtering.');
            return this.threadMap;
        }

    }

});

var app = new Vue({
    el: '#top',

    data: {
        activePane: 1,
        dumps: [],
        showAboutOverlay: true,
        isLoading: false
    },

    computed: {

        threadMap: function () {
            console.log('Constructing thread map.');
            var table = {}, lastThreadObj = {};

            for (var i = 0; i < this.dumps.length; ++i) {
                var dump = this.dumps[i];
                for (var j = dump.threads.length; j-- > 0;) {
                    var thread = dump.threads[j];
                    if (!table[thread.name])
                        table[thread.name] = new Array(this.dumps.length);
                    if (lastThreadObj[thread.name]) {
                        var lastThread = lastThreadObj[thread.name];
                        if (lastThread.stack === thread.stack && lastThread.status === thread.status) {
                            lastThread.span = (lastThread.span || 1) + 1;
                            table[thread.name][i] = '=DO=';
                            continue;
                        }
                    }
                    table[thread.name][i] = thread;
                    if (thread)
                        lastThreadObj[thread.name] = thread;
                }
            }

            return table;
        }

    },

    methods: {
        drop: onDropped
    }
});

function onDropped(e) {
    var files = e.dataTransfer.files;
    console.log(files);
    var dumps = [];
    var remainingFiles = files.length;
    app.isLoading = true;

    for (var i = 0, file; file = files[i]; i++) {
        var reader = new FileReader();
        reader.onload = getFileReadCallback(file);
        reader.readAsText(file);
    }

    function getFileReadCallback(file) {
        return function (event) {
            var dump = parseDump(event.target.result);
            dump.id = app.dumps.length;
            dump.file = file;
            dump.event = event;
            dumps.push(dump);
            done();
        }
    }

    function done() {
        if (--remainingFiles) return;
        app.dumps.push.apply(app.dumps, dumps);
        app.dumps.sort(function (d1, d2) {
            return d1.time - d2.time;
        });
        app.isLoading = app.showAboutOverlay = false;
    }
}

function parseDump(text) {
    var dump = {raw: text}, blocks = text.trim().split('\n\n');
    dump.time = new Date(blocks[0].split('\n')[0]);
    dump.title = blocks[0].split('\n')[1];
    dump.threads = [];
    dump.statusCounts = {};
    dump.methodCounts = {};

    for (var i = 1; i < blocks.length; ++i) {
        if (blocks[i].startsWith('JNI global references: ')) {
            dump.jniGlobalReferences = parseInt(blocks[i].split(': ')[1]);
            continue;
        }

        var lines = blocks[i].split('\n');

        if (lines[0].trim() === 'Locked ownable synchronizers:') {
            // TODO: Locked ownable synchronizers data discarded.
            continue;
        }

        var j = 0;
        var match = lines[j].match(/"(.+)" .+? ([^=\[]+)(\s*\[0x[a-f0-9]+])?$/);
        if (!match) {
            console.warn('Unable to parse: ', lines[j]);
            continue;
        }
        var thread = {
            name: match[1],
            status: Status.get(match[2].trim())
        };

        ++j;
        thread.state = Status.UNKNOWN;
        if (lines[j] && lines[j].trim().startsWith('java.lang.Thread.State: ')) {
            thread.state = lines[j].split(': ')[j];
            ++j;
        }

        if (!lines[j]) {
            thread.method = '';
        } else if (lines[j].trim().startsWith('at ')) {
            thread.method = lines[j].substr(3);
        }

        thread.stack = lines.slice(j).join('\n');

        dump.threads.push(thread);
        dump.statusCounts[thread.status.name] = (dump.statusCounts[thread.status.name] || 0) + 1;
        dump.methodCounts[thread.method] = (dump.methodCounts[thread.method] || 0) + 1;
    }

    return dump;
}