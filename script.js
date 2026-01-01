let rawData = [];
let processedStories = [];
let holidays = JSON.parse(localStorage.getItem('holidays') || "[]");

// Holiday Setup
function addHoliday() {
    const h = document.getElementById('holidayPicker').value;
    if(h && !holidays.includes(h)) {
        holidays.push(h);
        localStorage.setItem('holidays', JSON.stringify(holidays));
        renderHolidays();
    }
}

function renderHolidays() {
    const list = document.getElementById('holidaysList');
    if (list) {
        list.innerHTML = holidays.map(h => `<li>${h} <button onclick="removeHoliday('${h}')">X</button></li>`).join('');
    }
}

function removeHoliday(date) {
    holidays = holidays.filter(h => h !== date);
    localStorage.setItem('holidays', JSON.stringify(holidays));
    renderHolidays();
}

// Handle Upload
function handleUpload() {
    const file = document.getElementById('csvFile').files[0];
    if (!file) return alert("Please select a file first");

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            rawData = results.data;
            processData();
            showView('business-view');
        }
    });
}

// Data Processing
function processData() {
    processedStories = [];
    let currentStory = null;

    rawData.forEach(row => {
        const type = row['Work Item Type'];
        
        if (type === 'User Story') {
            currentStory = {
                id: row['ID'],
                title: row['Title'],
                businessArea: row['Business Area'] || 'General',
                devLead: row['Assigned To'],
                testerLead: row['Assigned To Tester'],
                activatedDate: row['Activated Date'],
                status: row['State'],
                tasks: [],
                bugs: []
            };
            processedStories.push(currentStory);
        } else if (currentStory) {
            if (type === 'Task') currentStory.tasks.push(row);
            if (type === 'Bug') currentStory.bugs.push(row);
        }
    });

    calculateMetrics();
}

function calculateMetrics() {
    processedStories.forEach(us => {
        let devOrig = 0, devActual = 0, testOrig = 0, testActual = 0;
        
        us.tasks.forEach(t => {
            const orig = parseFloat(t['Original Estimation']) || 0;
            const actDev = parseFloat(t['TimeSheet_DevActualTime']) || 0;
            const actTest = parseFloat(t['TimeSheet_TestingActualTime']) || 0;
            const activity = t['Activity'];

            if (activity === 'Development' || activity === 'DB Modification') {
                devOrig += orig;
                devActual += actDev;
            } else if (activity === 'Testing') {
                testOrig += orig;
                testActual += actTest;
            }
        });

        us.devEffort = { orig: devOrig, actual: devActual, dev: devOrig / (devActual || 1) };
        us.testEffort = { orig: testOrig, actual: testActual, dev: testOrig / (testActual || 1) };

        let bugOrig = 0, bugActualTotal = 0, bugsNoTimesheet = 0;
        us.bugs.forEach(b => {
            bugOrig += parseFloat(b['Original Estimation']) || 0;
            let bDevAct = parseFloat(b['TimeSheet_DevActualTime']) || 0;
            let bTestAct = parseFloat(b['TimeSheet_TestingActualTime']) || 0;
            bugActualTotal += (bDevAct + bTestAct);
            if (bDevAct === 0) bugsNoTimesheet++;
        });

        us.rework = {
            time: bugOrig,
            count: us.bugs.length,
            missingTimesheet: bugsNoTimesheet,
            deviation: bugOrig / (bugActualTotal || 1),
            percentage: (bugActualTotal / (devActual || 1)) * 100
        };

        calculateTimeline(us);
    });
}

function calculateTimeline(us) {
    if (!us.activatedDate) return;
    let currentExpectedDate = new Date(us.activatedDate);
    
    us.tasks.forEach(t => {
        if (t['Activity'] !== 'Testing') {
            t.expectedStart = new Date(currentExpectedDate);
            let hours = parseFloat(t['Original Estimation']) || 0;
            t.expectedEnd = addWorkHours(t.expectedStart, hours);
            currentExpectedDate = new Date(t.expectedEnd);
        }
    });

    us.tasks.forEach(t => {
        if (t['Activity'] === 'Testing') {
            t.expectedStart = new Date(currentExpectedDate);
            let hours = parseFloat(t['Original Estimation']) || 0;
            t.expectedEnd = addWorkHours(t.expectedStart, hours);
            currentExpectedDate = new Date(t.expectedEnd);
        }
    });
}

