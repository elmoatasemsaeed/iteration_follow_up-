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

// التبديل بين الشاشات وعرض البيانات
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';

    if (viewId === 'business-view') renderBusinessView();
    if (viewId === 'team-view') renderTeamView();
}

function renderBusinessView() {
    const container = document.getElementById('business-view');
    const grouped = groupBy(processedStories, 'businessArea');
    
    let html = '';
    for (let area in grouped) {
        html += `<h2 class="business-area-title">${area}</h2>`;
        grouped[area].forEach(us => {
            html += `
                <div class="card">
                    <h3>${us.id}: ${us.title}</h3>
                    <p>المطور: ${us.devLead} | التستر: ${us.testerLead}</p>
                    <table>
                        <tr>
                            <th>Dev Effort (H)</th>
                            <th>Testing Effort (H)</th>
                            <th>Rework Time (H)</th>
                            <th>Bug Count</th>
                            <th>Rework %</th>
                        </tr>
                        <tr>
                            <td>${us.devEffort.orig}</td>
                            <td>${us.testEffort.orig}</td>
                            <td>${us.rework.time}</td>
                            <td>${us.rework.count}</td>
                            <td>${us.rework.percentage.toFixed(1)}%</td>
                        </tr>
                    </table>
                </div>
            `;
        });
    }
    container.innerHTML = html;
}

// دالة مساعدة للتجميع
function groupBy(arr, key) {
    return arr.reduce((acc, obj) => {
        (acc[obj[key]] = acc[obj[key]] || []).push(obj);
        return acc;
    }, {});
}

renderHolidays();