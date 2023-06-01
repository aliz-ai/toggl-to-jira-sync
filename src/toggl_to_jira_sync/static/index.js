import { spawn } from './utils.js';
import { makeDay } from './components.js';

async function main() {
    var app = new Vue({
        el: "#vue-app",
        template: `
            <sync-app
                v-bind:days="days"
                v-on:more-days="moreDays"
                v-on:until-first="untilFirst"
            ></sync-app>
        `,
        data: {
            days: [],
        },
        methods: {
            moreDays(n) {
                for (var i = 0; i < n; i++) {
                    addDay();
                }
            },
            untilFirst() {
                let lastShownDay = today.clone().add(dayCounter + 1, 'days');
                // if the user clicks on the button when a complete month is shown, add another month
                do {
                    addDay();
                    lastShownDay = today.clone().add(dayCounter + 1, 'days');
                } while (lastShownDay.date() > 1);
            }
        }
    });

    var now = moment();
    var today = now.clone().startOf('day');
    var dayCounter = 0;

    function addDay() {
        var loop_day = today.clone().add(dayCounter--, 'days');
        app.days.push(makeDay(loop_day));
    }

    /*for (var i = 0; i < 10; i++) {
        addDay();
    }*/
}

window.addEventListener("load", () => {
    spawn(main);
});
