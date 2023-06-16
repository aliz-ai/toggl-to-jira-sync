import {Queue, spawn} from "./utils.js";
import {readLines} from "./streams.js";

Vue.component("sync-row", {
    template: `
        <div class="sync-entry">
            <div>{{ row?.toggl?.time_start }} [{{ row?.actions?.length }}] - {{row?.toggl?.comment}}</div>
        </div>
    `,
    props: ['row'],
});
Vue.component("sync-day", {
    template: `
        <div
            class="sync-day"
            v-bind:class="expanded ? '' : 'collapsed'"
        >
            <div class="sync-day-headline">
                <span
                    class="icon"
                    v-bind:class="day.loading ? 'icon-loading' : 'icon-refresh'"
                    v-on:click="refresh()"
                ></span>
                <span
                    class="icon icon-expand"
                    v-bind:class="expanded ? 'icon-expand-collapse' : 'icon-expand-expand'"
                    v-on:click="toggleExpand()"
                ></span>
                <button
                    type="button"
                    class="btn sync-action"
                    v-bind:class="(day?.error ? 'btn-danger' :  (day?.actions?.length ? 'btn-primary' : 'btn-secondary')) + ' ' + (day?.loading ? 'disabled' : '')"
                    v-bind:disabled="day?.loading"
                    v-on:click="executeSync()"
                >{{ day?.actions?.length }} differences</button>
                <span class="details">
                    <span>{{ calendarDay(day?.date) ?? "unknown day" }}</span>
                </span>
            </div>
            <div class="progress">
                <div
                    class="progress-bar"
                    role="progressbar"
                    aria-valuenow="0"
                    aria-valuemin="0"
                    v-bind:aria-valuemax="progress"
                    v-bind:style="'width: ' + progress + '%'"
                ></div>
            </div>
            <div class="details-section" style="display: none" ref="detailsSection">
                <div v-if="day?.error">{{ day?.error }}</div>
                <div v-for="row in day.rows">
                    <sync-row v-bind:row="row"></sync-row>
                </div>
            </div>
        </div>
    `,
    props: ['day'],
    data: () => ({ expanded: false, progress: 0 }),
    methods: {
        toggleExpand() {
            this.expanded = !this.expanded;
            slide(this.$refs.detailsSection, this.expanded, {
                duration: 400,
            });
        },
        executeSync() {
            if (this.day.loading) {
                return;
            }
            this.day.loading = true;
            spawn(async () => {
                try {
                    this.progress = 0;
                    await _doSyncDay(this.day, progress => {
                        this.progress = progress;
                    });
                    this.day.error = null;
                } catch (e) {
                    this.day.error = String(e);
                } finally {
                    this.day.loading = false;
                }
                enqueueDayUpdate(this.day, true);
            });
        },
        refresh() {
            if (this.day.loading) {
                return;
            }
            this.day.loading = true;
            enqueueDayUpdate(this.day, true);
        },
    },
});

Vue.component("sync-app", {
    template: `
        <div class="sync-app">
            <nav class="navbar sticky-top navbar-light bg-light">
                <div class="sync-title">
                    <h1>Toggl-Jira sync tool for <strong>{{ settings?.jira_username ?? '...' }}</strong></h1>
                    <div>
                        <button
                            type="button"
                            v-on:click="$emit('until-first')"
                            class="btn btn-primary"
                        >Load until 1st</button>
                        <button
                            type="button"
                            v-on:click="$emit('more-days', 1)"
                            class="btn btn-info"
                        >Load 1 more day</button>
                        <button
                            type="button"
                            v-on:click="$emit('more-days', 3)"
                            class="btn btn-info"
                        >Load 3 more days</button>
                        <button
                            type="button"
                            v-on:click="$emit('more-days', 7)"
                            class="btn btn-info"
                        >Load 7 more days</button>
                    </div>
                </div>
            </nav>
            <div v-for="day in days">
                <sync-day v-bind:day="day"></sync-day>
            </div>
        </div>
    `,
    props: ['days'],
    data: () => ({ settings: null }),
    created() {
        spawn(async () => {
            var resp = await fetch("/api/settings");
            if (!resp.ok) throw new Error();
            this.settings = await resp.json();
        });
    },
});

function calendarDay(m) {
    return m?.format('YYYY-MM-DD') + ' (' + m?.calendar({
        lastDay: '[Yesterday]',
        sameDay: '[Today]',
        nextDay: '[Tomorrow]',
        lastWeek: 'dddd',
        nextWeek: 'dddd',
        sameElse: 'dddd'
    }) + ')';
}

window.calendarDay = calendarDay;

export function makeDay(date) {
    var result = {
        date: date.clone(),
        loading: true,
        error: null,
    };
    enqueueDayUpdate(result);
    return result;
}


var queue = new Queue({ workers: 1 });


function enqueueDayUpdate(day, priority=false) {
    day.loading = true;
    queue.submit(async () => {
        try {
            await _doUpdateDay(day);
            day.error = null;
        } catch(e) {
            day.error = String(e);
        } finally {
            day.loading = false;
        }
    }, priority);
}

async function _doFetchDay(day) {
    var {min, max} = getDayRange(day);
    var resp = await fetch(`/api/diff?min=${encodeURIComponent(min)}&max=${encodeURIComponent(max)}`);
    if (!resp.ok) {
        throw new Error(await resp.text());
    }
    return await resp.json();
}

async function _doSyncDay(day, progressCb) {
    var {min, max} = getDayRange(day);
    var resp = await fetch(
        `/api/diff/sync?min=${encodeURIComponent(min)}&max=${encodeURIComponent(max)}`,
        {method: "post"}
    );
    if (!resp.ok) {
        throw new Error(await resp.text());
    }
    await readLines(resp, line => {
        var data = JSON.parse(line);
        if (progressCb) progressCb(Math.round(100 *  data.current / data.total));
    });
}

function getDayRange(day) {
    var min = day.date.format();
    var max = day.date.clone().add(1, 'days').format();
    return {min, max};
}

async function _doUpdateDay(day) {
    var data = await _doFetchDay(day);
    Object.assign(day, data);
}


function slide(el, shown, opts) {
    var $el = $(el);
    if (shown) {
        $el.slideDown(opts);
    } else {
        $el.slideUp(opts);
    }
}
