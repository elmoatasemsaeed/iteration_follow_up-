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
    // إضافة رأس الجدول الجديد (RW Time) إذا كان الشخص ديف
    let tableHtml = `<table><thead><tr>
        <th>Name</th>
        <th>S.</th>
        <th>Est</th>
        <th>Act</th>
        <th>Idx</th>
        ${isDev ? '<th>RW Time</th><th>%RW</th>' : ''} 
    </tr></thead><tbody>`;

    for (let p in statsObj) {
        let person = statsObj[p];
        let index = person.est / (person.act || 1);
        
        // حساب نسبة الريورك
        let reworkPerc = isDev ? ((person.reworkTime / (person.act || 1)) * 100).toFixed(1) : 0;
        
        tableHtml += `<tr>
            <td>${person.name}</td>
            <td>${person.stories}</td>
            <td>${person.est.toFixed(1)}</td>
            <td>${person.act.toFixed(1)}</td>
            <td class="${index < 1 ? 'alert-red' : ''}">${index.toFixed(2)}</td>
            ${isDev ? `
                <td>${person.reworkTime.toFixed(1)}h</td>
                <td style="color: ${reworkPerc > 25 ? '#e74c3c' : '#2c3e50'}">${reworkPerc}%</td>
            ` : ''}
        </tr>`;
    }
    return tableHtml + '</tbody></table>';
}
function renderNotTestedView() {
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
        container.innerHTML = "<h2>Iteration Summary</h2><p>No data available. Please upload a file first.</p>";
        return;
    }

    // 1. حساب الإجماليات
    let totalDevEst = 0, totalDevAct = 0;
    let totalTestEst = 0, totalTestAct = 0;
    let totalBugs = 0, totalReworkTime = 0;
    let startDates = [];

    processedStories.forEach(us => {
        totalDevEst += us.devEffort.orig;
        totalDevAct += us.devEffort.actual;
        totalTestEst += us.testEffort.orig;
        totalTestAct += us.testEffort.actual;
        totalBugs += us.rework.count;
        totalReworkTime += us.bugs.reduce((s, b) => s + (parseFloat(b['TimeSheet_DevActualTime']) || 0) + (parseFloat(b['TimeSheet_TestingActualTime']) || 0), 0);
        if (us.activatedDate) startDates.push(new Date(us.activatedDate));
    });

    const iterationStart = startDates.length > 0 ? new Date(Math.min(...startDates)).toLocaleDateString('en-GB') : 'N/A';
    const totalReworkPerc = totalDevAct > 0 ? ((totalReworkTime / totalDevAct) * 100).toFixed(1) : 0;

    // 2. تحليل أداء الأفراد (الديف تيم)
    let devStats = {};
    processedStories.forEach(us => {
        if (us.devLead) {
            if (!devStats[us.devLead]) devStats[us.devLead] = { name: us.devLead, est: 0, act: 0 };
            devStats[us.devLead].est += us.devEffort.orig;
            devStats[us.devLead].act += us.devEffort.actual;
        }
    });

    let devArray = Object.values(devStats).map(d => ({
        ...d,
        index: d.est / (d.act || 1)
    })).sort((a, b) => b.index - a.index); // ترتيب من الأعلى للأقل

    const bestPerformer = devArray[0];
    const lowPerformer = devArray[devArray.length - 1];

    // 3. بناء واجهة العرض (HTML)
    let html = `
        <h2>Iteration Global Summary</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">
            <div class="card" style="border-top: 5px solid #3498db;">
                <small>Iteration Start Date</small><br><b style="font-size: 1.2em;">📅 ${iterationStart}</b>
            </div>
            <div class="card" style="border-top: 5px solid #2ecc71;">
                <small>Total Dev Effort (Est vs Act)</small><br><b>${totalDevEst.toFixed(1)}h / ${totalDevAct.toFixed(1)}h</b>
            </div>
            <div class="card" style="border-top: 5px solid #e74c3c;">
                <small>Total Rework (Bugs Time)</small><br><b>${totalReworkTime.toFixed(1)}h (${totalReworkPerc}%)</b>
            </div>
             <div class="card" style="border-top: 5px solid #f1c40f;">
                <small>Total Bugs Count</small><br><b>🐞 ${totalBugs} Bugs</b>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="card">
                <h3>🏆 Top Performer (Dev)</h3>
                ${bestPerformer ? `
                    <p><b>Name:</b> ${bestPerformer.name}</p>
                    <p><b>Efficiency Index:</b> <span style="color:green; font-weight:bold;">${bestPerformer.index.toFixed(2)}</span></p>
                    <small>(Higher index means better estimation adherence)</small>
                ` : 'N/A'}
            </div>
            <div class="card">
                <h3>⚠️ Needs Support (Dev)</h3>
                ${lowPerformer && lowPerformer !== bestPerformer ? `
                    <p><b>Name:</b> ${lowPerformer.name}</p>
                    <p><b>Efficiency Index:</b> <span style="color:red; font-weight:bold;">${lowPerformer.index.toFixed(2)}</span></p>
                    <small>(Lower index means actual time was much higher than estimation)</small>
                ` : 'N/A'}
            </div>
        </div>

        <div class="card">
            <h3>Iteration KPIs</h3>
            <table style="width:100%">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th>Metric</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Total Stories Processed</td><td>${processedStories.length}</td></tr>
                    <tr><td>Total Testing Actual Time</td><td>${totalTestAct.toFixed(1)}h</td></tr>
                    <tr><td>Dev-to-Test Ratio</td><td>1:${(totalTestAct / (totalDevAct || 1)).toFixed(2)}</td></tr>
                    <tr><td>Average Rework per Story</td><td>${(totalReworkTime / processedStories.length).toFixed(1)}h</td></tr>
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

// السطر الأخير الصحيح لإغلاق الملف وتشغيل الدوال الأولية
renderHolidays();








































