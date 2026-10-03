try {
    require('dotenv').config();
} catch (err) {
    console.warn('dotenv not installed — skipping .env load');
}
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Use bcryptjs for compatibility and easier installs
const fs = require('fs');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3000; // Public port for unified access
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/studentDB';

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors({ origin: true, credentials: true }));

// Helper to start a Streamlit app as a child process (detached, logged, and monitored)
function startStreamlit(moduleName, scriptRelativePath, streamlitPort) {
    const absScriptPath = path.resolve(__dirname, scriptRelativePath);
    const cwd = path.dirname(absScriptPath);
    const script = path.basename(absScriptPath);

    if (!fs.existsSync(absScriptPath)) {
        console.error(`Could not start ${moduleName}: script not found -> ${absScriptPath}`);
        return null;
    }

    // Ensure logs directory exists
    const logsDir = path.join(__dirname, 'logs');
    try { fs.mkdirSync(logsDir, { recursive: true }); } catch (e) { /* ignore */ }

    const safeName = moduleName.replace(/[\/:]/g, '').replace(/[^a-z0-9_.-]/gi, '_');
    const logFile = path.join(logsDir, `${safeName}-${streamlitPort}.log`);

    // Open file descriptors for stdout/stderr so the child can be detached and continue running.
    const out = fs.openSync(logFile, 'a');
    const err = fs.openSync(logFile, 'a');

    const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python';
    const baseUrlPath = moduleName.replace(/^\/+|\/+$/g, '');
    const proc = spawn(pythonExecutable, [
        '-m', 'streamlit', 'run', script,
        '--server.port', String(streamlitPort),
        '--server.headless', 'true',
        '--server.baseUrlPath', baseUrlPath,
        '--server.enableCORS', 'false',
        '--server.enableXsrfProtection', 'false'
    ], { cwd, detached: true, stdio: ['ignore', out, err] });

    // Allow parent to exit independently; unref makes the child not keep the event loop alive
    try { proc.unref(); } catch (e) { /* ignore if not available */ }

    proc.on('error', (errObj) => console.error(`Failed to start ${moduleName}:`, errObj));
    proc.on('exit', (code, signal) => console.log(`${moduleName} (pid ${proc.pid}) exited with code ${code} signal ${signal}; see ${logFile}`));

    return { proc, logFile };
}

// Map public paths to internal Streamlit ports
const streamlitMappings = [
    // Keep the mock interview service on the requested default Streamlit port.
    { mount: '/aptitude', script: path.join('Aptitude', 'AptiApp.py'), port: 8507 },
    { mount: '/aptitude-dashboard', script: path.join('Aptitude', 'InteractiveDashboard.py'), port: 8502 },
    { mount: '/dsa', script: path.join('CodingPract', 'DSA_app_db.py'), port: 8503 },
    { mount: '/dsa-dashboard', script: path.join('CodingPract', 'DSA_dash.py'), port: 8504 },
    { mount: '/mockinterview', script: path.join('MockInter', 'app.py'), port: 8501 },
    { mount: '/resumeats', script: path.join('ResumeATS', 'app.py'), port: 8506 },
];

// Start Streamlit modules automatically (unless explicitly disabled via START_STREAMLIT=false)
const spawnedProcesses = []; // will hold objects {mount, proc, logFile, restarts}
let shuttingDown = false;

async function monitorStreamlit(m) {
    if (shuttingDown) return;

    const absScriptPath = path.resolve(__dirname, m.script);
    if (!fs.existsSync(absScriptPath)) {
        console.error(`Skipping ${m.mount}: script not found at ${absScriptPath}`);
        return;
    }

    const maxRestarts = 10;
    let attempts = 0;
    let backoffMs = 2000;

    const startOnce = () => {
        if (shuttingDown) return;
        attempts += 1;

        // Start through the active Python environment so Windows does not
        // depend on a separately-resolved streamlit.exe shell command.
        let started = startStreamlit(m.mount, m.script, m.port);

        // If CLI returned null (shouldn't, since startStreamlit now checks file existence), try python fallback
        if (!started) {
            console.log(`Attempting python fallback for ${m.mount}`);
            const absScriptPathLocal = path.resolve(__dirname, m.script);
            const cwdLocal = path.dirname(absScriptPathLocal);
            const scriptLocal = path.basename(absScriptPathLocal);

            // Logs for fallback
            const logsDir = path.join(__dirname, 'logs');
            try { fs.mkdirSync(logsDir, { recursive: true }); } catch (e) { }
            const safeName = m.mount.replace(/[\/:]/g, '').replace(/[^a-z0-9_.-]/gi, '_');
            const logFile = path.join(logsDir, `${safeName}-py-${m.port}.log`);
            const out = fs.openSync(logFile, 'a');
            const err = fs.openSync(logFile, 'a');

            const baseUrlPath = m.mount.replace(/^\/+|\/+$/g, '');
            const proc = spawn(process.env.PYTHON_EXECUTABLE || 'python', [
                '-m', 'streamlit', 'run', scriptLocal,
                '--server.port', String(m.port),
                '--server.headless', 'true',
                '--server.baseUrlPath', baseUrlPath,
                '--server.enableCORS', 'false',
                '--server.enableXsrfProtection', 'false'
            ], { cwd: cwdLocal, detached: true, stdio: ['ignore', out, err] });
            try { proc.unref(); } catch (e) { }

            started = { proc, logFile };

            proc.on('error', (errObj) => console.error(`Fallback failed to start ${m.mount}:`, errObj));
            proc.on('exit', (code, signal) => console.log(`${m.mount} (fallback pid ${proc.pid}) exited with code ${code} signal ${signal}; see ${logFile}`));
        }

        if (started && started.proc) {
            spawnedProcesses.push({ mount: m.mount, proc: started.proc, logFile: started.logFile, restarts: attempts });

            // Monitor exit and restart with backoff (if not shutting down)
            started.proc.on('exit', (code, signal) => {
                if (shuttingDown) return;
                console.warn(`${m.mount} process exited (code ${code}). Restarting after ${backoffMs}ms (attempt ${attempts}/${maxRestarts})`);
                if (attempts < maxRestarts) {
                    setTimeout(() => { backoffMs = Math.min(30000, backoffMs * 2); startOnce(); }, backoffMs);
                } else {
                    console.error(`${m.mount} reached max restart attempts (${maxRestarts}). Not restarting.`);
                }
            });
        }
    };

    startOnce();
}

if (process.env.START_STREAMLIT === 'false') {
    console.log('START_STREAMLIT set to "false" — skipping automatic Streamlit startup.');
} else {
    for (const m of streamlitMappings) {
        monitorStreamlit(m).catch(err => console.error(`monitorStreamlit error for ${m.mount}:`, err));
    }
}

// Ensure spawned Streamlit processes are terminated when this Node process exits
function killSpawnedProcesses() {
    shuttingDown = true;
    for (const entry of spawnedProcesses) {
        try {
            const p = entry.proc;
            if (p && !p.killed) {
                try { p.kill(); } catch (e) { /* ignore */ }
            }
        } catch (e) {
            // ignore
        }
    }
}
process.on('SIGINT', () => { killSpawnedProcesses(); process.exit(); });
process.on('SIGTERM', () => { killSpawnedProcesses(); process.exit(); });
process.on('exit', killSpawnedProcesses);

