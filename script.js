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
                bugs: [],
                reviews: []
            };
            processedStories.push(currentStory);
        } else if (currentStory) {
            if (type === 'Task') currentStory.tasks.push(row);
            if (type === 'Bug') currentStory.bugs.push(row);
            if (type === 'Review') currentStory.reviews.push(row);
        }
    });

    calculateMetrics();
}

function calculateMetrics() {
    processedStories.forEach(us => {
        let devOrig = 0, devActual = 0, testOrig = 0, testActual = 0;
        let dbOrig = 0, dbActual = 0, dbNames = new Set(); 

        // 1. حساب مهام الـ Tasks (Development, Testing, DB)
        us.tasks.forEach(t => {
            const orig = parseFloat(t['Original Estimation']) || 0;
            const actDev = parseFloat(t['TimeSheet_DevActualTime']) || 0; // التأكد من تعريف actDev هنا
            const actTest = parseFloat(t['TimeSheet_TestingActualTime']) || 0;
            const activity = t['Activity'];

            if (activity === 'DB Modification') {
                dbOrig += orig;
                dbActual += actDev; // الآن actDev معرف ولن يظهر الخطأ
                if (t['Assigned To']) dbNames.add(t['Assigned To']); 
            } else if (activity === 'Development') {
                devOrig += orig;
                devActual += actDev;
            } else if (activity === 'Testing') {
                testOrig += orig;
                testActual += actTest;
            }
        });

        // تخزين بيانات الـ DB والـ Effort الأساسي
        us.dbEffort = { 
            orig: dbOrig, 
            actual: dbActual, 
            dev: dbOrig / (dbActual || 1),
            names: Array.from(dbNames).join(', ') || 'N/A'
        };
        us.devEffort = { orig: devOrig, actual: devActual, dev: devOrig / (devActual || 1) };
        us.testEffort = { orig: testOrig, actual: testActual, dev: testOrig / (testActual || 1) };

        // 2. حساب الـ Rework (Bugs العادية)
        let bugOrig = 0, bugActualTotal = 0, bugsNoTimesheet = 0;
        us.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

        us.bugs.forEach(b => {
            bugOrig += parseFloat(b['Original Estimation']) || 0;
            let bDevAct = parseFloat(b['TimeSheet_DevActualTime']) || 0;
            bugActualTotal += bDevAct;
            if (bDevAct === 0) bugsNoTimesheet++;

            const sev = b['Severity'] || "";
            if (sev.includes("1 - Critical")) us.severityCounts.critical++;
            else if (sev.includes("2 - High")) us.severityCounts.high++;
            else if (sev.includes("3 - Medium")) us.severityCounts.medium++;
            else if (sev.includes("4 - Low")) us.severityCounts.low++;
        });

        us.rework = {
            timeEstimation: bugOrig,
            actualTime: bugActualTotal,
            count: us.bugs.length,
            severity: us.severityCounts,
            missingTimesheet: bugsNoTimesheet,
            deviation: bugOrig / (bugActualTotal || 1),
            percentage: (bugActualTotal / (devActual || 1)) * 100
        };

        // 3. حساب الـ Review (الطلب الجديد)
us.reviewStats = {
    estimation: 0,
    devActual: 0, 
    testActual: 0,
    totalActual: 0, // سيتم تحديثه في النهاية
    devCount: 0,
    testCount: 0,
    count: us.reviews ? us.reviews.length : 0,
    severity: { critical: 0, high: 0, medium: 0, low: 0}
};

if (us.reviews) {
    us.reviews.forEach(r => {
        const rEst = parseFloat(r['Original Estimation']) || 0;
        const rDevAct = parseFloat(r['TimeSheet_DevActualTime']) || 0;
        const rTestAct = parseFloat(r['TimeSheet_TestingActualTime']) || 0;
        const activity = r['Activity'];
        const sev = r['Severity'] || "";

        us.reviewStats.estimation += rEst;

        if (activity === 'Development') {
            us.reviewStats.devActual += rDevAct;
            us.reviewStats.devCount++;
        } else if (activity === 'Testing') {
            us.reviewStats.testActual += rTestAct;
            us.reviewStats.testCount++;
        }

        if (sev.includes("1 - Critical")) us.reviewStats.severity.critical++;
        else if (sev.includes("2 - High")) us.reviewStats.severity.high++;
        else if (sev.includes("3 - Medium")) us.reviewStats.severity.medium++;
        else if (sev.includes("4 - Low")) us.reviewStats.severity.low++;
    });

    us.reviewStats.totalActual = us.reviewStats.devActual + us.reviewStats.testActual;
}
        // 4. حساب التوقيت والـ Cycle Time
        let minDate = Infinity;
        us.tasks.forEach(t => {
            const taskDate = new Date(t['Activated Date']).getTime();
            if (!isNaN(taskDate) && taskDate < minDate) minDate = taskDate;
        });

        const firstTaskStart = minDate === Infinity ? null : new Date(minDate);
        const storyEndDate = us.testedDate ? new Date(us.testedDate) : null;
        us.cycleTime = calculateCycleTimeDays(firstTaskStart, storyEndDate);

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

            // دالة مساعدة لعرض السيفيرتي كعدد ونسبة
            const renderSev = (sevObj, total) => {
                if (!total) return 'N/A';
                return `C: ${sevObj.critical} (${((sevObj.critical/total)*100).toFixed(0)}%) | 
                        H: ${sevObj.high} (${((sevObj.high/total)*100).toFixed(0)}%) | 
                        M: ${sevObj.medium} (${((sevObj.medium/total)*100).toFixed(0)}%) |
                        L: ${sevObj.low} (${((sevObj.low/total)*100).toFixed(0)}%)`;
            };

         html += `
<div class="card" style="margin-bottom: 30px; border-left: 5px solid #2980b9; overflow-x: auto;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
        <h4>ID: ${us.id} - ${us.title}</h4>
        <div style="text-align: right; font-size: 0.85em; color: #2c3e50; background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #ddd; line-height: 1.6;">
            <div><b style="color: #27ae60;">US Start:</b> ${formatDate(sortedTasks[0]?.expectedStart)}</div>
            <div><b style="color: #3498db;">US Actual End:</b> ${formatDate(us.testedDate)}</div>
            <div style="margin-top:5px; padding-top:5px; border-top:1px solid #eee;">
                <b style="color: #e67e22;">Cycle Time: ${us.cycleTime || 0} Working Days</b>
            </div>
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
            <th>Bugs / Reviews</th> 
            <th>Bugs Work (H)</th>
            <th>Review Work (H)</th> 
            <th>Effort Variance</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Dev (Excl. DB)</td>
            <td>${us.devEffort.orig.toFixed(1)}</td>
            <td>${us.devEffort.actual.toFixed(1)}</td>
            <td rowspan="3" style="text-align:center; vertical-align:middle; background:#fcfcfc; border: 1px solid #eee;">
                <div style="margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px dashed #ddd;">
                    <b style="color:#c0392b;">Bugs: ${us.rework.count}</b>
                    <div style="font-size: 0.7em; color: #666; margin-top:3px;">
                        ${renderSev(us.rework.severity, us.rework.count)}
                    </div>
                </div>
                <div>
                    <b style="color:#8e44ad;">Reviews: ${us.reviewStats.count}</b>
                    <div style="font-size: 0.7em; color: #666; margin-top:3px;">
                        ${renderSev(us.reviewStats.severity, us.reviewStats.count)}
                    </div>
                    <div style="font-size: 0.75em; color: #444; font-weight:bold;">
                        (D:${us.reviewStats.devCount} | T:${us.reviewStats.testCount})
                    </div>
                </div>
            </td>
            <td rowspan="3" style="text-align:center; vertical-align:middle; background:#fff5f5;">
                <b style="color:#c0392b;">${us.rework.actualTime.toFixed(1)}h</b>
            </td>
            <td rowspan="3" style="text-align:center; vertical-align:middle; background:#f5f3ff;">
                <div style="color:#6d28d9; font-size:0.85em;">Dev: <b>${us.reviewStats.devActual.toFixed(1)}h</b></div>
                <div style="color:#2980b9; font-size:0.85em; margin-top:5px;">Test: <b>${us.reviewStats.testActual.toFixed(1)}h</b></div>
            </td>
           <td class="${us.devEffort.dev < 0.85 ? 'alert-red' : ''}"><b>${us.devEffort.dev.toFixed(2)}</b></td>
        </tr>
        <tr style="background: #f4ecf7;">
            <td>DB Modification</td>
            <td>${us.dbEffort.orig.toFixed(1)}</td>
            <td>${us.dbEffort.actual.toFixed(1)}</td>
            <td class="${us.dbEffort.dev < 0.85 ? 'alert-red' : ''}"><b>${us.dbEffort.dev.toFixed(2)}</b></td>
        </tr>
        <tr>
            <td>Test</td>
            <td>${us.testEffort.orig.toFixed(1)}</td>
            <td>${us.testEffort.actual.toFixed(1)}</td>
            <td class="${us.testEffort.dev < 0.85 ? 'alert-red' : ''}"><b>${us.testEffort.dev.toFixed(2)}</b></td>
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

            html += `
                <div style="background: #fdfdfd; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #eee; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h5 style="margin: 0; color: #2c3e50;">Quality & Review Analysis</h5>
                        <div style="display: flex; gap: 10px;">
                            <span style="background: #f5f3ff; color: #5b21b6; padding: 4px 10px; border-radius: 20px; font-size: 0.8em; font-weight: bold; border: 1px solid #ddd;">
                                🔎 Review Actual: Dev ${us.reviewStats.devActual.toFixed(1)}h | Test ${us.reviewStats.testActual.toFixed(1)}h
                            </span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 20px; align-items: center;">
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 5px;">
                                <span>Quality Ratio: <b>${(( (us.rework.actualTime + us.reviewStats.totalActual) / (us.devEffort.actual || 1)) * 100).toFixed(1)}%</b></span>
                            </div>
                            <div style="width: 100%; background: #eee; height: 10px; border-radius: 5px; overflow: hidden; display: flex;">
                                <div style="width: ${Math.min((us.rework.actualTime / (us.devEffort.actual || 1) * 100), 100)}%; background: #e74c3c;" title="Standard Bugs"></div>
                                <div style="width: ${Math.min((us.reviewStats.devActual / (us.devEffort.actual || 1) * 100), 100)}%; background: #8e44ad;" title="Dev Review"></div>
                                <div style="width: ${Math.min((us.reviewStats.testActual / (us.devEffort.actual || 1) * 100), 100)}%; background: #3498db;" title="Test Review"></div>
                            </div>
                        </div>
                    </div>
                </div></div>`; 
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
    <div style="direction: ltr; text-align: left; font-family: 'Segoe UI', Tahoma, sans-serif;">
        <h2 style="margin-bottom:30px; color: #2c3e50; border-left: 6px solid #2ecc71; padding-left: 20px; font-size: 1.8em;">
            🚀 Team Performance Analytics
        </h2>`;

    for (let area in grouped) {
        let stats = {
            devEst: 0, devAct: 0, testEst: 0, testAct: 0, dbEst: 0, dbAct: 0,
            reworkTime: 0, bugsCount: 0,
            bugsCrit: 0, bugsHigh: 0, bugsMed: 0, bugsLow: 0,
            reviewDevTime: 0, reviewTestTime: 0, reviewCount: 0,
            revCrit: 0, revHigh: 0, revMed: 0, revLow: 0,
            totalStories: grouped[area].length,
            totalCycleTime: 0
        };

        grouped[area].forEach(us => {
            stats.devEst += us.devEffort.orig;
            stats.devAct += us.devEffort.actual;
            stats.testEst += us.testEffort.orig;
            stats.testAct += us.testEffort.actual;
            stats.dbEst += us.dbEffort.orig;
            stats.dbAct += us.dbEffort.actual;
            stats.totalCycleTime += (us.cycleTime || 0);

            stats.reworkTime += us.rework.actualTime;
            stats.bugsCount += us.rework.count;
            stats.bugsCrit += us.rework.severity.critical;
            stats.bugsHigh += us.rework.severity.high;
            stats.bugsMed += us.rework.severity.medium;
            stats.bugsLow += us.rework.severity.low;

            stats.reviewCount += us.reviewStats.count;
            stats.reviewDevTime += us.reviewStats.devActual;
            stats.reviewTestTime += us.reviewStats.testActual;
            stats.revCrit += us.reviewStats.severity.critical;
            stats.revHigh += us.reviewStats.severity.high;
            stats.revMed += us.reviewStats.severity.medium;
            stats.revLow += us.reviewStats.severity.low;
        });

        const totalQualityTime = stats.reworkTime + stats.reviewDevTime + stats.reviewTestTime;
        const reworkRatio = (totalQualityTime / (stats.devAct || 1)) * 100;
        const reworkColor = reworkRatio > 15 ? '#d32f2f' : '#2e7d32';
        const totalTeamEst = stats.devEst + stats.testEst + stats.dbEst;
        const totalTeamAct = stats.devAct + stats.testAct + stats.dbAct;
        const teamEfficiency = (totalTeamEst / (totalTeamAct || 1)) * 100;
        const efficiencyColor = teamEfficiency >= 85 ? '#2e7d32' : '#d32f2f';
        const avgCycleTime = (stats.totalCycleTime / stats.totalStories).toFixed(1);

        // التعديل هنا: تكبير النسبة وتصغير الرقم
        const getSevBadges = (c, h, m, l, t) => {
            if (!t) return '<div style="color:#999; margin-top:5px; font-size:0.8em;">No items recorded</div>';
            
            const pct = (v) => ((v / t) * 100).toFixed(0);

            const badgeStyle = (bg, color, border) => `
                background:${bg}; color:${color}; padding:10px 5px; border-radius:10px; 
                text-align:center; flex:1; border:1px solid ${border}; 
                display: flex; flex-direction: column; justify-content: center;`;

            return `
            <div style="display: flex; gap: 8px; margin-top: 10px;">
                <div style="${badgeStyle('#ffeaed', '#c62828', '#ffcdd2')}">
                    <div style="font-size:0.6em; font-weight:bold; opacity:0.8;">CRIT</div>
                    <div style="font-size:1.4em; font-weight:900; line-height:1;">${pct(c)}%</div>
                    <div style="font-size:0.75em; margin-top:2px; font-weight:bold;">count: ${c}</div>
                </div>
                <div style="${badgeStyle('#fff3e0', '#ef6c00', '#ffe0b2')}">
                    <div style="font-size:0.6em; font-weight:bold; opacity:0.8;">HIGH</div>
                    <div style="font-size:1.4em; font-weight:900; line-height:1;">${pct(h)}%</div>
                    <div style="font-size:0.75em; margin-top:2px; font-weight:bold;">count: ${h}</div>
                </div>
                <div style="${badgeStyle('#e8f5e9', '#2e7d32', '#c8e6c9')}">
                    <div style="font-size:0.6em; font-weight:bold; opacity:0.8;">MED</div>
                    <div style="font-size:1.4em; font-weight:900; line-height:1;">${pct(m)}%</div>
                    <div style="font-size:0.75em; margin-top:2px; font-weight:bold;">count: ${m}</div>
                </div>
                <div style="${badgeStyle('#e3f2fd', '#1565c0', '#bbdefb')}">
                    <div style="font-size:0.6em; font-weight:bold; opacity:0.8;">LOW</div>
                    <div style="font-size:1.4em; font-weight:900; line-height:1;">${pct(l)}%</div>
                    <div style="font-size:0.75em; margin-top:2px; font-weight:bold;">count: ${l}</div>
                </div>
            </div>`;
        };

        html += `
        <div class="business-section" style="margin-bottom: 50px; background: white; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); overflow: hidden;">
            <div style="background: #2c3e50; color: white; padding: 18px 25px; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin:0; font-size: 1.5em;">📍 Area: ${area}</h3>
            </div>
            <div style="padding: 25px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 30px;">
                    <div style="background: ${efficiencyColor}0a; border: 2px solid ${efficiencyColor}; border-radius: 12px; padding: 20px; text-align: center;">
                        <span style="font-size: 0.85em; color: #555; font-weight: bold; text-transform: uppercase;">Effort Variance</span>
                        <div style="font-size: 2.8em; font-weight: 900; color: ${efficiencyColor}; margin: 10px 0;">${teamEfficiency.toFixed(1)}%</div>
                        <div style="font-size: 0.75em; color: white; background: ${efficiencyColor}; padding: 3px 12px; border-radius: 15px; display: inline-block;">
                            ${teamEfficiency >= 85 ? '🎯 On Track' : '⚠️ Low Efficiency'}
                        </div>
                    </div>
                    <div style="background: ${reworkColor}0a; border: 2px solid ${reworkColor}; border-radius: 12px; padding: 20px; text-align: center;">
                        <span style="font-size: 0.85em; color: #555; font-weight: bold; text-transform: uppercase;">Rework Ratio</span>
                        <div style="font-size: 2.8em; font-weight: 900; color: ${reworkColor}; margin: 10px 0;">${reworkRatio.toFixed(1)}%</div>
                        <div style="font-size: 0.75em; color: white; background: ${reworkColor}; padding: 3px 12px; border-radius: 15px; display: inline-block;">
                            Limit: 15% ${reworkRatio > 15 ? '⚠️' : '✅'}
                        </div>
                    </div>
                    <div style="background: #e3f2fd; border: 2px solid #1565c0; border-radius: 12px; padding: 20px; text-align: center;">
                        <span style="font-size: 0.85em; color: #1565c0; font-weight: bold; text-transform: uppercase;">Avg Cycle Time</span>
                        <div style="font-size: 2.8em; font-weight: 900; color: #1565c0; margin: 10px 0;">${avgCycleTime}</div>
                        <div style="font-size: 0.8em; color: #1565c0; font-weight: bold;">Working Days</div>
                    </div>
                    <div style="background: #fdfaf3; border: 2px solid #f39c12; border-radius: 12px; padding: 20px; text-align: center;">
                        <span style="font-size: 0.85em; color: #f39c12; font-weight: bold; text-transform: uppercase;">Total Stories</span>
                        <div style="font-size: 2.8em; font-weight: 900; color: #f39c12; margin: 10px 0;">${stats.totalStories}</div>
                        <div style="font-size: 0.8em; color: #f39c12; font-weight: bold;">Completed</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px;">
                    <div style="background: #fff; border: 1px solid #eee; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f8d7da; padding-bottom: 8px; margin-bottom: 12px;">
                            <h5 style="margin:0; color: #c62828; font-size: 1.1em;">Standard Bugs</h5>
                            <b style="font-size: 1.2em; color: #c62828;">${stats.bugsCount} <small style="font-size:0.6em; color:#666;">(${stats.reworkTime.toFixed(1)}h)</small></b>
                        </div>
                        ${getSevBadges(stats.bugsCrit, stats.bugsHigh, stats.bugsMed, stats.bugsLow, stats.bugsCount)}
                    </div>

                    <div style="background: #fff; border: 1px solid #eee; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ddd6fe; padding-bottom: 8px; margin-bottom: 12px;">
                            <h5 style="margin:0; color: #6a1b9a; font-size: 1.1em;">Review Defects</h5>
                            <b style="font-size: 1.2em; color: #6a1b9a;">${stats.reviewCount} <small style="font-size:0.6em; color:#666;">(${(stats.reviewDevTime + stats.reviewTestTime).toFixed(1)}h)</small></b>
                        </div>
                        ${getSevBadges(stats.revCrit, stats.revHigh, stats.revMed, stats.revLow, stats.reviewCount)}
                    </div>
                </div>

                <div style="margin-top: 25px; background: #f8fbff; border: 1px solid #e3f2fd; padding: 15px 25px; border-radius: 12px; display: flex; justify-content: space-around; align-items: center; flex-wrap: wrap; gap: 20px;">
                    <div style="text-align:center;">
                        <div style="font-size: 0.7em; color: #777; text-transform: uppercase;">Planned Effort</div>
                        <div style="font-size: 1.1em; font-weight: bold;">${totalTeamEst.toFixed(1)}h</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size: 0.7em; color: #777; text-transform: uppercase;">Actual Effort</div>
                        <div style="font-size: 1.1em; font-weight: bold;">${totalTeamAct.toFixed(1)}h</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size: 0.7em; color: #777; text-transform: uppercase;">Quality Effort</div>
                        <div style="font-size: 1.1em; font-weight: bold; color: #c62828;">${totalQualityTime.toFixed(1)}h</div>
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
                areaMap[area].devs[d] = { 
                    name: d, est: 0, act: 0, stories: 0, totalCycleTime: 0,
                    bugs: 0, crit: 0, high: 0, med: 0, rwTime: 0, // البجز العادية
                    revCount: 0, revCrit: 0, revHigh: 0, revMed: 0, revTime: 0 // الريفيو
                };
            }
            const devData = areaMap[area].devs[d];
            // البجز العادية
            devData.crit += us.rework.severity.critical;
            devData.high += us.rework.severity.high;
            devData.med += us.rework.severity.medium;
            devData.bugs += us.rework.count;
            devData.rwTime += us.rework.actualTime;
            
            // إضافة وقت التطوير الأساسي + وقت الريفيو الخاص بالمطور
            devData.est += us.devEffort.orig + us.reviewStats.estimation; 
            devData.act += us.devEffort.actual + us.reviewStats.devActual;

            // إحصائيات الريفيو المنفصلة
            devData.revCount += us.reviewStats.count;
            devData.revCrit += us.reviewStats.severity.critical;
            devData.revHigh += us.reviewStats.severity.high;
            devData.revMed += us.reviewStats.severity.medium;
            devData.revTime += us.reviewStats.devActual;

            devData.stories++;
            devData.totalCycleTime += (us.cycleTime || 0);
        }

        // إحصائيات المختبرين (Testing)
        if (us.testerLead) {
            const t = us.testerLead;
            if (!areaMap[area].testers[t]) {
                areaMap[area].testers[t] = { 
                    name: t, est: 0, act: 0, stories: 0, totalCycleTime: 0,
                    revCount: 0, revTime: 0 // الريفيو للتستر
                };
            }
            const testData = areaMap[area].testers[t];
            testData.est += us.testEffort.orig;
            testData.act += us.testEffort.actual + us.reviewStats.testActual;
            
            testData.revCount += us.reviewStats.count;
            testData.revTime += us.reviewStats.testActual;
            
            testData.stories++;
            testData.totalCycleTime += (us.cycleTime || 0);
        }

        // إحصائيات تعديل قواعد البيانات (DB Modification)
        if (us.dbEffort && us.dbEffort.names !== 'N/A') {
            const names = us.dbEffort.names.split(', ');
            names.forEach(dbName => {
                const name = dbName.trim();
                if (!areaMap[area].dbMods[name]) {
                    areaMap[area].dbMods[name] = { name: name, est: 0, act: 0, stories: 0 };
                }
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
            
            <div style="padding: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                
                <div style="background: #f9fdfa; border: 1px solid #d4edda; border-radius: 8px; padding: 15px;">
                    <h4 style="color: #27ae60; border-bottom: 2px solid #27ae60; padding-bottom: 10px; margin-top:0;">💻 Developers (Inc. Review Time)</h4>
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

// ابحث عن دالة generateModernCards وقم بتحديث جزء الـ type === 'dev'
function generateModernCards(dataObj, type) {
    const keys = Object.keys(dataObj);
    if (keys.length === 0) return '<p style="text-align:center; padding:20px; color:#999;">No data available</p>';

    return keys.map(name => {
        const p = dataObj[name];
        const index = (p.est / (p.act || 1)) * 100;
        const efficiencyColor = index >= 85 ? '#2e7d32' : '#d32f2f';
        
        const personalReworkTime = (p.rwTime || 0) + (p.revTime || 0);
        const personalReworkRatio = (personalReworkTime / (p.act || 1)) * 100;
        const pReworkColor = personalReworkRatio > 15 ? '#d32f2f' : '#2e7d32';

        return `
        <div style="background: white; border: 1px solid #e0e0e0; border-radius: 12px; padding: 18px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); position: relative; overflow: hidden;">
            ${type === 'dev' ? `
                <div style="position: absolute; top: 0; right: 0; background: ${pReworkColor}; color: white; padding: 8px 15px; border-bottom-left-radius: 12px; text-align: center; min-width: 80px;">
                    <div style="font-size: 0.6em; font-weight: bold;">REWORK</div>
                    <div style="font-size: 1.2em; font-weight: 900;">${personalReworkRatio.toFixed(1)}%</div>
                </div>
            ` : ''}

            <div style="margin-bottom: 15px;">
                <div style="font-size: 1.2em; font-weight: bold; color: #2c3e50;">${p.name}</div>
                <div style="font-size: 0.8em; color: #7f8c8d;">Stories: <b>${p.stories}</b></div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
                <div style="background: #fcfcfc; padding: 8px; border-radius: 8px; border: 1px solid #f0f0f0;">
                    <span style="display:block; font-size:0.7em; color:#888;">Planned/Actual</span>
                    <span style="font-weight:bold; font-size:1.1em;">${p.est.toFixed(0)}h / ${p.act.toFixed(0)}h</span>
                </div>
                <div style="background: #fcfcfc; padding: 8px; border-radius: 8px; border: 1px solid #f0f0f0;">
                    <span style="display:block; font-size:0.7em; color:#888;">Efficiency Index</span>
                    <span style="font-weight:bold; font-size:1.1em; color: ${efficiencyColor}">${index.toFixed(1)}%</span>
                </div>
            </div>

            ${type === 'dev' ? `
                <div style="display: flex; gap: 8px;">
                    <div style="flex: 1; background: #fff5f5; border-radius: 8px; padding: 10px; border-left: 4px solid #c62828;">
                        <div style="font-size: 0.75em; color: #c62828; font-weight: bold;">🪲 BUGS: ${p.bugs}</div>
                        <div style="font-size: 1.1em; font-weight: 900; color: #c62828;">${p.rwTime.toFixed(1)}h</div>
                        <div style="font-size: 0.7em; font-family: monospace; color: #777; margin-top: 4px;">C:${p.crit} H:${p.high} M:${p.med}</div>
                    </div>
                    <div style="flex: 1; background: #f5f3ff; border-radius: 8px; padding: 10px; border-left: 4px solid #6d28d9;">
                        <div style="font-size: 0.75em; color: #6d28d9; font-weight: bold;">🔎 REVIEW</div>
                        <div style="font-size: 1.1em; font-weight: 900; color: #6d28d9;">${p.revTime.toFixed(1)}h</div>
                        <div style="font-size: 0.7em; color: #777; margin-top: 4px;">${p.revCount} Tasks</div>
                    </div>
                </div>
            ` : ''}

            ${type === 'test' ? `
                <div style="background: #f0f7ff; border-radius: 8px; padding: 10px; border-left: 4px solid #1565c0;">
                    <div style="font-size: 0.8em; color: #1565c0; font-weight: bold;">🔎 QUALITY REVIEWS FOUND</div>
                    <div style="font-size: 1.2em; font-weight: 900; color: #1565c0;">${p.revTime.toFixed(1)}h <span style="font-weight:normal; font-size:0.6em;">(${p.revCount} Items)</span></div>
                </div>
            ` : ''}
        </div>`;
    }).join('');
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
                            <tr><th>Type</th><th>Est. (H)</th><th>Actual (H)</th><th>Effort Variance</th></tr>
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
        container.innerHTML = "<div class='card'><h2>Iteration Summary</h2><p>No data available.</p></div>";
        return;
    }

    // 1. تجميع البيانات لكل التيمز (Global Aggregation)
    let globalStats = {
        totalStories: processedStories.length,
        devEst: 0, devAct: 0,
        testEst: 0, testAct: 0,
        reworkHrs: 0, reviewHrs: 0,
        totalCycleTime: 0, ctCount: 0,
        sev: { crit: 0, high: 0, med: 0, low: 0, totalBugs: 0 }
    };

    processedStories.forEach(us => {
        globalStats.devEst += us.devEffort.orig;
        globalStats.devAct += us.devEffort.actual;
        globalStats.testEst += us.testEffort.orig;
        globalStats.testAct += us.testEffort.actual;
        
        // Cycle Time
        if (us.cycleTime > 0) {
            globalStats.totalCycleTime += us.cycleTime;
            globalStats.ctCount++;
        }

        // Rework (Bugs + Reviews)
        globalStats.reworkHrs += us.rework.actualTime;
        globalStats.reviewHrs += (us.reviewStats.devActual + us.reviewStats.testActual);

        // Severity Tracking (Combined)
        const allBugs = [us.rework.severity, us.reviewStats.severity];
        allBugs.forEach(s => {
            globalStats.sev.crit += s.critical;
            globalStats.sev.high += s.high;
            globalStats.sev.med += s.medium;
            globalStats.sev.low += s.low;
        });
    });

    globalStats.sev.totalBugs = globalStats.sev.crit + globalStats.sev.high + globalStats.sev.med + globalStats.sev.low;

    // 2. حساب المؤشرات الرئيسية (Key Metrics)
    const effortVariance = (((globalStats.devAct + globalStats.testAct) - (globalStats.devEst + globalStats.testEst)) / (globalStats.devEst + globalStats.testEst || 1)) * 100;
    const combinedReworkRatio = ((globalStats.reworkHrs + globalStats.reviewHrs) / (globalStats.devAct || 1)) * 100;
    const avgCycleTime = globalStats.ctCount > 0 ? (globalStats.totalCycleTime / globalStats.ctCount).toFixed(1) : 0;

    const getSevPct = (val) => globalStats.sev.totalBugs > 0 ? ((val / globalStats.sev.totalBugs) * 100).toFixed(1) : 0;

    // 3. بناء الواجهة
    let html = `
    <div style="direction: ltr; text-align: left; font-family: 'Segoe UI', Tahoma, sans-serif; padding: 10px;">
        <h2 style="color: #2c3e50; border-left: 5px solid #3498db; padding-left: 15px; margin-bottom: 25px;">Team-Wide Iteration Insights</h2>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
            
            <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-top: 4px solid ${effortVariance <= 10 ? '#27ae60' : '#e74c3c'};">
                <div style="color: #7f8c8d; font-size: 0.85em; font-weight: bold; margin-bottom: 10px;">EFFORT VARIANCE</div>
                <div style="font-size: 2.2em; font-weight: bold; color: ${effortVariance <= 10 ? '#27ae60' : '#e74c3c'};">${effortVariance.toFixed(1)}%</div>
                <div style="font-size: 0.8em; color: #95a5a6; margin-top: 5px;">Actual vs Estimated (Dev+Test)</div>
            </div>

            <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-top: 4px solid #f39c12;">
                <div style="color: #7f8c8d; font-size: 0.85em; font-weight: bold; margin-bottom: 10px;">REWORK RATIO (BUGS + REVIEWS)</div>
                <div style="font-size: 2.2em; font-weight: bold; color: #e67e22;">${combinedReworkRatio.toFixed(1)}%</div>
                <div style="font-size: 0.8em; color: #95a5a6; margin-top: 5px;">${(globalStats.reworkHrs + globalStats.reviewHrs).toFixed(1)} Total Quality Hours</div>
            </div>

            <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-top: 4px solid #3498db;">
                <div style="color: #7f8c8d; font-size: 0.85em; font-weight: bold; margin-bottom: 10px;">AVG CYCLE TIME</div>
                <div style="font-size: 2.2em; font-weight: bold; color: #2980b9;">${avgCycleTime} <span style="font-size: 0.5em;">Days</span></div>
                <div style="font-size: 0.8em; color: #95a5a6; margin-top: 5px;">From Activation to Completion</div>
            </div>
        </div>

        <div style="background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 30px;">
            <h4 style="margin: 0 0 20px 0; color: #34495e; font-size: 1.1em;">Defect Severity Distribution (Global)</h4>
            <div style="display: flex; height: 40px; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
                <div title="Critical" style="width: ${getSevPct(globalStats.sev.crit)}%; background: #c0392b; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.8em;">${getSevPct(globalStats.sev.crit)}%</div>
                <div title="High" style="width: ${getSevPct(globalStats.sev.high)}%; background: #e67e22; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.8em;">${getSevPct(globalStats.sev.high)}%</div>
                <div title="Medium" style="width: ${getSevPct(globalStats.sev.med)}%; background: #f1c40f; display: flex; align-items: center; justify-content: center; color: #2c3e50; font-size: 0.8em;">${getSevPct(globalStats.sev.med)}%</div>
                <div title="Low" style="width: ${getSevPct(globalStats.sev.low)}%; background: #2ecc71; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.8em;">${getSevPct(globalStats.sev.low)}%</div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center;">
                <div><b style="color:#c0392b;">Critical:</b> ${globalStats.sev.crit}</div>
                <div><b style="color:#e67e22;">High:</b> ${globalStats.sev.high}</div>
                <div><b style="color:#f39c12;">Medium:</b> ${globalStats.sev.med}</div>
                <div><b style="color:#27ae60;">Low:</b> ${globalStats.sev.low}</div>
            </div>
        </div>

        <div style="background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                <thead style="background: #f8f9fa;">
                    <tr style="text-align: left; border-bottom: 2px solid #edf2f7;">
                        <th style="padding: 15px;">Business Area</th>
                        <th style="padding: 15px;">Stories</th>
                        <th style="padding: 15px;">Effort Var.</th>
                        <th style="padding: 15px;">Cycle Time</th>
                        <th style="padding: 15px;">Rework (Bug+Rev)</th>
                    </tr>
                </thead>
                <tbody>`;

    const grouped = groupBy(processedStories, 'businessArea');
    for (let area in grouped) {
        const areaStories = grouped[area];
        let a = { devEst:0, devAct:0, testEst:0, testAct:0, rw:0, rv:0, ct:0, ctCount:0 };
        
        areaStories.forEach(s => {
            a.devEst += s.devEffort.orig; a.devAct += s.devEffort.actual;
            a.testEst += s.testEffort.orig; a.testAct += s.testEffort.actual;
            a.rw += s.rework.actualTime;
            a.rv += (s.reviewStats.devActual + s.reviewStats.testActual);
            if(s.cycleTime > 0) { a.ct += s.cycleTime; a.ctCount++; }
        });

        const aVar = (((a.devAct+a.testAct)-(a.devEst+a.testEst))/(a.devEst+a.testEst||1))*100;
        const aCT = a.ctCount > 0 ? (a.ct/a.ctCount).toFixed(1) : 0;
        const aRwRatio = ((a.rw + a.rv)/(a.devAct||1))*100;

        html += `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td style="padding: 15px; font-weight: 600;">${area}</td>
                <td style="padding: 15px;">${areaStories.length}</td>
                <td style="padding: 15px; color: ${aVar > 15 ? '#e74c3c' : '#27ae60'};">${aVar.toFixed(1)}%</td>
                <td style="padding: 15px;">${aCT} d</td>
                <td style="padding: 15px; font-weight: bold; color: ${aRwRatio > 15 ? '#e67e22' : '#27ae60'};">${aRwRatio.toFixed(1)}%</td>
            </tr>`;
    }

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
}

function addHoliday() {
    const picker = document.getElementById('holidayPicker');
    const date = picker.value;
    if (date && !holidays.includes(date)) {
        holidays.push(date);
        localStorage.setItem('holidays', JSON.stringify(holidays));
        renderHolidays();
        picker.value = '';
    }
}

function calculateCycleTimeDays(startDate, endDate) {
    if (!startDate || !endDate || isNaN(new Date(startDate)) || isNaN(new Date(endDate))) return 0;
    
    let start = new Date(startDate);
    let end = new Date(endDate);
    if (end < start) return 0;

    let days = 0;
    let current = new Date(start);
    current.setHours(0, 0, 0, 0);
    let finalEnd = new Date(end);
    finalEnd.setHours(0, 0, 0, 0);

    while (current <= finalEnd) {
        const dayOfWeek = current.getDay(); // 5 للجمعة و 6 للسبت
        const dateString = current.toISOString().split('T')[0];
        
        // استثناء الجمعة (5) والسبت (6) والعطلات المسجلة في مصفوفة holidays
        if (dayOfWeek !== 5 && dayOfWeek !== 6 && !holidays.includes(dateString)) {
            days++;
        }
        current.setDate(current.getDate() + 1);
    }
    return days;
}


function removeHoliday(date) {
    holidays = holidays.filter(h => h !== date);
    localStorage.setItem('holidays', JSON.stringify(holidays));
    renderHolidays();
}

renderHolidays();


















