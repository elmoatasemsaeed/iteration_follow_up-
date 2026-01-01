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
} // Added missing brace here

function renderHolidays() {
    const list = document.getElementById('holidaysList');
    if (!list) return;
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

    // Ensure PapaParse library is loaded in your HTML
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
            const activity = t['Activity'];

            if (activity === 'Development' || activity === 'DB Modification') {
                devOrig += orig;
                devActual += actDev;
            } else if (activity === 'Testing') {
                testOrig += orig;
                testActual += (parseFloat(t['TimeSheet_TestingActualTime']) || 0);
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
            count: us.bugs.length,
            percentage: (bugActualTotal / (devActual || 1)) * 100
        };

        calculateTimeline(us);
    });
}

function calculateTimeline(us) {
    if (!us.activatedDate) return;
    let currentExpectedDate = new Date(us.activatedDate);
    
    us.tasks.forEach(t => {
        t.expectedStart = new Date(currentExpectedDate);
        let hours = parseFloat(t['Original Estimation']) || 0;
        t.expectedEnd = addWorkHours(t.expectedStart, hours);
        currentExpectedDate = new Date(t.expectedEnd);
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
        let addedToday = Math.min(remaining, 5); 
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
    let html = '<h2>Business Area Analysis</h2>';
    for (let area in grouped) {
        html += `<div class="business-section"><h3>${area}</h3>`;
        grouped[area].forEach(us => {
            html += `<div class="card"><h4>${us.id}: ${us.title}</h4>
            <p>Dev Productivity: ${us.devEffort.dev.toFixed(2)}</p></div>`;
        });
        html += `</div>`;
    }
    container.innerHTML = html;
}

function renderTeamView() { /* Function implementation */ }
function renderPeopleView() { /* Function implementation */ }
function renderNotTestedView() { /* Function implementation */ }

function groupBy(arr, key) {
    return arr.reduce((acc, obj) => {
        (acc[obj[key]] = acc[obj[key]] || []).push(obj);
        return acc;
    }, {});
}

function generatePeopleTable(statsObj) {
    if (Object.keys(statsObj).length === 0) return '<p>No data.</p>';
    let tableHtml = `<table><thead><tr><th>Name</th><th>Stories</th><th>Index</th></tr></thead><tbody>`;
    for (let p in statsObj) {
        let person = statsObj[p];
        let index = person.est / (person.act || 1);
        tableHtml += `<tr><td>${person.name}</td><td>${person.stories}</td><td>${index.toFixed(2)}</td></tr>`;
    }
    return tableHtml + '</tbody></table>';
}

// Initial call to load saved holidays
renderHolidays();