// Add proxy routes so the public server serves each Streamlit app under a path.
const streamlitProxies = [];
for (const m of streamlitMappings) {
    const mount = m.mount.endsWith('/') ? m.mount.slice(0, -1) : m.mount;
    const proxy = createProxyMiddleware({
        target: `http://localhost:${m.port}`,
        changeOrigin: true,
        ws: false,
        pathRewrite: (pathReq) => {
            const cleaned = pathReq.startsWith(mount) ? pathReq.slice(mount.length) : pathReq;
            const targetPath = cleaned === '' ? '/' : cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
            return `${mount}${targetPath}`;
        },
        on: {
            proxyReq: (proxyReq) => {
                proxyReq.setHeader('host', `localhost:${m.port}`);
            },
            proxyReqWs: (proxyReq, req) => {
                proxyReq.setHeader('host', `localhost:${m.port}`);
                const requestPath = req.url.startsWith(mount)
                    ? req.url
                    : `${mount}${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
                proxyReq.path = requestPath;
            }
        }
    });
    if (mount === '/mockinterview') {
        // The interview page must be reachable while locked so it can explain
        // which placement requirement is missing. The start API below remains
        // protected by requireInterviewQualification.
        app.use(mount, proxy);
    } else {
        app.use(mount, proxy);
    }
    streamlitProxies.push({ mount, proxy });
}

// Serve the portal's static files after Streamlit proxy routes so app mounts
// cannot be handled by index.html before reaching their Streamlit service.
app.use((req, res, next) => {
    const disabledCompanyPages = new Set([
        '/company-login.html', '/company-dashboard.html', '/compdash.html', '/compannounce.html'
    ]);
    if (disabledCompanyPages.has(req.path)) {
        return res.status(410).send('The Company Portal is no longer available. Please use the Admin or Student portal.');
    }
    next();
});
app.use(express.static(__dirname));

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'careerconnect' });
});

app.get('/api/version', (req, res) => {
    res.json({ service: 'careerconnect', locationFallback: true });
});

function buildCareerCoachFallback(message) {
    const text = String(message || '').trim();
    const lower = text.toLowerCase();

    if (lower.includes('resume') || lower.includes('cv')) {
        return 'For a strong resume, keep it ATS-friendly: tailor your summary to the job, add measurable results, include keywords from the description, and keep formatting simple. Use 3-5 bullet points per role and highlight outcomes like “improved efficiency by 25%”.';
    }
    if (lower.includes('interview') || lower.includes('mock')) {
        return 'For interviews, prepare 3 stories: a challenge, a success, and a conflict. Practice the STAR method, keep answers concise, and show confidence with a clear structure: Situation, Task, Action, Result.';
    }
    if (lower.includes('skill') || lower.includes('roadmap')) {
        return 'A good roadmap is: master fundamentals, build 2-3 projects, practice coding/communication, and tailor your profile to one target role. Focus on skills that match the job description and keep learning consistently.';
    }
    if (lower.includes('job') || lower.includes('career')) {
        return 'To improve your career readiness, align your resume with the role, improve your portfolio, and practice common interview questions. Keep improving one skill at a time and apply consistently.';
    }
    return 'I can help with resume writing, ATS improvement, interview prep, skill roadmaps, and job search strategy. Ask me for a quick review or a tailored plan.';
}

async function getOpenAIChatReply(messages) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) return null;

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                temperature: 0.8,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful, knowledgeable, general-purpose AI assistant. Answer clearly, accurately, and professionally. You can help with coding, writing, resume advice, interview prep, project planning, career questions, study help, and everyday tasks.'
                    },
                    ...messages
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                timeout: 30000
            }
        );

        return response?.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
        console.warn('OpenAI chatbot failed:', error.response?.data || error.message);
        return null;
    }
}

async function getGeminiChatReply(messages) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) return null;

    try {
        const contents = messages.map((entry) => ({
            role: entry.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(entry.content || '').trim() }]
        }));

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                contents,
                systemInstruction: {
                    parts: [{
                        text: 'You are a helpful, general-purpose AI assistant. Respond clearly, accurately, and professionally to all user questions. You may help with technical questions, writing, learning, coding, career advice, and everyday tasks.'
                    }]
                },
                generationConfig: {
                    temperature: 0.8,
                    maxOutputTokens: 600
                }
            },
            { timeout: 30000 }
        );

        const candidate = response?.data?.candidates?.[0];
        const text = candidate?.content?.parts
            ?.map(part => part.text)
            .join('')
            .trim();

        return text || null;
    } catch (error) {
        console.warn('Gemini chatbot failed:', error.response?.data || error.message);
        return null;
    }
}

function buildGeneralFallback(message) {
    const text = String(message || '').trim();
    const lower = text.toLowerCase();

    if (!text) return 'I can help with academic, technical, career, and general questions. Ask me anything.';
    if (lower.includes('resume') || lower.includes('cv')) return 'For a strong resume, tailor it to the role, include measurable achievements, and keep the formatting simple. Use the job description keywords, 3-5 bullets per role, and a clear summary.';
    if (lower.includes('interview')) return 'For interviews, prepare 3 strong stories using the STAR method: challenge, action, result. Practice calm explanations and answer clearly without rambling.';
    if (lower.includes('code') || lower.includes('python') || lower.includes('javascript') || lower.includes('program')) return 'If you want code help, share the exact goal, current code, and the error. I can explain the bug, improve the logic, and suggest a corrected version.';
    if (lower.includes('study') || lower.includes('learn') || lower.includes('exam')) return 'A good study plan is to divide topics into fundamentals, practice, review, and timed revision. Focus on understanding concepts before memorizing.';
    if (lower.includes('job') || lower.includes('career')) return 'A strong career plan includes skill alignment, project work, networking, resume tailoring, and interview practice. Focus on one target role and improve the matching skills.';
    return 'I can help with coding, writing, studies, interviews, resumes, project ideas, and general career guidance. Tell me what you want to achieve and I will help you with a practical plan.';
}

app.post('/api/chatbot', async (req, res) => {
    const payload = Array.isArray(req.body?.messages) ? req.body.messages : null;
    const singleMessage = payload ? null : String(req.body?.message || '').trim();
    const messages = payload && payload.length
        ? payload.slice(-12).map((entry) => ({
            role: entry.role === 'assistant' ? 'assistant' : 'user',
            content: String(entry.content || '').trim()
        }))
        : [{ role: 'user', content: singleMessage }];

    if (!messages[0] || !messages[0].content) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    try {
        const aiReply = await getOpenAIChatReply(messages) || await getGeminiChatReply(messages);
        return res.json({
            text: aiReply || buildGeneralFallback(messages[messages.length - 1].content)
        });
    } catch (error) {
        console.error('General chatbot error:', error);
        return res.status(500).json({
            text: 'I am temporarily unavailable. Please try again in a moment.'
        });
    }
});

app.get('/api/locations/status', (req, res) => {
    res.json({ status: 'ok', service: 'careerconnect-api' });
});

app.get('/api/student/me', requireJwt, async (req, res) => {
    try {
        const student = await Student.findOne({ username: req.auth.username })
            .select('name username email department course graduationYear cgpa activeBacklogs atsScore skills')
            .lean();
        if (!student) return res.status(404).json({ error: 'Student account not found.' });
        res.json({ user: student });
    } catch (error) {
        console.error('Current student lookup error:', error.message || error);
        res.status(500).json({ error: 'Unable to load the current student account.' });
    }
});

app.post('/api/student/reset-test-data', requireJwt, async (req, res) => {
    try {
        const username = req.auth.username;
        const safeUsername = String(username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const quizDb = mongoose.connection.useDb('quiz_system', { useCache: true });
        const aptitudeResult = await quizDb.collection('apti_test').deleteMany({
            student_id: { $regex: `^${safeUsername}$`, $options: 'i' }
        });
        const faceLogResult = await quizDb.collection('face_logs').deleteMany({
            student_id: { $regex: `^${safeUsername}$`, $options: 'i' }
        });
        await PlacementProgress.deleteOne({ studentId: username });
        res.json({
            success: true,
            deleted: {
                aptitudeAttempts: aptitudeResult.deletedCount,
                faceLogs: faceLogResult.deletedCount,
                placementProgress: 1
            }
        });
    } catch (error) {
        console.error('Student test-data reset error:', error.message || error);
        res.status(500).json({ error: 'Unable to reset the current student test data.' });
    }
});

// Return the latest aptitude result saved by the Streamlit quiz.
app.get('/api/students/:username/performance', async (req, res) => {
    try {
        const username = req.params.username.trim();
        const quizDb = mongoose.connection.useDb('quiz_system', { useCache: true });
        const result = await quizDb.collection('apti_test')
            .find({ student_id: { $regex: `^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })
            .sort({ timestamp: -1 })
            .limit(1)
            .next();

        res.json({
            aptitude: result
                ? {
                    score: result.marks_achieved,
                    total: result.no_of_questions,
                    accuracy: result.no_of_questions
                        ? Number(((result.marks_achieved / result.no_of_questions) * 100).toFixed(2))
                        : 0,
                    category: result.category,
                    testNo: result.test_no
                }
                : null
        });
    } catch (error) {
        console.error('Error fetching student performance:', error.message || error);
        res.status(500).json({ error: 'Error fetching student performance' });
    }
});

// Home page
app.get('/', (req, res) => {
    res.send("Home route is working");
});

// --- Country/State/City proxy endpoints (keep API key secret in .env) ---
const CSC_KEY = process.env.CSC_KEY || '';
const fallbackStates = {
    IN: [
        'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
        'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
        'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
        'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
        'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
        'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi'
    ]
};

app.get('/api/locations/countries', async (req, res) => {
    try {
        if (CSC_KEY && CSC_KEY !== 'YOUR_REAL_COUNTRYSTATECITY_API_KEY') {
            const r = await axios.get('https://api.countrystatecity.in/v1/countries', {
                headers: { 'X-CSCAPI-KEY': CSC_KEY }
            });
            return res.json(r.data);
        }

        const r = await axios.get('https://countriesnow.space/api/v0.1/countries/positions');
        res.json((r.data.data || []).map((country) => ({
            iso2: country.iso2,
            name: country.name
        })));
    } catch (err) {
        console.error('Error proxying countries:', err.message || err);
        res.status(502).json({ error: 'Upstream error fetching countries', details: err.message });
    }
});

app.get('/api/locations/states/:countryIso2', async (req, res) => {
    try {
        const { countryIso2 } = req.params;
        if (CSC_KEY && CSC_KEY !== 'YOUR_REAL_COUNTRYSTATECITY_API_KEY') {
            const r = await axios.get(`https://api.countrystatecity.in/v1/countries/${countryIso2}/states`, {
                headers: { 'X-CSCAPI-KEY': CSC_KEY }
            });
            return res.json(r.data);
        }

        const countries = await axios.get('https://countriesnow.space/api/v0.1/countries/positions');
        const country = (countries.data.data || []).find((item) =>
            String(item.iso2 || '').toUpperCase() === countryIso2.toUpperCase()
        );
        if (!country) return res.status(404).json({ error: 'Country not found' });
        const r = await axios.post('https://countriesnow.space/api/v0.1/countries/states', {
            country: country.name
        });
        if (r.data.error) {
            const localStates = fallbackStates[countryIso2.toUpperCase()];
            if (localStates) {
                return res.json(localStates.map((name) => ({ iso2: name, name })));
            }
            return res.status(502).json({ error: r.data.msg || 'State provider error' });
        }
        res.json((r.data.data?.states || []).map((state) => ({
            iso2: state.name,
            name: state.name
        })));
    } catch (err) {
        console.error('Error proxying states:', err.message || err);
        const localStates = fallbackStates[countryIso2.toUpperCase()];
        if (localStates) {
            return res.json(localStates.map((name) => ({ iso2: name, name })));
        }
        res.status(502).json({ error: `Upstream error fetching states: ${err.response?.data?.msg || err.message}` });
    }
});

app.get('/api/locations/cities/:countryIso2/:stateIso2', async (req, res) => {
    try {
        const { countryIso2, stateIso2 } = req.params;
        if (CSC_KEY && CSC_KEY !== 'YOUR_REAL_COUNTRYSTATECITY_API_KEY') {
            const r = await axios.get(`https://api.countrystatecity.in/v1/countries/${countryIso2}/states/${stateIso2}/cities`, {
                headers: { 'X-CSCAPI-KEY': CSC_KEY }
            });
            return res.json(r.data);
        }

        const countries = await axios.get('https://countriesnow.space/api/v0.1/countries/positions');
        const country = (countries.data.data || []).find((item) => item.iso2 === countryIso2);
        if (!country) return res.status(404).json({ error: 'Country not found' });
        const r = await axios.post('https://countriesnow.space/api/v0.1/countries/state/cities', {
            country: country.name,
            state: decodeURIComponent(stateIso2)
        });
        res.json((r.data.data || []).map((name) => ({ name })));
    } catch (err) {
        console.error('Error proxying cities:', err.message || err);
        res.status(502).json({ error: 'Upstream error fetching cities', details: err.message });
    }
});


// Connect to MongoDB
mongoose.connect(mongoUri)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.warn('MongoDB connection error:', err.message || err));

mongoose.connection.on('error', (err) => {
    console.warn('MongoDB runtime error:', err.message || err);
});

