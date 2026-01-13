// 1. Global Variables (Top Level Scope)
let rawData = [];
let processedStories = [];
let holidays = JSON.parse(localStorage.getItem('holidays') || "[]");
let githubToken = localStorage.getItem('gh_token') || ""; 

// GitHub Configuration
const GH_CONFIG = {
    owner: 'elmoatasemsaeed',
    repo: 'iteration_follow_up-',
    path: 'data.json',
    usersPath: 'users.json', // مسار ملف المستخدمين الجديد
    branch: 'main'
};

// Initialize Users
let users = JSON.parse(localStorage.getItem('app_users'));
if (!users || Object.keys(users).length === 0) {
    users = {
        "admin": { pass: "admin", role: "admin" } // Changed role to 'admin' to match setupPermissions logic
    };
    localStorage.setItem('app_users', JSON.stringify(users));
}

let currentUser = null;

// --- Functions ---

function saveUsers() {
    localStorage.setItem('app_users', JSON.stringify(users));
    renderUsersTable(); 
}

async function attemptLogin() {
    const user = document.getElementById('loginUser').value;
    const pass = document.getElementById('loginPass').value;
    const token = document.getElementById('ghTokenInput').value;
    const remember = document.getElementById('rememberMe').checked;

    if (!token) return alert("Please enter GitHub Token");

    githubToken = token; // تعيين التوكن مؤقتاً لمحاولة الجلب

    try {
        // محاولة جلب المستخدمين من GitHub أولاً
        await fetchUsersFromGitHub(); 

        if (users[user] && users[user].pass === pass) {
            currentUser = users[user];
            
            if (remember) {
                localStorage.setItem('gh_token', token);
                localStorage.setItem('app_role', currentUser.role);
                localStorage.setItem('saved_user', user);
                localStorage.setItem('saved_pass', pass);
            }

            setupPermissions();
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('main-nav').style.display = 'flex';
            await fetchDataFromGitHub();
        } else {
            alert("Invalid Credentials!");
        }
    } catch (e) {
        alert("Login failed: Could not connect to GitHub or invalid Token.");
    }
}
function renderUsersTable() {
    const tbody = document.getElementById('usersListTable');
    if (!tbody || !users) return;
    
    tbody.innerHTML = Object.keys(users).map(u => `
        <tr>
            <td>${u}</td>
            <td>${users[u].pass}</td>
            <td>${users[u].role}</td>
            <td>
                <button onclick="deleteUser('${u}')" style="background:#e74c3c; padding:5px; color:white; border:none; border-radius:3px;">Delete</button>
            </td>
        </tr>
    `).join('');
}


async function addUser() {
    const name = document.getElementById('newUserName').value;
    const pass = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;

    if (name && pass) {
        users[name] = { pass: pass, role: role };
        // حفظ محلي مؤقت
        localStorage.setItem('app_users', JSON.stringify(users)); 
        
        // رفع القائمة المحدثة إلى GitHub
        await uploadUsersToGitHub(); 
        
        alert("User saved and synced to GitHub!");
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserPass').value = '';
        renderUsersTable();
    }
}

// جلب المستخدمين من GitHub عند تشغيل النظام
async function fetchUsersFromGitHub() {
    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.usersPath}`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            const content = decodeURIComponent(escape(atob(data.content)));
            users = JSON.parse(content);
            localStorage.setItem('app_users', JSON.stringify(users));
            renderUsersTable();
        }
    } catch (e) {
        console.error("Error fetching users:", e);
    }
}

async function uploadUsersToGitHub() { // تم إضافة القوس هنا
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(users))));

    let sha = "";

    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.usersPath}`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            sha = data.sha;
        }

        await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.usersPath}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: "Update user list",
                content: content,
                sha: sha,
                branch: GH_CONFIG.branch
            })
        });
    } catch (e) {
        console.error("Error syncing users:", e);
    }
}
function deleteUser(username) {
    if (username === 'admin') return alert("Cannot delete main admin!");
    if (confirm(`Delete user ${username}?`)) {
        delete users[username];
        saveUsers();
    }
}

// 3. التحكم في ما يظهر للمستخدم
function setupPermissions() {
    // جلب الرتبة من localStorage أو من كائن المستخدم الحالي
    const role = localStorage.getItem('app_role') || (currentUser ? currentUser.role : null);
    const adminElements = document.querySelectorAll('.admin-only');
    
    adminElements.forEach(el => {
        // إذا كان المستخدم admin اجعل العنصر يظهر، وإلا أخفه تماماً
        if (role === 'admin') {
            el.style.setProperty('display', 'inline-block', 'important');
        } else {
            el.style.setProperty('display', 'none', 'important');
        }
    });
}

