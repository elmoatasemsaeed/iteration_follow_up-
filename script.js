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
    list.innerHTML = holidays.map(h => `<li>${h} <button onclick="removeHoliday('${h}')">X</button></li>`).join('');
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
        // 1. Dev & Testing Effort
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

        // 2. Bugs Rework
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
        // Friday (5), Saturday (6) or Holiday
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
    document.getElementById(viewId).style.display = 'block';
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
        html += `<div class="business-section">
                    <h3 class="business-area-title">${area}</h3>`;
        grouped[area].forEach(us => {
            html += `
                <div class="card">
                    <h4>ID: ${us.id} - ${us.title}</h4>
                    <p><b>Dev:</b> ${us.devLead} | <b>Tester:</b> ${us.testerLead}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Est. (H)</th>
                                <th>Actual (H)</th>
                                <th>Productivity Index</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Development</td>
                                <td>${us.devEffort.orig}</td>
                                <td>${us.devEffort.actual}</td>
                                <td class="${us.devEffort.dev < 1 ? 'alert-red' : ''}">${us.devEffort.dev.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Testing</td>
                                <td>${us.testEffort.orig}</td>
                                <td>${us.testEffort.actual}</td>
                                <td class="${us.testEffort.dev < 1 ? 'alert-red' : ''}">${us.testEffort.dev.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p>Bugs Count: ${us.rework.count} | Rework Ratio: ${us.rework.percentage.toFixed(1)}%</p>
                </div>`;
        });
        html += `</div>`;
    }
    container.innerHTML = html;
}

function renderTeamView() {
    const container = document.getElementById('team-view');
    // تجميع القصص حسب الـ Business Area
    const grouped = groupBy(processedStories, 'businessArea');
    
    let html = '<h2>Team Performance by Business Area</h2>';

    for (let area in grouped) {
        let areaDevEst = 0, areaDevAct = 0, areaBugs = 0;
        
        // حساب إجمالي الأرقام لكل منطقة عمل
        grouped[area].forEach(us => {
            areaDevEst += us.devEffort.orig;
            areaDevAct += us.devEffort.actual;
            areaBugs += us.rework.count;
        });

        const delay = areaDevAct - areaDevEst;

        html += `
            <div class="card" style="background: #f8f9fa; border-left: 5px solid #2980b9; margin-bottom: 20px;">
                <h3 style="color: #2c3e50; margin-top: 0;">${area}</h3>
                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                    <div class="stat-box">Total Est. Hours: <b>${areaDevEst.toFixed(1)}</b></div>
                    <div class="stat-box">Total Actual Hours: <b>${areaDevAct.toFixed(1)}</b></div>
                    <div class="stat-box">Total Bugs: <b>${areaBugs}</b></div>
                    <div class="stat-box">Total Delay: <b style="color: ${delay > 0 ? '#e74c3c' : '#27ae60'}">${delay.toFixed(1)} hours</b></div>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function renderPeopleView() {
    const container = document.getElementById('people-view');
    const areaMap = {}; // { AreaName: { devs: {}, testers: {} } }

    // 1. تجميع البيانات موزعة حسب المنطقة والمسمى الوظيفي
    processedStories.forEach(us => {
        const area = us.businessArea || 'General';
        if (!areaMap[area]) {
            areaMap[area] = { devs: {}, testers: {} };
        }

        // تجميع بيانات المطورين
        const dev = us.devLead;
        if (dev) {
            if (!areaMap[area].devs[dev]) areaMap[area].devs[dev] = { name: dev, est: 0, act: 0, stories: 0 };
            areaMap[area].devs[dev].est += us.devEffort.orig;
            areaMap[area].devs[dev].act += us.devEffort.actual;
            areaMap[area].devs[dev].stories += 1;
        }

        // تجميع بيانات المختبرين
        const tester = us.testerLead;
        if (tester) {
            if (!areaMap[area].testers[tester]) areaMap[area].testers[tester] = { name: tester, est: 0, act: 0, stories: 0 };
            areaMap[area].testers[tester].est += us.testEffort.orig;
            areaMap[area].testers[tester].act += us.testEffort.actual;
            areaMap[area].testers[tester].stories += 1;
        }
    });

    // 2. بناء واجهة العرض (Grid لكل Business Area)
    let html = '<h2>People Performance by Business Area</h2>';

    for (let area in areaMap) {
        html += `
            <div class="area-performance-grid" style="margin-bottom: 40px; border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #fff;">
                <h3 style="background: #2c3e50; color: white; padding: 10px; margin: -15px -15px 15px -15px; border-radius: 8px 8px 0 0;">
                    Business Area: ${area}
                </h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h4 style="color: #2980b9;">Developers</h4>
                        ${Object.keys(areaMap[area].devs).length > 0 ? generatePeopleTable(areaMap[area].devs) : '<p>No developers assigned</p>'}
                    </div>
                    <div>
                        <h4 style="color: #27ae60;">Testers</h4>
                        ${Object.keys(areaMap[area].testers).length > 0 ? generatePeopleTable(areaMap[area].testers) : '<p>No testers assigned</p>'}
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}
// وظيفة مساعدة لإنشاء الجدول لتقليل تكرار الكود
function generatePeopleTable(statsObj) {
    let tableHtml = `<table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Stories</th>
                <th>Total Est (H)</th>
                <th>Total Actual (H)</th>
                <th>Productivity Index</th>
            </tr>
        </thead>
        <tbody>`;
    
    for (let p in statsObj) {
        let person = statsObj[p];
        let index = person.est / (person.act || 1);
        tableHtml += `<tr>
            <td>${person.name}</td>
            <td>${person.stories}</td>
            <td>${person.est.toFixed(1)}</td>
            <td>${person.act.toFixed(1)}</td>
            <td class="${index < 1 ? 'alert-red' : ''}">${index.toFixed(2)}</td>
        </tr>`;
    }
    
    tableHtml += '</tbody></table>';
    return tableHtml;
}

function renderNotTestedView() {
    const container = document.getElementById('not-tested-view');
    const notTested = processedStories.filter(us => us.status !== 'Tested' && us.status !== 'Resolved');
    const grouped = groupBy(notTested, 'businessArea');
    let html = '<h2>User Stories Not Yet Tested (By Business Area)</h2>';
    if (notTested.length === 0) {
        html += '<p>All User Stories have been tested successfully!</p>';
    } else {
        for (let area in grouped) {
            html += `<h3 class="business-area-title">${area}</h3><ul>`;
            grouped[area].forEach(us => {
                html += `<li><b>${us.id}</b>: ${us.title} (Status: ${us.status})</li>`;
            });
            html += `</ul>`;
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

renderHolidays();