// Define the Student schema
const studentSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    dob: Date,
    college: String,
    department: String,
    gender: String,  // Ensure gender is included here
    course: String,
    graduationYear: Number,
    cgpa: Number,
    percentage: Number,
    activeBacklogs: Number,
    skills: [String],
    atsScore: Number,
    username: { type: String, unique: true },
    password: String, // The password will be hashed
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
});

// Create the Student model
const Student = mongoose.model('Student', studentSchema);

// Define the Admin schema
const adminSchema = new mongoose.Schema({
    name: String,
    position: String,
    email: String,
    phone: String,
    username: { type: String, unique: true },
    password: String, // The password will be hashed
});

// Create the Admin model
const Admin = mongoose.model('Admin', adminSchema);

// Define the Announcement schema
const announcementSchema = new mongoose.Schema({
    title: String,
    content: String,
    type: { type: String, enum: ['general', 'job'], default: 'general', index: true },
    companyName: String,
    jobTitle: String,
    employmentType: String,
    location: String,
    salaryPackage: String,
    eligibleCourse: String,
    eligibleBranch: String,
    eligibleYear: Number,
    minimumPercentage: Number,
    minimumCgpa: Number,
    requiredSkills: { type: [String], default: [] },
    applicationStartDate: Date,
    applicationDeadline: Date,
    interviewTestDate: Date,
    numberOfOpenings: Number,
    additionalInstructions: String,
    targetAudience: { type: String, enum: ['all', 'departments', 'graduationYears', 'students'], default: 'all' },
    targetDepartments: { type: [String], default: [] },
    targetGraduationYears: { type: [Number], default: [] },
    targetStudents: { type: [String], default: [] },
    channels: { type: [String], enum: ['in-app', 'email', 'sms'], default: ['in-app'] },
    createdAt: { type: Date, default: Date.now },
});

// Create the Announcement model
const Announcement = mongoose.model('Announcement', announcementSchema);

const applicationSchema = new mongoose.Schema({
    studentId: { type: String, required: true, index: true },
    announcementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement', required: true, index: true },
    companyName: { type: String, required: true },
    role: { type: String, required: true },
    appliedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['APPLIED', 'SHORTLISTED', 'REJECTED', 'SELECTED', 'WITHDRAWN'], default: 'APPLIED' },
    statusUpdatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
applicationSchema.index({ studentId: 1, announcementId: 1 }, { unique: true });
const Application = mongoose.model('Application', applicationSchema);

const notificationSchema = new mongoose.Schema({
    recipientUsername: { type: String, required: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, default: 'announcement' },
    announcementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement' },
    reminderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reminder' },
    readAt: Date,
    createdAt: { type: Date, default: Date.now, index: true }
});
const Notification = mongoose.model('Notification', notificationSchema);

const reminderSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    dueAt: { type: Date, required: true, index: true },
    targetAudience: { type: String, enum: ['all', 'departments', 'graduationYears', 'students'], default: 'all' },
    targetDepartments: { type: [String], default: [] },
    targetGraduationYears: { type: [Number], default: [] },
    targetStudents: { type: [String], default: [] },
    channels: { type: [String], enum: ['in-app', 'email', 'sms'], default: ['in-app'] },
    sentAt: Date,
    createdAt: { type: Date, default: Date.now }
});
const Reminder = mongoose.model('Reminder', reminderSchema);

// Define the Company schema
const companySchema = new mongoose.Schema({
    name: String,
    email: String,
    company_add: String,
    phone: String,
    username: { type: String, unique: true },
    password: String, // The password will be hashed
});

// Create the Company model
const Company = mongoose.model('Company', companySchema);

const placementProgressSchema = new mongoose.Schema({
    studentId: { type: String, required: true, unique: true, index: true },
    workflowState: { type: String, enum: ['APTITUDE_LOCKED', 'APTITUDE_AVAILABLE', 'APTITUDE_QUALIFIED', 'DSA_AVAILABLE', 'DSA_QUALIFIED', 'TECHNICAL_INTERVIEW_AVAILABLE', 'TECHNICAL_INTERVIEW_QUALIFIED', 'PLACEMENT_READY'], default: 'APTITUDE_AVAILABLE' },
    aptitude: {
        status: { type: String, enum: ['LOCKED', 'AVAILABLE', 'QUALIFIED', 'NOT_QUALIFIED'], default: 'AVAILABLE' },
        score: Number, total: Number, attemptCount: { type: Number, default: 0 }, latestAttemptAt: Date
    },
    dsa: {
        status: { type: String, enum: ['LOCKED', 'AVAILABLE', 'QUALIFIED', 'NOT_QUALIFIED'], default: 'LOCKED' },
        score: Number, acceptedSolutions: { type: Number, default: 0 }, attempts: { type: Number, default: 0 }, latestAttemptAt: Date
        ,startedAt: Date, deadline: Date, completedAt: Date, submittedAt: Date, durationSeconds: Number,
        submissionType: { type: String, enum: ['manual', 'automatic'] },
        submitted: { type: Boolean, default: false }, qualified: { type: Boolean, default: false },
        interviewEligible: { type: Boolean, default: false },
        durationQualified: { type: Boolean, default: false }, completed: { type: Boolean, default: false }
    },
    technicalInterview: {
        status: { type: String, enum: ['LOCKED', 'AVAILABLE', 'QUALIFIED', 'NOT_QUALIFIED'], default: 'LOCKED' },
        score: Number, technicalKnowledge: Number, problemSolving: Number, communication: Number,
        completed: { type: Boolean, default: false }, feedback: String, latestAttemptAt: Date
    },
    overallScore: Number,
    lastUpdatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
const PlacementProgress = mongoose.model('PlacementProgress', placementProgressSchema);

const assessmentConfigSchema = new mongoose.Schema({
    key: { type: String, unique: true, default: 'default' },
    aptitudeMinScore: { type: Number, default: 50, min: 0, max: 100 },
    dsaMinScore: { type: Number, default: 60, min: 0, max: 100 },
    technicalMinScore: { type: Number, default: 60, min: 0, max: 100 },
    dsaMaxTimeMinutes: { type: Number, default: null, min: 0 },
    dsaMinimumDurationSeconds: { type: Number, default: 0, min: 0 },
    weights: {
        aptitude: { type: Number, default: 30, min: 0, max: 100 },
        dsa: { type: Number, default: 30, min: 0, max: 100 },
        technical: { type: Number, default: 40, min: 0, max: 100 }
    },
    strongSkillThreshold: { type: Number, default: 80, min: 0, max: 100 },
    weakSkillThreshold: { type: Number, default: 60, min: 0, max: 100 },
    retakePolicy: { type: String, enum: ['unlimited', 'one_per_day'], default: 'unlimited' }
});
const AssessmentConfig = mongoose.model('AssessmentConfig', assessmentConfigSchema);

const placementCompanySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    requirements: {
        overallMin: { type: Number, min: 0, max: 100 },
        aptitudeMin: { type: Number, min: 0, max: 100 },
        dsaMin: { type: Number, min: 0, max: 100 },
        technicalMin: { type: Number, min: 0, max: 100 },
        cgpaMin: { type: Number, min: 0, max: 10 },
        atsMin: { type: Number, min: 0, max: 100 },
        activeBacklogsMax: { type: Number, min: 0 },
        departments: [String],
        graduationYearMin: Number,
        skills: [String],
        languages: [String]
    },
    jobDescription: String,
    applicationDeadline: Date,
    driveStatus: { type: String, enum: ['DRAFT', 'OPEN', 'CLOSED'], default: 'DRAFT' },
    createdAt: { type: Date, default: Date.now }
});
const PlacementCompany = mongoose.model('PlacementCompany', placementCompanySchema);

function requireJwt(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
        ? header.slice(7)
        : req.headers.cookie
            ?.split(';')
            .map((cookie) => cookie.trim())
            .find((cookie) => cookie.startsWith('careerconnect_session='))
            ?.slice('careerconnect_session='.length);

    if (!token) {
        return res.status(401).json({
            error: 'Authentication required.'
        });
    }

    try {
        req.auth = jwt.verify(
            token,
            process.env.JWT_SECRET || 'careerconnect-development-secret'
        );
        next();
    } catch (error) {
        return res.status(401).json({
            error: 'Invalid or expired authentication token.'
        });
    }
}

// Optional JWT authentication middleware
function optionalJwt(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
        ? header.slice(7)
        : null;

    if (token) {
        try {
            req.auth = jwt.verify(
                token,
                process.env.JWT_SECRET || 'careerconnect-development-secret'
            );
        } catch (error) {
            // Continue as a public request if the token is invalid
        }
    }

    next();
}
const requireAdmin = (req, res, next) => {
    if (req.auth?.role !== 'admin') return res.status(403).json({ error: 'TPO/admin access required.' });
    next();
};

const getStudentId = (req) => req.auth?.username || req.params.username || req.query.username;
const DSA_MAX_DURATION_SECONDS = 5 * 60;

function audienceMatches(student, item) {
    const audience = item.targetAudience || 'all';
    if (audience === 'departments') return (item.targetDepartments || []).includes(student.department);
    if (audience === 'graduationYears') return (item.targetGraduationYears || []).includes(Number(student.graduationYear));
    if (audience === 'students') return (item.targetStudents || []).includes(student.username);
    return true;
}

async function matchingStudents(item) {
    const students = await Student.find({}, 'username department graduationYear email phone').lean();
    return students.filter((student) => audienceMatches(student, item));
}

function jobEligibility(student, job) {
    const missing = [];
    if (job.eligibleCourse && String(student.course || '').toLowerCase() !== String(job.eligibleCourse).toLowerCase()) {
        missing.push(`Course: ${job.eligibleCourse}`);
    }
    if (job.eligibleBranch && String(student.department || '').toLowerCase() !== String(job.eligibleBranch).toLowerCase()) {
        missing.push(`Branch: ${job.eligibleBranch}`);
    }
    if (job.eligibleYear != null && Number(student.graduationYear) !== Number(job.eligibleYear)) {
        missing.push(`Graduation year: ${job.eligibleYear}`);
    }
    if (job.minimumCgpa != null && Number(student.cgpa || 0) < Number(job.minimumCgpa)) {
        missing.push(`CGPA: ${job.minimumCgpa} or above`);
    }
    if (job.minimumPercentage != null && Number(student.percentage || 0) < Number(job.minimumPercentage)) {
        missing.push(`Percentage: ${job.minimumPercentage}% or above`);
    }
    const studentSkills = new Set((student.skills || []).map((skill) => String(skill).trim().toLowerCase()));
    (job.requiredSkills || []).forEach((skill) => {
        if (!studentSkills.has(String(skill).trim().toLowerCase())) missing.push(`Skill: ${skill}`);
    });
    return { eligible: missing.length === 0, missing };
}

