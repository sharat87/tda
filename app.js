const Status = {
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

Vue.component('f-time', {
    template: '<time>{{ formattedTime }}</time>',
    props: ['time'],
    computed: {
        formattedTime: function () {
            const minutes = this.time.getUTCMinutes(), seconds = this.time.getUTCSeconds();
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return this.time.getUTCHours() + ':' + (minutes > 9 ? '' : '0') + minutes + ':' + (seconds > 9 ? '' : '0') +
                seconds + ', ' + this.time.getUTCDate() + ' ' + monthNames[this.time.getUTCMonth()] + ' ' +
                this.time.getUTCFullYear();
        }
    }
});

// FIXME: Not working!
Vue.component('close-btn', {
    template: '<a href="#" class="close-btn"><i class="fa fa-window-close"></i></a>'
});

Vue.component('dump-list-pane', {
    template: document.getElementById('dump-list-tpl').textContent,
    props: ['dumps', 'threadMap'],

    data: function () {
        return {
            activeDump: null,
            threadFilter: ''
        };
    },

    computed: {

        hangSuspects: function () {
            const hangSuspects = [];

            for (const threadName in this.threadMap) {
                if (!this.threadMap.hasOwnProperty(threadName)) continue;
                const threads = this.threadMap[threadName];

                if (!threads[threads.length - 1])
                    continue;

                for (let i = threads.length; i-- > 0;) {
                    const thread = threads[i];
                    if (thread !== '=DO=' && thread.status.name.indexOf('WAIT') >= 0)
                        hangSuspects.push(thread);
                }
            }

            hangSuspects.sort(function (t1, t2) {
                return t1.name < t2.name ? -1 : 1;
            });
            return hangSuspects;
        },

        activeDumpThreadsFiltered: function () {
            if (!this.activeDump) return [];
            const filtered = [], needle = this.threadFilter;

            if (!needle)
                return this.activeDump.threads;

            for (let i = 0; i < this.activeDump.threads.length; ++i) {
                if (this.activeDump.threads[i].name.indexOf(needle) >= 0) {
                    filtered.push(this.activeDump.threads[i]);
                }
            }

            return filtered;
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
            const emptyThreadNames = new Set();

            for (const threadName in this.threadMap) {
                if (!this.threadMap.hasOwnProperty(threadName)) continue;
                const threads = this.threadMap[threadName];
                let isEmpty = true;
                for (let i = threads.length; i-- > 0;) {
                    if (threads[i] && threads[i].stack) {
                        isEmpty = false;
                        break;
                    }
                }
                if (isEmpty)
                    emptyThreadNames.add(threadName);
            }

            return emptyThreadNames;
        },

        stackIndex: function () {
            console.log('Building stack index.');
            const words = new Set(), map = new Map();

            for (const threadName in this.threadMap) {
                if (!this.threadMap.hasOwnProperty(threadName)) continue;
                const threads = this.threadMap[threadName];
                for (let i = 0; i <= threads.length; ++i) {
                    const thread = threads[i];
                    if (!thread)
                        continue;

                    const tokens = thread.stack.split(/\W+/);
                    for (let k = tokens.length; k-- > 0;) {
                        const tok = tokens[k].toLowerCase();

                        if (!tok || tok === 'at' || tok.match(/^\d+$/))
                            continue;

                        if (map.has(tok)) {
                            map.get(tok).add(thread.name);
                        } else {
                            map.set(tok, new Set([thread.name]));
                            words.add(tok);
                        }
                    }

                    if (thread.span)
                        i += thread.span - 1;
                }
            }

            console.log('Words in index:', words.size);
            console.log(map);

            return {
                words: words,
                map: map
            };
        },

        stackMatchedThreads: function () {
            if (!this.stackFilter) return null;

            const stackMatchedThreads = new Set();

            const index = this.stackIndex, needle = this.stackFilter.toLowerCase();
            for (let word of index.words)
                if (word.indexOf(needle) >= 0) {
                    const matched = index.map.get(word);
                    for (const key of matched)
                        stackMatchedThreads.add(key);
                }

            return stackMatchedThreads;
        },

        threadMapFiltered: function () {
            console.log('Filtering thread map.');

            // TODO: Search among previous search results, when possible.

            for (const threadName in this.threadMap) {
                if (!this.threadMap.hasOwnProperty(threadName)) continue;

                let show = true;
                if (this.hideEmptyThreads && this.emptyThreads.has(threadName))
                    show = false;

                else if (this.threadsFilter && threadName.indexOf(this.threadsFilter) < 0)
                    show = false;

                else if (this.stackFilter && !this.stackMatchedThreads.has(threadName))
                    show = false;

                this.threadMap[threadName]._show = show;
            }

            console.log('Done filtering.');
            return this.threadMap;
        }

    }

});

const app = new Vue({
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
            const table = {}, lastThreadObj = {};

            for (let i = 0; i < this.dumps.length; ++i) {
                const dump = this.dumps[i];
                for (let j = dump.threads.length; j-- > 0;) {
                    const thread = dump.threads[j];
                    if (!table[thread.name])
                        table[thread.name] = new Array(this.dumps.length);
                    if (lastThreadObj[thread.name]) {
                        const lastThread = lastThreadObj[thread.name];
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
    const files = e.dataTransfer.files;
    console.log(files);
    const dumps = [];
    let remainingFiles = files.length;
    app.isLoading = true;

    for (let i = 0, file; file = files[i]; i++) {
        const reader = new FileReader();
        reader.onload = getFileReadCallback(file);
        reader.readAsText(file);
    }

    function getFileReadCallback(file) {
        return function (event) {
            const dump = parseDump(event.target.result);
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
    const blocks = text.trim().split('\n\n');
    const dump = {
        title: blocks[0].split('\n')[1],
        threads: [],
        raw: text,
        statusCounts: [],
        methodCounts: []
    };

    dump.time = new Date(blocks[0].split('\n')[0]);
    const statusCountsMap = {}, methodCountsMap = {};

    for (let i = 1; i < blocks.length; ++i) {
        if (blocks[i].startsWith('JNI global references: ')) {
            dump.jniGlobalReferences = parseInt(blocks[i].split(': ')[1]);
            continue;
        }

        const lines = blocks[i].split('\n');

        if (lines[0].trim() === 'Locked ownable synchronizers:') {
            // TODO: Locked ownable synchronizers data discarded.
            continue;
        }

        let j = 0;
        let match = lines[j].match(/"(.+)" .+? ([^=\[]+)(\s*\[0x[a-f0-9]+])?$/);
        if (!match) {
            console.warn('Unable to parse: ', lines[j]);
            continue;
        }
        const thread = {
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
        statusCountsMap[thread.status.name] = (statusCountsMap[thread.status.name] || 0) + 1;
        methodCountsMap[thread.method] = (methodCountsMap[thread.method] || 0) + 1;
    }

    const percentFactor = 100 / dump.threads.length;
    for (let key in statusCountsMap) {
        if (statusCountsMap.hasOwnProperty(key))
            dump.statusCounts.push({
                status: key,
                count: statusCountsMap[key],
                percentage: Math.round(percentFactor * statusCountsMap[key])
            });
    }
    dump.statusCounts.sort(countSorter);

    for (let key in methodCountsMap) {
        if (methodCountsMap.hasOwnProperty(key))
            dump.methodCounts.push({
                method: key,
                count: methodCountsMap[key],
                percentage: Math.round(percentFactor * methodCountsMap[key])
            });
    }
    dump.methodCounts.sort(countSorter);

    return dump;

    function countSorter(a, b) {
        return b.count - a.count;
    }
}