// 4. دالة جلب البيانات من GitHub (تحديث للدالة الحالية)
async function fetchDataFromGitHub() {
    const statusDiv = document.getElementById('sync-status');
    statusDiv.style.display = 'block';
    statusDiv.innerText = "🔍 Fetching data from GitHub...";

    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            // فك تشفير البيانات من Base64
            const content = decodeURIComponent(escape(atob(data.content)));
            rawData = JSON.parse(content);
            processData(); 
            showView('business-view');
            statusDiv.innerText = "✅ Data loaded from GitHub";
        } else {
            statusDiv.innerText = "❌ No data found on GitHub. Admin must upload first.";
        }
    } catch (e) {
        console.error(e);
        statusDiv.innerText = "❌ Connection Error";
    }
}

// 5. تسجيل الخروج
// 5. تسجيل الخروج
function logout() { // تم تصحيح الكلمة هنا
    // نمسح فقط بيانات الجلسة الحالية
    localStorage.removeItem('gh_token');
    localStorage.removeItem('app_role');
    localStorage.removeItem('saved_user');
    localStorage.removeItem('saved_pass');
    location.reload();
}

// تحديث window.onload
window.onload = async function() {
    if (githubToken) {
        await fetchUsersFromGitHub();
    }
    
    renderUsersTable();
    renderHolidays();

    const savedToken = localStorage.getItem('gh_token');
    const savedRole = localStorage.getItem('app_role');
    const savedUser = localStorage.getItem('saved_user');

    if (savedToken && savedRole) {
        githubToken = savedToken; // استرجاع التوكن المحفوظ تلقائياً
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-nav').style.display = 'flex';
        setupPermissions();
        await fetchDataFromGitHub();
    } else if (savedUser) {
        document.getElementById('loginUser').value = savedUser;
        document.getElementById('loginPass').value = localStorage.getItem('saved_pass') || "";
        document.getElementById('ghTokenInput').value = savedToken || "";
    }
};

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
// Handle Upload
async function handleUpload() {
    const file = document.getElementById('csvFile').files[0];
    
    // التعديل هنا: نستخدم المتغير githubToken الذي تم تعريفه عالمياً وتعبئته عند تسجيل الدخول
    // بدلاً من سحب القيمة من عنصر HTML قد لا يكون موجوداً في هذه الشاشة
    if (!githubToken) {
        return alert("GitHub Token is missing. Please log in again or ensure it's provided.");
    }

    if (!file) return alert("Please select a file first");

    // تخزين التوكن الحالي في LocalStorage لضمان استمراريته
    localStorage.setItem('gh_token', githubToken); 

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            rawData = results.data;
            processData(); // الدالة الموجودة مسبقاً
            await uploadToGitHub();
            showView('business-view');
        }
    });
}