async function notifyApplication(student, announcement, application) {
    const appliedAt = new Date(application.appliedAt).toLocaleDateString('en-GB', { dateStyle: 'long' });
    const subject = `Application Confirmation — ${announcement.jobTitle || announcement.title} at ${announcement.companyName}`;
    const text = [
        `Dear ${student.name || 'Student'},`,
        '',
        'Thank you for applying through CareerConnect.',
        '',
        'Your application has been successfully registered.',
        `Company: ${announcement.companyName}`,
        `Position: ${announcement.jobTitle || announcement.title}`,
        `Application Date: ${appliedAt}`,
        'Application Status: Applied',
        '',
        'Please monitor your CareerConnect account and registered email address for further updates.',
        '',
        'Regards,',
        'CareerConnect Training & Placement Cell'
    ].join('\n');

    try {
        const transporter = getMailTransporter();
        if (transporter && student.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM || process.env.SMTP_USER,
                to: student.email,
                subject,
                text
            });
        }
    } catch (error) {
        console.warn('Job application email delivery failed:', error.message || error);
    }

    async function notifyApplicationStatus(student, announcement, status) {
        const role = announcement.jobTitle || announcement.title;
        const message = status === 'SHORTLISTED'
            ? `Your application for ${role} at ${announcement.companyName} has been shortlisted. Please check CareerConnect for further instructions.`
            : status === 'SELECTED'
                ? `Your application for ${role} at ${announcement.companyName} has been selected. Please check CareerConnect for further instructions.`
                : status === 'REJECTED'
                    ? `Your application for ${role} at ${announcement.companyName} has been reviewed and was not selected. We encourage you to continue exploring CareerConnect opportunities.`
                    : `Your application for ${role} at ${announcement.companyName} is now ${status.toLowerCase()}.`;
        try {
            const transporter = getMailTransporter();
            if (transporter && student.email) {
                await transporter.sendMail({
                    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
                    to: student.email,
                    subject: `CareerConnect — Application Status Update`,
                    text: `Dear ${student.name || 'Student'},\n\n${message}\n\nRegards,\nCareerConnect Training & Placement Cell`
                });
            }
        } catch (error) {
            console.warn('Application status email delivery failed:', error.message || error);
        }
    }
}

async function dispatchExternalChannels(students, item) {
    const channels = item.channels || ['in-app'];
    if (channels.includes('email') && process.env.EMAIL_WEBHOOK_URL) {
        for (const student of students.filter((s) => s.email)) {
            try { await axios.post(process.env.EMAIL_WEBHOOK_URL, { to: student.email, subject: item.title, text: item.content }); }
            catch (error) { console.warn('Email provider delivery failed:', error.message); }
        }
    }
    if (channels.includes('sms') && process.env.SMS_WEBHOOK_URL) {
        for (const student of students.filter((s) => s.phone)) {
            try { await axios.post(process.env.SMS_WEBHOOK_URL, { to: student.phone, message: `${item.title}: ${item.content}` }); }
            catch (error) { console.warn('SMS provider delivery failed:', error.message); }
        }
    }
}

async function createNotifications(item, type, idField) {
    const students = await matchingStudents(item);
    if ((item.channels || ['in-app']).includes('in-app')) {
        await Notification.insertMany(students.map((student) => ({
            recipientUsername: student.username, title: item.title, content: item.content, type, [idField]: item._id
        })));
    }
    await dispatchExternalChannels(students, item);
}

async function processDueReminders() {
    if (mongoose.connection.readyState !== 1) return;
    const reminders = await Reminder.find({ dueAt: { $lte: new Date() }, sentAt: null }).limit(50);
    for (const reminder of reminders) {
        await createNotifications(reminder, 'reminder', 'reminderId');
        await Reminder.updateOne({ _id: reminder._id, sentAt: null }, { $set: { sentAt: new Date() } });
    }
}

const getConfig = async () => {
    let config = await AssessmentConfig.findOne({ key: 'default' }).lean();
    if (!config) config = await AssessmentConfig.create({ key: 'default' });
    return config;
};

