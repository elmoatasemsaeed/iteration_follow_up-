let rawData = [];
let processedStories = [];
let holidays = JSON.parse(localStorage.getItem('holidays') || "[]");

// إعداد العطلات
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

// معالجة الملف عند الرفع
function handleUpload() {
    const file = document.getElementById('csvFile').files[0];
    if (!file) return alert("اختر ملف أولاً");

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

// الوظيفة الأساسية لفرز البيانات
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

// حساب الـ Metrics لكل يوزر استوري
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

        // 3. Lead Time Logic
        calculateTimeline(us);
    });
}

function calculateTimeline(us) {
    if (!us.activatedDate) return;

    let currentExpectedDate = new Date(us.activatedDate);
    
    // حساب الديف
    us.tasks.forEach((t, index) => {
        if (t['Activity'] !== 'Testing') {
            t.expectedStart = new Date(currentExpectedDate);
            let hours = parseFloat(t['Original Estimation']) || 0;
            t.expectedEnd = addWorkHours(t.expectedStart, hours);
            currentExpectedDate = new Date(t.expectedEnd); // التالية تبدأ من نهاية السابقة
        }
    });

    // حساب التستر (يبدأ بعد آخر ديف)
    us.tasks.forEach(t => {
        if (t['Activity'] === 'Testing') {
            t.expectedStart = new Date(currentExpectedDate);
            let hours = parseFloat(t['Original Estimation']) || 0;
            t.expectedEnd = addWorkHours(t.expectedStart, hours);
            currentExpectedDate = new Date(t.expectedEnd);
        }
    });
}

// وظيفة إضافة ساعات العمل (5 ساعات/يوم، 9ص-6م، أحد-خميس)
function addWorkHours(startDate, hours) {
    let date = new Date(startDate);
    let remaining = hours;

    while (remaining > 0) {
        // إذا كان يوم جمعة (5) أو سبت (6) أو عطلة، تخطاه
        if (date.getDay() === 5 || date.getDay() === 6 || holidays.includes(date.toISOString().split('T')[0])) {
            date.setDate(date.getDate() + 1);
            date.setHours(9, 0, 0);
            continue;
        }

        // ساعات العمل المتبقية في اليوم الحالي حتى الساعة 6م
        // بما أن اليوم 5 ساعات فقط، سنعتبر اليوم ينتهي بمجرد مرور 5 ساعات من البداية (أو الوصول لـ 6م)
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

// التبديل بين الشاشات
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';

    if (processedStories.length === 0) return;

    if (viewId === 'business-view') renderBusinessView();
    if (viewId === 'team-view') renderTeamView();
    if (viewId === 'people-view') renderPeopleView();
    if (viewId === 'not-tested-view') renderNotTestedView();
}

// 1. عرض البزنس ايريا (بالتفصيل لكل يوزر استوري)
function renderBusinessView() {
    const container = document.getElementById('business-view');
    const grouped = groupBy(processedStories, 'businessArea');
    
    let html = '<h2>تحليل البزنس ايريا واليوزر استوري</h2>';
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
                                <th>النوع</th>
                                <th>Est. (H)</th>
                                <th>Actual (H)</th>
                                <th>Deviation</th>
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
                    <p>عدد البجز: ${us.rework.count} | نسبة الـ Rework: ${us.rework.percentage.toFixed(1)}%</p>
                </div>`;
        });
        html += `</div>`;
    }
    container.innerHTML = html;
}

// 2. عرض الفريق (إجماليات)
function renderTeamView() {
    const container = document.getElementById('team-view');
    let totalDevEst = 0, totalDevAct = 0, totalBugs = 0, totalReworkTime = 0;

    processedStories.forEach(us => {
        totalDevEst += us.devEffort.orig;
        totalDevAct += us.devEffort.actual;
        totalBugs += us.rework.count;
        totalReworkTime += us.rework.time;
    });

    container.innerHTML = `
        <div class="card" style="background: #ecf0f1;">
            <h2>إجمالي أداء الفريق</h2>
            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                <div class="stat-box">إجمالي ساعات الاستميشن: <b>${totalDevEst}</b></div>
                <div class="stat-box">إجمالي ساعات العمل الفعلي: <b>${totalDevAct}</b></div>
                <div class="stat-box">إجمالي عدد البجز: <b>${totalBugs}</b></div>
                <div class="stat-box">إجمالي تأخير الفريق: <b>${(totalDevAct - totalDevEst).toFixed(1)} ساعة</b></div>
            </div>
        </div>
    `;
}

// 3. عرض الأشخاص (تحليل أداء كل فرد)
function renderPeopleView() {
    const container = document.getElementById('people-view');
    const peopleStats = {};

    processedStories.forEach(us => {
        const dev = us.devLead;
        if (!peopleStats[dev]) peopleStats[dev] = { name: dev, est: 0, act: 0, stories: 0 };
        peopleStats[dev].est += us.devEffort.orig;
        peopleStats[dev].act += us.devEffort.actual;
        peopleStats[dev].stories += 1;
    });

    let html = '<h2>تحليل أداء المطورين</h2><table><thead><tr><th>الاسم</th><th>عدد الاستوريز</th><th>إجمالي Est</th><th>إجمالي Actual</th><th>الانحراف</th></tr></thead><tbody>';
    
    for (let p in peopleStats) {
        let person = peopleStats[p];
        let dev = person.est / (person.act || 1);
        html += `<tr>
            <td>${person.name}</td>
            <td>${person.stories}</td>
            <td>${person.est}</td>
            <td>${person.act}</td>
            <td class="${dev < 1 ? 'alert-red' : ''}">${dev.toFixed(2)}</td>
        </tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

// 4. عرض غير المختبر (Not Tested)
function renderNotTestedView() {
    const container = document.getElementById('not-tested-view');
    const notTested = processedStories.filter(us => us.status !== 'Tested' && us.status !== 'Resolved');
    
    const grouped = groupBy(notTested, 'businessArea');
    let html = '<h2>يوزر استوري لم يتم اختبارها (مقسمة بالبزنس ايريا)</h2>';

    if (notTested.length === 0) {
        html += '<p>كل اليوزر استوري تم اختبارها بنجاح!</p>';
    } else {
        for (let area in grouped) {
            html += `<h3 class="business-area-title">${area}</h3><ul>`;
            grouped[area].forEach(us => {
                html += `<li><b>${us.id}</b>: ${us.title} (الحالة: ${us.status})</li>`;
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
