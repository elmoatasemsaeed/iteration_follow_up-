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
    let tasks = us.tasks;
    if (!tasks || tasks.length === 0) return;

    const isValidDate = (d) => d instanceof Date && !isNaN(d);

    let devTasks = tasks.filter(t => t.Activity !== 'Testing');
    let testingTasks = tasks.filter(t => t.Activity === 'Testing');

    // 1. ترتيب مهام التطوير
    devTasks.sort((a, b) => {
        let dateA = new Date(a['Activated Date'] || 0);
        let dateB = new Date(b['Activated Date'] || 0);
        return dateA - dateB;
    });

    let lastDevExpectedEnd;
    let lastDevActualEnd = null;

    devTasks.forEach((t, index) => {
        let hours = parseFloat(t['Original Estimation']) || 0;
        
        // التعديل هنا: استخدام Resolved Date إذا كان Actual End غير موجود
        // 
        let finishDateStr = t['Actual End'] || t['Resolved Date']; 
        if (finishDateStr) {
            let actualEnd = new Date(finishDateStr);
            if (isValidDate(actualEnd)) {
                if (!lastDevActualEnd || actualEnd > lastDevActualEnd) {
                    lastDevActualEnd = actualEnd;
                }
            }
        }

        if (index === 0) {
            let taskAct = t['Activated Date'] ? new Date(t['Activated Date']) : new Date(us.activatedDate);
            t.expectedStart = isValidDate(taskAct) ? taskAct : new Date();
        } else {
            t.expectedStart = new Date(lastDevExpectedEnd);
        }

        t.expectedEnd = addWorkHours(t.expectedStart, hours);
        lastDevExpectedEnd = new Date(t.expectedEnd);
    });

    // 2. ترتيب مهام الاختبار
    testingTasks.sort((a, b) => parseInt(a.id || 0) - parseInt(b.id || 0));

    let lastTestExpectedEnd = null;

    testingTasks.forEach((t, index) => {
        let hours = parseFloat(t['Original Estimation']) || 0;
        
        if (index === 0) {
            let taskAct = t['Activated Date'] ? new Date(t['Activated Date']) : new Date(us.activatedDate);
            t.expectedStart = isValidDate(taskAct) ? taskAct : new Date();
        } 
        else if (index === 1) {
            // الآن سيجد قيمة في lastDevActualEnd لأننا سحبناها من Resolved Date في ملف الـ CSV
            // [cite: 1, 6]
            if (lastDevActualEnd && isValidDate(lastDevActualEnd)) {
                t.expectedStart = new Date(lastDevActualEnd);
            } else {
                t.expectedStart = new Date(lastTestExpectedEnd);
            }
        } 
        else {
            t.expectedStart = new Date(lastTestExpectedEnd);
        }

        t.expectedEnd = addWorkHours(t.expectedStart, hours);
        lastTestExpectedEnd = new Date(t.expectedEnd);
    });

    // تحديث نهاية الـ User Story
    let allTasks = [...devTasks, ...testingTasks];
    if (allTasks.length > 0) {
        let endDates = allTasks.map(t => t.expectedEnd).filter(isValidDate);
        if (endDates.length > 0) {
            us.expectedEnd = new Date(Math.max(...endDates));
        }
    }
}
function addWorkHours(startDate, hours) {
    let date = new Date(startDate);
    let remainingMinutes = hours * 60; // تحويل الساعات إلى دقائق

    while (remainingMinutes > 0) {
        // التحقق من أيام العطلات (الجمعة والسبت)
        if (date.getDay() === 5 || date.getDay() === 6 || holidays.includes(date.toISOString().split('T')[0])) {
            date.setDate(date.getDate() + 1);
            date.setHours(9, 0, 0, 0);
            continue;
        }

        // حساب الدقائق المتبقية حتى نهاية يوم العمل (حتى الساعة 5 مساءً)
        let currentHour = date.getHours();
        let currentMinutes = date.getMinutes();
        let minutesUntilEndOfDay = ((17 - currentHour) * 60) - currentMinutes;

        // إضافة الدقائق المتاحة في اليوم الحالي
        let addedNow = Math.min(remainingMinutes, minutesUntilEndOfDay);
        
        // استخدام getTime وsetTime لإضافة الوقت بدقة بالدقائق
        date.setTime(date.getTime() + (addedNow * 60 * 1000));
        remainingMinutes -= addedNow;

        // إذا انتهى يوم العمل وما زال هناك دقائق متبقية، انتقل لليوم التالي
        if (remainingMinutes > 0 || date.getHours() >= 17) {
            date.setDate(date.getDate() + 1);
            date.setHours(9, 0, 0, 0);
        }
    }
    return date;
}
function calculateHourDiff(start, actual) {
    if (!start || !actual || isNaN(new Date(start)) || isNaN(new Date(actual))) return 0;
    
    let startDate = new Date(start);
    let actualDate = new Date(actual);
    
    // إذا بدأ قبل الموعد، نعتبر التأخير 0
    if (actualDate <= startDate) return 0;

    let totalDiffMinutes = 0;
    let current = new Date(startDate);

    while (current < actualDate) {
        let dayEnd = new Date(current);
        dayEnd.setHours(17, 0, 0, 0); // نهاية العمل 5 مساءً

        if (current.getDay() !== 5 && current.getDay() !== 6 && !holidays.includes(current.toISOString().split('T')[0])) {
            let endOfPeriod = actualDate < dayEnd ? actualDate : dayEnd;
            let diff = (endOfPeriod - current) / (1000 * 60);
            if (diff > 0) totalDiffMinutes += diff;
        }

        // الانتقال لليوم التالي الساعة 9 صباحاً
        current.setDate(current.getDate() + 1);
        current.setHours(9, 0, 0, 0);
    }

    return (totalDiffMinutes / 60).toFixed(1);
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

            // فصل المهام وتطبيق نفس منطق الترتيب المستخدم في الحسابات
const devTasksSorted = us.tasks
    .filter(t => t.Activity !== 'Testing')
    .sort((a, b) => {
        let dateA = new Date(a['Activated Date'] || 0);
        let dateB = new Date(b['Activated Date'] || 0);
        return dateA - dateB;
    });

const testingTasksSorted = us.tasks
    .filter(t => t.Activity === 'Testing')
    .sort((a, b) => parseInt(a.id || 0) - parseInt(b.id || 0));

// دمج المجموعتين بالترتيب الصحيح (الديف أولاً ثم التستر)
const sortedTasks = [...devTasksSorted, ...testingTasksSorted];

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
    <td class="${calculateHourDiff(t.expectedStart, t['Activated Date']) > 0 ? 'alert-red' : ''}">
        ${calculateHourDiff(t.expectedStart, t['Activated Date'])}h
    </td>
</tr>`;
                            }).join('')}
                        </tbody>
                    </table>`;

            // Logic for Progress Bar calculations
            const progressWidth = Math.min(us.rework.percentage, 100);
            const progressBarColor = us.rework.percentage > 25 ? '#e74c3c' : '#f1c40f';

            html += `
                <div style="background: #fdfdfd; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #eee; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h5 style="margin: 0; color: #2c3e50;">Quality & Rework Analysis</h5>
                <span style="background: ${us.rework.missingTimesheet > 0 ? '#fff3cd' : '#d4edda'}; 
             color: ${us.rework.missingTimesheet > 0 ? '#856404' : '#155724'}; 
             padding: 4px 10px; border-radius: 20px; font-size: 0.8em; font-weight: bold; border: 1px solid">
    ${us.rework.missingTimesheet > 0 
        ? `⚠️ ${us.rework.missingTimesheet} Bugs missing Timesheet` // هذا السطر يعرض الرقم بجانب النص
        : '✅ All bugs recorded'}
</span>
                    </div>

                    <div style="display: flex; gap: 20px; align-items: center;">
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 5px;">
                                <span>Rework Ratio: <b>${us.rework.percentage.toFixed(1)}%</b></span>
                                <span style="color: #7f8c8d;">Formula: (Bug Time / Dev Time)</span>
                            </div>
                            <div style="width: 100%; background: #eee; height: 10px; border-radius: 5px; overflow: hidden;">
                                <div style="width: ${progressWidth}%; background: ${progressBarColor}; height: 100%; transition: width 0.5s;"></div>
                            </div>
                        </div>
                        
                        <div style="text-align: center; border-left: 1px solid #eee; padding-left: 20px;">
                            <div style="font-size: 0.75em; color: #7f8c8d;">Total Bugs</div>
                            <div style="font-size: 1.5em; font-weight: bold; color: #2c3e50;">${us.rework.count}</div>
                        </div>
                    </div>

                    <p style="margin-top: 10px; font-size: 0.85em; color: #555; background: #f9f9f9; padding: 5px 10px; border-radius: 4px;">
                        🔍 <b>Calculation Details:</b> Spent <b>${us.rework.time}h</b> on bug fixes, compared to <b>${us.devEffort.actual}h</b> of actual development work.
                    </p>
                </div>
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
        let areaDevEst = 0, areaDevAct = 0, areaBugsCount = 0, areaReworkTime = 0, areaBugActualTotal = 0;
        
        grouped[area].forEach(us => {
            areaDevEst += us.devEffort.orig;
            areaDevAct += us.devEffort.actual;
            areaBugsCount += us.rework.count;
            areaReworkTime += us.rework.time; // هذا يعتمد على التقدير الأصلي للبجز

            // لحساب النسبة بدقة نحتاج لجمع الوقت الفعلي المستغرق في البجز من كل ستوري
            // استناداً للمنطق الموجود في calculateMetrics
            let usBugActual = us.bugs.reduce((sum, b) => {
                return sum + (parseFloat(b['TimeSheet_DevActualTime']) || 0) + (parseFloat(b['TimeSheet_TestingActualTime']) || 0);
            }, 0);
            areaBugActualTotal += usBugActual;
        });

        const delay = areaDevAct - areaDevEst;
        // حساب النسبة: (إجمالي وقت البجز الفعلي / إجمالي وقت التطوير الفعلي) * 100
        const reworkPercentage = areaDevAct > 0 ? ((areaBugActualTotal / areaDevAct) * 100).toFixed(1) : 0;
        
        html += `
            <div class="card" style="border-left: 5px solid #2980b9; margin-bottom: 20px;">
                <h3 style="color: #2c3e50; margin-bottom: 15px;">${area}</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px;">
                    <div><small>Dev Est:</small><br><b>${areaDevEst.toFixed(1)}h</b></div>
                    <div><small>Dev Act:</small><br><b>${areaDevAct.toFixed(1)}h</b></div>
                    <div style="color: ${delay > 0 ? '#e74c3c' : '#27ae60'}">
                        <small>Delay:</small><br><b>${delay.toFixed(1)}h</b>
                    </div>
                    <div>
                        <small>Total Bugs:</small><br><b style="color: #e67e22;">${areaBugsCount}</b>
                    </div>
                    <div>
                        <small>Rework Time:</small><br><b style="color: #e74c3c;">${areaBugActualTotal.toFixed(1)}h</b>
                    </div>
                    <div style="background: #fdf2f2; padding: 5px; border-radius: 4px; border: 1px solid #f8d7da;">
                        <small>Rework %:</small><br><b style="color: #c0392b;">${reworkPercentage}%</b>
                    </div>
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
            if (!areaMap[area].devs[d]) {
                // إضافة reworkTime هنا
                areaMap[area].devs[d] = { name: d, est: 0, act: 0, stories: 0, reworkTime: 0 };
            }
            areaMap[area].devs[d].est += us.devEffort.orig;
            areaMap[area].devs[d].act += us.devEffort.actual;
            // إضافة وقت الريورك الفعلي من اليوزر ستوري
            areaMap[area].devs[d].reworkTime += (us.rework.time || 0); 
            areaMap[area].devs[d].stories++;
        }
        
        // ... جزء التستر يبقى كما هو ...
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
                <div><h4>Devs</h4>${generatePeopleTable(areaMap[area].devs, true)}</div>
                <div><h4>Testers</h4>${generatePeopleTable(areaMap[area].testers, false)}</div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

function generatePeopleTable(statsObj, isDev) {
    // إضافة رأس الجدول الجديد إذا كان الشخص ديف
    let tableHtml = `<table><thead><tr>
        <th>Name</th>
        <th>S.</th>
        <th>Est</th>
        <th>Act</th>
        <th>Idx</th>
        ${isDev ? '<th>%RW</th>' : ''} 
    </tr></thead><tbody>`;

    for (let p in statsObj) {
        let person = statsObj[p];
        let index = person.est / (person.act || 1);
        
        // حساب نسبة الريورك: (وقت البجز / وقت الديف الفعلي) * 100
        let reworkPerc = isDev ? ((person.reworkTime / (person.act || 1)) * 100).toFixed(1) : 0;
        
        tableHtml += `<tr>
            <td>${person.name}</td>
            <td>${person.stories}</td>
            <td>${person.est.toFixed(1)}</td>
            <td>${person.act.toFixed(1)}</td>
            <td class="${index < 1 ? 'alert-red' : ''}">${index.toFixed(2)}</td>
            ${isDev ? `<td style="color: ${reworkPerc > 25 ? '#e74c3c' : '#2c3e50'}">${reworkPerc}%</td>` : ''}
        </tr>`;
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




