const ensureProgress = async (studentId) => PlacementProgress.findOneAndUpdate(
    { studentId },
    { $setOnInsert: { studentId, aptitude: { status: 'AVAILABLE' }, dsa: { status: 'LOCKED' }, technicalInterview: { status: 'LOCKED' } } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
);

async function finalizeExpiredDsaAttempt(studentId) {
    const now = new Date();
    return PlacementProgress.findOneAndUpdate(
        {
            studentId,
            'dsa.startedAt': { $exists: true },
            'dsa.deadline': { $lte: now },
            'dsa.submitted': { $ne: true }
        },
        {
            $set: {
                'dsa.completed': true,
                'dsa.submitted': true,
                'dsa.submittedAt': now,
                'dsa.completedAt': now,
                'dsa.durationSeconds': DSA_MAX_DURATION_SECONDS,
                'dsa.durationQualified': true,
                'dsa.submissionType': 'automatic'
            }
        },
        { new: true }
    );
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function readAssessmentSnapshot(studentId) {
    const safe = escapeRegex(studentId);
    const quizDb = mongoose.connection.useDb('quiz_system', { useCache: true });
    const dsaDb = mongoose.connection.useDb('DSA_code_app_db', { useCache: true });
    const interviewDb = mongoose.connection.useDb('mock_interviews', { useCache: true });
    const aptitudeAttempts = await quizDb.collection('apti_test').find({ student_id: { $regex: `^${safe}$`, $options: 'i' } }).sort({ timestamp: -1 }).toArray();
    const dsaAttempts = await dsaDb.collection('submissions').find({ username: { $regex: `^${safe}$`, $options: 'i' } }).sort({ timestamp: -1 }).toArray();
    const interviews = await interviewDb.collection('feedbacks').find({ username: { $regex: `^${safe}$`, $options: 'i' } }).sort({ timestamp: -1 }).toArray();
    const aptitude = aptitudeAttempts[0] || null;
    const dsaAccepted = dsaAttempts.filter((item) => String(item.status || '').toLowerCase() === 'accepted');
    const dsaScore = dsaAttempts.length ? Math.max(...dsaAttempts.map((item) => Number(item.score ?? item.coding_score ?? (String(item.status).toLowerCase() === 'accepted' ? 100 : 0)))) : null;
    const interviewScores = interviews.map((item) => {
        const explicit = Number(item.score ?? item.interview_score);
        if (Number.isFinite(explicit)) return explicit;
        const match = String(item.feedback || '').match(/score(?:\s+out\s+of\s+10)?\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
        return match ? Number(match[1]) * 10 : null;
    }).filter(Number.isFinite);
    const interview = interviews[0] || null;
    return {
        aptitudeAttempts, dsaAttempts, interviews,
        aptitude: aptitude ? { score: Number(aptitude.marks_achieved || 0), total: Number(aptitude.no_of_questions || 0), timeTaken: aptitude.time_taken, category: aptitude.category } : null,
        dsa: dsaAttempts.length ? { score: Math.max(0, Math.min(100, dsaScore || 0)), acceptedSolutions: dsaAccepted.length, attempts: dsaAttempts.length, latest: dsaAttempts[0] } : null,
        interview: interview ? { score: interviewScores.length ? Math.max(0, Math.min(100, interviewScores[0])) : null, completed: Boolean(interview.completed || interview.status === 'completed'), feedback: interview.feedback || interview.responses?.map((r) => r.feedback).join('\n') || '' } : null
    };
}

async function syncProgress(studentId) {
    await finalizeExpiredDsaAttempt(studentId);
    const [config, snapshot, student] = await Promise.all([getConfig(), readAssessmentSnapshot(studentId), Student.findOne({ username: studentId }).lean()]);
    const progress = await ensureProgress(studentId);
    const aptitudeScore = snapshot.aptitude?.total ? Number(((snapshot.aptitude.score / snapshot.aptitude.total) * 100).toFixed(2)) : null;
    const dsaScore = snapshot.dsa?.score ?? null;
    const interviewScore = snapshot.interview?.score ?? null;
    const aptitudeQualified = aptitudeScore !== null && aptitudeScore >= config.aptitudeMinScore;
    const dsaDurationQualified = progress.dsa?.completed === true && progress.dsa?.submitted === true;
    const dsaQualified = dsaScore !== null && snapshot.dsa.acceptedSolutions > 0 && dsaScore >= config.dsaMinScore && dsaDurationQualified;
    const interviewQualified = interviewScore !== null && snapshot.interview.completed && interviewScore >= config.technicalMinScore;
    const aptitudeStatus = snapshot.aptitude ? (aptitudeQualified ? 'QUALIFIED' : 'NOT_QUALIFIED') : 'AVAILABLE';
    const dsaStatus = aptitudeQualified ? (snapshot.dsa ? (dsaQualified ? 'QUALIFIED' : 'NOT_QUALIFIED') : 'AVAILABLE') : 'LOCKED';
    const technicalStatus = dsaQualified ? (snapshot.interview ? (interviewQualified ? 'QUALIFIED' : 'NOT_QUALIFIED') : 'AVAILABLE') : 'LOCKED';
    const workflowState = interviewQualified
        ? 'PLACEMENT_READY'
        : technicalStatus === 'QUALIFIED'
            ? 'TECHNICAL_INTERVIEW_QUALIFIED'
            : technicalStatus === 'AVAILABLE' || technicalStatus === 'NOT_QUALIFIED'
                ? 'TECHNICAL_INTERVIEW_AVAILABLE'
                : dsaQualified
                    ? 'DSA_QUALIFIED'
                    : dsaStatus === 'AVAILABLE' || dsaStatus === 'NOT_QUALIFIED'
                        ? 'DSA_AVAILABLE'
                        : aptitudeQualified
                            ? 'APTITUDE_QUALIFIED'
                            : aptitudeStatus === 'AVAILABLE' || aptitudeStatus === 'NOT_QUALIFIED'
                                ? 'APTITUDE_AVAILABLE'
                                : 'APTITUDE_LOCKED';
    const update = {
        workflowState,
        'aptitude.status': aptitudeStatus, 'aptitude.score': aptitudeScore, 'aptitude.total': snapshot.aptitude?.total,
        'aptitude.attemptCount': snapshot.aptitudeAttempts.length, 'aptitude.latestAttemptAt': snapshot.aptitudeAttempts[0]?.timestamp,
        'dsa.status': dsaStatus, 'dsa.score': dsaScore, 'dsa.acceptedSolutions': snapshot.dsa?.acceptedSolutions || 0,
        'dsa.attempts': snapshot.dsa?.attempts || 0, 'dsa.latestAttemptAt': snapshot.dsa?.latest?.timestamp,
        'dsa.qualified': dsaQualified,
        'dsa.interviewEligible': dsaQualified,
        'dsa.durationQualified': dsaDurationQualified,
        'technicalInterview.status': technicalStatus, 'technicalInterview.score': interviewScore,
        'technicalInterview.completed': Boolean(snapshot.interview?.completed), 'technicalInterview.feedback': snapshot.interview?.feedback || '',
        'technicalInterview.latestAttemptAt': snapshot.interviews[0]?.timestamp, lastUpdatedAt: new Date()
    };
    if (aptitudeQualified && dsaQualified && interviewQualified) {
        update.overallScore = Number(((aptitudeScore * config.weights.aptitude + dsaScore * config.weights.dsa + interviewScore * config.weights.technical) / 100).toFixed(2));
    } else {
        update.overallScore = null;
    }
    const saved = await PlacementProgress.findOneAndUpdate({ studentId }, { $set: update }, { new: true });
    return { config, progress: saved, snapshot, student };
}

async function interviewEligibility(studentId) {
    const result = await syncProgress(studentId);
    const aptitudeQualified = result.progress.aptitude.status === 'QUALIFIED';
    const dsaQualified = result.progress.dsa.status === 'QUALIFIED'
        && result.progress.dsa.submitted === true;
    return { result, allowed: aptitudeQualified && dsaQualified };
}

function interviewLockMessage(result) {
    if (result.progress.aptitude.status !== 'QUALIFIED') {
        return 'Qualify in the Aptitude Round first before accessing the Technical Interview.';
    }
    if (result.progress.dsa.status !== 'QUALIFIED') {
        return 'Complete and qualify the DSA Practice Round before accessing the Technical Interview.';
    }
    return 'Complete and qualify the Aptitude and DSA rounds before accessing the interview.';
}

async function requireInterviewQualification(req, res, next) {
    try {
        const studentId = getStudentId(req);
        const eligibility = await interviewEligibility(studentId);
        if (!eligibility.allowed) {
            return res.status(403).json({
                success: false,
                code: 'INTERVIEW_NOT_UNLOCKED',
                message: interviewLockMessage(eligibility.result)
            });
        }
        req.placement = eligibility.result;
        next();
    } catch (error) {
        console.error('Interview qualification check error:', error.message || error);
        res.status(500).json({ success: false, message: 'Unable to verify interview qualification.' });
    }
}

app.get('/api/placement/interview-access/:username', requireJwt, async (req, res) => {
    try {
        const requestedUsername = String(req.params.username || '').trim();
        const authenticatedUsername = String(req.auth?.username || '').trim();
        if (!requestedUsername || requestedUsername.toLowerCase() !== authenticatedUsername.toLowerCase()) {
            return res.status(403).json({ success: false, code: 'INTERVIEW_ACCESS_FORBIDDEN', message: 'You may only check your own interview access.' });
        }

        const eligibility = await interviewEligibility(authenticatedUsername);
        if (!eligibility.allowed) {
            return res.status(403).json({
                success: false,
                code: 'INTERVIEW_NOT_UNLOCKED',
                message: interviewLockMessage(eligibility.result)
            });
        }
        return res.json({
            success: true,
            code: 'INTERVIEW_UNLOCKED',
            message: 'Technical interview unlocked.',
            data: { unlocked: true }
        });
    } catch (error) {
        console.error('Interview access check error:', error.message || error);
        return res.status(500).json({ success: false, message: 'Unable to verify interview qualification.' });
    }
});

app.get('/api/placement/progress', requireJwt, async (req, res) => {
    try {
        const studentId = getStudentId(req);
        const result = await syncProgress(studentId);
        const statuses = {
            aptitude: result.progress.aptitude.status,
            dsa: result.progress.dsa.status,
            technicalInterview: result.progress.technicalInterview.status
        };
        const currentRound = statuses.technicalInterview === 'QUALIFIED'
            ? 'PLACEMENT_READY'
            : statuses.technicalInterview === 'AVAILABLE' || statuses.technicalInterview === 'NOT_QUALIFIED'
                ? 'TECHNICAL_INTERVIEW_AVAILABLE'
                : statuses.dsa === 'QUALIFIED'
                    ? 'TECHNICAL_INTERVIEW_AVAILABLE'
                    : statuses.dsa === 'AVAILABLE' || statuses.dsa === 'NOT_QUALIFIED'
                        ? 'DSA_AVAILABLE'
                        : statuses.aptitude === 'AVAILABLE' || statuses.aptitude === 'NOT_QUALIFIED'
                            ? 'APTITUDE_AVAILABLE'
                            : 'APTITUDE_LOCKED';
        const aptitude = result.snapshot.aptitude
            ? {
                score: result.snapshot.aptitude.score,
                maxScore: result.snapshot.aptitude.total,
                percentage: result.progress.aptitude.score,
                status: result.progress.aptitude.status
            }
            : { score: null, maxScore: null, percentage: null, status: 'NOT_ATTEMPTED' };
        const quickAptitude = { score: null, maxScore: 10, percentage: null, status: 'NOT_ATTEMPTED' };
        const dsa = result.snapshot.dsa
            ? {
                score: result.progress.dsa.score,
                maxScore: 100,
                percentage: result.progress.dsa.score,
                status: result.progress.dsa.submitted ? result.progress.dsa.status : 'IN_PROGRESS',
                durationSeconds: result.progress.dsa.durationSeconds || null,
                completed: Boolean(result.progress.dsa.completed && result.progress.dsa.submitted)
            }
            : {
                score: null,
                maxScore: 100,
                percentage: null,
                status: 'NOT_ATTEMPTED',
                durationSeconds: null,
                completed: false
            };
        const interview = result.snapshot.interview
            ? {
                score: result.progress.technicalInterview.score,
                maxScore: 100,
                percentage: result.progress.technicalInterview.score,
                status: result.progress.technicalInterview.completed
                    ? 'COMPLETED'
                    : 'PENDING'
            }
            : { score: null, maxScore: 100, percentage: null, status: 'NOT_ATTEMPTED' };
        const resumeATS = Number.isFinite(Number(result.student?.atsScore))
            ? { score: Number(result.student.atsScore), maxScore: 100, percentage: Number(result.student.atsScore), status: 'COMPLETED' }
            : { score: null, maxScore: 100, percentage: null, status: 'NOT_ATTEMPTED' };
        const overall = result.progress.overallScore === null || result.progress.overallScore === undefined
            ? { status: 'PENDING', score: null }
            : { status: 'COMPLETED', score: result.progress.overallScore };

        res.json({
            student: result.student ? {
                id: result.student.username, name: result.student.name, email: result.student.email,
                department: result.student.department, course: result.student.course,
                graduationYear: result.student.graduationYear, cgpa: result.student.cgpa,
                activeBacklogs: result.student.activeBacklogs, atsScore: result.student.atsScore,
                skills: result.student.skills || []
            } : null,
            currentRound: result.progress.workflowState || currentRound, statuses, progress: result.progress, config: result.config,
            overall,
            scores: { aptitude, quickAptitude, dsa, interview, resumeATS, overall },
            performance: {
                aptitude: result.snapshot.aptitude,
                dsa: result.snapshot.dsa,
                technicalInterview: result.snapshot.interview
            }
        });

    } catch (error) {
        console.error('Placement progress error:', error.message || error);
        res.status(500).json({ error: 'Unable to load placement progress.' });
    }
});

app.get('/api/student/qualification-status', requireJwt, async (req, res) => {
    try {
        const { progress, snapshot, config } = await syncProgress(getStudentId(req));
        const aptitudeCompleted = Boolean(snapshot.aptitude);
        const dsaDurationSeconds = Number(progress.dsa.durationSeconds || 0);
        res.json({
            success: true,
            code: 'INTERVIEW_ACCESS_STATUS',
            aptitude: {
                completed: aptitudeCompleted, score: snapshot.aptitude?.score ?? null,
                maxScore: snapshot.aptitude?.total ?? null,
                passMarks: snapshot.aptitude?.total
                    ? Math.ceil(snapshot.aptitude.total * config.aptitudeMinScore / 100)
                    : null,
                qualified: progress.aptitude.status === 'QUALIFIED'
            },
            dsa: {
                unlocked: progress.aptitude.status === 'QUALIFIED',
                completed: Boolean(progress.dsa.completed), durationSeconds: dsaDurationSeconds,
                startedAt: progress.dsa.startedAt || null,
                deadline: progress.dsa.deadline || null,
                submitted: Boolean(progress.dsa.submitted),
                remainingSeconds: progress.dsa.deadline
                    ? Math.max(0, Math.ceil((new Date(progress.dsa.deadline).getTime() - Date.now()) / 1000))
                    : null,
                durationQualified: Boolean(progress.dsa.submitted),
                qualified: progress.dsa.status === 'QUALIFIED'
            },
            interview: {
                unlocked: progress.dsa.status === 'QUALIFIED' && Boolean(progress.dsa.submitted),
                qualified: progress.technicalInterview.status === 'QUALIFIED'
            },
            access: progress.dsa.status === 'QUALIFIED' && Boolean(progress.dsa.submitted)
                ? { unlocked: true, code: 'INTERVIEW_UNLOCKED', message: 'Technical interview unlocked.' }
                : { unlocked: false, code: 'INTERVIEW_NOT_UNLOCKED', message: interviewLockMessage({ progress }) }
        });
    } catch (error) {
        console.error('Qualification status error:', error.message || error);
        res.status(500).json({ success: false, message: 'Unable to load qualification status.' });
    }
});

app.post('/api/placement/dsa/start', requireJwt, async (req, res) => {
    try {
        const studentId = getStudentId(req);
        const current = await ensureProgress(studentId);
        if (current.aptitude.status !== 'QUALIFIED') {
            return res.status(403).json({ success: false, code: 'DSA_NOT_UNLOCKED', message: 'Qualify in Aptitude before starting DSA.' });
        }
        const startedAt = new Date();
        const deadline = new Date(startedAt.getTime() + DSA_MAX_DURATION_SECONDS * 1000);
        const progress = await PlacementProgress.findOneAndUpdate(
            { studentId, 'dsa.startedAt': { $exists: false } },
            { $set: { 'dsa.startedAt': startedAt, 'dsa.deadline': deadline, 'dsa.completed': false, 'dsa.submitted': false, 'dsa.durationQualified': false } },
            { new: true }
        );
        const saved = progress || await PlacementProgress.findOne({ studentId });
        if (saved.dsa.submitted) {
            return res.status(409).json({ success: false, code: 'DSA_ALREADY_SUBMITTED', message: 'This DSA attempt has already been finalized.' });
        }
        if (!saved.dsa.deadline) {
            const migratedDeadline = new Date(new Date(saved.dsa.startedAt).getTime() + DSA_MAX_DURATION_SECONDS * 1000);
            await PlacementProgress.updateOne({ studentId, 'dsa.submitted': { $ne: true } }, { $set: { 'dsa.deadline': migratedDeadline } });
            saved.dsa.deadline = migratedDeadline;
        }
        if (new Date(saved.dsa.deadline).getTime() <= Date.now()) {
            const finalized = await finalizeExpiredDsaAttempt(studentId);
            return res.status(409).json({
                success: false,
                code: 'DSA_EXPIRED',
                message: 'The DSA attempt expired and was automatically submitted.',
                submitted: true,
                progress: finalized
            });
        }
        res.json({
            success: true, startedAt: saved.dsa.startedAt, deadline: saved.dsa.deadline,
            remainingSeconds: Math.max(0, Math.ceil((new Date(saved.dsa.deadline).getTime() - Date.now()) / 1000)),
            submitted: false
        });
    } catch (error) {
        console.error('DSA start error:', error.message || error);
        res.status(500).json({ success: false, message: 'Unable to start DSA.' });
    }
});

app.get('/api/placement/dsa/status', requireJwt, async (req, res) => {
    try {
        const studentId = getStudentId(req);
        await ensureProgress(studentId);
        await finalizeExpiredDsaAttempt(studentId);
        const progress = await PlacementProgress.findOne({ studentId }).lean();
        const dsa = progress?.dsa || {};
        const deadline = dsa.deadline ? new Date(dsa.deadline) : null;
        res.json({
            success: true,
            started: Boolean(dsa.startedAt),
            startedAt: dsa.startedAt || null,
            deadline,
            remainingSeconds: deadline ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 1000)) : null,
            submitted: Boolean(dsa.submitted),
            submissionType: dsa.submissionType || null,
            qualified: Boolean(dsa.qualified)
        });
    } catch (error) {
        console.error('DSA status error:', error.message || error);
        res.status(500).json({ success: false, message: 'Unable to load DSA status.' });
    }
});

app.post('/api/placement/dsa/complete', requireJwt, async (req, res) => {
    try {
        const studentId = getStudentId(req);
        const progress = await PlacementProgress.findOne({ studentId });
        if (!progress?.dsa?.startedAt) return res.status(400).json({ success: false, code: 'DSA_NOT_STARTED', message: 'Start the DSA round before completing it.' });
        if (progress.dsa.submitted) {
            const result = await syncProgress(studentId);
            return res.json({ success: true, alreadySubmitted: true, progress: result.progress });
        }
        const completedAt = new Date();
        const deadline = progress.dsa.deadline || new Date(progress.dsa.startedAt.getTime() + DSA_MAX_DURATION_SECONDS * 1000);
        const elapsedSeconds = Math.floor((completedAt.getTime() - progress.dsa.startedAt.getTime()) / 1000);
        if (elapsedSeconds < DSA_MAX_DURATION_SECONDS) {
            return res.status(400).json({
                success: false,
                code: 'DSA_MINIMUM_DURATION',
                message: `DSA completion requires at least ${DSA_MAX_DURATION_SECONDS} seconds.`,
                durationSeconds: Math.max(0, elapsedSeconds),
                minimumDurationSeconds: DSA_MAX_DURATION_SECONDS
            });
        }
        const expired = completedAt.getTime() > deadline.getTime();
        const durationSeconds = Math.max(0, elapsedSeconds);
        const submissionType = expired || req.body?.automatic === true ? 'automatic' : 'manual';
        await PlacementProgress.updateOne({ studentId, 'dsa.submitted': { $ne: true } }, {
            $set: {
                'dsa.completedAt': completedAt, 'dsa.durationSeconds': durationSeconds,
                'dsa.deadline': deadline, 'dsa.completed': true, 'dsa.submitted': true,
                'dsa.submittedAt': completedAt, 'dsa.submissionType': submissionType,
                'dsa.durationQualified': true
            }
        });
        const result = await syncProgress(studentId);
        res.json({ success: true, durationSeconds, submissionType, expired, interviewUnlocked: result.progress.dsa.status === 'QUALIFIED', progress: result.progress });
    } catch (error) {
        console.error('DSA completion error:', error.message || error);
        res.status(500).json({ success: false, message: 'Unable to complete DSA.' });
    }
});

app.post('/api/interview/start', requireJwt, requireInterviewQualification, (req, res) => {
    res.json({ success: true, interviewUnlocked: true });
});

app.get('/api/placement/eligibility', requireJwt, async (req, res) => {
    try {
        const studentId = getStudentId(req);
        const result = await syncProgress(studentId);
        const profile = result.student || {};
        const scores = {
            overall: result.progress.overallScore,
            aptitude: result.progress.aptitude.score,
            dsa: result.progress.dsa.score,
            technical: result.progress.technicalInterview.score
        };
        const skills = new Set((profile.skills || []).map((skill) => String(skill).toLowerCase()));
        const companies = await PlacementCompany.find({ driveStatus: { $ne: 'CLOSED' } }).lean();
        const eligibility = companies.map((company) => {
            const requirements = company.requirements || {};
            const missing = [];
            if (requirements.overallMin != null && (scores.overall == null || scores.overall < requirements.overallMin)) missing.push(`Overall score >= ${requirements.overallMin}`);
            if (requirements.aptitudeMin != null && (scores.aptitude == null || scores.aptitude < requirements.aptitudeMin)) missing.push(`Aptitude score >= ${requirements.aptitudeMin}`);
            if (requirements.dsaMin != null && (scores.dsa == null || scores.dsa < requirements.dsaMin)) missing.push(`DSA score >= ${requirements.dsaMin}`);
            if (requirements.technicalMin != null && (scores.technical == null || scores.technical < requirements.technicalMin)) missing.push(`Technical interview score >= ${requirements.technicalMin}`);
            if (requirements.cgpaMin != null && (Number(profile.cgpa) || 0) < requirements.cgpaMin) missing.push(`CGPA >= ${requirements.cgpaMin}`);
            if (requirements.activeBacklogsMax != null && (Number(profile.activeBacklogs) || 0) > requirements.activeBacklogsMax) missing.push(`Active backlogs <= ${requirements.activeBacklogsMax}`);
            if (requirements.departments?.length && !requirements.departments.includes(profile.department)) missing.push(`Department: ${requirements.departments.join(', ')}`);
            const matchingSkills = (requirements.skills || []).filter((skill) => skills.has(String(skill).toLowerCase()));
            const missingSkills = (requirements.skills || []).filter((skill) => !skills.has(String(skill).toLowerCase()));
            missing.push(...missingSkills.map((skill) => `Skill: ${skill}`));
            return {
                companyId: company._id, companyName: company.name, role: company.role,
                eligible: missing.length === 0, missingRequirements: missing,
                requiredSkills: requirements.skills || [], matchingSkills,
                scores, applicationDeadline: company.applicationDeadline, driveStatus: company.driveStatus
            };
        });
        res.json({ companies: eligibility });
    } catch (error) {
        console.error('Company eligibility error:', error.message || error);
        res.status(500).json({ error: 'Unable to calculate company eligibility.' });
    }
});

app.get('/api/placement/companies', requireJwt, async (req, res) => {
    const companies = await PlacementCompany.find().sort({ createdAt: -1 }).lean();
    res.json({ companies });
});

app.post('/api/placement/companies', requireJwt, requireAdmin, async (req, res) => {
    try {
        const { name, role, requirements = {}, jobDescription, applicationDeadline, driveStatus } = req.body;
        if (!String(name || '').trim() || !String(role || '').trim()) return res.status(400).json({ error: 'Company name and role are required.' });
        const company = await PlacementCompany.create({ name: String(name).trim(), role: String(role).trim(), requirements, jobDescription, applicationDeadline, driveStatus });
        res.status(201).json({ company });
    } catch (error) {
        res.status(400).json({ error: 'Invalid company requirements.' });
    }
});

app.put('/api/placement/companies/:id', requireJwt, requireAdmin, async (req, res) => {
    try {
        const company = await PlacementCompany.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!company) return res.status(404).json({ error: 'Company not found.' });
        res.json({ company });
    } catch (error) {
        res.status(400).json({ error: 'Invalid company update.' });
    }
});