function addWorkHours(startDate, hours) {
    let date = new Date(startDate);
    let remaining = hours;
    while (remaining > 0) {
        if (date.getDay() === 5 || date.getDay() === 6 || holidays.includes(date.toISOString().split('T')[0])) {
            date.setDate(date.getDate() + 1);
            date.setHours(9, 0, 0);
            continue;
        }
        let currentDayLimit = 5; 
        let addedToday = Math.min(remaining, currentDayLimit);
        date.setHours(date.getHours() + addedToday);
        remaining -= addedToday;
        if (remaining > 0 || date.getHours() >= 18) {
            date.setDate(date.getDate() + 1);
            date.setHours(9, 0, 0);
        }
    }
    return date;
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';
    
    if (processedStories.length === 0) return;

    if (viewId === 'business-view') renderBusinessView();
    if (viewId === 'team-view') renderTeamView();
    if (viewId === 'people-view') renderPeopleView();
    if (viewId === 'not-tested-view') renderNotTestedView();
}

function renderBusinessView() {
    const container = document.getElementById('business-view');
    const grouped = groupBy(processedStories, 'businessArea');
    let html = '<h2>Business Area & User Story Analysis</h2>';
    
    for (let area in grouped) {
        html += `<div class="business-section"><h3 class="business-area-title">${area}</h3>`;
        
        grouped[area].forEach(us => {
            const formatDate = (date) => {
                if (!date || isNaN(new Date(date))) return 'N/A';
                return new Date(date).toLocaleString('en-GB', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
            };

            const sortedTasks = [...us.tasks].sort((a, b) => (a.expectedStart || 0) - (b.expectedStart || 0));

            html += `
                <div class="card" style="margin-bottom: 30px; border-left: 5px solid #2980b9; overflow-x: auto;">
                    <h4>ID: ${us.id} - ${us.title}</h4>
                    <p><b>Dev Lead:</b> ${us.devLead} | <b>Tester Lead:</b> ${us.testerLead}</p>
                    <table>
                        <thead>
                            <tr><th>Type</th><th>Est. (H)</th><th>Actual (H)</th><th>Index</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>Dev</td><td>${us.devEffort.orig}</td><td>${us.devEffort.actual}</td><td class="${us.devEffort.dev < 1 ? 'alert-red' : ''}">${us.devEffort.dev.toFixed(2)}</td></tr>
                            <tr><td>Test</td><td>${us.testEffort.orig}</td><td>${us.testEffort.actual}</td><td class="${us.testEffort.dev < 1 ? 'alert-red' : ''}">${us.testEffort.dev.toFixed(2)}</td></tr>
                        </tbody>
                    </table>

                    <h5 style="margin: 10px 0;">Tasks Timeline & Schedule:</h5>
                    <table style="font-size: 0.85em; width: 100%;">
                        <thead>
                            <tr style="background:#eee;">
                                <th>ID</th>
                                <th>Task Name</th>
                                <th>Activity</th>
                                <th>Est</th>
                                <th>Exp. Start</th>
                                <th>Exp. End</th>
                                <th>Act. Start</th>
                                <th>TS Total</th>
                                <th>Dev %</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedTasks.map(t => {
                                const tsTotal = (parseFloat(t['TimeSheet_DevActualTime']) || 0) + (parseFloat(t['TimeSheet_TestingActualTime']) || 0);
                                const est = parseFloat(t['Original Estimation']) || 0;
                                const deviation = est > 0 ? ((tsTotal - est) / est * 100).toFixed(1) : 0;
                                return `
                                <tr>
                                    <td>${t['ID']}</td>
                                    <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${t['Title']}">${t['Title'] || 'N/A'}</td>
                                    <td>${t['Activity']}</td>
                                    <td>${est}</td>
                                    <td>${formatDate(t.expectedStart)}</td>
                                    <td>${formatDate(t.expectedEnd)}</td>
                                    <td>${formatDate(t['Activated Date'])}</td>
                                    <td>${tsTotal}</td>
                                    <td class="${deviation > 15 ? 'alert-red' : ''}">${deviation}%</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                    <p><b>Bugs:</b> ${us.rework.count} | <b>Rework:</b> ${us.rework.percentage.toFixed(1)}%</p>
                </div>`;
        });
        html += `</div>`;
    }
    container.innerHTML = html;
}

function renderTeamView() {
    const container = document.getElementById('team-view');
    const grouped = groupBy(processedStories, 'businessArea');
    let html = '<h2>Team Performance by Business Area</h2>';

    for (let area in grouped) {
        let areaDevEst = 0, areaDevAct = 0, areaBugs = 0;
        grouped[area].forEach(us => {
            areaDevEst += us.devEffort.orig;
            areaDevAct += us.devEffort.actual;
            areaBugs += us.rework.count;
        });
        const delay = areaDevAct - areaDevEst;
        html += `
            <div class="card" style="border-left: 5px solid #2980b9; margin-bottom: 20px;">
                <h3>${area}</h3>
                <div style="display: flex; gap: 20px;">
                    <div>Est: <b>${areaDevEst.toFixed(1)}</b></div>
                    <div>Act: <b>${areaDevAct.toFixed(1)}</b></div>
                    <div>Bugs: <b>${areaBugs}</b></div>
                    <div style="color: ${delay > 0 ? '#e74c3c' : '#27ae60'}">Delay: <b>${delay.toFixed(1)}h</b></div>
                </div>
            </div>`;
    }
    container.innerHTML = html;
}

function renderPeopleView() {
    const container = document.getElementById('people-view');
    const areaMap = {};

    processedStories.forEach(us => {
        const area = us.businessArea;
        if (!areaMap[area]) areaMap[area] = { devs: {}, testers: {} };

        if (us.devLead) {
            const d = us.devLead;
            if (!areaMap[area].devs[d]) areaMap[area].devs[d] = { name: d, est: 0, act: 0, stories: 0 };
            areaMap[area].devs[d].est += us.devEffort.orig;
            areaMap[area].devs[d].act += us.devEffort.actual;
            areaMap[area].devs[d].stories++;
        }
        if (us.testerLead) {
            const t = us.testerLead;
            if (!areaMap[area].testers[t]) areaMap[area].testers[t] = { name: t, est: 0, act: 0, stories: 0 };
            areaMap[area].testers[t].est += us.testEffort.orig;
            areaMap[area].testers[t].act += us.testEffort.actual;
            areaMap[area].testers[t].stories++;
        }
    });

    let html = '<h2>People Performance</h2>';
    for (let area in areaMap) {
        html += `<div style="margin-bottom:30px; border:1px solid #ddd; padding:10px;">
            <h3>${area}</h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <div><h4>Devs</h4>${generatePeopleTable(areaMap[area].devs)}</div>
                <div><h4>Testers</h4>${generatePeopleTable(areaMap[area].testers)}</div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

function generatePeopleTable(statsObj) {
    let tableHtml = `<table><thead><tr><th>Name</th><th>S.</th><th>Est</th><th>Act</th><th>Idx</th></tr></thead><tbody>`;
    for (let p in statsObj) {
        let person = statsObj[p];
        let index = person.est / (person.act || 1);
        tableHtml += `<tr><td>${person.name}</td><td>${person.stories}</td><td>${person.est.toFixed(1)}</td><td>${person.act.toFixed(1)}</td><td class="${index < 1 ? 'alert-red' : ''}">${index.toFixed(2)}</td></tr>`;
    }
    return tableHtml + '</tbody></table>';
}

function renderNotTestedView() {
    const container = document.getElementById('not-tested-view');
    const notTested = processedStories.filter(us => us.status !== 'Tested' && us.status !== 'Resolved');
    const grouped = groupBy(notTested, 'businessArea');
    let html = '<h2>Not Yet Tested</h2>';
    if (notTested.length === 0) {
        html += '<p>All Stories Tested!</p>';
    } else {
        for (let area in grouped) {
            html += `<h3>${area}</h3><ul>${grouped[area].map(us => `<li>${us.id}: ${us.title}</li>`).join('')}</ul>`;
        }
    }
    container.innerHTML = html;
}

function groupBy(arr, key) {
    return arr.reduce((acc, obj) => {
        (acc[obj[key]] = acc[obj[key]] || []).push(obj);
        return acc;
    }, {});
}

// Initialize
renderHolidays();