async function uploadToGitHub() {
    const statusDiv = document.getElementById('sync-status');
    statusDiv.style.display = 'block';
    statusDiv.innerText = "🚀 Uploading to GitHub...";

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(rawData))));
    
    // نحتاج أولاً لمعرفة إذا كان الملف موجوداً للحصول على الـ SHA الخاص به
    let sha = "";
    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            sha = data.sha;
        }
    } catch (e) {}

    const response = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${githubToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: "Update productivity data",
            content: content,
            sha: sha, // ضروري لتحديث ملف موجود
            branch: GH_CONFIG.branch
        })
    });

    if (response.ok) {
        statusDiv.innerText = "✅ Successfully synced to GitHub!";
    } else {
        alert("Error uploading to GitHub. Check your token and repo permissions.");
    }
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
                testedDate: row['Tested Date'],
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
        let dbOrig = 0, dbActual = 0, dbNames = new Set(); // متغيرات جديدة للـ DB

        us.tasks.forEach(t => {
            const orig = parseFloat(t['Original Estimation']) || 0;
            const actDev = parseFloat(t['TimeSheet_DevActualTime']) || 0;
            const actTest = parseFloat(t['TimeSheet_TestingActualTime']) || 0;
            const activity = t['Activity'];

            if (activity === 'DB Modification') {
                dbOrig += orig;
                dbActual += actDev;
                if (t['Assigned To']) dbNames.add(t['Assigned To']); // جمع أسماء مسؤولي الـ DB
            } else if (activity === 'Development') {
                devOrig += orig;
                devActual += actDev;
            } else if (activity === 'Testing') {
                testOrig += orig;
                testActual += actTest;
            }
        });

        // تخزين بيانات الـ DB
        us.dbEffort = { 
            orig: dbOrig, 
            actual: dbActual, 
            dev: dbOrig / (dbActual || 1),
            names: Array.from(dbNames).join(', ') || 'N/A'
        };

        us.devEffort = { orig: devOrig, actual: devActual, dev: devOrig / (devActual || 1) };
        us.testEffort = { orig: testOrig, actual: testActual, dev: testOrig / (testActual || 1) };

        // ... بقية الكود الخاص بالـ Rework والـ Timeline كما هو دون تغيير ...
        let bugOrig = 0, bugActualTotal = 0, bugsNoTimesheet = 0;
        us.bugs.forEach(b => {
            bugOrig += parseFloat(b['Original Estimation']) || 0;
            let bDevAct = parseFloat(b['TimeSheet_DevActualTime']) || 0;
            bugActualTotal += bDevAct;
            if (bDevAct === 0) bugsNoTimesheet++;
        });

        us.rework = {
            timeEstimation: bugOrig,
            actualTime: bugActualTotal,
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

    if (viewId === 'iteration-view') renderIterationView();
    if (viewId === 'business-view') renderBusinessView();
    if (viewId === 'team-view') renderTeamView();
    if (viewId === 'people-view') renderPeopleView();
    if (viewId === 'not-tested-view') renderNotTestedView();
    if (viewId === 'users-view') renderUsersTable();
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

            const devTasksSorted = us.tasks
                .filter(t => t.Activity !== 'Testing')
                .sort((a, b) => new Date(a['Activated Date'] || 0) - new Date(b['Activated Date'] || 0));

            const testingTasksSorted = us.tasks
                .filter(t => t.Activity === 'Testing')
                .sort((a, b) => parseInt(a.id || 0) - parseInt(b.id || 0));

            const sortedTasks = [...devTasksSorted, ...testingTasksSorted];

            // 1. الجدول العلوي المحدث مع بيانات البجات وتواريخ اليوزر ستوري
           html += `
    <div class="card" style="margin-bottom: 30px; border-left: 5px solid #2980b9; overflow-x: auto;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
            <h4>ID: ${us.id} - ${us.title}</h4>
            <div style="text-align: right; font-size: 0.85em; color: #2c3e50; background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #ddd; line-height: 1.6;">
                <div><b style="color: #27ae60;">US Start (First Task):</b> ${formatDate(sortedTasks[0]?.expectedStart)}</div>
                <div><b style="color: #3498db;">US Actual End (Tested):</b> ${formatDate(us.testedDate)}</div>
            </div>
        </div>
                    <p>
                        <b>Dev Lead:</b> ${us.devLead} | 
                        <b>Tester Lead:</b> ${us.testerLead} | 
                        <b style="color: #8e44ad;">DB Mod:</b> ${us.dbEffort.names}
                    </p>
                    <table>
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Est. (H)</th>
                                <th>Actual (H)</th>
                                <th>Bugs Count</th>
                                <th>Bugs Work (H)</th>
                                <th>Index</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Dev (Excl. DB)</td>
                                <td>${us.devEffort.orig.toFixed(1)}</td>
                                <td>${us.devEffort.actual.toFixed(1)}</td>
                                <td rowspan="3" style="text-align:center; vertical-align:middle; font-weight:bold; background:#fff5f5; border: 1px solid #ffebeb;">${us.rework.count}</td>
                                <td rowspan="3" style="text-align:center; vertical-align:middle; font-weight:bold; background:#fff5f5; color:#c0392b; border: 1px solid #ffebeb;">${us.rework.actualTime.toFixed(1)}h</td>
                                <td class="${us.devEffort.dev < 1 ? 'alert-red' : ''}">${us.devEffort.dev.toFixed(2)}</td>
                            </tr>
                            <tr style="background: #f4ecf7;">
                                <td>DB Modification</td>
                                <td>${us.dbEffort.orig.toFixed(1)}</td>
                                <td>${us.dbEffort.actual.toFixed(1)}</td>
                                <td class="${us.dbEffort.dev < 1 ? 'alert-red' : ''}">${us.dbEffort.dev.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td>Test</td>
                                <td>${us.testEffort.orig.toFixed(1)}</td>
                                <td>${us.testEffort.actual.toFixed(1)}</td>
                                <td class="${us.testEffort.dev < 1 ? 'alert-red' : ''}">${us.testEffort.dev.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <h5 style="margin: 20px 0 10px 0; color: #2c3e50;">Tasks Timeline & Schedule:</h5>
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
                                <th>Act. End</th> 
                                <th>TS Total</th>
                                <th>Delay</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedTasks.map(t => {
                                const tsTotal = (parseFloat(t['TimeSheet_DevActualTime']) || 0) + (parseFloat(t['TimeSheet_TestingActualTime']) || 0);
                                const est = parseFloat(t['Original Estimation']) || 0;
                                const actualEnd = t['Actual End'] || t['Resolved Date'];
                                return `
                                <tr>
                                    <td>${t['ID']}</td>
                                    <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${t['Title']}">${t['Title'] || 'N/A'}</td>
                                    <td>${t['Activity']}</td>
                                    <td>${est}</td>
                                    <td style="background-color: #e8f4fd; font-weight: 500;">${formatDate(t.expectedStart)}</td>
                                    <td>${formatDate(t.expectedEnd)}</td>
                                    <td style="background-color: #eafaf1; font-weight: 500;">${formatDate(t['Activated Date'])}</td>
                                    <td>${formatDate(actualEnd)}</td> 
                                    <td>${tsTotal}</td>
                                    <td class="${calculateHourDiff(t.expectedStart, t['Activated Date']) > 0 ? 'alert-red' : ''}">
                                        ${calculateHourDiff(t.expectedStart, t['Activated Date'])}h
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>`;

            // إكمال باقي الدالة (Progress Bar & Rework Analysis)
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
                                ? `⚠️ ${us.rework.missingTimesheet} Bugs missing Timesheet` 
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
                    </div>
                </div>
            </div>`; 
        });
        html += `</div>`;
    }
    container.innerHTML = html;
}
function renderTeamView() {
    const container = document.getElementById('team-view');
    if (!processedStories || processedStories.length === 0) {
        container.innerHTML = "<div class='card'><h2>Team Performance</h2><p>No data available.</p></div>";
        return;
    }

    const grouped = groupBy(processedStories, 'businessArea');
    let html = `
    <div style="direction: ltr; text-align: left; font-family: 'Segoe UI', sans-serif;">
        <h2 style="margin-bottom:25px; color: #2c3e50; border-left: 5px solid #2ecc71; padding-left: 15px;">
            🚀 Team Performance Analytics <small style="font-size: 0.5em; color: #7f8c8d; display: block;">Aggregated by Business Area</small>
        </h2>`;

    for (let area in grouped) {
        // --- 1. تجميع الإحصائيات للمنطقة ---
        let stats = {
            devEst: 0, devAct: 0,
            testEst: 0, testAct: 0,
            dbEst: 0, dbAct: 0,
            reworkTime: 0, bugsCount: 0,
            totalStories: grouped[area].length,
            completedStories: grouped[area].filter(us => us.status === 'Tested').length,
            devLeads: new Set(),
            testerLeads: new Set()
        };

        grouped[area].forEach(us => {
            stats.devEst += us.devEffort.orig;
            stats.devAct += us.devEffort.actual;
            stats.testEst += us.testEffort.orig;
            stats.testAct += us.testEffort.actual;
            stats.dbEst += us.dbEffort.orig;
            stats.dbAct += us.dbEffort.actual;
            stats.reworkTime += us.rework.actualTime;
            stats.bugsCount += us.rework.count;
            if (us.devLead) stats.devLeads.add(us.devLead);
            if (us.testerLead) stats.testerLeads.add(us.testerLead);
        });

        const totalActualHours = stats.devAct + stats.testAct + stats.dbAct + stats.reworkTime;
        const completionRate = ((stats.completedStories / stats.totalStories) * 100).toFixed(1);
        
        // حساب المؤشرات
        const devIndex = stats.devEst / (stats.devAct || 1);
        const testIndex = stats.testEst / (stats.testAct || 1);
        const dbIndex = stats.dbEst / (stats.dbAct || 1);
        const reworkRatio = ((stats.reworkTime / (stats.devAct || 1)) * 100).toFixed(1);

        html += `
        <div class="business-section" style="margin-bottom: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; border-top: 6px solid #2ecc71;">
            
            <div style="background: #f8f9fa; padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin:0; color: #2c3e50; font-size: 1.4em;">${area}</h3>
                    <div style="font-size: 0.85em; color: #7f8c8d; margin-top: 5px;">
                        <b>Leads:</b> ${Array.from(stats.devLeads).join(', ')} | <b>Testers:</b> ${Array.from(stats.testerLeads).join(', ')}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.2em; font-weight: bold; color: #2ecc71;">${completionRate}%</div>
                    <div style="font-size: 0.75em; color: #95a5a6;">${stats.completedStories} / ${stats.totalStories} Stories Tested</div>
                </div>
            </div>

            <div style="padding: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 25px;">
                    
                    <div style="background: #f9fdfa; border: 1px solid #d4edda; padding: 15px; border-radius: 10px;">
                        <h5 style="margin: 0 0 10px 0; color: #27ae60; font-size: 0.9em; text-transform: uppercase;">Productivity Indices</h5>
                        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95em;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Dev Index:</span>
                                <b style="color: ${devIndex < 0.8 ? '#e74c3c' : '#27ae60'}">${devIndex.toFixed(2)}</b>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Test Index:</span>
                                <b style="color: ${testIndex < 0.8 ? '#e74c3c' : '#27ae60'}">${testIndex.toFixed(2)}</b>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>DB Index:</span>
                                <b style="color: ${dbIndex < 0.8 ? '#e74c3c' : '#27ae60'}">${dbIndex.toFixed(2)}</b>
                            </div>
                        </div>
                    </div>

                    <div style="background: #f0f7ff; border: 1px solid #d1ecf1; padding: 15px; border-radius: 10px;">
                        <h5 style="margin: 0 0 10px 0; color: #2980b9; font-size: 0.9em; text-transform: uppercase;">Effort Allocation</h5>
                        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95em;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Total Actual:</span>
                                <b>${totalActualHours.toFixed(1)}h</b>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Pure Dev:</span>
                                <b>${stats.devAct.toFixed(1)}h</b>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>DB Mods:</span>
                                <b>${stats.dbAct.toFixed(1)}h</b>
                            </div>
                        </div>
                    </div>

                    <div style="background: #fff5f5; border: 1px solid #f8d7da; padding: 15px; border-radius: 10px;">
                        <h5 style="margin: 0 0 10px 0; color: #c0392b; font-size: 0.9em; text-transform: uppercase;">Quality Metrics</h5>
                        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95em;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Bugs Found:</span>
                                <b>${stats.bugsCount}</b>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Rework Time:</span>
                                <b style="color: #c0392b;">${stats.reworkTime.toFixed(1)}h</b>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Rework Ratio:</span>
                                <b style="color: #c0392b;">${reworkRatio}%</b>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: #7f8c8d; margin-bottom: 8px; font-weight: bold;">
                        <span>TIME DISTRIBUTION ACROSS ROLES</span>
                        <span>Total: ${totalActualHours.toFixed(1)} Hours</span>
                    </div>
                    <div style="display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: #eee; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="width: ${(stats.devAct/totalActualHours*100).toFixed(1)}%; background: #2ecc71;" title="Development"></div>
                        <div style="width: ${(stats.dbAct/totalActualHours*100).toFixed(1)}%; background: #f39c12;" title="DB Modification"></div>
                        <div style="width: ${(stats.reworkTime/totalActualHours*100).toFixed(1)}%; background: #e74c3c;" title="Rework (Bugs)"></div>
                        <div style="width: ${(stats.testAct/totalActualHours*100).toFixed(1)}%; background: #3498db;" title="Testing"></div>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.75em; margin-top: 10px; color: #666;">
                        <span><i style="display:inline-block; width:10px; height:10px; background:#2ecc71; border-radius:2px; margin-right:4px;"></i> Dev: ${((stats.devAct/totalActualHours)*100).toFixed(0)}%</span>
                        <span><i style="display:inline-block; width:10px; height:10px; background:#f39c12; border-radius:2px; margin-right:4px;"></i> DB: ${((stats.dbAct/totalActualHours)*100).toFixed(0)}%</span>
                        <span><i style="display:inline-block; width:10px; height:10px; background:#e74c3c; border-radius:2px; margin-right:4px;"></i> Rework: ${((stats.reworkTime/totalActualHours)*100).toFixed(0)}%</span>
                        <span><i style="display:inline-block; width:10px; height:10px; background:#3498db; border-radius:2px; margin-right:4px;"></i> Test: ${((stats.testAct/totalActualHours)*100).toFixed(0)}%</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}

function renderPeopleView() {
    const container = document.getElementById('people-view');
    if (!processedStories || processedStories.length === 0) {
        container.innerHTML = "<div class='card'><h2>People Performance</h2><p>No data available. Please upload a file first.</p></div>";
        return;
    }

    const areaMap = {};

    // 1. تجميع البيانات وتصنيفها
    processedStories.forEach(us => {
        const area = us.businessArea || 'General';
        if (!areaMap[area]) {
            areaMap[area] = { devs: {}, testers: {}, dbMods: {} };
        }

        // إحصائيات المطورين (Development)
        if (us.devLead) {
            const d = us.devLead;
            if (!areaMap[area].devs[d]) {
                areaMap[area].devs[d] = { name: d, est: 0, act: 0, bugs: 0, rwTime: 0, stories: 0 };
            }
            areaMap[area].devs[d].est += us.devEffort.orig;
            areaMap[area].devs[d].act += us.devEffort.actual;
            areaMap[area].devs[d].bugs += us.rework.count;
            areaMap[area].devs[d].rwTime += us.rework.actualTime;
            areaMap[area].devs[d].stories++;
        }

        // إحصائيات المختبرين (Testing)
        if (us.testerLead) {
            const t = us.testerLead;
            if (!areaMap[area].testers[t]) {
                areaMap[area].testers[t] = { name: t, est: 0, act: 0, stories: 0 };
            }
            areaMap[area].testers[t].est += us.testEffort.orig;
            areaMap[area].testers[t].act += us.testEffort.actual;
            areaMap[area].testers[t].stories++;
        }

        // إحصائيات تعديل قواعد البيانات (DB Modification)
        // نستخدم حقل us.dbEffort.names الذي قمت بتعريفه سابقاً في calculateMetrics
        if (us.dbEffort && us.dbEffort.names !== 'N/A') {
            const names = us.dbEffort.names.split(', ');
            names.forEach(dbName => {
                const name = dbName.trim();
                if (!areaMap[area].dbMods[name]) {
                    areaMap[area].dbMods[name] = { name: name, est: 0, act: 0, stories: 0 };
                }
                // توزيع الإحصائيات (تقريبياً لكل مسؤول في الستوري الواحدة)
                areaMap[area].dbMods[name].est += (us.dbEffort.orig / names.length);
                areaMap[area].dbMods[name].act += (us.dbEffort.actual / names.length);
                areaMap[area].dbMods[name].stories++;
            });
        }
    });

    // 2. بناء واجهة العرض
    let html = '<h2 style="margin-bottom:25px; color: #2c3e50;">👥 Multi-Disciplinary Performance Analytics</h2>';

    for (let area in areaMap) {
        html += `
        <div class="business-section" style="margin-bottom: 50px; background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); overflow: hidden; border-top: 5px solid #2c3e50;">
            <div style="background: #2c3e50; color: white; padding: 15px 25px;">
                <h3 style="margin:0; font-size: 1.5em; letter-spacing: 1px;">${area}</h3>
            </div>
            
            <div style="padding: 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
                
                <div style="background: #f9fdfa; border: 1px solid #d4edda; border-radius: 8px; padding: 15px;">
                    <h4 style="color: #27ae60; border-bottom: 2px solid #27ae60; padding-bottom: 10px; margin-top:0;">💻 Developers</h4>
                    ${generateModernCards(areaMap[area].devs, 'dev')}
                </div>

                <div style="background: #f0f7ff; border: 1px solid #d1ecf1; border-radius: 8px; padding: 15px;">
                    <h4 style="color: #2980b9; border-bottom: 2px solid #2980b9; padding-bottom: 10px; margin-top:0;">🔍 Testers</h4>
                    ${generateModernCards(areaMap[area].testers, 'test')}
                </div>

                <div style="background: #fffbf0; border: 1px solid #ffeeba; border-radius: 8px; padding: 15px;">
                    <h4 style="color: #f39c12; border-bottom: 2px solid #f39c12; padding-bottom: 10px; margin-top:0;">🗄️ DB Specialists</h4>
                    ${generateModernCards(areaMap[area].dbMods, 'db')}
                </div>

            </div>
        </div>`;
    }
    container.innerHTML = html;
}

function generateModernCards(dataObj, type) {
    const keys = Object.keys(dataObj);
    if (keys.length === 0) return '<p style="color:#999; font-style:italic; font-size:0.9em;">No data in this section</p>';

    return keys.map(name => {
        const p = dataObj[name];
        const index = p.est / (p.act || 1);
        const efficiencyColor = index >= 0.9 ? '#27ae60' : (index >= 0.7 ? '#f39c12' : '#e74c3c');

        return `
        <div style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 12px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
            <div style="font-weight: bold; color: #34495e; border-bottom: 1px solid #f0f0f0; padding-bottom: 5px; margin-bottom: 8px; display: flex; justify-content: space-between;">
                <span>${p.name}</span>
                <span style="font-size: 0.75em; color: #7f8c8d;">${p.stories} Stories</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85em;">
                <div title="Estimated Hours">Est: <b>${p.est.toFixed(1)}h</b></div>
                <div title="Actual Hours">Act: <b>${p.act.toFixed(1)}h</b></div>
                <div title="Efficiency Index" style="color: ${efficiencyColor}">Idx: <b>${index.toFixed(2)}</b></div>
                ${type === 'dev' ? `
                    <div style="color: #c0392b;" title="Bugs Count">Bugs: <b>${p.bugs}</b></div>
                    <div style="grid-column: span 2; background: #fff5f5; padding: 4px; border-radius: 4px; margin-top: 4px; color: #c0392b;">
                        Rework: <b>${p.rwTime.toFixed(1)}h</b>
                    </div>
                ` : ''}
                ${type === 'test' ? `<div style="grid-column: span 2; color: #2980b9;">QA Effort Recorded</div>` : ''}
                ${type === 'db' ? `<div style="grid-column: span 2; color: #d35400;">Data Modification</div>` : ''}
            </div>
        </div>`;
    }).join('');
}function renderNotTestedView() {
    const container = document.getElementById('not-tested-view');
    // تصفية القصص التي لم تختبر بعد
    const notTested = processedStories.filter(us => us.status !== 'Tested');
    const grouped = groupBy(notTested, 'businessArea');
    
    let html = '<h2>Not Yet Tested - Detailed Analysis</h2>';
    
    if (notTested.length === 0) {
        html += '<div class="card"><p style="text-align:center; color: #27ae60; font-weight: bold;">✅ All Stories are Tested!</p></div>';
        container.innerHTML = html;
        return;
    }

    const formatDate = (date) => {
        if (!date || isNaN(new Date(date))) return 'N/A';
        return new Date(date).toLocaleString('en-GB', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    };

    for (let area in grouped) {
        html += `<div class="business-section"><h3 class="business-area-title">${area}</h3>`;
        
        grouped[area].forEach(us => {
            // ترتيب المهام (نفس المنطق المستخدم في البزنس فيو)
            const devTasksSorted = us.tasks
                .filter(t => t.Activity !== 'Testing')
                .sort((a, b) => new Date(a['Activated Date'] || 0) - new Date(b['Activated Date'] || 0));

            const testingTasksSorted = us.tasks
                .filter(t => t.Activity === 'Testing')
                .sort((a, b) => parseInt(a.id || 0) - parseInt(b.id || 0));

            const sortedTasks = [...devTasksSorted, ...testingTasksSorted];

            html += `
                <div class="card" style="margin-bottom: 30px; border-left: 5px solid #e67e22; overflow-x: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4>ID: ${us.id} - ${us.title}</h4>
                        <span style="background: #eee; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">Status: <b>${us.status}</b></span>
                    </div>
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

                    <h5 style="margin: 10px 0;">Tasks Timeline:</h5>
                    <table style="font-size: 0.85em; width: 100%;">
                        <thead>
                            <tr style="background:#eee;">
                                <th>ID</th><th>Task Name</th><th>Activity</th><th>Est</th><th>Exp. Start</th><th>Exp. End</th><th>Act. Start</th><th>TS Total</th><th>Delay</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedTasks.map(t => {
                                const tsTotal = (parseFloat(t['TimeSheet_DevActualTime']) || 0) + (parseFloat(t['TimeSheet_TestingActualTime']) || 0);
                                const est = parseFloat(t['Original Estimation']) || 0;
                                const delay = calculateHourDiff(t.expectedStart, t['Activated Date']);
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
                                    <td class="${delay > 0 ? 'alert-red' : ''}">${delay}h</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
        });
        html += `</div>`;
}
    container.innerHTML = html;
}

