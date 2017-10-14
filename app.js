Set.prototype.union = function (setB) {
    for (const elem of setB)
        this.add(elem);
};

Set.prototype.intersect = function (setB) {
    for (const elem of this)
        if (!setB.has(elem))
            this.delete(elem);
};

const Status = {
    DEADLOCK: {name: 'DEADLOCK', raw: '', icon: 'fa-question-circle'},
    RUNNABLE: {name: 'RUNNABLE', raw: 'runnable', icon: 'fa-play-circle-o'},
    WAIT_CONDITION: {name: 'WAIT_CONDITION', raw: 'waiting on condition', icon: 'fa-moon-o'},
    WAIT_MONITOR: {name: 'WAIT_MONITOR', raw: 'waiting for monitor entry', icon: 'fa-eye'},
    SUSPENDED: {name: 'SUSPENDED', raw: '', icon: 'fa-question-circle'},
    OBJECT_WAIT: {name: 'OBJECT_WAIT', raw: 'in Object.wait()', icon: 'fa-clock-o'},
    BLOCKED: {name: 'BLOCKED', raw: 'sleeping', icon: 'fa-question-circle'},
    PARKED: {name: 'PARKED', raw: '', icon: 'fa-ban'},
    UNKNOWN: {name: 'UNKNOWN', raw: '', icon: 'fa-times'},

    get: function (text) {
        switch (text) {
            case Status.RUNNABLE.raw:
                return Status.RUNNABLE;
            case Status.WAIT_CONDITION.raw:
                return Status.WAIT_CONDITION;
            case Status.WAIT_MONITOR.raw:
                return Status.WAIT_MONITOR;
            case Status.OBJECT_WAIT.raw:
                return Status.OBJECT_WAIT;
            case Status.BLOCKED.raw:
                return Status.BLOCKED;
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
            hideLocksWithNoWaits: true,
            methodTopLimit: 5,
            threadFilter: ''
        };
    },

    computed: {

        hangSuspects: function () {
            const hangSuspects = [];

            for (const item of this.threadMap.values()) {
                const threads = item.threads;
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

            for (const [threadName, thread] of this.activeDump.threads) {
                if (!needle || threadName.indexOf(needle) >= 0) {
                    filtered.push(thread);
                }
            }

            return filtered;
        },

        lockTracks: function () {
            const lockTracksMap = new Map();

            let i = 0;
            for (const dump of this.dumps) {
                for (const lock of dump.locks) {
                    if (!lock.count)
                        continue;
                    if (!lockTracksMap.has(lock.id))
                        lockTracksMap.set(lock.id, new Map());
                    lockTracksMap.get(lock.id).set(i, lock.count);
                }
                ++i;
            }

            const lockTracks = [];
            for (const [id, counts] of lockTracksMap)
                lockTracks.push({id, counts});
            lockTracks.sort(function (a, b) {
                return a.id < b.iD ? -1 : 1;
            });

            return lockTracks;
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
            hideEmptyThreads: true,
            threadEmptiness: {}
        }
    },

    computed: {

        emptyThreads: function () {
            console.log('Building empty thread list.');
            const emptyThreadNames = new Set();

            for (const [threadName, item] of this.threadMap) {
                const threads = item.threads;
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
            const index = new Map();

            for (const [threadName, item] of this.threadMap) {
                const threads = item.threads;
                for (let i = 0; i <= threads.length; ++i) {
                    const thread = threads[i];
                    if (!thread)
                        continue;

                    const tokens = thread.stack.split(/\W+/);
                    for (let k = tokens.length; k-- > 0;) {
                        const tok = tokens[k].toLowerCase();

                        if (!tok || tok === 'at' || tok.match(/^\d+$/))
                            continue;

                        if (index.has(tok)) {
                            index.get(tok).add(threadName);
                        } else {
                            index.set(tok, new Set([threadName]));
                        }
                    }

                    if (thread.span)
                        i += thread.span - 1;
                }
            }

            console.log('Words in index:', index.size);
            console.log(index);

            return index;
        },

        stackMatchedThreads: function () {
            if (!this.stackFilter) return null;

            const stackMatchedThreads = new Set();
            const needles = this.stackFilter.toLowerCase().split(/\W+/);

            for (const needle of needles) {
                const matches = new Set();

                for (const [word, threadNames] of this.stackIndex) {
                    if (word.indexOf(needle) >= 0)
                        matches.union(threadNames);
                }

                if (stackMatchedThreads.size > 0)
                    stackMatchedThreads.intersect(matches);
                else
                    stackMatchedThreads.union(matches);
            }

            return stackMatchedThreads;
        },

        threadMapFiltered: function () {
            console.log('Filtering thread map.');

            // TODO: Search among previous search results, when possible.

            for (const threadName of this.threadMap.keys()) {
                let show = true;
                if (this.hideEmptyThreads && this.emptyThreads.has(threadName))
                    show = false;

                else if (this.threadsFilter && threadName.indexOf(this.threadsFilter) < 0)
                    show = false;

                else if (this.stackFilter && !this.stackMatchedThreads.has(threadName))
                    show = false;

                this.threadMap.get(threadName).show = show;
            }

            console.log('Done filtering.');
            return Array.from(this.threadMap);
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
            const table = new Map(), lastThreadObj = {};

            for (let i = 0; i < this.dumps.length; ++i) {
                const dump = this.dumps[i];
                for (const [threadName, thread] of dump.threads) {
                    if (!table.has(threadName))
                        table.set(threadName, {threads: new Array(this.dumps.length), show: true});

                    if (lastThreadObj[threadName]) {
                        const lastThread = lastThreadObj[threadName];
                        if (lastThread.stack === thread.stack && lastThread.status === thread.status) {
                            lastThread.span = (lastThread.span || 1) + 1;
                            table.get(threadName).threads[i] = '=DO=';
                            continue;
                        }
                    }

                    table.get(threadName).threads[i] = thread;
                    if (thread)
                        lastThreadObj[threadName] = thread;
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
        threads: new Map(),
        raw: text,
        statusCounts: [],
        methodCounts: [],
        locks: []
    };

    dump.time = new Date(blocks[0].split('\n')[0]);
    const statusCountsMap = {}, allLocks = new Map(), methodCountsMap = {};

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

        for (; j < lines.length; ++j) {
            const line = lines[j];
            let match = line.match(/- waiting to lock <(.+?)> \(a (.+?)\)/);
            if (match) {
                const id = match[1], type = match[2];
                if (allLocks.has(id)) {
                    allLocks.get(id).count += 1;
                } else {
                    allLocks.set(id, {id, type, count: 1});
                }
                continue;
            }

            match = line.match(/- locked <(.+?)> \(a (.+)\)/);
            if (match) {
                const id = match[1], type = match[2];
                if (allLocks.has(id)) {
                    allLocks.get(id).holder = thread.name;
                } else {
                    allLocks.set(id, {id, type, count: 0, holder: thread.name});
                }
            }
        }

        dump.threads.set(thread.name, thread);
        statusCountsMap[thread.status.name] = (statusCountsMap[thread.status.name] || 0) + 1;
        methodCountsMap[thread.method] = (methodCountsMap[thread.method] || 0) + 1;
    }

    const percentFactor = 100 / dump.threads.size;
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

    for (const lock of allLocks.values())
        dump.locks.push(lock);
    dump.locks.sort(countSorter);

    return dump;

    function countSorter(a, b) {
        return b.count - a.count;
    }
}