app.get('/api/placement/config', requireJwt, async (req, res) => res.json({ config: await getConfig() }));

app.put('/api/placement/config', requireJwt, requireAdmin, async (req, res) => {
    try {
        const current = await getConfig();
        const next = { ...current.toObject(), ...req.body, weights: { ...current.weights.toObject(), ...(req.body.weights || {}) } };
        const total = Number(next.weights.aptitude) + Number(next.weights.dsa) + Number(next.weights.technical);
        if (Math.abs(total - 100) > 0.001) return res.status(400).json({ error: 'Aptitude, DSA, and technical weights must total 100.' });
        const config = await AssessmentConfig.findOneAndUpdate({ key: 'default' }, { $set: req.body }, { new: true, runValidators: true });
        res.json({ config });
    } catch (error) {
        res.status(400).json({ error: 'Invalid qualification configuration.' });
    }
});

app.get('/api/placement/skills', requireJwt, async (req, res) => {
    const { snapshot } = await syncProgress(getStudentId(req));
    const values = [];
    snapshot.aptitudeAttempts.forEach((attempt) => {
        if (attempt.topic) values.push({ skill: attempt.topic, score: Number(attempt.marks_achieved || 0) / Number(attempt.no_of_questions || 1) * 100 });
    });
    snapshot.dsaAttempts.forEach((attempt) => (attempt.topics || []).forEach((skill) => values.push({ skill, score: String(attempt.status).toLowerCase() === 'accepted' ? 100 : 0 })));
    const grouped = Object.values(values.reduce((acc, item) => {
        const key = String(item.skill).trim();
        if (!key) return acc;
        acc[key] = acc[key] || { skill: key, total: 0, count: 0 };
        acc[key].total += item.score; acc[key].count += 1; return acc;
    }, {})).map((item) => ({ skill: item.skill, score: Number((item.total / item.count).toFixed(2)) }));
    const config = await getConfig();
    res.json({ skills: grouped, strong: grouped.filter((item) => item.score >= config.strongSkillThreshold), weak: grouped.filter((item) => item.score < config.weakSkillThreshold) });
});