// دالة التجميع (Helper Function)
function groupBy(arr, key) {
    return arr.reduce((acc, obj) => {
        (acc[obj[key]] = acc[obj[key]] || []).push(obj);
        return acc;
    }, {});
}
function renderIterationView() {
    const container = document.getElementById('iteration-view');
    if (!processedStories || processedStories.length === 0) {
        container.innerHTML = "<div class='card'><h2>Iteration Summary</h2><p>No data available. Please upload a file first.</p></div>";
        return;
    }

    // --- 1. الحسابات التجميعية الشاملة (Global Aggregation) ---
    let stats = {
        devEst: 0, devAct: 0,
        testEst: 0, testAct: 0,
        dbEst: 0, dbAct: 0,
        reworkAct: 0, bugsCount: 0,
        totalStories: processedStories.length,
        completedStories: processedStories.filter(s => s.status === 'Tested').length
    };

    processedStories.forEach(us => {
        stats.devEst += us.devEffort.orig;
        stats.devAct += us.devEffort.actual;
        stats.testEst += us.testEffort.orig;
        stats.testAct += us.testEffort.actual;
        stats.dbEst += us.dbEffort.orig;
        stats.dbAct += us.dbEffort.actual;
        stats.reworkAct += us.rework.actualTime;
        stats.bugsCount += us.rework.count;
    });

    const totalActualTime = stats.devAct + stats.testAct + stats.dbAct + stats.reworkAct;
    const deliveryIndex = (stats.devEst + stats.testEst + stats.dbEst) / (totalActualTime || 1);
    const iterationHealth = Math.max(0, 100 - (stats.reworkAct / (stats.devAct || 1) * 100)).toFixed(1);
    const reworkRatio = ((stats.reworkAct / (stats.devAct || 1)) * 100).toFixed(1);

    // --- 2. بناء الهيكل المرئي (UI Structure) ---
    let html = `
    <div style="direction: ltr; text-align: left; font-family: 'Segoe UI', sans-serif; padding: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 3px solid #34495e; padding-bottom: 10px;">
            <h2 style="margin:0; color: #2c3e50;">🚀 Iteration Executive Summary</h2>
            <div style="background: #34495e; color: white; padding: 5px 15px; border-radius: 20px; font-size: 0.9em;">
                Iteration Scope: <b>${stats.totalStories} Stories</b>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
            
            <div class="card" style="border-top: 5px solid #2ecc71; background: #fff;">
                <h5 style="color: #7f8c8d; margin: 0; font-size: 0.8em; text-transform: uppercase;">Health Score</h5>
                <div style="font-size: 2em; font-weight: bold; color: #2ecc71;">${iterationHealth}%</div>
                <p style="font-size: 0.7em; color: #95a5a6; margin: 5px 0 0;">Overall Quality Stability</p>
            </div>

            <div class="card" style="border-top: 5px solid #3498db; background: #fff;">
                <h5 style="color: #7f8c8d; margin: 0; font-size: 0.8em; text-transform: uppercase;">Delivery Index</h5>
                <div style="font-size: 2em; font-weight: bold; color: #3498db;">${deliveryIndex.toFixed(2)}</div>
                <p style="font-size: 0.7em; color: #95a5a6; margin: 5px 0 0;">Est. vs Actual Efficiency</p>
            </div>

            <div class="card" style="border-top: 5px solid #e74c3c; background: #fff;">
                <h5 style="color: #7f8c8d; margin: 0; font-size: 0.8em; text-transform: uppercase;">Rework Ratio</h5>
                <div style="font-size: 2em; font-weight: bold; color: #e74c3c;">${reworkRatio}%</div>
                <p style="font-size: 0.7em; color: #95a5a6; margin: 5px 0 0;">Time Spent Fixing Bugs</p>
            </div>

            <div class="card" style="border-top: 5px solid #f39c12; background: #fff;">
                <h5 style="color: #7f8c8d; margin: 0; font-size: 0.8em; text-transform: uppercase;">Completion</h5>
                <div style="font-size: 2em; font-weight: bold; color: #f39c12;">${stats.completedStories}/${stats.totalStories}</div>
                <p style="font-size: 0.7em; color: #95a5a6; margin: 5px 0 0;">Stories Marked as Tested</p>
            </div>
        </div>

        <div class="card" style="margin-bottom: 30px; background: #fdfdfd; border: 1px solid #eee;">
            <h4 style="margin-top: 0; color: #34495e; font-size: 1.1em;">⏱️ Iteration Effort Allocation (Total: ${totalActualTime.toFixed(1)}h)</h4>
            <div style="display: flex; height: 30px; border-radius: 15px; overflow: hidden; background: #eee; margin: 15px 0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);">
                <div style="width: ${(stats.devAct/totalActualTime*100).toFixed(1)}%; background: #2ecc71;" title="Pure Development"></div>
                <div style="width: ${(stats.dbAct/totalActualTime*100).toFixed(1)}%; background: #f39c12;" title="DB Modification"></div>
                <div style="width: ${(stats.reworkAct/totalActualTime*100).toFixed(1)}%; background: #e74c3c;" title="Rework (Fixes)"></div>
                <div style="width: ${(stats.testAct/totalActualTime*100).toFixed(1)}%; background: #3498db;" title="Testing/QA"></div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 20px; font-size: 0.85em; justify-content: center;">
                <span><i style="display:inline-block; width:12px; height:12px; background:#2ecc71; margin-right:5px;"></i> Dev: <b>${(stats.devAct/totalActualTime*100).toFixed(0)}%</b></span>
                <span><i style="display:inline-block; width:12px; height:12px; background:#f39c12; margin-right:5px;"></i> DB: <b>${(stats.dbAct/totalActualTime*100).toFixed(0)}%</b></span>
                <span><i style="display:inline-block; width:12px; height:12px; background:#e74c3c; margin-right:5px;"></i> Rework: <b>${(stats.reworkAct/totalActualTime*100).toFixed(0)}%</b></span>
                <span><i style="display:inline-block; width:12px; height:12px; background:#3498db; margin-right:5px;"></i> QA: <b>${(stats.testAct/totalActualTime*100).toFixed(0)}%</b></span>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px;">
            <div class="card" style="background: white;">
                <h4 style="margin-top:0; border-bottom: 2px solid #eee; padding-bottom: 10px;">🏢 Area Efficiency Matrix</h4>
                <table style="width: 100%; font-size: 0.9em; border-collapse: collapse;">
                    <thead>
                        <tr style="text-align: left; color: #7f8c8d; border-bottom: 2px solid #f4f4f4;">
                            <th style="padding: 10px 5px;">Business Area</th>
                            <th>Actual (H)</th>
                            <th>Index</th>
                            <th>Health</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(groupBy(processedStories, 'businessArea')).map(([area, stories]) => {
                            let aDev = 0, aEst = 0, aRew = 0;
                            stories.forEach(s => { 
                                aDev += s.devEffort.actual; 
                                aEst += s.devEffort.orig; 
                                aRew += s.rework.actualTime;
                            });
                            const aIdx = aEst / (aDev || 1);
                            const aHealth = Math.max(0, 100 - (aRew / (aDev || 1) * 100));
                            return `
                            <tr style="border-bottom: 1px solid #f9f9f9;">
                                <td style="padding: 12px 5px;"><b>${area}</b></td>
                                <td>${aDev.toFixed(1)}h</td>
                                <td style="color: ${aIdx < 0.8 ? '#e74c3c' : '#27ae60'}"><b>${aIdx.toFixed(2)}</b></td>
                                <td>
                                    <div style="width:50px; background:#eee; height:6px; border-radius:3px;">
                                        <div style="width:${aHealth}%; background:${aHealth < 70 ? '#e74c3c' : '#2ecc71'}; height:100%; border-radius:3px;"></div>
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <div class="card" style="background: white; border-left: 5px solid #e74c3c;">
                <h4 style="margin-top:0; color: #c0392b;">🚩 Top Iteration Bottlenecks</h4>
                <p style="font-size: 0.8em; color: #7f8c8d; margin-bottom: 15px;">Stories requiring the most rework effort</p>
                ${processedStories
                    .sort((a, b) => b.rework.actualTime - a.rework.actualTime)
                    .slice(0, 4)
                    .map(us => `
                    <div style="padding: 10px; background: #fff5f5; border-radius: 8px; margin-bottom: 10px; border: 1px solid #ffebeb;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.85em;">
                            <span style="font-weight: bold; color: #c0392b;">US: ${us.id}</span>
                            <span style="color: #e74c3c; font-weight:bold;">${us.rework.actualTime.toFixed(1)}h Rework</span>
                        </div>
                        <div style="font-size: 0.8em; color: #34495e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 5px;">
                            ${us.title}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>`;

    container.innerHTML = html;
}
// السطر الأخير الصحيح لإغلاق الملف وتشغيل الدوال الأولية
renderHolidays();
































































