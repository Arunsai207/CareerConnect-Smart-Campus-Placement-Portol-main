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
const app = express();
const port = process.env.PORT || 3000; // Public port for unified access
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/studentDB';

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors({ origin: true, credentials: true }));
// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

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

    // Spawn as detached process so it won't block the Node event loop; on Windows shell:true is helpful
    const proc = spawn('streamlit', ['run', script, '--server.port', String(streamlitPort), '--server.headless', 'true'], { cwd, shell: true, detached: true, stdio: ['ignore', out, err] });

    // Allow parent to exit independently; unref makes the child not keep the event loop alive
    try { proc.unref(); } catch (e) { /* ignore if not available */ }

    proc.on('error', (errObj) => console.error(`Failed to start ${moduleName}:`, errObj));
    proc.on('exit', (code, signal) => console.log(`${moduleName} (pid ${proc.pid}) exited with code ${code} signal ${signal}; see ${logFile}`));

    return { proc, logFile };
}

// Map public paths to internal Streamlit ports
const streamlitMappings = [
    { mount: '/apti', script: path.join('Aptitude', 'AptiApp.py'), port: 8501 },
    { mount: '/apti-dashboard', script: path.join('Aptitude', 'InteractiveDashboard.py'), port: 8502 },
    { mount: '/dsa', script: path.join('CodingPract', 'DSA_app_db.py'), port: 8503 },
    { mount: '/dsa-dashboard', script: path.join('CodingPract', 'DSA_dash.py'), port: 8504 },
    { mount: '/mockinterview', script: path.join('MockInter', 'app.py'), port: 8505 },
    { mount: '/resume', script: path.join('ResumeATS', 'app.py'), port: 8506 },
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

        // Try streamlit CLI first
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

            const proc = spawn('python', ['-m', 'streamlit', 'run', scriptLocal, '--server.port', String(m.port), '--server.headless', 'true'], { cwd: cwdLocal, shell: true, detached: true, stdio: ['ignore', out, err] });
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
for (const m of streamlitMappings) {
    const mount = m.mount.endsWith('/') ? m.mount.slice(0, -1) : m.mount;
    app.use(mount, createProxyMiddleware({
        target: `http://localhost:${m.port}`,
        changeOrigin: true,
        ws: true,
        pathRewrite: (pathReq) => {
            const cleaned = pathReq.startsWith(mount) ? pathReq.slice(mount.length) : pathReq;
            return cleaned === '' ? '/' : cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
        },
        onProxyReq: (proxyReq) => {
            proxyReq.setHeader('host', `localhost:${m.port}`);
        }
    }));
}

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
    username: { type: String, unique: true },
    password: String, // The password will be hashed
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
    createdAt: { type: Date, default: Date.now },
});

// Create the Announcement model
const Announcement = mongoose.model('Announcement', announcementSchema);

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

// Create an announcement (Admin only)
app.post('/announcements', async (req, res) => {
    try {
        const { title, content } = req.body;
        const newAnnouncement = new Announcement({ title, content });
        await newAnnouncement.save();
        res.status(201).json({ message: 'Announcement created successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating announcement', error });
    }
});

// Get all announcements for students and admins
app.get('/announcements', async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ createdAt: -1 });
        res.status(200).json(announcements);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching announcements', error });
    }
});

// DELETE an announcement by ID (Admin only)
app.delete('/announcements/:id', async (req, res) => {
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

// Student Registration Route
app.post('/register', async (req, res) => {
    try {
        const { name, email, phone, dob, college, department, gender, username, password } = req.body;

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        const newStudent = new Student({
            name,
            email,
            phone,
            dob,
            college,
            department,
            gender,  // Make sure gender is included in the body
            username,
            password: hashedPassword, // Save the hashed password
        });

        await newStudent.save();
        res.status(201).json({ message: 'Student registration successful' });
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
        const { username, password } = req.body;

        const user = await Student.findOne({ username });

        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        res.status(200).json({
            message: 'Login successful',
            user: {
                name: user.name,
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

        res.status(200).json({
            message: 'Admin login successful',
            admin: {
                name: admin.name,
                position: admin.position,
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error during login', error });
    }
});

// Admin Profile Route
app.get('/admin/profile', async (req, res) => {
    try {
        const { username } = req.query; // Expect username in query parameters
        
        // Find the admin by username
        const admin = await Admin.findOne({ username });

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Return admin profile details (excluding password)
        res.status(200).json({
            username: admin.username,
            email: admin.email,
            position: admin.position
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching admin profile', error });
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
});

// Company Login Route
app.post('/company/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const company = await Company.findOne({ username });

        if (!company) {
            return res.status(401).json({ message: 'Invalid usernames or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, company.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid usernamee or password' });
        }

        res.status(200).json({
            message: 'Company login successful',
            company: {
                name: company.name,
                
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error during login', error });
    }
});

// Company Announcement Route
app.post('/company/announcements', async (req, res) => {
    try {
        const { title, content } = req.body;

        // Assuming company should be authenticated to create an announcement
        const newAnnouncement = new Announcement({ title, content });
        await newAnnouncement.save();
        res.status(201).json({ message: 'Announcement created successfully by company' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating announcement', error });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