// Create an announcement (Admin only)
app.post('/announcements', requireJwt, requireAdmin, async (req, res) => {
    try {
        const {
            title, content, type, companyName, jobTitle, employmentType, location, salaryPackage,
            eligibleCourse, eligibleBranch, eligibleYear, minimumPercentage, minimumCgpa,
            requiredSkills, applicationStartDate, applicationDeadline, interviewTestDate,
            numberOfOpenings, additionalInstructions, targetAudience, targetDepartments,
            targetGraduationYears, targetStudents, channels
        } = req.body;
        if (!String(title || '').trim() || !String(content || '').trim()) return res.status(400).json({ message: 'Title and content are required.' });
        if (type === 'job' && (!String(companyName || '').trim() || !String(jobTitle || '').trim() || !applicationDeadline)) {
            return res.status(400).json({ message: 'Job announcements require company name, job title, and application deadline.' });
        }
        const newAnnouncement = new Announcement({
            title: String(title).trim(), content: String(content).trim(), type: type === 'job' ? 'job' : 'general',
            companyName, jobTitle, employmentType, location, salaryPackage, eligibleCourse, eligibleBranch,
            eligibleYear, minimumPercentage, minimumCgpa, requiredSkills, applicationStartDate,
            applicationDeadline, interviewTestDate, numberOfOpenings, additionalInstructions,
            targetAudience, targetDepartments, targetGraduationYears, targetStudents, channels
        });
        await newAnnouncement.save();
        const recipients = await matchingStudents(newAnnouncement);
        const eligibleRecipients = newAnnouncement.type === 'job'
            ? recipients.filter((student) => jobEligibility(student, newAnnouncement).eligible)
            : recipients;
        if ((newAnnouncement.channels || ['in-app']).includes('in-app') && eligibleRecipients.length) {
            await Notification.insertMany(eligibleRecipients.map((student) => ({
                recipientUsername: student.username,
                title: newAnnouncement.type === 'job' ? 'New Placement Opportunity' : newAnnouncement.title,
                content: newAnnouncement.type === 'job'
                    ? `${newAnnouncement.jobTitle} — ${newAnnouncement.companyName}. You may be eligible for this opportunity.`
                    : newAnnouncement.content,
                type: newAnnouncement.type === 'job' ? 'JOB_POSTED' : 'announcement',
                announcementId: newAnnouncement._id
            })));
        }
        if (newAnnouncement.type === 'general') {
            await dispatchExternalChannels(recipients, newAnnouncement);
        } else {
            await dispatchExternalChannels(eligibleRecipients, newAnnouncement);
        }
        res.status(201).json({ message: 'Announcement created successfully', announcement: newAnnouncement });
    } catch (error) {
        console.error('Announcement creation error:', error.message || error);
        res.status(500).json({ message: 'Unable to create the announcement.' });
    }
});

// Get all announcements for students and admins
app.get('/announcements', optionalJwt, async (req, res) => {
    try {
        const student = req.auth ? await Student.findOne({ username: req.auth.username }).lean() : null;
        const announcements = (await Announcement.find().sort({ createdAt: -1 }).lean())
            .filter((announcement) => !student || audienceMatches(student, announcement));
        res.status(200).json(announcements);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching announcements', error });
    }
});

// DELETE an announcement by ID (Admin only)
app.delete('/announcements/:id', requireJwt, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const deletedAnnouncement = await Announcement.findByIdAndDelete(id);

        if (!deletedAnnouncement) {
            return res.status(404).json({ message: 'Announcement not found' });
        }

        res.status(200).json({ message: 'Announcement deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting announcement', error });
    }
});

app.get('/api/student/applications', requireJwt, async (req, res) => {
    if (req.auth.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
    const applications = await Application.find({ studentId: req.auth.username })
        .populate('announcementId', 'title companyName jobTitle applicationDeadline type')
        .sort({ appliedAt: -1 }).lean();
    res.json({ applications });
});

app.get('/api/admin/applications', requireJwt, requireAdmin, async (req, res) => {
    const applications = await Application.find()
        .populate('announcementId', 'title companyName jobTitle applicationDeadline')
        .sort({ appliedAt: -1 }).lean();
    const usernames = applications.map((application) => application.studentId);
    const students = await Student.find({ username: { $in: usernames } }, 'username name email department').lean();
    const byUsername = new Map(students.map((student) => [student.username, student]));
    res.json({ applications: applications.map((application) => ({ ...application, student: byUsername.get(application.studentId) || null })) });
});

app.patch('/api/admin/applications/:id/status', requireJwt, requireAdmin, async (req, res) => {
    const allowedStatuses = ['APPLIED', 'SHORTLISTED', 'REJECTED', 'SELECTED', 'WITHDRAWN'];
    const status = String(req.body.status || '').toUpperCase();
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid application status.' });
    const application = await Application.findByIdAndUpdate(
        req.params.id, { $set: { status, statusUpdatedAt: new Date() } }, { new: true }
    ).populate('announcementId', 'companyName jobTitle title');
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    const statusMessages = {
        SHORTLISTED: 'has been shortlisted. Please check CareerConnect for further instructions.',
        SELECTED: 'has been selected. Please check CareerConnect for further instructions.',
        REJECTED: 'has been reviewed and was not selected for this opportunity. We encourage you to continue exploring CareerConnect opportunities.',
        WITHDRAWN: 'has been withdrawn.'
    };
    if (status !== 'APPLIED') {
        await Notification.create({
            recipientUsername: application.studentId,
            title: 'Application Status Updated',
            content: `Your application for ${application.announcementId.jobTitle || application.announcementId.title} at ${application.announcementId.companyName} ${statusMessages[status] || `is now ${status.toLowerCase()}.`}`,
            type: 'APPLICATION_STATUS_UPDATED',
            announcementId: application.announcementId._id
        });
        const student = await Student.findOne({ username: application.studentId }).lean();
        if (student) {
            notifyApplicationStatus(student, application.announcementId, status)
                .catch((error) => console.warn('Application status notification error:', error.message || error));
        }
    }
    res.json({ application });
});

app.post('/api/announcements/:id/apply', requireJwt, async (req, res) => {
    if (req.auth.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Job opportunity not found.' });
        const announcement = await Announcement.findOne({ _id: req.params.id, type: 'job' }).lean();
        if (!announcement) return res.status(404).json({ error: 'Job opportunity not found.' });
        const now = new Date();
        if (announcement.applicationStartDate && now < new Date(announcement.applicationStartDate)) {
            return res.status(409).json({ error: 'Applications for this opportunity are not open yet.' });
        }
        if (!announcement.applicationDeadline || now > new Date(announcement.applicationDeadline)) {
            return res.status(409).json({ error: 'The application deadline has passed.' });
        }
        const student = await Student.findOne({ username: req.auth.username }).lean();
        if (!student) return res.status(404).json({ error: 'Student account not found.' });
        const eligibility = jobEligibility(student, announcement);
        if (!eligibility.eligible) return res.status(403).json({ error: 'You are not eligible for this opportunity.', missing: eligibility.missing });
        const existing = await Application.findOne({ studentId: student.username, announcementId: announcement._id }).lean();
        if (existing) return res.status(409).json({ error: 'You have already applied for this opportunity.', application: existing });
        const application = await Application.create({
            studentId: student.username,
            announcementId: announcement._id,
            companyName: announcement.companyName,
            role: announcement.jobTitle || announcement.title
        });
        await Notification.create({
            recipientUsername: student.username,
            title: 'Application Submitted',
            content: `Your application for ${announcement.jobTitle || announcement.title} at ${announcement.companyName} has been successfully submitted.`,
            type: 'APPLICATION_SUBMITTED',
            announcementId: announcement._id
        });
        notifyApplication(student, announcement, application).catch((error) => console.warn('Application notification error:', error.message || error));
        res.status(201).json({ success: true, application });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ error: 'You have already applied for this opportunity.' });
        console.error('Job application error:', error.message || error);
        res.status(500).json({ error: 'Unable to submit the application right now.' });
    }
});

app.get('/api/notifications', requireJwt, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const notifications = await Notification.find({ recipientUsername: req.auth.username }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ notifications, unreadCount: await Notification.countDocuments({ recipientUsername: req.auth.username, readAt: null }) });
});

app.patch('/api/notifications/:id/read', requireJwt, async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, recipientUsername: req.auth.username },
        { $set: { readAt: new Date() } }, { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ notification });
});

app.post('/api/notifications/read-all', requireJwt, async (req, res) => {
    await Notification.updateMany({ recipientUsername: req.auth.username, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ message: 'Notifications marked as read.' });
});

app.get('/api/reminders', requireJwt, requireAdmin, async (req, res) => {
    res.json({ reminders: await Reminder.find().sort({ dueAt: 1 }).lean() });
});

app.post('/api/reminders', requireJwt, requireAdmin, async (req, res) => {
    try {
        const { title, content, dueAt, targetAudience, targetDepartments, targetGraduationYears, targetStudents, channels } = req.body;
        if (!title || !content || !dueAt || Number.isNaN(new Date(dueAt).getTime())) return res.status(400).json({ error: 'Title, content, and a valid due date are required.' });
        const reminder = await Reminder.create({ title, content, dueAt, targetAudience, targetDepartments, targetGraduationYears, targetStudents, channels });
        res.status(201).json({ reminder });
    } catch (error) { res.status(400).json({ error: 'Invalid reminder.' }); }
});

app.delete('/api/reminders/:id', requireJwt, requireAdmin, async (req, res) => {
    const deleted = await Reminder.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Reminder not found.' });
    res.json({ message: 'Reminder deleted.' });
});

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function getMailTransporter() {
    const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
    const SMTP_PORT = String(process.env.SMTP_PORT || '').trim();
    const SMTP_USER = String(process.env.SMTP_USER || '').trim();
    const SMTP_PASSWORD = String(process.env.SMTP_PASSWORD || '').replace(/\s/g, '');
    const hasPlaceholder = [SMTP_HOST, SMTP_USER, SMTP_PASSWORD].some((value) =>
        /^(YOUR_|your-|your_|replace-|example\.com|your-provider)/i.test(value)
    );
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || hasPlaceholder) {
        return null;
    }

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: SMTP_PORT === '465',
        auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
    });
}

// Student Registration Route
app.post('/register', async (req, res) => {
    try {
        const { name, phone, dob, college, department, gender, password } = req.body;
        const email = normalizeEmail(req.body.email);
        const username = String(req.body.username || '').trim();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (![name, phone, dob, college, department, gender, username, password].every((value) => String(value || '').trim()) ||
            !emailPattern.test(email)) {
            return res.status(400).json({ message: 'Please provide valid values for all registration fields.' });
        }

        const [existingStudent, existingUsername] = await Promise.all([
            Student.findOne({ email }).select('_id'),
            Student.findOne({ username }).select('_id')
        ]);
        if (existingStudent) return res.status(409).json({ message: 'This email is already registered.' });
        if (existingUsername) return res.status(409).json({ message: 'Username already exists.' });

        const newStudent = new Student({
            name: String(name).trim(),
            email,
            phone: String(phone).trim(),
            dob,
            college: String(college).trim(),
            department: String(department).trim(),
            gender: String(gender).trim(),
            username,
            password: await bcrypt.hash(String(password), 12)
        });

        try {
            await newStudent.save();
        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({ message: 'Username already exists.' });
            }
            throw error;
        }
        res.status(201).json({ message: 'Registration successful', user: { name: newStudent.name, username: newStudent.username } });
    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ message: 'Username already exists' });
        } else {
            res.status(500).json({ message: 'Error during registration', error });
        }
    }
});

// Student Login Route
app.post('/login', async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const { password } = req.body;

        const user = await Student.findOne({ username });

        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ username: user.username, role: 'student' }, process.env.JWT_SECRET || 'careerconnect-development-secret', { expiresIn: '8h' });
        res.cookie('careerconnect_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });
        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                name: user.name,
                username: user.username,
                email: user.email,
                department: user.department,
            }
        });

    } catch (error) {
        res.status(500).json({ message: 'Error during login', error });
    }
});

// Admin Registration Route
app.post('/admin/register', async (req, res) => {
    try {
        const { name, position, email, phone, username, password } = req.body;

        const hashedPassword = await bcrypt.hash(password, 10);

        const newAdmin = new Admin({
            name,
            position,
            email,
            phone,
            username,
            password: hashedPassword,
        });

        await newAdmin.save();
        res.status(201).json({ message: 'Admin registration successful' });
    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ message: 'Username already exists' });
        } else {
            res.status(500).json({ message: 'Error during registration', error });
        }
    }
});

// Admin Login Route
app.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const admin = await Admin.findOne({ username });

        if (!admin) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ username: admin.username, role: 'admin' }, process.env.JWT_SECRET || 'careerconnect-development-secret', { expiresIn: '8h' });
        res.cookie('careerconnect_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });
        res.status(200).json({
            message: 'Admin login successful',
            token,
            admin: {
                name: admin.name,
                username: admin.username,
                position: admin.position,
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error during login', error });
    }
});

// Admin Profile Route
app.get('/admin/profile', requireJwt, requireAdmin, async (req, res) => {
    try {
        const admin = await Admin.findOne({ username: req.auth.username });

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Return admin profile details (excluding password)
        res.status(200).json({
            username: admin.username,
            name: admin.name,
            email: admin.email,
            phone: admin.phone,
            position: admin.position
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching admin profile', error });
    }
});

// Legacy profile endpoints used by the existing profile pages.
app.get('/student/profile', async (req, res) => {
    try {
        const student = await Student.findOne({ username: String(req.query.username || '').trim() })
            .select('-password').lean();
        if (!student) return res.status(404).json({ message: 'Student not found.' });
        res.json(student);
    } catch (error) {
        console.error('Student profile lookup error:', error.message || error);
        res.status(500).json({ message: 'Unable to load student profile.' });
    }
});

app.put('/student/update', async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        if (!username || !String(req.body.name || '').trim() || !normalizeEmail(req.body.email)) {
            return res.status(400).json({ message: 'Username, name, and email are required.' });
        }
        const updatedStudent = await Student.findOneAndUpdate(
            { username },
            {
                $set: {
                    name: String(req.body.name).trim(),
                    email: normalizeEmail(req.body.email),
                    phone: String(req.body.phone || '').trim(),
                    department: String(req.body.department || '').trim(),
                    college: String(req.body.college || '').trim(),
                    gender: String(req.body.gender || '').trim()
                }
            },
            { new: true, runValidators: true }
        ).select('-password');
        if (!updatedStudent) return res.status(404).json({ message: 'Student not found.' });
        res.json(updatedStudent);
    } catch (error) {
        console.error('Student profile update error:', error.message || error);
        res.status(400).json({ message: 'Unable to update student profile.' });
    }
});

app.put('/admin/update', requireJwt, requireAdmin, async (req, res) => {
    try {
        const updatedAdmin = await Admin.findOneAndUpdate(
            { username: req.auth.username },
            { $set: {
                name: String(req.body.name || '').trim(),
                email: normalizeEmail(req.body.email),
                phone: String(req.body.phone || '').trim(),
                position: String(req.body.position || '').trim()
            } },
            { new: true, runValidators: true }
        ).select('-password');
        if (!updatedAdmin) return res.status(404).json({ message: 'Admin not found.' });
        res.json(updatedAdmin);
    } catch (error) {
        console.error('Admin profile update error:', error.message || error);
        res.status(400).json({ message: 'Unable to update admin profile.' });
    }
});

// Get total count of students route
app.get('/students/count', async (req, res) => {
    try {
        const count = await Student.countDocuments(); // Get the count of documents in the collection
        res.status(200).json({ count });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching student count', error });
    }
});

app.get('/api/admin/students', requireJwt, requireAdmin, async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
    const search = String(req.query.search || '').trim();
    const filter = {};
    if (search) {
        const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ name: pattern }, { email: pattern }, { username: pattern }, { department: pattern }, { course: pattern }];
    }
    if (req.query.department) filter.department = req.query.department;
    if (req.query.course) filter.course = req.query.course;
    if (req.query.graduationYear) filter.graduationYear = Number(req.query.graduationYear);
    const [students, total] = await Promise.all([
        Student.find(filter, 'name username email phone course department graduationYear emailVerified createdAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Student.countDocuments(filter)
    ]);
    res.json({ students, total, page, limit, pages: Math.ceil(total / limit) });
});

// Get all students route (if you still want to display details later)
app.get('/students', async (req, res) => {
    try {
        const students = await Student.find({});
        res.status(200).json(students);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching students', error });
    }
});

// DELETE a student by username
app.delete('/students/:username', async (req, res) => {
    const username = req.params.username;
    try {
        const deletedStudent = await Student.findOneAndDelete({ username });
        if (deletedStudent) {
            res.json({ message: 'Student deleted successfully' });
        } else {
            res.status(404).json({ message: 'Student not found' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update student details
app.put('/students/:username', async (req, res) => {
    const username = req.params.username;
    const { name, email, phone, gender } = req.body; // Ensure these fields exist in the request

    if (!name || !email || !phone) {
        return res.status(400).json({ message: 'All fields (name, email, phone) are required' });
    }

    try {
        const updatedStudent = await Student.findOneAndUpdate(
            { username },
            { name, email, phone, gender },  // Include gender here
            { new: true }
        );

        if (updatedStudent) {
            res.json(updatedStudent); // Respond with updated student details
        } else {
            res.status(404).json({ message: 'Student not found' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error during student update', error: err.message });
    }
});

// Company Registration Route
app.post('/company/register', async (req, res) => {
    return res.status(410).json({ message: 'Company registration is no longer available. Use the Admin or Student portal.' });
    /*
    try {
        const { name, email, company_add, phone, username, password } = req.body;

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        const newCompany = new Company({
            name,
            email,
            company_add,
            phone,
            username,
            password: hashedPassword,
        });

        await newCompany.save();
        res.status(201).json({ message: 'Company registration successful' });
    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ message: 'Username already exists' });
        } else {
            res.status(500).json({ message: 'Error during registration', error });
        }
    }
    */
});

// Company Login Route
app.post('/company/login', async (req, res) => {
    return res.status(410).json({ message: 'Company login is no longer available. Use the Admin or Student portal.' });
});

// Company Announcement Route
app.post('/company/announcements', async (req, res) => {
    return res.status(410).json({ message: 'Company announcements are disabled. Admins manage placement opportunities.' });
    /*
    try {
        const { title, content } = req.body;

        // Assuming company should be authenticated to create an announcement
        const newAnnouncement = new Announcement({ title, content });
        await newAnnouncement.save();
        res.status(201).json({ message: 'Announcement created successfully by company' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating announcement', error });
    }
    */
});

let server;
if (require.main === module) {
server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

// Persistent reminder delivery survives restarts because due reminders remain unsent in MongoDB.
const reminderPoller = setInterval(() => processDueReminders().catch((error) => console.warn('Reminder scheduler error:', error.message)), 60 * 1000);
processDueReminders().catch((error) => console.warn('Reminder scheduler error:', error.message));
if (reminderPoller.unref) reminderPoller.unref();

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. The CareerConnect server may already be running.`);
        console.error(`Open http://localhost:${port}/ instead of starting another server.`);
        process.exit(0);
    }

    console.error('Unable to start the CareerConnect server:', error);
    process.exitCode = 1;
});

server.on('upgrade', (req, socket, head) => {
    const matchingProxy = streamlitProxies.find(({ mount }) => (
        req.url === mount || req.url.startsWith(`${mount}/`)
    ));

    if (matchingProxy) {
        matchingProxy.proxy.upgrade(req, socket, head);
    } else {
        socket.destroy();
    }
});
}

module.exports = app;